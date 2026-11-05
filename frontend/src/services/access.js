// Hai loại tài khoản duy nhất. Quyền truy cập không suy ra từ hồ sơ thuê hay cơ sở.
export const isAdmin = (user) => user?.role === 'admin';
export const isCustomer = (user) => user?.role === 'user';
export const isAdminPath = (path) => path === '/admin' || path.startsWith('/admin/');

export function loginRedirect(auth, user, next) {
  const home = isAdmin(user) ? '/admin' : '/';
  if (auth === 'guest' && user) return home;
  if (auth === 'admin') {
    if (!user) return `/admin/login?next=${encodeURIComponent(next)}`;
    if (!isAdmin(user)) return '/';
  }
  if (auth === 'customer') {
    if (!user) return `/login?next=${encodeURIComponent(next)}`;
    if (!isCustomer(user)) return '/admin';
  }
  return null;
}
