// Tiền VND là số nguyên (numeric(18,0)). Đơn giá tối đa 4 chữ số thập phân, lượng 6 (dòng hóa đơn) hoặc 3 (chỉ số).
// Tính toán ở trình duyệt CHỈ để xem trước; số tiền chính thức do máy chủ tính và chụp lại khi phát hành.

const vndFormatter = new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 });
const numberFormatter = new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 });

export function formatVnd(value, { signed = false, empty = '—' } = {}) {
  if (value == null || value === '' || Number.isNaN(Number(value))) return empty;
  const n = Number(value);
  const text = vndFormatter.format(Math.abs(n) === 0 ? 0 : n);
  if (signed && n > 0) return `+${text}`;
  return text;
}

/** Số có phân cách nghìn kiểu Việt Nam, tối đa `digits` chữ số thập phân. */
export function formatNumber(value, digits = 0) {
  if (value == null || value === '') return '—';
  if (digits === 0) return numberFormatter.format(Number(value));
  return new Intl.NumberFormat('vi-VN', { maximumFractionDigits: digits }).format(Number(value));
}

/** "3.655.000" hoặc "3655000 đ" → 3655000. Trả null nếu rỗng hoặc không hợp lệ. */
export function parseVnd(input) {
  if (input == null) return null;
  if (typeof input === 'number') return Number.isFinite(input) ? Math.trunc(input) : null;
  const digits = String(input).replace(/[^\d-]/g, '');
  if (!digits || digits === '-') return null;
  const n = Number(digits);
  return Number.isSafeInteger(n) ? n : null;
}

/** Format digits without rounding, and keep the caret beside the same digit. */
export function formatMoneyEdit(value, position = value.length) {
  const negative = value.trimStart().startsWith('-');
  const rawDigits = value.replace(/\D/g, '');
  const digits = rawDigits.replace(/^0+(?=\d)/, '');
  const removed = rawDigits.length - digits.length;
  const before = Math.max(0, value.slice(0, position).replace(/\D/g, '').length - removed);
  const text = (negative ? '-' : '') + digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  let caret = negative ? 1 : 0;
  let seen = 0;
  while (caret < text.length && seen < before) {
    if (/\d/.test(text[caret])) seen++;
    caret++;
  }
  return { text, caret };
}

/** "12,5" hoặc "12.5" → 12.5 cho số lượng/chỉ số; dấu chấm phân cách nghìn không dùng ở trường này. */
export function parseDecimal(input) {
  if (input == null || input === '') return null;
  if (typeof input === 'number') return Number.isFinite(input) ? input : null;
  const normalized = String(input).trim().replace(/\s/g, '').replace(',', '.');
  if (!/^-?\d+(\.\d+)?$/.test(normalized)) return null;
  return Number(normalized);
}

function toScaled(value, scale) {
  const text = typeof value === 'number' ? value.toFixed(Math.min(scale + 2, 20)) : String(value).trim();
  const m = /^(-)?(\d+)(?:\.(\d+))?$/.exec(text);
  if (!m) throw new Error(`Số không hợp lệ: ${value}`);
  const frac = (m[3] || '').padEnd(scale, '0').slice(0, scale);
  const scaled = BigInt(m[2] + frac);
  return m[1] ? -scaled : scaled;
}

/** Chia BigInt làm tròn nửa ra xa 0 (MidpointRounding.AwayFromZero). */
function divRoundHalfAway(numerator, denominator) {
  const negative = (numerator < 0n) !== (denominator < 0n);
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  const q = (2n * n + d) / (2n * d);
  return negative ? -q : q;
}

/**
 * Tiền một dòng = ROUND(lượng × đơn giá × tử / mẫu) về VND, rồi nhân dấu.
 * Tính chính xác bằng BigInt để tránh sai số dấu phẩy động.
 */
export function lineAmount({ quantity, unitPrice, prorationNumerator = 1, prorationDenominator = 1, sign = 1 }) {
  const q = toScaled(quantity ?? 0, 6);
  const p = toScaled(unitPrice ?? 0, 4);
  const product = q * p * BigInt(prorationNumerator);
  const divisor = 10n ** 10n * BigInt(prorationDenominator);
  return Number(divRoundHalfAway(product, divisor)) * (sign < 0 ? -1 : 1);
}

export function sumLines(lines) {
  return lines.reduce((total, line) => total + lineAmount(line), 0);
}

export function roundVnd(value) {
  const n = Number(value);
  return Math.sign(n) * Math.round(Math.abs(n));
}
