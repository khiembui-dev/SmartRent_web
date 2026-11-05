// Phần dùng chung của đăng nhập và đăng ký.
import { session } from '../../services/session.js';
import { isAdminPath } from '../../services/access.js';

/** Chỉ nhận đường dẫn nội bộ để không bị dẫn sang trang ngoài. */
export const safeNext = (query) => (typeof query.next === 'string' && query.next.startsWith('/') && !query.next.startsWith('//') && !/[\\\u0000-\u0020]/.test(query.next) ? query.next : null);

/** Về đúng trang khách đang xem trước khi đăng nhập; khu quản trị vẫn cần đúng quyền. */
export function landingAfterLogin(next) {
  if (!next) return session.homePath();
  if (session.isAdmin) return isAdminPath(next) && !next.startsWith('/admin/login') ? next : '/admin';
  if (isAdminPath(next) || next.startsWith('/system') || next.startsWith('/portal') || /^\/(login|register)([/?#]|$)/.test(next)) return '/';
  return next;
}
