// Bảng route. layout quyết định khung; auth quyết định ai được vào khu vực; perm là quyền tối thiểu (kiểm tra thật ở máy chủ).
const admin = (path, load, perm, extra = {}) => ({ path, layout: 'admin', auth: 'admin', perm, load, ...extra });
// Khu khách hàng: site là trang ai cũng xem được, member cần đăng nhập bằng tài khoản khách.
const site = (path, load) => ({ path, layout: 'customer', auth: 'none', load });
const member = (path, load) => ({ path, layout: 'customer', auth: 'customer', load });

export const ROUTES = [
  // Khu khách hàng
  site('/', () => import('../pages/customer/home/index.js')),
  site('/rooms', () => import('../pages/customer/rooms/list.js')),
  site('/rooms/:slug', () => import('../pages/customer/rooms/detail.js')),
  site('/favorites', () => import('../pages/customer/favorites.js')),
  site('/contact', () => import('../pages/customer/contact.js')),
  member('/invoices', () => import('../pages/customer/invoices/list.js')),
  member('/invoices/:id/pay', () => import('../pages/customer/invoices/payment.js')),
  member('/invoices/:id', () => import('../pages/customer/invoices/detail.js')),
  member('/tickets', () => import('../pages/customer/tickets/list.js')),
  member('/tickets/new', () => import('../pages/customer/tickets/new.js')),
  member('/tickets/:id', () => import('../pages/customer/tickets/detail.js')),
  member('/contract', () => import('../pages/customer/contract.js')),
  member('/account', () => import('../pages/customer/account.js')),
  member('/notifications', () => import('../pages/shared/notifications.js')),

  // Xác thực: cửa đăng nhập riêng cho admin, không cho đăng ký admin.
  { path: '/admin/login', redirect: '/login' },
  { path: '/admin/forgot-password', layout: 'auth', auth: 'none', load: () => import('../pages/auth/forgot.js') },
  { path: '/admin/reset-password', layout: 'auth', auth: 'none', load: () => import('../pages/auth/reset.js') },
  { path: '/login', layout: 'auth', auth: 'guest', load: () => import('../pages/auth/login.js') },
  { path: '/register', layout: 'auth', auth: 'guest', load: () => import('../pages/auth/register.js') },
  { path: '/forgot-password', layout: 'auth', auth: 'none', load: () => import('../pages/auth/forgot.js') },
  { path: '/reset-password', layout: 'auth', auth: 'none', load: () => import('../pages/auth/reset.js') },

  // Quản trị: 10 khu theo luồng làm việc của chủ trọ.
  admin('/admin', () => import('../pages/admin/dashboard.js'), 'properties.read'),
  admin('/admin/properties', () => import('../pages/admin/properties.js'), 'properties.read'),
  admin('/admin/properties/new', () => import('../pages/admin/property-form.js'), 'properties.write'),
  admin('/admin/properties/:id', () => import('../pages/admin/property-detail.js'), 'properties.read'),
  admin('/admin/properties/:id/edit', () => import('../pages/admin/property-form.js'), 'properties.write'),
  admin('/admin/rooms', () => import('../pages/admin/rooms.js'), 'rooms.read'),
  admin('/admin/rooms/new', () => import('../pages/admin/room-form.js'), 'rooms.write'),
  admin('/admin/rooms/:id', () => import('../pages/admin/room-detail.js'), 'rooms.read'),
  admin('/admin/rooms/:id/edit', () => import('../pages/admin/room-form.js'), 'rooms.write'),
  admin('/admin/viewings', () => import('../pages/admin/viewings.js'), 'inquiries.read'),
  admin('/admin/billing', () => import('../pages/admin/billing.js'), 'billing.read'),
  admin('/admin/tenants', () => import('../pages/admin/tenants.js'), 'tenants.read'),
  admin('/admin/tenants/:id', () => import('../pages/admin/tenant-detail.js'), 'tenants.read'),
  admin('/admin/contracts', () => import('../pages/admin/contracts.js'), 'contracts.read'),
  admin('/admin/contracts/new', () => import('../pages/admin/contract-new.js'), 'tenancies.checkin'),
  admin('/admin/contracts/:id', () => import('../pages/admin/contract-detail.js'), 'contracts.read'),
  admin('/admin/invoices', () => import('../pages/admin/invoices.js'), 'invoices.read'),
  admin('/admin/invoices/:id', () => import('../pages/admin/invoice-detail.js'), 'invoices.read'),
  admin('/admin/tickets', () => import('../pages/admin/tickets.js'), 'tickets.read'),
  admin('/admin/tickets/:id', () => import('../pages/admin/tickets.js'), 'tickets.read'),
  admin('/admin/settings', () => import('../pages/admin/settings.js')),

];

export const NOT_FOUND = { path: '*', layout: 'customer', auth: 'none', load: () => import('../pages/customer/not-found.js') };
