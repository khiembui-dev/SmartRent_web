// Quản trị hệ thống (nhiều chủ trọ): đơn vị, tài khoản, quyền hỗ trợ có thời hạn, sao lưu (mô phỏng).
import { uuid } from '../../utils/ids.js';
import { compareIso } from '../../utils/date.js';
import { conflict, fail, listResponse, validator } from '../respond.js';
import { audit, find, must, queueEmail } from '../engine.js';
import { userRef } from '../dto.js';
import { storageInfo } from '../db.js';
import { PERMISSIONS, SEED_VERSION } from '../seed.js';

function orgDto(db, o) {
  const props = db.properties.filter((p) => p.organizationId === o.id);
  const rooms = db.rooms.filter((r) => props.some((p) => p.id === r.propertyId));
  return {
    ...o, propertyCount: props.length, roomCount: rooms.length,
    memberCount: db.memberships.filter((m) => m.organizationId === o.id && m.status === 'active').length,
    activeTenancies: db.tenancies.filter((t) => t.status === 'active' && rooms.some((r) => r.id === find(db.roomAllocations, t.allocationId).roomId)).length,
    owners: db.memberships.filter((m) => m.organizationId === o.id && m.roleIds.some((id) => find(db.businessRoles, id)?.code === 'owner')).map((m) => userRef(db, m.userId)),
  };
}

function grantDto(db, g, now) {
  return { ...g, organization: { id: g.organizationId, name: find(db.organizations, g.organizationId)?.name }, grantedTo: userRef(db, g.grantedTo), grantedBy: userRef(db, g.grantedBy), isActive: !g.revokedAt && g.expiresAt > now && g.startsAt <= now };
}

export default function register(r) {
  r.get('/api/v1/system/organizations', (ctx) => listResponse(ctx.db.organizations.map((o) => orgDto(ctx.db, o)), ctx.query, {
    search: (o) => [o.code, o.name], sortable: ['code', 'name', 'createdAt'], defaultSort: 'name',
  }), { auth: 'system' });

  r.post('/api/v1/system/organizations', (ctx) => {
    const b = ctx.body;
    const v = validator();
    v.required('code', b.code, 'Mã đơn vị');
    v.required('name', b.name, 'Tên đơn vị');
    v.required('ownerName', b.ownerName, 'Tên chủ trọ');
    v.email('ownerEmail', b.ownerEmail, { required: true });
    v.check();
    if (ctx.db.organizations.some((o) => o.code === b.code)) conflict('org_code_taken', 'Mã đơn vị đã tồn tại.', { code: ['Trùng mã.'] });
    const org = { id: uuid(), code: b.code, name: b.name, legalName: null, taxCode: null, phone: null, email: null, isActive: true, createdAt: ctx.now };
    ctx.db.organizations.push(org);
    // Tương đương initialize_organization(): vai trò, quyền, danh mục khoản thu, ticket, SLA, chi phí, cấu hình.
    const all = PERMISSIONS.map((p) => p.code);
    const mk = (code, name, permissions) => {
      const role = { id: uuid(), organizationId: org.id, code, name, permissions, isSystem: true };
      ctx.db.businessRoles.push(role);
      return role;
    };
    const owner = mk('owner', 'Chủ trọ', all);
    mk('manager', 'Quản lý', all.filter((c) => !['members.manage', 'settings.manage', 'integrations.manage', 'payments.reverse', 'deposits.refund', 'billing.unlock'].includes(c)));
    mk('staff', 'Nhân viên', ['properties.read', 'rooms.read', 'inquiries.read', 'inquiries.write', 'tenants.read', 'meters.read', 'meters.write', 'billing.read', 'invoices.read', 'payments.read', 'payments.report', 'tickets.read', 'tickets.write']);
    [['RENT', 'Tiền thuê', 'rent', 'tháng'], ['ELECTRICITY', 'Điện', 'electricity', 'kWh'], ['WATER', 'Nước', 'water', 'm³'], ['SERVICE', 'Dịch vụ', 'service', 'phòng'], ['INTERNET', 'Internet', 'service', 'phòng'], ['GARBAGE', 'Rác', 'service', 'phòng'], ['OTHER', 'Phí khác', 'other', 'lần'], ['COMPENSATION', 'Bồi thường', 'compensation', 'lần']]
      .forEach(([code, name, category, unitLabel]) => ctx.db.chargeTypes.push({ id: uuid(), organizationId: org.id, code, name, category, unitLabel, isActive: true }));
    [['ELECTRICAL', 'Điện'], ['PLUMBING', 'Nước'], ['REPAIR', 'Sửa chữa'], ['OTHER', 'Khác']].forEach(([code, name]) => ctx.db.ticketCategories.push({ id: uuid(), organizationId: org.id, code, name }));
    [['urgent', 4], ['high', 12], ['normal', 48], ['low', 96]].forEach(([priority, targetHours]) => ctx.db.slaPolicies.push({ id: uuid(), organizationId: org.id, priority, targetHours, clockMode: 'continuous' }));
    [['REPAIR', 'Sửa chữa'], ['UTILITY', 'Điện nước đầu vào'], ['OPERATION', 'Vận hành'], ['OTHER', 'Khác']].forEach(([code, name]) => ctx.db.expenseCategories.push({ id: uuid(), organizationId: org.id, code, name }));
    ctx.db.orgSettings.push({ organizationId: org.id, timezone: 'Asia/Ho_Chi_Minh', dailyJobTime: '08:00', retentionDays: 365, contractWarningDays: 30 });
    let user = ctx.db.users.find((u) => u.email.toLowerCase() === b.ownerEmail.toLowerCase());
    if (!user) {
      user = { id: uuid(), key: null, email: b.ownerEmail, displayName: b.ownerName, phone: null, isActive: true, systemRoles: [], mockPassword: null, emailConfirmed: false, twoFactorEnabled: false, createdAt: ctx.now, lastLoginAt: null };
      ctx.db.users.push(user);
    }
    ctx.db.memberships.push({ id: uuid(), organizationId: org.id, userId: user.id, status: 'invited', propertyScope: 'all', roleIds: [owner.id], propertyIds: [], joinedAt: ctx.now, invitedAt: ctx.now });
    queueEmail(ctx.db, { organizationId: org.id, toEmail: user.email, templateCode: 'owner_invitation', eventKey: org.id, subject: 'Mời quản lý đơn vị trên SmartRent', at: ctx.now });
    audit(ctx.db, ctx, { organizationId: org.id, action: 'organization.create', tableName: 'organizations', recordId: org.id, after: { code: org.code, owner: user.email } });
    return orgDto(ctx.db, org);
  }, { auth: 'system' });

  const setActive = (active) => (ctx) => {
    const org = must(ctx.db.organizations, ctx.params.id, 'đơn vị');
    const v = validator();
    if (!active) v.reason('reason', ctx.body.reason);
    v.check();
    org.isActive = active;
    audit(ctx.db, ctx, { organizationId: org.id, action: active ? 'organization.activate' : 'organization.suspend', tableName: 'organizations', recordId: org.id, reason: ctx.body.reason });
    return orgDto(ctx.db, org);
  };
  r.post('/api/v1/system/organizations/:id/suspend', setActive(false), { auth: 'system' });
  r.post('/api/v1/system/organizations/:id/activate', setActive(true), { auth: 'system' });

  r.get('/api/v1/system/users', (ctx) => listResponse(ctx.db.users.map((u) => ({
    id: u.id, displayName: u.displayName, email: u.email, isActive: u.isActive, systemRoles: u.systemRoles, lastLoginAt: u.lastLoginAt, createdAt: u.createdAt,
    organizations: ctx.db.memberships.filter((m) => m.userId === u.id).map((m) => ({ name: find(ctx.db.organizations, m.organizationId).name, status: m.status })),
    isTenant: ctx.db.tenants.some((t) => t.userId === u.id),
  })), ctx.query, { search: (u) => [u.displayName, u.email], sortable: ['displayName', 'email', 'lastLoginAt'], defaultSort: 'displayName' }), { auth: 'system' });

  const lockUser = (lock) => (ctx) => {
    const user = must(ctx.db.users, ctx.params.id, 'tài khoản');
    if (user.id === ctx.user.id) fail(422, 'self_lock', 'Không tự khóa tài khoản quản trị đang dùng.');
    const v = validator();
    if (lock) v.reason('reason', ctx.body.reason);
    v.check();
    user.isActive = !lock;
    if (lock) ctx.db.sessions.filter((s) => s.userId === user.id && !s.revokedAt).forEach((s) => { s.revokedAt = ctx.now; });
    audit(ctx.db, ctx, { organizationId: null, action: lock ? 'user.lock' : 'user.unlock', tableName: 'users', recordId: user.id, reason: ctx.body.reason });
    return { id: user.id, isActive: user.isActive };
  };
  r.post('/api/v1/system/users/:id/lock', lockUser(true), { auth: 'system' });
  r.post('/api/v1/system/users/:id/unlock', lockUser(false), { auth: 'system' });

  r.get('/api/v1/system/support-access', (ctx) => ctx.db.supportGrants.sort((a, b) => compareIso(b.startsAt, a.startsAt)).map((g) => grantDto(ctx.db, g, ctx.now)), { auth: 'system' });

  r.get('/api/v1/system/backups', (ctx) => ctx.db.backupRuns.sort((a, b) => compareIso(b.startedAt, a.startedAt)), { auth: 'system' });

  r.post('/api/v1/system/backups', (ctx) => {
    const v = validator();
    v.oneOf('kind', ctx.body.kind, ['backup', 'restore_test'], 'Loại');
    v.check();
    const run = { id: uuid(), organizationId: null, kind: ctx.body.kind, status: 'succeeded', reference: `MÔ PHỎNG – ${ctx.body.kind === 'backup' ? 'không tạo bản sao lưu thật' : 'không khôi phục thật'}`, startedAt: ctx.now, finishedAt: ctx.now, note: 'Chỉ ghi nhận minh họa. Backend phải chạy sao lưu/khôi phục thật và lưu tham chiếu.' };
    ctx.db.backupRuns.push(run);
    return run;
  }, { auth: 'system' });

  r.get('/api/v1/system/health', (ctx) => ({
    dataSource: 'mock', seedVersion: SEED_VERSION, referenceToday: ctx.db.meta.referenceToday, storage: storageInfo(),
    counts: { organizations: ctx.db.organizations.length, users: ctx.db.users.length, rooms: ctx.db.rooms.length, invoices: ctx.db.invoices.length, payments: ctx.db.payments.length },
  }), { auth: 'system' });

  // ---------------------------------------------------------------- quyền hỗ trợ do chủ trọ cấp (phía đơn vị)
  r.get('/api/v1/support-access', (ctx) => ctx.db.supportGrants.filter((g) => g.organizationId === ctx.organizationId).map((g) => grantDto(ctx.db, g, ctx.now)), { perm: 'members.manage' });

  r.post('/api/v1/support-access', (ctx) => {
    const v = validator();
    v.reason('reason', ctx.body.reason);
    v.number('hours', ctx.body.hours, 'Thời hạn (giờ)', { min: 1, max: 168 });
    v.check();
    const admin = ctx.db.users.find((u) => u.systemRoles.includes('SystemAdmin'));
    const grant = { id: uuid(), organizationId: ctx.organizationId, grantedTo: admin.id, grantedBy: ctx.user.id, reason: ctx.body.reason, startsAt: ctx.now, expiresAt: new Date(Date.parse(ctx.now) + ctx.body.hours * 3600000).toISOString(), revokedAt: null };
    ctx.db.supportGrants.push(grant);
    audit(ctx.db, ctx, { action: 'support_access.grant', tableName: 'support_access_grants', recordId: grant.id, after: { hours: ctx.body.hours }, reason: ctx.body.reason });
    return grantDto(ctx.db, grant, ctx.now);
  }, { perm: 'members.manage' });

  r.post('/api/v1/support-access/:id/revoke', (ctx) => {
    const grant = ctx.db.supportGrants.find((g) => g.id === ctx.params.id && g.organizationId === ctx.organizationId);
    if (!grant) fail(404, 'not_found', 'Không tìm thấy quyền hỗ trợ.');
    if (grant.revokedAt) conflict('already_revoked', 'Quyền hỗ trợ đã bị thu hồi.');
    grant.revokedAt = ctx.now;
    audit(ctx.db, ctx, { action: 'support_access.revoke', tableName: 'support_access_grants', recordId: grant.id });
    return grantDto(ctx.db, grant, ctx.now);
  }, { perm: 'members.manage' });
}
