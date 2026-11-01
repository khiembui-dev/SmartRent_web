// crypto.randomUUID chỉ có trong secure context (https/localhost). Khi mở demo qua IP LAN bằng http,
// dùng getRandomValues (có ở mọi context) để tạo UUID v4.
export function uuid() {
  if (globalThis.crypto?.randomUUID) {
    try {
      return globalThis.crypto.randomUUID();
    } catch {
      // rơi xuống cách dự phòng
    }
  }
  const bytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** UUID ổn định từ một khóa chuỗi (dùng cho dữ liệu mẫu để ID không đổi giữa các lần reset). */
export function stableUuid(key) {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  const out = [];
  for (let round = 0; round < 4; round += 1) {
    for (let i = 0; i < key.length; i += 1) {
      const c = key.charCodeAt(i) + round * 131;
      h1 = Math.imul(h1 ^ c, 16777619) >>> 0;
      h2 = Math.imul(h2 + c, 2246822519) >>> 0;
    }
    out.push(((h1 ^ h2) >>> 0).toString(16).padStart(8, '0'));
    h1 = Math.imul(h1 ^ h2, 3266489917) >>> 0;
  }
  const hex = out.join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-${((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16)}${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
