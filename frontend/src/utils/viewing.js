import { addDays, instantToLocalInput } from './date.js';

// Booking input is a Vietnam wall-clock value, independent of the browser's zone.
export function viewingBounds(now = new Date()) {
  const nextMinute = new Date((Math.floor(new Date(now).getTime() / 60000) + 1) * 60000);
  const local = instantToLocalInput(nextMinute);
  const min = local.slice(11) > '20:00' ? `${addDays(local.slice(0, 10), 1)}T00:00` : local;
  return { min, defaultTime: min.slice(11) < '10:00' ? `${min.slice(0, 10)}T10:00` : min };
}

export function viewingTimeError(value, now = new Date(), endsAt = null) {
  const instant = new Date(value);
  if (!value || !Number.isFinite(instant.getTime()) || instant <= new Date(now)) return 'Chọn thời gian xem trong tương lai, từ hôm nay trở đi.';
  const local = instantToLocalInput(instant);
  if (instant.getTime() > new Date(`${local.slice(0, 10)}T20:00:00+07:00`).getTime()) return 'Giờ bắt đầu xem chậm nhất là 20:00 theo giờ Việt Nam.';
  if (endsAt != null) {
    const end = new Date(endsAt);
    const localEnd = Number.isFinite(end.getTime()) ? instantToLocalInput(end) : '';
    if (!Number.isFinite(end.getTime()) || end <= instant || localEnd.slice(0, 10) !== local.slice(0, 10) || end.getTime() > new Date(`${local.slice(0, 10)}T21:00:00+07:00`).getTime()) return 'Lịch xem phải kết thúc sau bắt đầu và chậm nhất lúc 21:00 cùng ngày.';
  }
  return null;
}
