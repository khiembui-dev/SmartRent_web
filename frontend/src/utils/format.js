export { formatVnd, formatNumber } from './money.js';
export { formatDate, formatDateTime, formatRelative, formatTime, monthLabel, displayEndDate } from './date.js';

export function initials(name = '') {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return '?';
  const last = words[words.length - 1][0];
  const first = words.length > 1 ? words[0][0] : '';
  return (first + last).toUpperCase();
}

export function truncate(text, length = 80) {
  if (!text) return '';
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}

export function formatArea(m2) {
  return `${new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(m2)} m²`;
}

export function formatPhone(phone) {
  if (!phone) return '—';
  const d = phone.replace(/\D/g, '');
  return d.length === 10 ? `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}` : phone;
}

/** Bỏ dấu tiếng Việt để tìm kiếm không phân biệt dấu. */
export function foldVietnamese(text = '') {
  return String(text)
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .toLowerCase();
}

export function slugify(text = '') {
  return foldVietnamese(text).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}
