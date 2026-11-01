// Nhân sự, vai trò, cấu hình, mẫu nhắc, tác vụ nền, gửi email (mô phỏng), xuất dữ liệu, tích hợp, nhật ký, chi phí, AI, tệp.
import { uuid } from '../../utils/ids.js';
import { addDays, compareIso, formatDate, instantToIsoDate } from '../../utils/date.js';
import { asBool, conflict, fail, listResponse, rule, validator } from '../respond.js';
import {
  audit, contractStatus, expireReservations, find, invoiceBalance, isTicketOverdue, must, notify, permissionsOf, queueEmail,
  roomOccupancy, tenancyContext,
} from '../engine.js';
import { fileDto, propertyRef, roomRef, userRef } from '../dto.js';
import { fileContent, storeFileContent } from '../db.js';
import { orgProperties, propertyFilter, propertyInScope } from '../scope.js';

const fmt = (n) => new Intl.NumberFormat('vi-VN').format(n);

function memberDto(ctx, m) {
  const { db } = ctx;
  const user = find(db.users, m.userId);
  return {
    id: m.id, user: { id: user.id, displayName: user.displayName, email: user.email, phone: user.phone, lastLoginAt: user.lastLoginAt }, status: m.status,
    roles: m.roleIds.map((id) => find(db.businessRoles, id)).filter(Boolean).map((r) => ({ id: r.id, code: r.code, name: r.name })),
    propertyScope: m.propertyScope, properties: m.propertyIds.map((id) => propertyRef(find(db.properties, id))).filter(Boolean),
    permissionCount: permissionsOf(db, m).size, joinedAt: m.joinedAt, invitedAt: m.invitedAt, isSelf: m.userId === ctx.user.id,
  };
}

function assertGrantable(ctx, roleIds) {
  const mine = ctx.permissions;
  for (const roleId of roleIds) {
    const role = find(ctx.db.businessRoles, roleId);
    if (!role || role.organizationId !== ctx.organizationId) fail(422, 'validation_failed', 'Vai trò không hợp lệ.', { roleIds: ['Không thuộc đơn vị.'] });
    const extra = role.permissions.filter((p) => !mine.has(p));
    if (extra.length) fail(403, 'privilege_escalation', `Không cấp vai trò "${role.name}" vì có quyền bạn chưa có (${extra.slice(0, 3).join(', ')}${extra.length > 3 ? '…' : ''}).`);
  }
}

function ownerCount(ctx) {
  const ownerRole = ctx.db.businessRoles.find((r) => r.organizationId === ctx.organizationId && r.code === 'owner');
  return ctx.db.memberships.filter((m) => m.organizationId === ctx.organizationId && m.status === 'active' && m.roleIds.includes(ownerRole.id)).length;
}

function placeholderSvg(title, subtitle) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400" viewBox="0 0 640 400"><rect width="640" height="400" fill="#eef2f0"/><rect x="24" y="24" width="592" height="352" rx="18" fill="#fff" stroke="#1f5662" stroke-width="3" stroke-dasharray="10 8"/><text x="320" y="185" text-anchor="middle" font-family="sans-serif" font-size="26" fill="#1f5662">${title}</text><text x="320" y="225" text-anchor="middle" font-family="sans-serif" font-size="16" fill="#5b6b70">${subtitle}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

const FILE_PERMS = { identity_front: 'tenants.identity.read', identity_back: 'tenants.identity.read', contract_signed: 'contracts.read', payment_proof: 'payments.read', handover: 'contracts.read' };

function aiAnswer(ctx, question) {
  const { db, today } = ctx;
  const text = question.toLowerCase();
  const props = orgProperties(ctx);
  const propIds = new Set(props.map((p) => p.id));
  const rooms = db.rooms.filter((r) => propIds.has(r.propertyId));
  const scopeNote = `Phạm vi: ${props.length} cơ sở bạn được phân công, dữ liệu đến ${formatDate(today)}.`;
  if (/(trống|còn phòng|phòng nào)/.test(text)) {
    const free = rooms.filter((r) => roomOccupancy(db, r, today).occupancyStatus === 'available');
    const held = free.filter((r) => roomOccupancy(db, r, today).upcoming);
    return { content: `Hiện có ${free.length} phòng không có người ở: ${free.map((r) => r.code).join(', ') || 'không có'}. Trong đó ${held.length} phòng đã có giữ chỗ/đợt thuê dự kiến (${held.map((r) => r.code).join(', ') || '—'}), nên chưa chắc còn trống cho khách mới. ${scopeNote}`, sources: ['Phòng', 'Lịch phòng/giữ chỗ'] };
  }
  if (/(quá hạn|nợ|chưa thu|công nợ)/.test(text)) {
    const overdue = db.invoices.filter((i) => i.status === 'issued' && propIds.has(tenancyContext(db, i.tenancyId).property.id)).map((i) => ({ i, b: invoiceBalance(db, i, today) })).filter((x) => x.b.isOverdue);
    const total = overdue.reduce((s, x) => s + x.b.outstandingAmount, 0);
    return { content: `Có ${overdue.length} hóa đơn quá hạn, tổng còn phải thu ${fmt(total)} đ: ${overdue.slice(0, 6).map((x) => `${x.i.code} (${tenancyContext(db, x.i.tenancyId).room.code}, ${fmt(x.b.outstandingAmount)} đ)`).join('; ')}${overdue.length > 6 ? '…' : ''}. Khoản báo chuyển khoản chờ xác minh chưa được trừ. ${scopeNote}`, sources: ['Hóa đơn', 'Phân bổ thanh toán'] };
  }
  if (/(ticket|sự cố|sửa)/.test(text)) {
    const open = db.tickets.filter((t) => !['resolved', 'closed'].includes(t.status) && propIds.has(find(db.rooms, t.roomId).propertyId));
    const late = open.filter((t) => isTicketOverdue(t, ctx.now));
    return { content: `Có ${open.length} ticket đang mở, ${late.length} ticket quá hạn SLA: ${late.map((t) => `${t.code} – ${t.title}`).join('; ') || 'không có'}. ${scopeNote}`, sources: ['Ticket'] };
  }
  if (/(hợp đồng|hết hạn|gia hạn)/.test(text)) {
    const list = db.contracts.filter((k) => propIds.has(tenancyContext(db, k.tenancyId).property.id)).map((k) => ({ k, s: contractStatus(db, k, today) })).filter((x) => x.s.expiring || x.s.stillOccupiedAfterExpiry);
    return { content: `${list.length} hợp đồng cần xử lý: ${list.map((x) => `${x.k.code} (${tenancyContext(db, x.k.tenancyId).room.code}, ${x.s.stillOccupiedAfterExpiry ? 'đã hết hạn, khách vẫn ở' : `còn ${x.s.daysLeft} ngày`})`).join('; ') || 'không có'}. ${scopeNote}`, sources: ['Hợp đồng'] };
  }
  return { content: 'Tôi trả lời được câu hỏi về phòng trống, hóa đơn quá hạn/công nợ, ticket đang mở và hợp đồng sắp hết hạn trong phạm vi bạn được phép. Tôi không thực hiện thao tác tiền hay hợp đồng; các thao tác đó đi qua màn hình nghiệp vụ.', sources: [] };
}

// Khách thuê chỉ xem tệp gắn với chứng từ của chính mình: ticket mình báo/đợt thuê mình ở (không gồm ghi chú nội bộ),
// bản hợp đồng ký khi là người đại diện, ảnh chuyển khoản của mình.
function tenantCanSee(ctx, file) {
  const { db } = ctx;
  const tenantIds = new Set(db.tenants.filter((t) => t.userId === ctx.user.id).map((t) => t.id));
  if (!tenantIds.size) return false;
  const repTenancies = new Set(db.tenancies.filter((x) => tenantIds.has(x.representativeTenantId)).map((x) => x.id));
  const allTenancies = new Set([...repTenancies, ...db.residents.filter((r) => tenantIds.has(r.tenantId)).map((r) => r.tenancyId)]);
  const mineTicket = (t) => t && ((t.tenancyId && allTenancies.has(t.tenancyId)) || t.reportedBy === ctx.user.id);
  if (db.tickets.some((t) => (t.fileIds || []).includes(file.id) && mineTicket(t))) return true;
  if (db.ticketMessages.some((m) => !m.isInternal && (m.fileIds || []).includes(file.id) && mineTicket(find(db.tickets, m.ticketId)))) return true;
  if (db.contractVersions.some((v) => v.files.some((f) => f.fileId === file.id) && repTenancies.has(find(db.contracts, v.contractId)?.tenancyId))) return true;
  return db.payments.some((pay) => (pay.fileIds || []).includes(file.id) && tenantIds.has(pay.tenantId));
}

export default function register(r) {
  // ---------------------------------------------------------------- nhân sự
  r.get('/api/v1/members', (ctx) => {
    const all = ctx.db.memberships.filter((m) => m.organizationId === ctx.organizationId).map((m) => memberDto(ctx, m));
    return listResponse(all, ctx.query, {
      filter: (m) => !ctx.query.status || m.status === ctx.query.status,
      search: (m) => [m.user.displayName, m.user.email],
      sortable: ['user.displayName', 'status', 'joinedAt'],
      defaultSort: 'user.displayName',
    });
  }, { perm: 'members.read' });

  r.post('/api/v1/members/invitations', (ctx) => {
    const b = ctx.body;
    const v = validator();
    v.email('email', b.email, { required: true });
    v.required('displayName', b.displayName, 'Họ tên');
    v.required('roleIds', b.roleIds, 'Vai trò');
    v.oneOf('propertyScope', b.propertyScope, ['all', 'assigned'], 'Phạm vi cơ sở');
    if (b.propertyScope === 'assigned' && !b.propertyIds?.length) v.add('propertyIds', 'Chọn ít nhất một cơ sở.');
    v.check();
    assertGrantable(ctx, b.roleIds);
    if (b.propertyScope === 'all' && ctx.membership.propertyScope !== 'all') fail(403, 'privilege_escalation', 'Bạn chỉ quản lý một số cơ sở nên không cấp phạm vi "Tất cả cơ sở".');
    (b.propertyIds || []).forEach((id) => propertyInScope(ctx, id));
    let user = ctx.db.users.find((u) => u.email.toLowerCase() === b.email.toLowerCase());
    if (user && ctx.db.memberships.some((m) => m.userId === user.id && m.organizationId === ctx.organizationId)) conflict('already_member', 'Tài khoản đã thuộc đơn vị.');
    if (!user) {
      user = { id: uuid(), key: null, email: b.email, displayName: b.displayName, phone: null, isActive: true, systemRoles: [], mockPassword: null, emailConfirmed: false, twoFactorEnabled: false, createdAt: ctx.now, lastLoginAt: null };
      ctx.db.users.push(user);
    }
    const membership = { id: uuid(), organizationId: ctx.organizationId, userId: user.id, status: 'invited', propertyScope: b.propertyScope, roleIds: b.roleIds, propertyIds: b.propertyScope === 'all' ? [] : b.propertyIds, joinedAt: ctx.now, invitedAt: ctx.now };
    ctx.db.memberships.push(membership);
    queueEmail(ctx.db, { organizationId: ctx.organizationId, toEmail: b.email, templateCode: 'staff_invitation', eventKey: membership.id, subject: 'Lời mời tham gia SmartRent', at: ctx.now });
    audit(ctx.db, ctx, { action: 'member.invite', tableName: 'organization_memberships', recordId: membership.id, after: { email: b.email, roles: b.roleIds } });
    return memberDto(ctx, membership);
  }, { perm: 'members.manage' });

  r.put('/api/v1/members/:id', (ctx) => {
    const m = ctx.db.memberships.find((x) => x.id === ctx.params.id && x.organizationId === ctx.organizationId);
    if (!m) fail(404, 'not_found', 'Không tìm thấy nhân sự.');
    const b = ctx.body;
    const v = validator();
    v.required('roleIds', b.roleIds, 'Vai trò');
    v.oneOf('propertyScope', b.propertyScope, ['all', 'assigned'], 'Phạm vi cơ sở');
    if (b.propertyScope === 'assigned' && !b.propertyIds?.length) v.add('propertyIds', 'Chọn ít nhất một cơ sở.');
    v.check();
    assertGrantable(ctx, b.roleIds);
    const ownerRole = ctx.db.businessRoles.find((x) => x.organizationId === ctx.organizationId && x.code === 'owner');
    if (m.roleIds.includes(ownerRole.id) && !b.roleIds.includes(ownerRole.id) && ownerCount(ctx) <= 1) rule('last_owner', 'Đơn vị cần ít nhất một chủ trọ. Gán vai trò chủ trọ cho người khác trước.');
    if (m.userId === ctx.user.id && b.roleIds.join() !== m.roleIds.join()) rule('self_role_change', 'Không tự đổi vai trò của chính mình.');
    const before = { roleIds: m.roleIds, propertyScope: m.propertyScope, propertyIds: m.propertyIds };
    Object.assign(m, { roleIds: b.roleIds, propertyScope: b.propertyScope, propertyIds: b.propertyScope === 'all' ? [] : b.propertyIds });
    audit(ctx.db, ctx, { action: 'member.update', tableName: 'organization_memberships', recordId: m.id, before, after: { roleIds: m.roleIds, propertyScope: m.propertyScope, propertyIds: m.propertyIds } });
    return memberDto(ctx, m);
  }, { perm: 'members.manage' });

  r.post('/api/v1/members/:id/suspend', (ctx) => {
    const m = ctx.db.memberships.find((x) => x.id === ctx.params.id && x.organizationId === ctx.organizationId);
    if (!m) fail(404, 'not_found', 'Không tìm thấy nhân sự.');
    const v = validator();
    v.reason('reason', ctx.body.reason);
    v.check();
    if (m.userId === ctx.user.id) rule('self_suspend', 'Không tự khóa tài khoản của chính mình.');
    const ownerRole = ctx.db.businessRoles.find((x) => x.organizationId === ctx.organizationId && x.code === 'owner');
    if (m.roleIds.includes(ownerRole.id) && ownerCount(ctx) <= 1) rule('last_owner', 'Không khóa chủ trọ duy nhất.');
    m.status = 'suspended';
    // Thu hồi phiên đăng nhập khi khóa (mock: thu hồi mọi phiên của tài khoản).
    ctx.db.sessions.filter((s) => s.userId === m.userId && !s.revokedAt).forEach((s) => { s.revokedAt = ctx.now; });
    audit(ctx.db, ctx, { action: 'member.suspend', tableName: 'organization_memberships', recordId: m.id, after: { status: 'suspended' }, reason: ctx.body.reason });
    return memberDto(ctx, m);
  }, { perm: 'members.manage' });

  r.post('/api/v1/members/:id/activate', (ctx) => {
    const m = ctx.db.memberships.find((x) => x.id === ctx.params.id && x.organizationId === ctx.organizationId);
    if (!m) fail(404, 'not_found', 'Không tìm thấy nhân sự.');
    if (m.status === 'invited') rule('invitation_pending', 'Lời mời chưa được chấp nhận. Gửi lại lời mời nếu cần.');
    m.status = 'active';
    audit(ctx.db, ctx, { action: 'member.activate', tableName: 'organization_memberships', recordId: m.id, after: { status: 'active' } });
    return memberDto(ctx, m);
  }, { perm: 'members.manage' });

  r.post('/api/v1/members/:id/resend-invitation', (ctx) => {
    const m = ctx.db.memberships.find((x) => x.id === ctx.params.id && x.organizationId === ctx.organizationId);
    if (!m || m.status !== 'invited') fail(404, 'not_found', 'Không có lời mời đang chờ.');
    const user = find(ctx.db.users, m.userId);
    queueEmail(ctx.db, { organizationId: ctx.organizationId, toEmail: user.email, templateCode: 'staff_invitation', eventKey: `${m.id}:${ctx.now}`, subject: 'Nhắc lời mời tham gia SmartRent', at: ctx.now });
    return { simulated: true, toEmail: user.email };
  }, { perm: 'members.manage' });

  // ---------------------------------------------------------------- vai trò và quyền
  r.get('/api/v1/permissions', (ctx) => ctx.db.permissions, { perm: 'members.read' });

  r.get('/api/v1/roles', (ctx) => ctx.db.businessRoles.filter((x) => x.organizationId === ctx.organizationId).map((x) => ({
    ...x, memberCount: ctx.db.memberships.filter((m) => m.organizationId === ctx.organizationId && m.roleIds.includes(x.id) && m.status !== 'left').length,
  })), { perm: 'members.read' });

  r.post('/api/v1/roles', (ctx) => {
    const b = ctx.body;
    const v = validator();
    v.required('code', b.code, 'Mã vai trò');
    v.required('name', b.name, 'Tên vai trò');
    v.check();
    if (ctx.db.businessRoles.some((x) => x.organizationId === ctx.organizationId && x.code === b.code)) conflict('role_code_taken', 'Mã vai trò đã tồn tại.', { code: ['Trùng mã.'] });
    const extra = (b.permissions || []).filter((p) => !ctx.permissions.has(p));
    if (extra.length) fail(403, 'privilege_escalation', 'Không tạo vai trò có quyền bạn chưa có.');
    const role = { id: uuid(), organizationId: ctx.organizationId, code: b.code, name: b.name, permissions: b.permissions || [], isSystem: false };
    ctx.db.businessRoles.push(role);
    audit(ctx.db, ctx, { action: 'role.create', tableName: 'business_roles', recordId: role.id, after: { code: role.code, permissions: role.permissions } });
    return role;
  }, { perm: 'members.manage' });

  r.put('/api/v1/roles/:id', (ctx) => {
    const role = ctx.db.businessRoles.find((x) => x.id === ctx.params.id && x.organizationId === ctx.organizationId);
    if (!role) fail(404, 'not_found', 'Không tìm thấy vai trò.');
    if (role.code === 'owner') rule('owner_role_fixed', 'Vai trò Chủ trọ luôn có toàn bộ quyền và không chỉnh được.');
    const b = ctx.body;
    const extra = (b.permissions || []).filter((p) => !ctx.permissions.has(p));
    if (extra.length) fail(403, 'privilege_escalation', 'Không cấp quyền bạn chưa có.');
    const before = { permissions: role.permissions };
    Object.assign(role, { name: b.name || role.name, permissions: b.permissions || role.permissions });
    audit(ctx.db, ctx, { action: 'role.update', tableName: 'business_role_permissions', recordId: role.id, before, after: { permissions: role.permissions } });
    return role;
  }, { perm: 'members.manage' });

  // ---------------------------------------------------------------- cấu hình
  const scheduleOf = (ctx) => {
    const { meterReadingDay, invoiceCreateDay, reminderEnabled } = ctx.db.orgSettings.find((s) => s.organizationId === ctx.organizationId);
    return { meterReadingDay, invoiceCreateDay, reminderEnabled };
  };
  r.get('/api/v1/settings/billing-schedule', scheduleOf, { perm: 'billing.read' });

  r.put('/api/v1/settings/billing-schedule', (ctx) => {
    const b = ctx.body;
    const v = validator();
    // Tối đa ngày 28 để tháng nào cũng có ngày nhắc.
    v.number('meterReadingDay', b.meterReadingDay, 'Ngày nhập số điện nước', { min: 1, max: 28 });
    v.number('invoiceCreateDay', b.invoiceCreateDay, 'Ngày tạo hóa đơn', { min: 1, max: 28 });
    if (Number.isFinite(b.meterReadingDay) && Number.isFinite(b.invoiceCreateDay) && b.invoiceCreateDay < b.meterReadingDay) v.add('invoiceCreateDay', 'Ngày tạo hóa đơn phải từ ngày nhập số trở đi.');
    v.check();
    Object.assign(ctx.db.orgSettings.find((s) => s.organizationId === ctx.organizationId), { meterReadingDay: b.meterReadingDay, invoiceCreateDay: b.invoiceCreateDay, reminderEnabled: Boolean(b.reminderEnabled) });
    audit(ctx.db, ctx, { action: 'settings.billing_schedule', tableName: 'organization_settings', recordId: ctx.organizationId, after: scheduleOf(ctx) });
    return scheduleOf(ctx);
  }, { perm: 'settings.manage' });

  r.get('/api/v1/settings/organization', (ctx) => {
    const org = find(ctx.db.organizations, ctx.organizationId);
    return { ...org, settings: ctx.db.orgSettings.find((s) => s.organizationId === org.id) };
  }, { perm: 'members.read' });

  r.put('/api/v1/settings/organization', (ctx) => {
    const org = find(ctx.db.organizations, ctx.organizationId);
    const b = ctx.body;
    const v = validator();
    v.required('name', b.name, 'Tên đơn vị');
    v.email('email', b.email);
    v.phone('phone', b.phone);
    if (b.settings) {
      if (!/^\d{2}:\d{2}$/.test(b.settings.dailyJobTime || '')) v.add('settings.dailyJobTime', 'Giờ chạy dạng HH:mm.');
      v.number('settings.retentionDays', b.settings.retentionDays, 'Số ngày lưu', { min: 30, max: 3650 });
      v.number('settings.contractWarningDays', b.settings.contractWarningDays, 'Mốc cảnh báo hợp đồng', { min: 0, max: 365 });
    }
    v.check();
    Object.assign(org, { name: b.name, legalName: b.legalName || null, taxCode: b.taxCode || null, phone: b.phone || null, email: b.email || null });
    if (b.settings) Object.assign(ctx.db.orgSettings.find((s) => s.organizationId === org.id), { dailyJobTime: b.settings.dailyJobTime, retentionDays: b.settings.retentionDays, contractWarningDays: b.settings.contractWarningDays });
    audit(ctx.db, ctx, { action: 'settings.organization', tableName: 'organization_settings', recordId: org.id, after: { name: org.name } });
    return { ...org, settings: ctx.db.orgSettings.find((s) => s.organizationId === org.id) };
  }, { perm: 'settings.manage' });

  const emailDto = (cfg) => (cfg ? { host: cfg.host, port: cfg.port, securityMode: cfg.securityMode, username: cfg.username, fromAddress: cfg.fromAddress, fromName: cfg.fromName, hasSecret: cfg.hasSecret, lastTestAt: cfg.lastTestAt, lastTestResult: cfg.lastTestResult, updatedAt: cfg.updatedAt } : null);
  r.get('/api/v1/settings/email', (ctx) => emailDto(ctx.db.emailConfigs.find((c) => c.organizationId === ctx.organizationId)), { perm: 'settings.manage' });

  r.put('/api/v1/settings/email', (ctx) => {
    const b = ctx.body;
    const v = validator();
    v.required('host', b.host, 'Máy chủ SMTP');
    v.number('port', b.port, 'Cổng', { min: 1, max: 65535 });
    v.oneOf('securityMode', b.securityMode, ['starttls', 'tls', 'none'], 'Bảo mật');
    v.email('fromAddress', b.fromAddress, { required: true });
    v.check();
    let cfg = ctx.db.emailConfigs.find((c) => c.organizationId === ctx.organizationId);
    if (!cfg) {
      cfg = { organizationId: ctx.organizationId, hasSecret: false, secretRef: null, lastTestAt: null, lastTestResult: null };
      ctx.db.emailConfigs.push(cfg);
    }
    Object.assign(cfg, { host: b.host, port: b.port, securityMode: b.securityMode, username: b.username || null, fromAddress: b.fromAddress, fromName: b.fromName || null, updatedAt: ctx.now });
    // Mật khẩu chỉ ghi (write-only): mock không lưu giá trị, chỉ ghi nhận đã có secret.
    if (b.password) {
      cfg.hasSecret = true;
      cfg.secretRef = `secret://smtp/${ctx.organizationId}`;
    }
    cfg.lastTestResult = null;
    audit(ctx.db, ctx, { action: 'settings.email', tableName: 'email_configurations', recordId: ctx.organizationId, after: { host: cfg.host, port: cfg.port, passwordChanged: Boolean(b.password) } });
    return emailDto(cfg);
  }, { perm: 'settings.manage' });

  r.post('/api/v1/settings/email/test', (ctx) => {
    const cfg = ctx.db.emailConfigs.find((c) => c.organizationId === ctx.organizationId);
    if (!cfg) rule('email_not_configured', 'Chưa lưu cấu hình SMTP.');
    const v = validator();
    v.email('toEmail', ctx.body.toEmail, { required: true });
    v.check();
    cfg.lastTestAt = ctx.now;
    cfg.lastTestResult = cfg.hasSecret ? 'simulated_ok' : 'missing_secret';
    return {
      simulated: true, result: cfg.lastTestResult,
      message: cfg.hasSecret ? 'Mô phỏng: cấu hình đã lưu đủ trường. Chưa có email nào được gửi; kết quả thật phụ thuộc máy chủ SMTP khi có backend.' : 'Cấu hình chưa có mật khẩu SMTP; nhập và lưu trước khi gửi thử.',
    };
  }, { perm: 'settings.manage' });

  r.get('/api/v1/settings/templates', (ctx) => ctx.db.messageTemplates.filter((t) => t.organizationId === ctx.organizationId), { perm: 'settings.manage' });

  r.put('/api/v1/settings/templates/:id', (ctx) => {
    const tpl = ctx.db.messageTemplates.find((t) => t.id === ctx.params.id && t.organizationId === ctx.organizationId);
    if (!tpl) fail(404, 'not_found', 'Không tìm thấy mẫu.');
    const v = validator();
    v.required('subject', ctx.body.subject, 'Tiêu đề');
    v.required('body', ctx.body.body, 'Nội dung');
    v.check();
    Object.assign(tpl, { subject: ctx.body.subject, body: ctx.body.body, isActive: ctx.body.isActive ?? tpl.isActive, version: tpl.version + 1, updatedAt: ctx.now });
    return tpl;
  }, { perm: 'settings.manage' });

  r.get('/api/v1/settings/reminder-rules', (ctx) => ctx.db.reminderRules.filter((x) => x.organizationId === ctx.organizationId).map((x) => ({ ...x, template: find(ctx.db.messageTemplates, x.templateId) })), { perm: 'settings.manage' });

  const validateRule = (ctx, b) => {
    const v = validator();
    v.oneOf('eventType', b.eventType, ['invoice_issued', 'invoice_due', 'invoice_overdue', 'contract_expiring'], 'Sự kiện');
    v.number('dayOffset', b.dayOffset, 'Mốc ngày', { min: -90, max: 90 });
    v.required('templateId', b.templateId, 'Mẫu nội dung');
    v.check();
    if (!ctx.db.messageTemplates.some((t) => t.id === b.templateId && t.organizationId === ctx.organizationId)) fail(422, 'validation_failed', 'Mẫu không hợp lệ.');
  };
  r.post('/api/v1/settings/reminder-rules', (ctx) => {
    validateRule(ctx, ctx.body);
    if (ctx.db.reminderRules.some((x) => x.organizationId === ctx.organizationId && x.eventType === ctx.body.eventType && x.dayOffset === ctx.body.dayOffset && x.templateId === ctx.body.templateId)) conflict('rule_exists', 'Đã có lịch nhắc giống hệt.');
    const ruleRow = { id: uuid(), organizationId: ctx.organizationId, eventType: ctx.body.eventType, dayOffset: ctx.body.dayOffset, templateId: ctx.body.templateId, isEnabled: ctx.body.isEnabled ?? true };
    ctx.db.reminderRules.push(ruleRow);
    return ruleRow;
  }, { perm: 'settings.manage' });
  r.put('/api/v1/settings/reminder-rules/:id', (ctx) => {
    const row = ctx.db.reminderRules.find((x) => x.id === ctx.params.id && x.organizationId === ctx.organizationId);
    if (!row) fail(404, 'not_found', 'Không tìm thấy lịch nhắc.');
    validateRule(ctx, { ...row, ...ctx.body });
    Object.assign(row, { dayOffset: ctx.body.dayOffset ?? row.dayOffset, templateId: ctx.body.templateId ?? row.templateId, isEnabled: ctx.body.isEnabled ?? row.isEnabled });
    return row;
  }, { perm: 'settings.manage' });

  // ---------------------------------------------------------------- tác vụ nền và gửi (mô phỏng)
  r.get('/api/v1/jobs', (ctx) => listResponse(ctx.db.jobRuns.filter((j) => j.organizationId === ctx.organizationId), ctx.query, { defaultSort: '-startedAt', sortable: ['startedAt'] }), { perm: 'settings.manage' });

  r.post('/api/v1/jobs/:kind/run', (ctx) => {
    const kind = ctx.params.kind;
    if (!['daily_reminders', 'expire_reservations'].includes(kind)) fail(404, 'not_found', 'Không có tác vụ này.');
    const dedupeKey = `${kind}:${ctx.today}`;
    if (kind === 'daily_reminders' && ctx.db.jobRuns.some((j) => j.organizationId === ctx.organizationId && j.dedupeKey === dedupeKey && j.status === 'succeeded') && !ctx.body.force) {
      conflict('job_already_ran', 'Tác vụ nhắc hôm nay đã chạy thành công. Chạy lại có thể gửi trùng; chọn "Chạy lại" để bỏ qua các nhắc đã gửi.');
    }
    let summary;
    if (kind === 'expire_reservations') {
      const affected = expireReservations(ctx.db, ctx.now);
      summary = `Giải phóng ${affected} giữ chỗ hết hạn.`;
    } else {
      const overdue = ctx.db.invoices.filter((i) => i.status === 'issued' && tenancyContext(ctx.db, i.tenancyId).organizationId === ctx.organizationId).filter((i) => invoiceBalance(ctx.db, i, ctx.today).isOverdue);
      let sent = 0;
      let skipped = 0;
      for (const inv of overdue) {
        const c = tenancyContext(ctx.db, inv.tenancyId);
        const delivery = queueEmail(ctx.db, { organizationId: ctx.organizationId, recipientUserId: c.tenant.userId, toEmail: c.tenant.email, templateCode: 'invoice_overdue', eventKey: `${inv.id}:${ctx.today}`, subject: `Hóa đơn ${inv.code} đã quá hạn`, at: ctx.now });
        if (delivery) sent += 1;
        else skipped += 1;
      }
      summary = `Tạo ${sent} nhắc quá hạn (mô phỏng, không gửi email thật), bỏ qua ${skipped} nhắc đã có.`;
    }
    const run = { id: uuid(), organizationId: ctx.organizationId, jobKind: kind, status: 'succeeded', startedAt: ctx.now, finishedAt: ctx.now, summary, error: null, dedupeKey: ctx.body.force ? `${dedupeKey}:${ctx.now}` : dedupeKey, triggeredBy: ctx.user.id };
    ctx.db.jobRuns.push(run);
    return run;
  }, { perm: 'settings.manage' });

  r.get('/api/v1/deliveries', (ctx) => {
    const all = ctx.db.deliveries.filter((d) => d.organizationId === ctx.organizationId).map((d) => ({ ...d, simulated: true }));
    return listResponse(all, ctx.query, { filter: (d) => (!ctx.query.status || d.status === ctx.query.status) && (!ctx.query.templateCode || d.templateCode === ctx.query.templateCode), search: (d) => [d.subject, d.toEmail], defaultSort: '-createdAt', sortable: ['createdAt', 'status'] });
  }, { perm: 'settings.manage' });

  r.post('/api/v1/deliveries/:id/retry', (ctx) => {
    const d = ctx.db.deliveries.find((x) => x.id === ctx.params.id && x.organizationId === ctx.organizationId);
    if (!d) fail(404, 'not_found', 'Không tìm thấy lần gửi.');
    if (d.status === 'sent') conflict('already_sent', 'Lần gửi đã thành công; không gửi lại để tránh trùng.');
    const ok = d.toEmail && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.toEmail);
    d.attempts.push({ at: ctx.now, result: ok ? 'simulated_sent' : 'failed', error: ok ? null : 'Vẫn thiếu email người nhận.' });
    d.status = ok ? 'sent' : 'failed';
    return { ...d, simulated: true };
  }, { perm: 'settings.manage' });

  // ---------------------------------------------------------------- xuất dữ liệu
  r.get('/api/v1/exports', (ctx) => listResponse(ctx.db.exportJobs.filter((j) => j.organizationId === ctx.organizationId).map((j) => ({ ...j, requestedBy: userRef(ctx.db, j.requestedBy) })), ctx.query, { defaultSort: '-requestedAt', sortable: ['requestedAt'] }), { perm: 'reports.export' });

  r.post('/api/v1/exports', (ctx) => {
    const b = ctx.body;
    const v = validator();
    v.oneOf('kind', b.kind, ['invoices', 'payments', 'tenants', 'rooms', 'debts', 'deposits', 'readings', 'receivables', 'cash'], 'Loại dữ liệu');
    v.oneOf('format', b.format, ['csv', 'xlsx', 'pdf'], 'Định dạng');
    v.check();
    const job = {
      id: uuid(), organizationId: ctx.organizationId, kind: b.kind, format: b.format, filters: b.filters || {}, requestedBy: ctx.user.id, requestedAt: ctx.now,
      status: b.format === 'csv' ? 'succeeded' : 'pending', finishedAt: b.format === 'csv' ? ctx.now : null, rowCount: b.rowCount ?? null,
      note: b.format === 'csv' ? 'Mock: tệp CSV được tạo trong trình duyệt từ toàn bộ tập đã lọc.' : 'Mô phỏng: tệp XLSX/PDF sẽ do máy chủ tạo và lưu riêng tư khi có backend.',
    };
    ctx.db.exportJobs.push(job);
    audit(ctx.db, ctx, { action: 'export.create', tableName: 'export_jobs', recordId: job.id, after: { kind: job.kind, format: job.format, filters: job.filters } });
    return { ...job, downloadMode: b.format === 'csv' ? 'client' : 'server_pending' };
  }, { perm: 'reports.export' });

  // ---------------------------------------------------------------- tích hợp (chưa kết nối nhà cung cấp thật)
  r.get('/api/v1/integrations', (ctx) => ctx.db.integrations.filter((x) => x.organizationId === ctx.organizationId), { perm: 'integrations.manage' });

  r.put('/api/v1/integrations/:id', (ctx) => {
    const row = ctx.db.integrations.find((x) => x.id === ctx.params.id && x.organizationId === ctx.organizationId);
    if (!row) fail(404, 'not_found', 'Không tìm thấy tích hợp.');
    const v = validator();
    v.required('provider', ctx.body.provider, 'Nhà cung cấp');
    v.check();
    Object.assign(row, { provider: ctx.body.provider, settings: ctx.body.settings || {}, status: 'configured_simulated', secretRef: ctx.body.apiKey ? `secret://integration/${row.id}` : row.secretRef, updatedAt: ctx.now });
    return row;
  }, { perm: 'integrations.manage' });

  r.post('/api/v1/integrations/:id/test', (ctx) => {
    const row = ctx.db.integrations.find((x) => x.id === ctx.params.id && x.organizationId === ctx.organizationId);
    if (!row) fail(404, 'not_found', 'Không tìm thấy tích hợp.');
    return { simulated: true, ok: false, message: 'Mô phỏng: chưa có adapter nhà cung cấp. Cần đặc tả và nghiệm thu tích hợp riêng.' };
  }, { perm: 'integrations.manage' });

  // ---------------------------------------------------------------- nhật ký
  r.get('/api/v1/audit-logs', (ctx) => {
    const q = ctx.query;
    const all = ctx.db.auditLogs.filter((a) => a.organizationId === ctx.organizationId).map((a) => ({ ...a, actor: userRef(ctx.db, a.actorId) }));
    return listResponse(all, q, {
      filter: (a) => (!q.tableName || a.tableName === q.tableName) && (!q.actorId || a.actorId === q.actorId)
        && (!q.from || instantToIsoDate(a.occurredAt) >= q.from) && (!q.to || instantToIsoDate(a.occurredAt) <= q.to)
        && (!q.action || a.action.startsWith(q.action)),
      search: (a) => [a.action, a.tableName, a.reason, a.actor?.displayName, JSON.stringify(a.after || {})],
      sortable: ['occurredAt', 'action', 'tableName'],
      defaultSort: '-occurredAt',
    });
  }, { perm: 'audit.read' });

  // ---------------------------------------------------------------- chi phí (phân hệ mở rộng)
  r.get('/api/v1/expenses', (ctx) => {
    const q = ctx.query;
    const allowed = propertyFilter(ctx);
    const reversed = new Set(ctx.db.expenses.filter((e) => e.reversalOfId).map((e) => e.reversalOfId));
    const all = ctx.db.expenses.filter((e) => allowed.has(e.propertyId)).map((e) => ({
      ...e, property: propertyRef(find(ctx.db.properties, e.propertyId)), room: e.roomId ? roomRef(ctx.db, find(ctx.db.rooms, e.roomId)) : null,
      category: find(ctx.db.expenseCategories, e.categoryId), ticket: e.ticketId ? { id: e.ticketId, code: find(ctx.db.tickets, e.ticketId)?.code } : null,
      recordedBy: userRef(ctx.db, e.recordedBy), isReversal: Boolean(e.reversalOfId), isReversed: reversed.has(e.id), signedAmount: e.reversalOfId ? -e.amount : e.amount,
    }));
    return {
      ...listResponse(all, q, {
        filter: (e) => (!q.categoryId || e.categoryId === q.categoryId) && (!q.from || e.incurredOn >= q.from) && (!q.to || e.incurredOn <= q.to),
        search: (e) => [e.description, e.room?.code, e.ticket?.code],
        sortable: ['incurredOn', 'amount', 'createdAt'],
        defaultSort: '-incurredOn',
      }),
      netTotal: all.filter((e) => (!q.from || e.incurredOn >= q.from) && (!q.to || e.incurredOn <= q.to)).reduce((s, e) => s + e.signedAmount, 0),
    };
  }, { perm: 'expenses.read' });

  r.post('/api/v1/expenses', (ctx) => {
    const b = ctx.body;
    propertyInScope(ctx, b.propertyId);
    const v = validator();
    v.required('categoryId', b.categoryId, 'Loại chi phí');
    v.money('amount', b.amount, 'Số tiền', { positive: true });
    v.date('incurredOn', b.incurredOn, 'Ngày phát sinh');
    v.required('description', b.description, 'Nội dung');
    v.check();
    const expense = { id: uuid(), propertyId: b.propertyId, roomId: b.roomId || null, ticketId: b.ticketId || null, categoryId: b.categoryId, amount: b.amount, incurredOn: b.incurredOn, paidAt: b.paidAt || null, description: b.description, evidenceFileId: b.evidenceFileId || null, recordedBy: ctx.user.id, reversalOfId: null, reason: null, createdAt: ctx.now };
    ctx.db.expenses.push(expense);
    audit(ctx.db, ctx, { action: 'INSERT', tableName: 'expenses', recordId: expense.id, after: { amount: expense.amount, description: expense.description } });
    return expense;
  }, { perm: 'expenses.write' });

  r.post('/api/v1/expenses/:id/reverse', (ctx) => {
    const original = must(ctx.db.expenses, ctx.params.id, 'chi phí');
    propertyInScope(ctx, original.propertyId);
    const v = validator();
    v.reason('reason', ctx.body.reason);
    v.check();
    if (original.reversalOfId) rule('cannot_reverse_reversal', 'Không đảo một bút toán đảo.');
    if (ctx.db.expenses.some((e) => e.reversalOfId === original.id)) conflict('already_reversed', 'Chi phí đã được đảo.');
    const reversal = { ...original, id: uuid(), reversalOfId: original.id, description: `Đảo: ${original.description}`, reason: ctx.body.reason, recordedBy: ctx.user.id, createdAt: ctx.now };
    ctx.db.expenses.push(reversal);
    audit(ctx.db, ctx, { action: 'expense.reverse', tableName: 'expenses', recordId: reversal.id, reason: ctx.body.reason });
    return reversal;
  }, { perm: 'expenses.write' });

  // ---------------------------------------------------------------- AI (mô phỏng, chỉ đọc)
  r.get('/api/v1/ai/conversations', (ctx) => ctx.db.aiConversations.filter((c) => c.organizationId === ctx.organizationId && c.userId === ctx.user.id).sort((a, b) => compareIso(b.createdAt, a.createdAt)), { perm: 'ai.read' });

  r.post('/api/v1/ai/conversations', (ctx) => {
    const conv = { id: uuid(), organizationId: ctx.organizationId, userId: ctx.user.id, title: (ctx.body.title || 'Cuộc hỏi mới').slice(0, 80), createdAt: ctx.now, dataScope: { properties: ctx.propertyIds ? [...ctx.propertyIds] : 'all' } };
    ctx.db.aiConversations.push(conv);
    return { ...conv, messages: [] };
  }, { perm: 'ai.read' });

  r.get('/api/v1/ai/conversations/:id', (ctx) => {
    const conv = ctx.db.aiConversations.find((c) => c.id === ctx.params.id && c.userId === ctx.user.id);
    if (!conv) fail(404, 'not_found', 'Không tìm thấy hội thoại.');
    return { ...conv, messages: ctx.db.aiMessages.filter((m) => m.conversationId === conv.id).sort((a, b) => compareIso(a.createdAt, b.createdAt)) };
  }, { perm: 'ai.read' });

  r.post('/api/v1/ai/conversations/:id/messages', (ctx) => {
    const conv = ctx.db.aiConversations.find((c) => c.id === ctx.params.id && c.userId === ctx.user.id);
    if (!conv) fail(404, 'not_found', 'Không tìm thấy hội thoại.');
    const v = validator();
    v.required('content', ctx.body.content, 'Câu hỏi');
    v.check();
    ctx.db.aiMessages.push({ id: uuid(), conversationId: conv.id, role: 'user', content: ctx.body.content, createdAt: ctx.now, sources: [] });
    const answer = aiAnswer(ctx, ctx.body.content);
    ctx.db.aiMessages.push({ id: uuid(), conversationId: conv.id, role: 'assistant', content: answer.content, createdAt: new Date(Date.parse(ctx.now) + 1).toISOString(), sources: answer.sources, model: 'mock-rules (chưa kết nối AI thật)' });
    if (conv.title === 'Cuộc hỏi mới') conv.title = ctx.body.content.slice(0, 60);
    return { ...conv, messages: ctx.db.aiMessages.filter((m) => m.conversationId === conv.id).sort((a, b) => compareIso(a.createdAt, b.createdAt)) };
  }, { perm: 'ai.read' });

  // ---------------------------------------------------------------- tệp (mọi người dùng đã đăng nhập)
  r.post('/api/v1/files', (ctx) => {
    const b = ctx.body;
    const v = validator();
    v.required('fileName', b.fileName, 'Tên tệp');
    v.oneOf('visibility', b.visibility, ['private', 'public'], 'Chế độ hiển thị');
    v.check();
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
    if (!allowed.includes(b.contentType)) fail(422, 'unsupported_file_type', 'Chỉ nhận ảnh JPG, PNG, WEBP hoặc PDF.', { file: ['Định dạng không hỗ trợ.'] });
    if (b.sizeBytes > 10 * 1024 * 1024) fail(413, 'file_too_large', 'Tệp vượt 10 MB.', { file: ['Tối đa 10 MB.'] });
    const tenant = ctx.db.tenants.find((t) => t.userId === ctx.user.id);
    const organizationId = ctx.db.memberships.find((m) => m.userId === ctx.user.id && m.status === 'active')?.organizationId || tenant?.organizationId || null;
    const id = uuid();
    const stored = storeFileContent(id, b.dataUrl, b.sizeBytes);
    const file = {
      id, organizationId, fileName: b.fileName, contentType: b.contentType, sizeBytes: b.sizeBytes, visibility: b.visibility, scanStatus: 'clean',
      kind: b.purpose || 'other', generated: null, createdAt: ctx.now, uploadedBy: ctx.user.id, dataUrl: stored.dataUrl, persisted: stored.persisted,
    };
    ctx.db.files.push(file);
    return { ...fileDto(ctx.db, file.id), scanStatus: 'clean', simulatedScan: true, url: b.visibility === 'public' ? (stored.dataUrl || b.dataUrl) : null, persisted: stored.persisted };
  }, { auth: 'user' });

  r.get('/api/v1/files/:id/download-url', (ctx) => {
    const file = must(ctx.db.files, ctx.params.id, 'tệp');
    const membership = ctx.db.memberships.find((m) => m.userId === ctx.user.id && m.status === 'active' && m.organizationId === file.organizationId);
    const isUploader = file.uploadedBy === ctx.user.id;
    if (!isUploader && file.visibility === 'private' && !(!membership && tenantCanSee(ctx, file))) {
      if (!membership) fail(404, 'not_found', 'Không tìm thấy tệp hoặc bạn không có quyền tải.');
      const needed = FILE_PERMS[file.kind];
      if (needed && !permissionsOf(ctx.db, membership).has(needed)) fail(403, 'forbidden', 'Bạn không có quyền xem tệp riêng tư này.');
    }
    let url = fileContent(file);
    if (!url && file.generated) {
      const titles = { identity_front: 'Ảnh mô phỏng CCCD – mặt trước', identity_back: 'Ảnh mô phỏng CCCD – mặt sau', contract_signed: 'Bản scan hợp đồng (mô phỏng)', payment_proof: 'Ảnh chuyển khoản (mô phỏng)' };
      url = placeholderSvg(titles[file.kind] || 'Tệp mô phỏng', `${file.fileName} – không phải giấy tờ thật`);
    }
    if (!url) fail(410, 'file_missing', 'Tệp không còn trong bộ nhớ trình duyệt (tệp lớn chỉ giữ trong phiên). Tải lại tệp nếu cần.');
    return { url, expiresAt: new Date(Date.now() + 5 * 60000).toISOString(), file: fileDto(ctx.db, file.id) };
  }, { auth: 'user' });

  void addDays;
  void asBool;
  void notify;
}
