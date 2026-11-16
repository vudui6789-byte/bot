const SESSION_COOKIE = 'company_bot_session';
const SESSION_TTL = 43200;

function respond(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...extra }
  });
}

function cookies(request) {
  const raw = request.headers.get('cookie') || '';
  return Object.fromEntries(raw.split(';').map((v) => v.trim()).filter(Boolean).map((v) => {
    const i = v.indexOf('=');
    return i < 0 ? [v, ''] : [v.slice(0, i), v.slice(i + 1)];
  }));
}

function base64url(bytes) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function sign(secret, value) {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return base64url(new Uint8Array(sig));
}

async function createSession(secret) {
  secret = String(secret || '').trim();
  const expiry = String(Math.floor(Date.now() / 1000) + SESSION_TTL);
  return `${expiry}.${await sign(secret, expiry)}`;
}

async function authenticated(request, env) {
  const token = cookies(request)[SESSION_COOKIE];
  if (!token) return false;
  const [expiry, signature] = token.split('.');
  if (!expiry || !signature || Number(expiry) < Math.floor(Date.now() / 1000)) return false;
  return signature === await sign(String(env.SESSION_SECRET || '').trim(), expiry);
}

function agentAuthenticated(request, env) {
  return request.headers.get('authorization') === `Bearer ${String(env.AGENT_TOKEN || '').trim()}`;
}

function rowToTask(row) {
  return {
    id: row.id,
    request: row.request,
    status: row.status,
    plan: row.plan_json ? JSON.parse(row.plan_json) : null,
    logs: JSON.parse(row.logs_json || '[]'),
    outputs: JSON.parse(row.outputs_json || '[]'),
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

async function api(request, env, url) {
  if (url.pathname === '/api/login' && request.method === 'POST') {
    const body = await request.json().catch(() => ({}));
    if (String(body.password || '') !== String(env.APP_PASSWORD || '').trim()) {
      return respond({ error: 'Mật khẩu không đúng.' }, 401);
    }
    const session = await createSession(env.SESSION_SECRET);
    return respond(
      { ok: true },
      200,
      { 'set-cookie': `${SESSION_COOKIE}=${session}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_TTL}` }
    );
  }

  if (url.pathname === '/api/logout' && request.method === 'POST') {
    return respond(
      { ok: true },
      200,
      { 'set-cookie': `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0` }
    );
  }

  if (url.pathname.startsWith('/api/agent/')) {
    if (!agentAuthenticated(request, env)) return respond({ error: 'Agent token không hợp lệ.' }, 401);

    if (url.pathname === '/api/agent/next' && request.method === 'POST') {
      const candidate = await env.DB
        .prepare("SELECT id, request FROM tasks WHERE status = 'queued' ORDER BY created_at ASC LIMIT 1")
        .first();
      if (!candidate) return new Response(null, { status: 204 });
      const now = new Date().toISOString();
      const claim = await env.DB
        .prepare("UPDATE tasks SET status = 'running', claimed_at = ?, updated_at = ? WHERE id = ? AND status = 'queued'")
        .bind(now, now, candidate.id)
        .run();
      if (!claim.meta?.changes) return new Response(null, { status: 204 });
      return respond(candidate);
    }

    const completeMatch = url.pathname.match(/^\/api\/agent\/tasks\/([^/]+)\/complete$/);
    if (completeMatch && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      if (!['completed', 'failed'].includes(body.status)) {
        return respond({ error: 'Trạng thái không hợp lệ.' }, 400);
      }
      const now = new Date().toISOString();
      await env.DB
        .prepare('UPDATE tasks SET status = ?, plan_json = ?, logs_json = ?, outputs_json = ?, error = ?, updated_at = ? WHERE id = ?')
        .bind(
          body.status,
          body.plan ? JSON.stringify(body.plan) : null,
          JSON.stringify(body.logs || []),
          JSON.stringify(body.outputs || []),
          body.error || null,
          now,
          completeMatch[1]
        )
        .run();
      return respond({ ok: true });
    }
    return respond({ error: 'Agent endpoint không tồn tại.' }, 404);
  }

  const ok = await authenticated(request, env);
  if (url.pathname === '/api/me') return respond({ authenticated: ok });
  if (!ok) return respond({ error: 'Bạn cần đăng nhập.' }, 401);

  if (url.pathname === '/api/tasks' && request.method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const text = String(body.request || '').trim();
    if (!text || text.length > 10000) return respond({ error: 'Yêu cầu trống hoặc quá dài.' }, 400);
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    await env.DB
      .prepare('INSERT INTO tasks (id, request, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .bind(id, text, 'queued', now, now)
      .run();
    return respond({ id, request: text, status: 'queued' }, 202);
  }

  if (url.pathname === '/api/tasks' && request.method === 'GET') {
    const { results } = await env.DB.prepare('SELECT * FROM tasks ORDER BY created_at DESC LIMIT 20').all();
    return respond({ tasks: results.map(rowToTask) });
  }

  const taskMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)$/);
  if (taskMatch && request.method === 'GET') {
    const row = await env.DB.prepare('SELECT * FROM tasks WHERE id = ?').bind(taskMatch[1]).first();
    return row ? respond(rowToTask(row)) : respond({ error: 'Không tìm thấy task.' }, 404);
  }
  return respond({ error: 'API không tồn tại.' }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) return api(request, env, url);
    return env.ASSETS.fetch(request);
  }
};
