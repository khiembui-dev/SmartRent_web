import { singleBusiness } from './single-business.js';
// Chuyển dữ liệu demo cũ sang hai loại tài khoản, giữ phòng/hóa đơn/hợp đồng đã nhập.
// Phiên cũ bị thu hồi để vai trò đã xóa không tiếp tục dùng được.
export function migrateAccounts(db, version) {
  const admin = db.users.find((u) => u.role === 'admin' || u.key === 'owner');
  if (!admin) throw new Error('Dữ liệu thiếu tài khoản chủ trọ.');
  const customerIds = new Set(db.tenants.map((t) => t.userId).filter(Boolean));
  const removedIds = new Set(db.users.filter((u) => u.id !== admin.id && !customerIds.has(u.id)).map((u) => u.id));
  db.users = db.users.filter((u) => u.id === admin.id || customerIds.has(u.id));
  for (const user of db.users) {
    user.role = user.id === admin.id ? 'admin' : 'user';
    delete user.systemRoles;
  }
  // Lịch sử thao tác của các nhân sự cũ nay thuộc tài khoản quản trị duy nhất.
  function remap(value) {
    if (typeof value === 'string') return removedIds.has(value) ? admin.id : value;
    if (Array.isArray(value)) return value.map(remap);
    if (value && typeof value === 'object') {
      for (const key of Object.keys(value)) value[key] = remap(value[key]);
    }
    return value;
  }
  delete db.businessRoles;
  delete db.supportGrants;
  remap(db);
  db.memberships = db.organizations.map((org) => ({
    id: `admin:${org.id}`, organizationId: org.id, userId: admin.id,
    status: 'active', propertyScope: 'all', propertyIds: [], joinedAt: admin.createdAt,
  }));
  db.permissions = db.permissions.filter((p) => !p.code.startsWith('members.'));
  db.sessions = [];
  db.idempotency = {};
  delete db.resetTokens;
  db.meta.seedVersion = version;
  return singleBusiness(db);
}
