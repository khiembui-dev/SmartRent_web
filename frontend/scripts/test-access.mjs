import assert from 'node:assert/strict';
import { loginRedirect } from '../src/services/access.js';
import { ROUTES } from '../src/router/routes.js';
import { migrateAccounts } from '../src/mocks/accounts.js';

const memory = new Map();
globalThis.localStorage = { getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => memory.set(k, String(v)), removeItem: (k) => memory.delete(k) };
const schedule = globalThis.setTimeout;
globalThis.setTimeout = (fn, _ms, ...args) => schedule(fn, 0, ...args);
const { mockTransport, listRoutes } = await import('../src/mocks/server.js');
const { resetData, getData } = await import('../src/mocks/db.js');
const { DEMO_PASSWORD, SEED_VERSION } = await import('../src/mocks/seed.js');
resetData();
const call = (method, path, body, token) => mockTransport({ method, path, body, headers: token ? { Authorization: `Bearer ${token}` } : {} });
const login = (email, audience) => call('POST', '/api/v1/auth/login', { email, password: DEMO_PASSWORD, audience });
const rejected = (promise, status, code) => assert.rejects(promise, (e) => e.status === status && (!code || e.code === code));
const admin = getData().users.find((u) => u.role === 'admin');
const customer = getData().users.find((u) => u.role === 'user');
assert.equal(getData().users.filter((u) => u.role === 'admin').length, 1);
assert.ok(getData().users.every((u) => ['admin', 'user'].includes(u.role)));
assert.ok(!ROUTES.some((r) => /^\/(system|portal)(\/|$)/.test(r.path)));
assert.ok(!listRoutes().some((r) => /^\/api\/v1\/(system|roles|members|permissions|support-access)(\/|$)/.test(r.path)));
for (const old of ['quan.quanly@example.com', 'lan.nhanvien@example.com', 'minh.kythuat@example.com', 'admin@smartrent.example.com', 'tung.hoabinh@example.com']) {
  await rejected(login(old, 'admin'), 401, 'invalid_credentials');
}
await rejected(login(customer.email, 'admin'), 403, 'admin_only');
await rejected(login(admin.email, 'customer'), 403, 'customer_only');
await rejected(login(admin.email, 'manager'), 422, 'invalid_audience');
const adminSession = await login(admin.email, 'admin');
const customerSession = await login(customer.email, 'customer');
await rejected(call('GET', '/api/v1/portal/invoices', null, adminSession.accessToken), 403, 'customer_only');
const adminEndpoints = listRoutes().filter((r) => r.auth === 'admin');
for (const route of adminEndpoints) {
  const path = route.path.replace(/:\w+/g, 'test-id');
  await rejected(call(route.method, path, {}, customerSession.accessToken), 403, 'admin_only');
  await rejected(call(route.method, path, {}), 401, 'unauthorized');
}
for (const route of ROUTES.filter((r) => r.auth === 'admin')) {
  assert.equal(loginRedirect(route.auth, customer, route.path), '/');
  assert.ok(loginRedirect(route.auth, null, route.path).startsWith('/admin/login?next='));
  assert.equal(loginRedirect(route.auth, admin, route.path), null);
}
const registration = await call('POST', '/api/v1/auth/register', {
  fullName: 'Khách kiểm thử', email: 'access-test@example.com', phone: '0912345678', password: 'password123', acceptedTerms: true,
  role: 'admin', systemRoles: ['SystemAdmin'], permissions: ['settings.manage'],
});
const me = await call('GET', '/api/v1/me', null, registration.accessToken);
assert.equal(me.user.role, 'user');
assert.deepEqual(me.organizations, []);
await call('PUT', '/api/v1/me/profile', { displayName: 'Khách', email: me.user.email, phone: '0912345678', role: 'admin' }, registration.accessToken);
assert.equal((await call('GET', '/api/v1/me', null, registration.accessToken)).user.role, 'user');
assert.equal(getData().users.filter((u) => u.role === 'admin').length, 1);

// Nâng cấp dữ liệu cũ giữ nguyên nghiệp vụ và tài khoản khách, thu hồi mọi phiên cũ.
const legacy = structuredClone(getData());
const oldStaffId = 'old-staff';
legacy.users.push({ id: oldStaffId, key: 'staff', email: 'old-staff@example.com', systemRoles: [] });
legacy.businessRoles = [{ code: 'staff' }];
legacy.supportGrants = [{}];
legacy.invoices[0].createdBy = oldStaffId;
legacy.meta.seedVersion = 'v7-2026-11-01';
delete legacy.users.find((u) => u.id === admin.id).role;
const migrated = migrateAccounts(legacy, SEED_VERSION);
assert.equal(migrated.invoices.length, getData().invoices.length);
assert.equal(migrated.invoices[0].createdBy, admin.id);
assert.ok(migrated.users.some((u) => u.email === me.user.email && u.role === 'user'));
assert.ok(!migrated.users.some((u) => u.id === oldStaffId));
assert.ok(!migrated.businessRoles && !migrated.supportGrants);
assert.deepEqual(migrated.sessions, []);
assert.ok(migrated.memberships.every((m) => m.userId === admin.id && !m.roleIds));
console.log(`Đạt: 2 loại tài khoản, một admin, đăng nhập riêng, chống tự nâng quyền, ${adminEndpoints.length} API admin chặn khách/khách vãng lai, router và chuyển dữ liệu cũ.`);
