const quoted = '"([^"\\r\\n]+)"';

function cleanLine(line) {
  return line.trim().replace(/^[-*]\s*/, '');
}

export function buildPlan(requestText) {
  const lines = requestText
    .split(/\r?\n/)
    .map(cleanLine)
    .filter(Boolean);

  const actions = [];
  const ignored = [];

  for (const line of lines) {
    let match;

    match = line.match(/^(?:mở|mo|truy cập|truy cap|vào|vao)\s+(https?:\/\/\S+)$/i);
    if (match) {
      actions.push({ type: 'goto', url: match[1] });
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
