// Đồng bộ bộ lọc với query string để link từ dashboard mở đúng danh sách đã lọc và có thể chia sẻ URL.

export function parseQuery(search = window.location.search) {
  const params = new URLSearchParams(search);
  const out = {};
  for (const [key, value] of params.entries()) {
    if (key in out) out[key] = [].concat(out[key], value);
    else out[key] = value;
  }
  return out;
}

export function toQueryString(params) {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params || {})) {
    if (value == null || value === '' || (Array.isArray(value) && value.length === 0)) continue;
    if (Array.isArray(value)) value.forEach((v) => sp.append(key, v));
    else sp.set(key, String(value));
  }
  const text = sp.toString();
  return text ? `?${text}` : '';
}

export function cleanParams(params) {
  return Object.fromEntries(Object.entries(params).filter(([, v]) => v != null && v !== '' && !(Array.isArray(v) && !v.length)));
}

export const asArray = (v) => (v == null || v === '' ? [] : Array.isArray(v) ? v : String(v).split(','));
