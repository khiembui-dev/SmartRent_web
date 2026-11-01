// Tagged template an toàn: mọi giá trị chèn vào đều được escape, trừ khi bọc bằng raw()/html``.
// Dữ liệu mock và dữ liệu API đều do người dùng nhập nên không bao giờ ghép chuỗi HTML trực tiếp.

class SafeHtml {
  constructor(value) {
    this.value = value;
  }
  toString() {
    return this.value;
  }
}

const ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };

export function escapeHtml(value) {
  return String(value).replace(/[&<>"'`]/g, (ch) => ESCAPES[ch]);
}

export function raw(value) {
  return new SafeHtml(value == null ? '' : String(value));
}

// true/false hiển thị thành chuỗi rỗng để viết được ${điều_kiện && html`...`}.
// Vì vậy giá trị thuộc tính kiểu boolean (aria-pressed, data-exact...) phải bọc String(...).
export function toHtml(value) {
  if (value == null || value === false || value === true) return '';
  if (value instanceof SafeHtml) return value.value;
  if (Array.isArray(value)) return value.map(toHtml).join('');
  return escapeHtml(value);
}

export function html(strings, ...values) {
  let out = strings[0];
  for (let i = 0; i < values.length; i += 1) {
    out += toHtml(values[i]) + strings[i + 1];
  }
  return new SafeHtml(out);
}

export function isSafeHtml(value) {
  return value instanceof SafeHtml;
}

/** Nội dung văn bản nhiều dòng: escape rồi giữ xuống dòng. */
export function multiline(text) {
  if (!text) return raw('');
  return raw(escapeHtml(text).replace(/\r?\n/g, '<br>'));
}

export function attrs(map) {
  const parts = [];
  for (const [key, value] of Object.entries(map)) {
    if (value == null || value === false) continue;
    if (value === true) parts.push(escapeHtml(key));
    else parts.push(`${escapeHtml(key)}="${escapeHtml(value)}"`);
  }
  return raw(parts.join(' '));
}

export function cls(...names) {
  return names.flat().filter(Boolean).join(' ');
}

export function setHtml(element, content) {
  element.innerHTML = toHtml(content);
  return element;
}
