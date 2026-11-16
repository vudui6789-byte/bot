import crypto from 'node:crypto';
import express from 'express';
import { buildPlan } from './src/planner.js';
import { policy } from './src/policy.js';
import { runBrowserPlan } from './src/browser-worker.js';

const app = express();
const tasks = new Map();

app.use(express.json({ limit: '256kb' }));
app.use(express.static('public'));

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, browser: policy.browser.executablePath });
});

app.get('/api/policy', (_req, res) => {
  res.json({
    allowedDomains: policy.allowedDomains,
    allowedUploadFolders: policy.allowedUploadFolders,
    downloadFolder: policy.downloadFolder,
    maxActionsPerTask: policy.maxActionsPerTask
  });
});

app.post('/api/plan', (req, res) => {
  try {
    res.json(buildPlan(String(req.body?.request ?? '')));
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/tasks', (req, res) => {
  let plan;
  try {
    plan = buildPlan(String(req.body?.request ?? ''));
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }

  const id = crypto.randomUUID();
  const task = {
    id,
    status: 'queued',
    request: req.body.request,
    plan,
    logs: [],
    outputs: [],
    error: null,
    createdAt: new Date().toISOString()
  };
  tasks.set(id, task);

  queueMicrotask(async () => {
    task.status = 'running';
    try {
      task.outputs = await runBrowserPlan(plan.actions, (entry) => task.logs.push(entry));
      task.status = 'completed';
    } catch (error) {
      task.error = error.message;
      task.logs.push({ at: new Date().toISOString(), message: 'Task lỗi', detail: error.message });
      task.status = 'failed';
    }
  });

  return res.status(202).json({ id, status: task.status, plan });
});

app.get('/api/tasks/:id', (req, res) => {
  const task = tasks.get(req.params.id);
  if (!task) {
    return res.status(404).json({ error: 'Không tìm thấy task.' });
  }
  return res.json(task);
});

app.listen(policy.port, policy.host, () => {
  console.log(`Company Bot đang chạy tại http://${policy.host}:${policy.port}`);
});
