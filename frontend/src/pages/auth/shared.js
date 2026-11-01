// Phần dùng chung của đăng nhập và đăng ký.
import { session } from '../../services/session.js';

/** Chỉ nhận đường dẫn nội bộ để không bị dẫn sang trang ngoài. */
export const safeNext = (query) => (query.next && query.next.startsWith('/') && !query.next.startsWith('//') ? query.next : null);

/** Về đúng trang khách đang xem trước khi đăng nhập; khu quản trị vẫn cần đúng quyền. */
export function landingAfterLogin(next) {
  if (!next) return session.homePath();
  if (next.startsWith('/admin')) return session.isStaff ? next : session.homePath();
  if (next.startsWith('/system')) return session.isSystemAdmin ? next : session.homePath();
  return next;
}
