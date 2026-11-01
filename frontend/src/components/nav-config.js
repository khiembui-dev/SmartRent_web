// Điều hướng theo luồng làm việc của chủ trọ: tạo cơ sở → phòng → xem phòng → hợp đồng → tính tiền → hóa đơn.
// Ẩn mục theo quyền chỉ để gọn giao diện; máy chủ vẫn kiểm tra quyền.
export const ADMIN_NAV = [
  {
    items: [
      { path: '/admin', label: 'Tổng quan', icon: 'grid-1x2', exact: true, perm: 'properties.read' },
    ],
  },
  {
    title: 'Nhà trọ',
    items: [
      { path: '/admin/properties', label: 'Cơ sở', icon: 'buildings', perm: 'properties.read' },
      { path: '/admin/rooms', label: 'Phòng', icon: 'door-closed', perm: 'rooms.read' },
      { path: '/admin/viewings', label: 'Lịch xem phòng', icon: 'calendar-event', perm: 'inquiries.read', countKey: 'new_inquiries' },
    ],
  },
  {
    title: 'Khách và hợp đồng',
    items: [
      { path: '/admin/tenants', label: 'Khách thuê', icon: 'people', perm: 'tenants.read' },
      { path: '/admin/contracts', label: 'Hợp đồng', icon: 'file-earmark-text', perm: 'contracts.read', countKey: 'expiring' },
    ],
  },
  {
    title: 'Thu tiền',
    items: [
      { path: '/admin/billing', label: 'Tính tiền phòng', icon: 'calculator', perm: 'billing.read', countKey: 'missing_readings' },
      { path: '/admin/invoices', label: 'Hóa đơn', icon: 'receipt', perm: 'invoices.read', countKey: 'pending_payments' },
    ],
  },
  {
    title: 'Hỗ trợ và cài đặt',
    items: [
      { path: '/admin/tickets', label: 'Ticket', icon: 'chat-left-text', perm: 'tickets.read', countKey: 'new_tickets' },
      { path: '/admin/settings', label: 'Cài đặt', icon: 'gear' },
    ],
  },
];

export const SYSTEM_NAV = [
  {
    title: 'Quản trị hệ thống',
    items: [
      { path: '/system', label: 'Đơn vị chủ trọ', icon: 'buildings', exact: true },
      { path: '/system/users', label: 'Tài khoản', icon: 'people' },
      { path: '/system/operations', label: 'Hỗ trợ & vận hành', icon: 'hdd-stack' },
      { path: '/system/notifications', label: 'Thông báo', icon: 'bell' },
    ],
  },
];

// Menu khu khách hàng. member: chỉ hiện khi đã đăng nhập; finance: người ở cùng không có nghĩa vụ thanh toán nên không hiện.
export const CUSTOMER_NAV = [
  { path: '/rooms', label: 'Thuê phòng', icon: 'door-open' },
  { path: '/invoices', label: 'Hóa đơn', icon: 'receipt', member: true, finance: true },
  { path: '/tickets', label: 'Hỗ trợ', icon: 'chat-dots', member: true },
  { path: '/contract', label: 'Hợp đồng', icon: 'file-earmark-text', member: true },
  { path: '/contact', label: 'Liên hệ', icon: 'telephone' },
];
