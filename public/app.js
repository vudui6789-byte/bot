const requestInput = document.querySelector('#request');
const previewButton = document.querySelector('#previewButton');
const runButton = document.querySelector('#runButton');
const output = document.querySelector('#output');
const taskStatus = document.querySelector('#taskStatus');
const health = document.querySelector('#health');
const policyBox = document.querySelector('#policy');

async function jsonFetch(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || 'Request thất bại');
  return data;
}

function setBusy(busy) {
  previewButton.disabled = busy;
  runButton.disabled = busy;
}

function renderTask(task) {
  const lines = [];
  for (const [index, action] of task.plan.actions.entries()) {
    lines.push(`${index + 1}. ${JSON.stringify(action)}`);
  }
  if (task.plan.ignored?.length) {
    lines.push('', `Chưa hiểu: ${task.plan.ignored.join(' | ')}`);
  }
  if (task.logs?.length) {
    lines.push('', ...task.logs.map((entry) => `${entry.message}${entry.detail ? ` — ${entry.detail}` : ''}`));
  }
  if (task.outputs?.length) {
    lines.push('', 'Kết quả:', ...task.outputs.map((item) => `${item.type}: ${item.value}`));
  }
  if (task.error) lines.push('', `Lỗi: ${task.error}`);
  output.textContent = lines.join('\n');
  taskStatus.textContent = task.status;
}

async function preview() {
  setBusy(true);
  taskStatus.textContent = 'Đang phân tích';
  try {
    const plan = await jsonFetch('/api/plan', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ request: requestInput.value })
    });
    renderTask({ plan, logs: [], outputs: [], status: 'Sẵn sàng' });
  } catch (error) {
    taskStatus.textContent = 'Không hiểu yêu cầu';
    output.textContent = error.message;
  } finally {
    setBusy(false);
  }
}

async function run() {
  setBusy(true);
  taskStatus.textContent = 'Đang tạo task';
  try {
    const created = await jsonFetch('/api/tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ request: requestInput.value })
    });

    let task;
    do {
      await new Promise((resolve) => setTimeout(resolve, 700));
      task = await jsonFetch(`/api/tasks/${created.id}`);
      renderTask(task);
    } while (task.status === 'queued' || task.status === 'running');
  } catch (error) {
    taskStatus.textContent = 'Lỗi';
    output.textContent = error.message;
  } finally {
    setBusy(false);
  }
}

previewButton.addEventListener('click', preview);
runButton.addEventListener('click', run);

Promise.all([jsonFetch('/api/health'), jsonFetch('/api/policy')])
  .then(([healthData, policy]) => {
    health.textContent = 'Edge sẵn sàng';
    health.classList.add('ok');
    policyBox.innerHTML = '';
    const domain = document.createElement('div');
    domain.textContent = `Domain: ${policy.allowedDomains.join(', ') || 'chưa cấu hình'}`;
    const folders = document.createElement('div');
    folders.textContent = `Upload: ${policy.allowedUploadFolders.join(' · ')}`;
    policyBox.append(domain, folders);
  })
  .catch((error) => {
    health.textContent = error.message;
    health.classList.add('error');
  });
