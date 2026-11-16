const quoted = '"([^"\\r\\n]+)"';

function cleanLine(line) {
  return line.trim().replace(/^[-*]\s*/, '');
}

function cleanValue(value) {
  return String(value || '')
    .trim()
    .replace(/^['"]|['"]$/g, '')
    .replace(/[.。]+$/g, '')
    .trim();
}

export function buildPlan(requestText) {
  const lines = requestText
    .split(/\r?\n/)
    .map(cleanLine)
    .filter(Boolean);

  const actions = [];
  const ignored = [];
  let contextLabel = null;

  for (const line of lines) {
    let match;

    match = line.match(/^(?:ở|o|tại|tai)\s+["']([^"']+)["']\s*$/i);
    if (match) {
      contextLabel = cleanValue(match[1]);
      continue;
    }

    match = line.match(/^(?:mở|mo|truy cập|truy cap|vào|vao)\s+(https?:\/\/\S+)$/i);
    if (match) {
      actions.push({ type: 'goto', url: match[1] });
      continue;
    }

    match = line.match(/^(?:nhập|nhap|điền|dien)\s+([^:]+)\s*:\s*(.+?)\s+(?:và|va|rồi|roi)\s+(?:ấn|an|bấm|bam|click)\s+(.+)$/i);
    if (match) {
      actions.push({ type: 'fillLabel', value: cleanValue(match[2]), label: cleanValue(match[1]) });
      actions.push({ type: 'clickText', text: cleanValue(match[3]) });
      continue;
    }

    match = line.match(/^(?:nhập|nhap|điền|dien)\s+([^:]+)\s*:\s*(.+)$/i);
    if (match) {
      actions.push({ type: 'fillLabel', value: cleanValue(match[2]), label: cleanValue(match[1]) });
      continue;
    }

    match = line.match(/^(?:chọn|chon)\s+(?:bản|ban)\s+(.+?)\s+(?:rồi|roi)\s+(?:chọn|chon|ấn|an|bấm|bam|click)\s+(.+)$/i);
    if (match && contextLabel) {
      actions.push({ type: 'selectLabel', value: cleanValue(match[1]), label: contextLabel });
      actions.push({ type: 'clickText', text: cleanValue(match[2]) });
      continue;
    }

    match = line.match(/^(?:chọn|chon)\s+(?:bản|ban)\s+(.+)$/i);
    if (match && contextLabel) {
      actions.push({ type: 'selectLabel', value: cleanValue(match[1]), label: contextLabel });
      continue;
    }

    match = line.match(new RegExp(`^(?:bấm|bam|click)\\s+${quoted}$`, 'i'));
    if (match) {
      actions.push({ type: 'clickText', text: match[1] });
      continue;
    }

    match = line.match(new RegExp(`^(?:nhập|nhap|điền|dien)\\s+${quoted}\\s+(?:vào|vao)\\s+${quoted}$`, 'i'));
    if (match) {
      actions.push({ type: 'fillLabel', value: match[1], label: match[2] });
      continue;
    }

    match = line.match(new RegExp(`^(?:chọn|chon|select)\\s+${quoted}\\s+(?:ở|o|tại|tai)\\s+${quoted}$`, 'i'));
    if (match) {
      actions.push({ type: 'selectLabel', value: match[1], label: match[2] });
      continue;
    }

    match = line.match(new RegExp(`^(?:tải file khi bấm|tai file khi bam|download khi click)\\s+${quoted}$`, 'i'));
    if (match) {
      actions.push({ type: 'downloadClick', text: match[1] });
      continue;
    }

    match = line.match(new RegExp(`^(?:upload|tải lên|tai len)\\s+${quoted}\\s+(?:vào|vao)\\s+${quoted}$`, 'i'));
    if (match) {
      actions.push({ type: 'upload', filePath: match[1], selector: match[2] });
      continue;
    }

    match = line.match(new RegExp(`^(?:chờ|cho|đợi|doi)\\s+${quoted}$`, 'i'));
    if (match) {
      actions.push({ type: 'waitForText', text: match[1] });
      continue;
    }

    if (/^(?:chụp ảnh|chup anh|screenshot)$/i.test(line)) {
      actions.push({ type: 'screenshot' });
      continue;
    }

    ignored.push(line);
  }

  if (actions.length === 0) {
    throw new Error('Chưa hiểu yêu cầu. Hãy viết mỗi thao tác trên một dòng theo mẫu hiển thị trong giao diện.');
  }

  return { actions, ignored };
}
