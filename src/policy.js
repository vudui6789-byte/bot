import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(currentDir, '..');
const configPath = path.join(projectRoot, 'config', 'policy.json');

function normalizePath(value) {
  return path.resolve(projectRoot, value);
}

function loadPolicy() {
  const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  const envDomains = process.env.BOT_ALLOWED_DOMAINS
    ? process.env.BOT_ALLOWED_DOMAINS.split(',').map((item) => item.trim()).filter(Boolean)
    : null;

  const policy = {
    ...raw,
    allowedDomains: envDomains ?? raw.allowedDomains,
    downloadFolder: normalizePath(raw.downloadFolder),
    screenshotFolder: normalizePath(raw.screenshotFolder),
    allowedUploadFolders: raw.allowedUploadFolders.map(normalizePath)
  };

  for (const folder of [policy.downloadFolder, policy.screenshotFolder, ...policy.allowedUploadFolders]) {
    fs.mkdirSync(folder, { recursive: true });
  }

  return policy;
}

export const policy = loadPolicy();

export function isDomainAllowed(rawUrl) {
  let hostname;
  try {
    hostname = new URL(rawUrl).hostname.toLowerCase();
  } catch {
    return false;
  }

  return policy.allowedDomains.some((rule) => {
    const normalized = rule.toLowerCase();
    if (normalized.startsWith('*.')) {
      const suffix = normalized.slice(1);
      return hostname.endsWith(suffix) && hostname !== suffix.slice(1);
    }
    return hostname === normalized;
  });
}

export function assertAllowedUrl(rawUrl) {
  if (!isDomainAllowed(rawUrl)) {
    throw new Error(`Domain chưa được cho phép: ${rawUrl}`);
  }
}

export function assertAllowedUploadPath(filePath) {
  const candidate = path.resolve(filePath);
  if (!fs.existsSync(candidate)) {
    throw new Error(`Không tìm thấy file upload: ${candidate}`);
  }
  const realCandidate = fs.realpathSync(candidate);
  const allowed = policy.allowedUploadFolders.some((folder) => {
    const realFolder = fs.realpathSync(folder);
    const relative = path.relative(realFolder, realCandidate);
    return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
  });

  if (!allowed) {
    throw new Error(`File nằm ngoài thư mục upload được phép: ${realCandidate}`);
  }
  return realCandidate;
}

export function getProjectRoot() {
  return projectRoot;
}
