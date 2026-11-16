import path from 'node:path';
import { chromium } from 'playwright-core';
import { assertAllowedUploadPath, assertAllowedUrl, policy } from './policy.js';

function safeFileName(name) {
  return name.replace(/[<>:"/\\|?*\x00-\x1F]/g, '_').slice(0, 180) || `download-${Date.now()}`;
}

function logLine(onLog, message, detail = null) {
  onLog({ at: new Date().toISOString(), message, detail });
}

async function emitLiveProgress(page, onProgress, step, total, action) {
  if (!onProgress) return;
  let buffer = null;
  for (const quality of [45, 30, 20]) {
    buffer = await page.screenshot({ type: 'jpeg', quality, fullPage: false });
    if (buffer.length <= 60_000) break;
  }
  await onProgress({
    step,
    total,
    action: action.type,
    url: page.url(),
    capturedAt: new Date().toISOString(),
    frame: `data:image/jpeg;base64,${buffer.toString('base64')}`
  });
}

export async function runBrowserPlan(actions, onLog, onProgress = null) {
  if (actions.length > policy.maxActionsPerTask) {
    throw new Error(`Task vượt quá ${policy.maxActionsPerTask} thao tác.`);
  }

  const browser = await chromium.launch({
    executablePath: policy.browser.executablePath,
    headless: policy.browser.headless
  });
  const context = await browser.newContext({ acceptDownloads: true, serviceWorkers: 'block' });
  const page = await context.newPage();
  const outputs = [];

  await context.route('**/*', async (route) => {
    const request = route.request();
    const frame = request.frame();
    const isTopLevelNavigation = request.isNavigationRequest() && frame.parentFrame() === null;
    if (isTopLevelNavigation) {
      try {
        assertAllowedUrl(request.url());
      } catch (error) {
        logLine(onLog, 'Đã chặn điều hướng ngoài whitelist', request.url());
        await route.abort('blockedbyclient');
        return;
      }
    }
    await route.continue();
  });

  if (typeof context.routeWebSocket === 'function') {
    await context.routeWebSocket('**/*', (ws) => {
      try {
        assertAllowedUrl(ws.url());
        ws.connectToServer();
      } catch {
        logLine(onLog, 'Đã chặn WebSocket ngoài whitelist', ws.url());
        ws.close();
      }
    });
  }

  try {
    for (let index = 0; index < actions.length; index += 1) {
      const action = actions[index];
      logLine(onLog, `Bước ${index + 1}/${actions.length}: ${action.type}`);

      if (action.type === 'goto') {
        assertAllowedUrl(action.url);
        await page.goto(action.url, { waitUntil: 'domcontentloaded', timeout: 30_000 });
        outputs.push({ type: 'url', value: page.url() });
        await emitLiveProgress(page, onProgress, index + 1, actions.length, action);
        continue;
      }

      if (action.type === 'clickText') {
        await page.getByText(action.text, { exact: true }).first().click({ timeout: 15_000 });
        await emitLiveProgress(page, onProgress, index + 1, actions.length, action);
        continue;
      }

      if (action.type === 'fillLabel') {
        await page.getByLabel(action.label, { exact: false }).first().fill(action.value);
        await emitLiveProgress(page, onProgress, index + 1, actions.length, action);
        continue;
      }

      if (action.type === 'selectLabel') {
        await page.getByLabel(action.label, { exact: false }).first().selectOption({ label: action.value });
        await emitLiveProgress(page, onProgress, index + 1, actions.length, action);
        continue;
      }

      if (action.type === 'downloadClick') {
        const downloadPromise = page.waitForEvent('download', { timeout: 30_000 });
        await page.getByText(action.text, { exact: true }).first().click({ timeout: 15_000 });
        const download = await downloadPromise;
        const fileName = safeFileName(download.suggestedFilename());
        const destination = path.join(policy.downloadFolder, fileName);
        await download.saveAs(destination);
        outputs.push({ type: 'download', value: destination });
        logLine(onLog, 'Đã tải file', destination);
        await emitLiveProgress(page, onProgress, index + 1, actions.length, action);
        continue;
      }

      if (action.type === 'upload') {
        const filePath = assertAllowedUploadPath(action.filePath);
        await page.locator(action.selector).setInputFiles(filePath);
        logLine(onLog, 'Đã chọn file để upload', filePath);
        await emitLiveProgress(page, onProgress, index + 1, actions.length, action);
        continue;
      }

      if (action.type === 'waitForText') {
        await page.getByText(action.text, { exact: false }).first().waitFor({ state: 'visible', timeout: 30_000 });
        await emitLiveProgress(page, onProgress, index + 1, actions.length, action);
        continue;
      }

      if (action.type === 'screenshot') {
        const destination = path.join(policy.screenshotFolder, `task-${Date.now()}.png`);
        await page.screenshot({ path: destination, fullPage: true });
        outputs.push({ type: 'screenshot', value: destination });
        logLine(onLog, 'Đã chụp ảnh', destination);
        await emitLiveProgress(page, onProgress, index + 1, actions.length, action);
        continue;
      }

      throw new Error(`Action không được hỗ trợ: ${action.type}`);
    }

    return outputs;
  } finally {
    await context.close();
    await browser.close();
  }
}
