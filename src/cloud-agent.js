import { buildPlan } from './planner.js';
import { runBrowserPlan } from './browser-worker.js';

const cloudUrl = String(process.env.BOT_CLOUD_URL || '').replace(/\/$/, '');
const agentToken = String(process.env.BOT_AGENT_TOKEN || '');
const pollMs = Math.max(1000, Number(process.env.BOT_POLL_MS || 3000));

if (!cloudUrl || !agentToken) {
  throw new Error('Thiếu BOT_CLOUD_URL hoặc BOT_AGENT_TOKEN trong .env.agent');
}

const headers = { authorization: `Bearer ${agentToken}`, 'content-type': 'application/json' };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function agentFetch(pathname, options = {}) {
  const response = await fetch(`${cloudUrl}${pathname}`, {
    ...options,
    headers: { ...headers, ...(options.headers || {}) }
  });
  if (response.status === 204) return null;
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || `Cloud API ${response.status}`);
  return payload;
}

async function completeTask(id, payload) {
  await agentFetch(`/api/agent/tasks/${id}/complete`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

async function updateTaskProgress(id, payload) {
  try {
    await agentFetch(`/api/agent/tasks/${id}/progress`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
  } catch (error) {
    console.warn(`[${id}] live progress lỗi: ${error.message}`);
  }
}

async function runTask(task) {
  const logs = [];
  try {
    const plan = buildPlan(task.request);
    logs.push({ at: new Date().toISOString(), message: 'Đã phân tích yêu cầu', detail: `${plan.actions.length} thao tác` });
    await updateTaskProgress(task.id, { logs, live: null });
    const outputs = await runBrowserPlan(
      plan.actions,
      (entry) => logs.push(entry),
      async (live) => updateTaskProgress(task.id, { logs, live })
    );
    await completeTask(task.id, { status: 'completed', plan, logs, outputs, error: null });
    console.log(`[${task.id}] completed`);
  } catch (error) {
    logs.push({ at: new Date().toISOString(), message: 'Task lỗi', detail: error.message });
    await completeTask(task.id, { status: 'failed', plan: null, logs, outputs: [], error: error.message });
    console.error(`[${task.id}] failed: ${error.message}`);
  }
}

console.log(`Company Bot agent kết nối ${cloudUrl}`);
while (true) {
  try {
    const task = await agentFetch('/api/agent/next', { method: 'POST', body: '{}' });
    if (task) await runTask(task);
  } catch (error) {
    console.error(`Agent poll lỗi: ${error.message}`);
  }
  await sleep(pollMs);
}
