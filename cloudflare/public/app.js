const $=(s)=>document.querySelector(s);
const login=$('#login'),app=$('#app'),form=$('#loginForm'),password=$('#password'),loginError=$('#loginError'),logout=$('#logout'),requestBox=$('#request'),run=$('#run'),status=$('#status'),output=$('#output'),recent=$('#recent'),liveFrame=$('#liveFrame'),liveEmpty=$('#liveEmpty'),liveStep=$('#liveStep'),liveTime=$('#liveTime'),liveUrl=$('#liveUrl');
let timer;

async function api(path,options={}){
  const r=await fetch(path,{...options,headers:{'content-type':'application/json',...(options.headers||{})}});
  const d=await r.json().catch(()=>({}));
  if(!r.ok)throw new Error(d.error||`HTTP ${r.status}`);
  return d;
}

function show(ok){login.hidden=ok;app.hidden=!ok}

function render(t){
  status.textContent=t.status;
  if(t.live?.frame){
    liveFrame.src=t.live.frame;
    liveFrame.hidden=false;
    liveEmpty.hidden=true;
    liveStep.textContent=`Bước ${t.live.step}/${t.live.total} · ${t.live.action}`;
    liveTime.textContent=t.live.capturedAt?new Date(t.live.capturedAt).toLocaleTimeString('vi-VN'):'—';
    liveUrl.textContent=t.live.url||'—';
  }else{
    liveFrame.hidden=true;
    liveEmpty.hidden=false;
    liveStep.textContent=t.status==='running'?'Đang chờ frame đầu tiên…':'Chưa có hình ảnh trực tiếp';
    liveTime.textContent='—';
    liveUrl.textContent='—';
  }
  const l=[`Yêu cầu:\n${t.request}`,'',`Trạng thái: ${t.status}`];
  if(t.plan?.actions?.length)l.push('','Kế hoạch:',...t.plan.actions.map((a,i)=>`${i+1}. ${JSON.stringify(a)}`));
  if(t.logs?.length)l.push('','Log:',...t.logs.map(e=>`${e.message}${e.detail?' — '+e.detail:''}`));
  if(t.outputs?.length)l.push('','Kết quả:',...t.outputs.map(x=>`${x.type}: ${x.value}`));
  if(t.error)l.push('',`Lỗi: ${t.error}`);
  output.textContent=l.join('\n');
}

async function loadRecent(){
  const d=await api('/api/tasks');
  recent.innerHTML='';
  if(!d.tasks.length){recent.textContent='Chưa có task.';return}
  for(const t of d.tasks.slice(0,8)){
    const b=document.createElement('button');
    b.className='task';
    b.textContent=t.request.split('\n')[0].slice(0,55);
    const s=document.createElement('small');
    s.textContent=t.status;
    b.append(s);
    b.onclick=()=>watch(t.id);
    recent.append(b);
  }
}

async function watch(id){
  if(timer)clearTimeout(timer);
  const poll=async()=>{
    const t=await api(`/api/tasks/${id}`);
    render(t);
    if(['queued','running'].includes(t.status))timer=setTimeout(poll,900);
    else loadRecent();
  };
  await poll();
}

form.onsubmit=async(e)=>{
  e.preventDefault();
  loginError.textContent='';
  try{
    await api('/api/login',{method:'POST',body:JSON.stringify({password:password.value})});
    password.value='';
    show(true);
    await loadRecent();
  }catch(err){loginError.textContent=err.message}
};

logout.onclick=async()=>{await api('/api/logout',{method:'POST',body:'{}'});show(false)};
run.onclick=async()=>{
  run.disabled=true;
  try{
    const t=await api('/api/tasks',{method:'POST',body:JSON.stringify({request:requestBox.value})});
    await loadRecent();
    await watch(t.id);
  }catch(err){output.textContent=err.message}
  finally{run.disabled=false}
};

api('/api/me').then(async({authenticated})=>{show(authenticated);if(authenticated)await loadRecent()}).catch(()=>show(false));
