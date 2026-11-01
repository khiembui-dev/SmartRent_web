// Xuất CSV có BOM UTF-8 để Excel hiển thị đúng tiếng Việt.

function cell(value) {
  if (value == null) return '';
  const text = String(value);
  return /[",\n\r;]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** Bảng tự do (mỗi dòng một mảng ô): dùng cho tệp có phần đầu và phần tổng như hóa đơn. */
export function rowsToCsv(rows) {
  return `\ufeff${rows.map((row) => row.map(cell).join(',')).join('\r\n')}`;
}

export function toCsv(rows, columns) {
  const value = (row, c) => (typeof c.value === 'function' ? c.value(row) : row[c.key]);
  return rowsToCsv([columns.map((c) => c.label), ...rows.map((row) => columns.map((c) => value(row, c)))]);
}

export function downloadText(content, filename, type = 'text/csv;charset=utf-8') {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
