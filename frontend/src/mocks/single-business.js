// DTO cũ còn bọc cấu hình trong organizations để các trang hiện có tiếp tục dùng được.
// Dữ liệu nghiệp vụ chỉ có một chủ trọ, danh mục và hồ sơ khách dùng chung toàn hệ thống.
export function singleBusiness(db) {
  const business = db.organizations[0];
  if (!business) return db;
  const redirects = new Map(db.organizations.slice(1).map((o) => [o.id, business.id]));
  const catalogs = ['chargeTypes', 'roomTypes', 'amenities', 'ticketCategories', 'slaPolicies', 'expenseCategories'];
  for (const name of catalogs) {
    const byCode = new Map();
    for (const row of db[name] || []) {
      const code = row.code || row.priority;
      if (byCode.has(code)) redirects.set(row.id, byCode.get(code).id);
      else byCode.set(code, row);
    }
    db[name] = [...byCode.values()];
  }
  const accounts = new Map();
  for (const tenant of db.tenants) {
    if (!tenant.userId) continue;
    if (accounts.has(tenant.userId)) redirects.set(tenant.id, accounts.get(tenant.userId));
    else accounts.set(tenant.userId, tenant.id);
  }
  db.tenants = db.tenants.filter((t) => !redirects.has(t.id));
  function replace(value) {
    if (typeof value === 'string') return redirects.get(value) || value;
    if (Array.isArray(value)) return value.map(replace);
    if (value && typeof value === 'object') for (const key of Object.keys(value)) value[key] = replace(value[key]);
    return value;
  }
  replace(db);
  db.organizations = [business];
  db.orgSettings = db.orgSettings.slice(0, 1);
  db.emailConfigs = db.emailConfigs.slice(0, 1);
  const admin = db.users.find((u) => u.role === 'admin');
  db.users.forEach((u) => { u.role = u.id === admin?.id ? 'admin' : 'user'; });
  db.memberships = db.memberships.filter((m, i, all) => m.userId === admin?.id && all.findIndex((x) => x.organizationId === m.organizationId && x.userId === m.userId) === i);
  let next = Math.max(0, ...db.tenants.map((t) => Number(t.code?.match(/\d+$/)?.[0]) || 0));
  const codes = new Set();
  for (const tenant of db.tenants) {
    if (codes.has(tenant.code)) tenant.code = `KH-${String(++next).padStart(4, '0')}`;
    codes.add(tenant.code);
  }
  db.counters[`tenant:${business.id}`] = Math.max(next, db.counters[`tenant:${business.id}`] || 0);
  let hasDefaultBank = false;
  db.bankAccounts.forEach((b) => {
    if (b.isDefault && hasDefaultBank) b.isDefault = false;
    if (b.isDefault) hasDefaultBank = true;
  });
  return db;
}
