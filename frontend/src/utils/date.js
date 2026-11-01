// Quy ước ngày giờ (khớp database và hợp đồng API):
// - Ngày nghiệp vụ (nhận/trả phòng, kỳ, hạn, hiệu lực) là chuỗi "YYYY-MM-DD", KHÔNG đổi qua Date để tránh lệch múi giờ.
// - Thời điểm (đã ghi, đã xác nhận...) là ISO 8601 UTC, hiển thị theo Asia/Ho_Chi_Minh.
// - Khoảng thời gian là [đầu, cuối): tính ngày đầu, không tính ngày cuối.

export const TIME_ZONE = 'Asia/Ho_Chi_Minh';
// Việt Nam không dùng giờ mùa hè từ 1975, nên quy đổi nhập liệu giờ địa phương ↔ UTC là +07:00 cố định.
const VN_OFFSET_MINUTES = 7 * 60;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const isoDateInZone = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' });
const dateTimeFmt = new Intl.DateTimeFormat('vi-VN', {
  timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit', year: 'numeric', hour12: false,
});
const timeFmt = new Intl.DateTimeFormat('vi-VN', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit', hour12: false });
const weekdayFmt = new Intl.DateTimeFormat('vi-VN', { timeZone: 'UTC', weekday: 'long' });

const pad = (n, len = 2) => String(n).padStart(len, '0');

export function isIsoDate(value) {
  if (typeof value !== 'string') return false;
  const m = ISO_DATE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return mo >= 1 && mo <= 12 && d >= 1 && d <= daysInMonth(y, mo);
}

export function parseIsoDate(iso) {
  const m = ISO_DATE.exec(iso || '');
  if (!m) throw new Error(`Ngày không hợp lệ: ${iso}`);
  return { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) };
}

export function makeIsoDate(y, m, d) {
  return `${pad(y, 4)}-${pad(m)}-${pad(d)}`;
}

export function daysInMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** Ngày hôm nay theo giờ Việt Nam, không phụ thuộc múi giờ máy. */
export function todayIso(now = new Date()) {
  return isoDateInZone.format(now);
}

/** Ngày (theo giờ Việt Nam) của một thời điểm UTC. */
export function instantToIsoDate(instant) {
  return isoDateInZone.format(new Date(instant));
}

export function nowInstant() {
  return new Date().toISOString();
}

export function addDays(iso, days) {
  const { y, m, d } = parseIsoDate(iso);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Cộng tháng, ngày không tồn tại về cuối tháng (31/01 + 1 tháng = 28 hoặc 29/02), giống PostgreSQL. */
export function addMonths(iso, months) {
  const { y, m, d } = parseIsoDate(iso);
  const total = y * 12 + (m - 1) + months;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return makeIsoDate(ny, nm, Math.min(d, daysInMonth(ny, nm)));
}

export function diffDays(fromIso, toIso) {
  const a = parseIsoDate(fromIso);
  const b = parseIsoDate(toIso);
  return Math.round((Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86400000);
}

export function compareIso(a, b) {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

export function monthStart(iso) {
  const { y, m } = parseIsoDate(iso);
  return makeIsoDate(y, m, 1);
}

export function nextMonthStart(iso) {
  return addMonths(monthStart(iso), 1);
}

export function monthKey(iso) {
  return iso.slice(0, 7);
}

export function monthLabel(iso) {
  const { y, m } = parseIsoDate(iso.length === 7 ? `${iso}-01` : iso);
  return `Tháng ${m}/${y}`;
}

/** Danh sách tháng (giá trị YYYY-MM, nhãn "Tháng m/yyyy") từ `back` tháng trước tới `ahead` tháng sau, mới nhất trước. */
export function monthOptions({ around = todayIso(), back = 18, ahead = 3, include } = {}) {
  const base = monthStart(around);
  const list = [];
  for (let i = ahead; i >= -back; i -= 1) list.push(addMonths(base, i).slice(0, 7));
  if (include && !list.includes(include)) list.push(include);
  return list.sort().reverse().map((value) => ({ value, label: monthLabel(value) }));
}

/** Ngày lập theo cấu hình: ngày vượt số ngày của tháng thì lấy ngày cuối tháng (giống invoice_date()). */
export function invoiceDate(monthStartIso, day) {
  const { y, m } = parseIsoDate(monthStartIso);
  return makeIsoDate(y, m, Math.min(day, daysInMonth(y, m)));
}

/** Hạn hợp đồng nhanh: ngày kết thúc (không tính) = bắt đầu + số tháng. */
export function quickContractEndExclusive(startIso, months) {
  return addMonths(startIso, months);
}

/** Ngày kết thúc hiển thị trên hợp đồng = ends_on - 1 ngày. */
export function displayEndDate(endsOnExclusive) {
  return endsOnExclusive ? addDays(endsOnExclusive, -1) : null;
}

/** Hai khoảng [a1, a2) và [b1, b2) có giao nhau? null = vô hạn. */
export function rangesOverlap(a1, a2, b1, b2) {
  const startsBeforeOtherEnds = b2 == null || a1 < b2;
  const otherStartsBeforeEnd = a2 == null || b1 < a2;
  return startsBeforeOtherEnds && otherStartsBeforeEnd;
}

/** Số ngày của [from, to) nằm trong [rangeFrom, rangeTo). */
export function overlapDays(from, to, rangeFrom, rangeTo) {
  const start = from > rangeFrom ? from : rangeFrom;
  const end = to == null || to > rangeTo ? rangeTo : to;
  return end > start ? diffDays(start, end) : 0;
}

export function formatDate(iso) {
  if (!iso) return '—';
  const value = iso.length > 10 ? instantToIsoDate(iso) : iso;
  const { y, m, d } = parseIsoDate(value);
  return `${pad(d)}/${pad(m)}/${y}`;
}

export function formatWeekday(iso) {
  const { y, m, d } = parseIsoDate(iso);
  return weekdayFmt.format(new Date(Date.UTC(y, m - 1, d)));
}

export function formatDateTime(instant) {
  if (!instant) return '—';
  const parts = Object.fromEntries(dateTimeFmt.formatToParts(new Date(instant)).map((p) => [p.type, p.value]));
  return `${parts.hour}:${parts.minute}, ${parts.day}/${parts.month}/${parts.year}`;
}

export function formatTime(instant) {
  if (!instant) return '—';
  return timeFmt.format(new Date(instant));
}

export function formatRelative(instant, now = Date.now()) {
  if (!instant) return '—';
  const diff = Math.round((now - new Date(instant).getTime()) / 1000);
  const future = diff < 0;
  const s = Math.abs(diff);
  let text;
  if (s < 60) text = 'vài giây';
  else if (s < 3600) text = `${Math.floor(s / 60)} phút`;
  else if (s < 86400) text = `${Math.floor(s / 3600)} giờ`;
  else if (s < 86400 * 30) text = `${Math.floor(s / 86400)} ngày`;
  else return formatDate(instant);
  return future ? `còn ${text}` : `${text} trước`;
}

/** "2026-10-21T14:30" (giờ VN, từ input datetime-local) → ISO UTC. */
export function localInputToInstant(value) {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/.exec(value);
  if (!m) return null;
  const utc = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) - VN_OFFSET_MINUTES * 60000;
  return new Date(utc).toISOString();
}

/** ISO UTC → "2026-10-21T14:30" theo giờ VN, để điền vào input. */
export function instantToLocalInput(instant) {
  if (!instant) return '';
  const t = new Date(new Date(instant).getTime() + VN_OFFSET_MINUTES * 60000);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}T${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}`;
}

/** Thời điểm UTC của 00:00 giờ VN ngày iso + giờ/phút. */
export function vnDateTimeToInstant(iso, hour = 0, minute = 0) {
  const { y, m, d } = parseIsoDate(iso);
  return new Date(Date.UTC(y, m - 1, d, hour, minute) - VN_OFFSET_MINUTES * 60000).toISOString();
}

/** Mảng tháng (ngày đầu tháng) từ from tới to (bao gồm). */
export function monthsBetween(fromIso, toIso) {
  const out = [];
  let cur = monthStart(fromIso);
  const end = monthStart(toIso);
  while (cur <= end) {
    out.push(cur);
    cur = addMonths(cur, 1);
  }
  return out;
}
