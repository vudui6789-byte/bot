import { DurableObject } from 'cloudflare:workers';

const SESSION_COOKIE = 'company_bot_session';
const SESSION_TTL = 43200;
const TASK_INDEX_KEY = 'task-index';
const MAX_STORED_TASKS = 200;

function respond(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', ...extra }
  });
}

function cookies(request) {
  const raw = request.headers.get('cookie') || '';
  return Object.fromEntries(raw.split(';').map((value) => value.trim()).filter(Boolean).map((value) => {
    const index = value.indexOf('=');
    return index < 0 ? [value, ''] : [value.slice(0, index), value.slice(index + 1)];
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
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(value));
  return base64url(new Uint8Array(signature));
}

async function createSession(secret) {
  const normalizedSecret = String(secret || '').trim();
  const expiry = String(Math.floor(Date.now() / 1000) + SESSION_TTL);
  return `${expiry}.${await sign(normalizedSecret, expiry)}`;
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

function taskKey(id) {
  return `task:${id}`;
}

export class TaskStore extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.storage = ctx.storage;
  }

  async createTask(requestText) {
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const task = { id, request: requestText, status: 'queued', plan: null, logs: [], outputs: [], error: null, createdAt: now, updatedAt: now, claimedAt: null };
    const index = await this.storage.get(TASK_INDEX_KEY) || [];
    const nextIndex = [id, ...index.filter((value) => value !== id)].slice(0, MAX_STORED_TASKS);
    await this.storage.put({ [taskKey(id)]: task, [TASK_INDEX_KEY]: nextIndex });
    return task;
  }

  async listTasks(limit = 20) {
    const index = await this.storage.get(TASK_INDEX_KEY) || [];
    const ids = index.slice(0, Math.max(1, Math.min(Number(limit) || 20, 50)));
    if (!ids.length) return [];
    const values = await this.storage.get(ids.map(taskKey));
    return ids.map((id) => values.get(taskKey(id))).filter(Boolean);
  }

  async getTask(id) {
    return await this.storage.get(taskKey(id)) || null;
  }

  async claimNext() {
    const index = await this.storage.get(TASK_INDEX_KEY) || [];
    for (const id of [...index].reverse()) {
      const task = await this.storage.get(taskKey(id));
      if (!task || task.status !== 'queued') continue;
      const now = new Date().toISOString();
      const claimed = { ...task, status: 'running', claimedAt: now, updatedAt: now };
      await this.storage.put(taskKey(id), claimed);
      return { id: claimed.id, request: claimed.request };
    }
    return null;
  }

  async completeTask(id, payload) {
    const task = await this.storage.get(taskKey(id));
    if (!task) return false;
    const updated = {
      ...task,
      status: payload.status,
      plan: payload.plan || null,
      logs: Array.isArray(payload.logs) ? payload.logs : [],
      outputs: Array.isArray(payload.outputs) ? payload.outputs : [],
      error: payload.error || null,
      updatedAt: new Date().toISOString()
    };
    await this.storage.put(taskKey(id), updated);
    return true;
  }
}

function taskStore(env) {
  return env.TASK_STORE.getByName('company-bot-global');
}

async function api(request, env, url) {
  if (url.pathname === '/api/login' && request.method === 'POST') {
    const body = await request.json().catch(() => ({}));
    if (String(body.password || '') !== String(env.APP_PASSWORD || '').trim()) {
      return respond({ error: 'Mật khẩu không đúng.' }, 401);
    }
    const session = await createSession(env.SESSION_SECRET);
    return respond({ ok: true }, 200, { 'set-cookie': `${SESSION_COOKIE}=${session}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_TTL}` });
  }

  if (url.pathname === '/api/logout' && request.method === 'POST') {
    return respond({ ok: true }, 200, { 'set-cookie': `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0` });
  }

  if (url.pathname.startsWith('/api/agent/')) {
    if (!agentAuthenticated(request, env)) return respond({ error: 'Agent token không hợp lệ.' }, 401);
    const store = taskStore(env);
    if (url.pathname === '/api/agent/diagnostic' && request.method === 'POST') {
      const task = await store.createTask('mo https://analytics.aoing.workers.dev/\nscreenshot');
      return respond({ id: task.id, status: task.status }, 202);
    }
    const diagnosticMatch = url.pathname.match(/^\/api\/agent\/diagnostic\/([^/]+)$/);
    if (diagnosticMatch && request.method === 'GET') {
      const task = await store.getTask(diagnosticMatch[1]);
      return task ? respond(task) : respond({ error: 'Không tìm thấy task.' }, 404);
    }
    if (url.pathname === '/api/agent/next' && request.method === 'POST') {
      const task = await store.claimNext();
      return task ? respond(task) : new Response(null, { status: 204 });
    }
    const completeMatch = url.pathname.match(/^\/api\/agent\/tasks\/([^/]+)\/complete$/);
    if (completeMatch && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      if (!['completed', 'failed'].includes(body.status)) return respond({ error: 'Trạng thái không hợp lệ.' }, 400);
      const updated = await store.completeTask(completeMatch[1], body);
      return updated ? respond({ ok: true }) : respond({ error: 'Không tìm thấy task.' }, 404);
    }
    return respond({ error: 'Agent endpoint không tồn tại.' }, 404);
  }

  const ok = await authenticated(request, env);
  if (url.pathname === '/api/me') return respond({ authenticated: ok });
  if (!ok) return respond({ error: 'Bạn cần đăng nhập.' }, 401);
  const store = taskStore(env);

  if (url.pathname === '/api/tasks' && request.method === 'POST') {
    const body = await request.json().catch(() => ({}));
    const requestText = String(body.request || '').trim();
    if (!requestText || requestText.length > 10000) return respond({ error: 'Yêu cầu trống hoặc quá dài.' }, 400);
    return respond(await store.createTask(requestText), 202);
  }

  if (url.pathname === '/api/tasks' && request.method === 'GET') {
    return respond({ tasks: await store.listTasks(20) });
  }

  const taskMatch = url.pathname.match(/^\/api\/tasks\/([^/]+)$/);
  if (taskMatch && request.method === 'GET') {
    const task = await store.getTask(taskMatch[1]);
    return task ? respond(task) : respond({ error: 'Không tìm thấy task.' }, 404);
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
