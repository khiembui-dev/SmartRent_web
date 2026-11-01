// Hồ sơ khách, giấy tờ (riêng tư), đề nghị sửa hồ sơ.
import { uuid } from '../../utils/ids.js';
import { compareIso } from '../../utils/date.js';
import { conflict, fail, listResponse, validator } from '../respond.js';
import { audit, depositHeld, find, must, notify, queueEmail, tenancyContext } from '../engine.js';
import { fileDto, invoiceSummary, paymentSummary, tenancyBrief, tenantSummary, ticketSummary, userRef } from '../dto.js';
import { propertyFilter, tenantInScope, tenantVisible } from '../scope.js';
import { createTenantRecord, duplicateTenants } from './leasing.js';

function tenantDetail(ctx, t) {
  const { db, today } = ctx;
  const canSeeIdentity = ctx.can('tenants.identity.read');
  const repTenancies = db.tenancies.filter((x) => x.representativeTenantId === t.id);
  const residentTenancies = db.residents.filter((r) => r.tenantId === t.id).map((r) => ({ resident: r, tenancy: find(db.tenancies, r.tenancyId) }));
  const tenancyIds = new Set(repTenancies.map((x) => x.id));
  return {
    ...tenantSummary(db, t, today),
    dateOfBirth: t.dateOfBirth, address: t.address, emergencyContactName: t.emergencyContactName, emergencyContactPhone: t.emergencyContactPhone,
    notes: t.notes, userId: t.userId,
    account: (() => {
      const user = t.userId ? find(db.users, t.userId) : null;
      return user ? { email: user.email, isActive: user.isActive, lastLoginAt: user.lastLoginAt || null } : null;
    })(),
    identityDocuments: db.identityDocuments.filter((d) => d.tenantId === t.id).map((d) => ({
      id: d.id, documentType: d.documentType, numberMasked: d.numberMasked, issuedOn: d.issuedOn, issuingAuthority: d.issuingAuthority, expiresOn: d.expiresOn,
      verifiedBy: userRef(db, d.verifiedBy), verifiedAt: d.verifiedAt,
      // Ảnh giấy tờ chỉ trả metadata cho người có quyền; đường dẫn tải phải xin riêng (download-url).
      frontFile: canSeeIdentity ? fileDto(db, d.frontFileId) : null, backFile: canSeeIdentity ? fileDto(db, d.backFileId) : null,
      filesHidden: !canSeeIdentity,
    })),
    tenancies: [
      ...repTenancies.map((x) => ({ ...tenancyBrief(db, x, today), role: 'representative' })),
      ...residentTenancies.map(({ resident, tenancy }) => ({ ...tenancyBrief(db, tenancy, today), role: 'resident', joinedOn: resident.joinedOn, leftOn: resident.leftOn, relationship: resident.relationship })),
    ].sort((a, b) => compareIso(b.plannedMoveIn, a.plannedMoveIn)),
    invoices: ctx.can('invoices.read') ? db.invoices.filter((i) => tenancyIds.has(i.tenancyId) && i.status !== 'draft').map((i) => invoiceSummary(db, i, today)).sort((a, b) => compareIso(b.serviceFrom, a.serviceFrom)) : null,
    payments: ctx.can('payments.read') ? db.payments.filter((p) => p.tenantId === t.id).map((p) => paymentSummary(db, p)).sort((a, b) => compareIso(b.receivedAt, a.receivedAt)) : null,
    depositHeldTotal: repTenancies.reduce((s, x) => s + depositHeld(db, x.id), 0),
    tickets: db.tickets.filter((k) => tenancyIds.has(k.tenancyId)).map((k) => ticketSummary(db, k, ctx.now)),
    profileChangeRequests: db.profileChangeRequests.filter((p) => p.tenantId === t.id).sort((a, b) => compareIso(b.createdAt, a.createdAt)).map((p) => ({ ...p, requestedBy: userRef(db, p.requestedBy), reviewedBy: userRef(db, p.reviewedBy) })),
  };
}

function validateTenant(ctx, b, existing) {
  const v = validator();
  v.required('fullName', b.fullName, 'Họ tên');
  v.email('email', b.email);
  v.phone('phone', b.phone);
  v.phone('emergencyContactPhone', b.emergencyContactPhone);
  if (!b.phone && !b.email) v.add('phone', 'Cần ít nhất số điện thoại hoặc email.');
  if (b.dateOfBirth && b.dateOfBirth > ctx.today) v.add('dateOfBirth', 'Ngày sinh không hợp lệ.');
  v.check();
  if (!existing && !b.confirmDuplicate) {
    const dupes = duplicateTenants(ctx, { phone: b.phone, email: b.email });
    if (dupes.length) {
      conflict('possible_duplicate_tenant', `Có ${dupes.length} hồ sơ trùng điện thoại/email (liên hệ có thể dùng chung, ví dụ người thân). Kiểm tra trước khi tạo mới.`, {
        phone: dupes.map((d) => `${d.code} – ${d.fullName}`),
      });
    }
  }
}

export default function register(r) {
  r.get('/api/v1/tenants', (ctx) => {
    const q = ctx.query;
    const allowed = q.propertyId ? propertyFilter(ctx) : null;
    const all = ctx.db.tenants.filter((t) => tenantVisible(ctx, t)).map((t) => tenantSummary(ctx.db, t, ctx.today));
    return listResponse(all, q, {
      filter: (t) => (!q.residenceStatus || t.residenceStatus === q.residenceStatus)
        && (!q.debt || (q.debt === 'overdue' ? t.overdueAmount > 0 : q.debt === 'outstanding' ? t.outstandingAmount > 0 : t.outstandingAmount === 0))
        && (!allowed || (t.currentTenancy && allowed.has(find(ctx.db.rooms, t.currentTenancy.room.id).propertyId)))
        && (!q.portal || (q.portal === 'yes') === t.hasPortalAccount)
        && (!q.profileRequests || t.hasPendingProfileRequest),
      search: (t) => [t.code, t.fullName, t.email, t.phone, t.currentTenancy?.room?.code],
      sortable: ['code', 'fullName', 'outstandingAmount', 'createdAt'],
      defaultSort: 'fullName',
    });
  }, { perm: 'tenants.read' });

  r.post('/api/v1/tenants', (ctx) => {
    validateTenant(ctx, ctx.body);
    const tenant = createTenantRecord(ctx, ctx.body);
    return tenantDetail(ctx, tenant);
  }, { perm: 'tenants.write' });

  r.get('/api/v1/tenants/:id', (ctx) => tenantDetail(ctx, tenantInScope(ctx, ctx.params.id)), { perm: 'tenants.read' });

  r.put('/api/v1/tenants/:id', (ctx) => {
    const t = tenantInScope(ctx, ctx.params.id);
    const b = ctx.body;
    validateTenant(ctx, b, t);
    const before = { fullName: t.fullName, email: t.email, phone: t.phone };
    Object.assign(t, {
      fullName: b.fullName.trim(), email: b.email || null, phone: b.phone || null, dateOfBirth: b.dateOfBirth || null,
      address: { line: b.addressLine ?? t.address.line, locality: b.locality ?? t.address.locality },
      emergencyContactName: b.emergencyContactName || null, emergencyContactPhone: b.emergencyContactPhone || null, notes: b.notes || null,
    });
    // Khách có tài khoản: họ tên, điện thoại và email đăng nhập đi cùng hồ sơ.
    if (t.userId) {
      const user = find(ctx.db.users, t.userId);
      if (t.email && ctx.db.users.some((u) => u.id !== user.id && u.email.toLowerCase() === t.email.toLowerCase())) conflict('email_taken', 'Email đã thuộc tài khoản khác.', { email: ['Email đã được dùng.'] });
      Object.assign(user, { displayName: t.fullName, phone: t.phone, email: t.email || user.email });
    }
    audit(ctx.db, ctx, { action: 'UPDATE', tableName: 'tenants', recordId: t.id, before, after: { fullName: t.fullName, email: t.email, phone: t.phone } });
    return tenantDetail(ctx, t);
  }, { perm: 'tenants.write' });

  r.post('/api/v1/tenants/:id/identity-documents', (ctx) => {
    const t = tenantInScope(ctx, ctx.params.id);
    const b = ctx.body;
    const v = validator();
    v.oneOf('documentType', b.documentType, ['cccd', 'passport', 'other'], 'Loại giấy tờ');
    v.required('number', b.number, 'Số giấy tờ');
    if (b.number && !/^[A-Z0-9]{6,20}$/i.test(String(b.number).replace(/\s/g, ''))) v.add('number', 'Số giấy tờ gồm 6–20 chữ/số.');
    v.date('issuedOn', b.issuedOn, 'Ngày cấp', { required: false });
    v.check();
    const digits = String(b.number).replace(/\s/g, '');
    // Mock không lưu số thật: chỉ giữ 4 số cuối + "fingerprint" giả. Backend dùng HMAC với khóa máy chủ và mã hóa số đầy đủ.
    const fingerprint = `mock-hmac:${digits.length}:${digits.slice(-4)}:${digits.split('').reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 1000003, 7)}`;
    const dupe = ctx.db.identityDocuments.find((d) => d.fingerprint === fingerprint && d.documentType === b.documentType);
    if (dupe && dupe.tenantId === t.id) conflict('identity_exists', 'Giấy tờ này đã có trong hồ sơ.');
    const doc = {
      id: uuid(), tenantId: t.id, documentType: b.documentType, numberMasked: `•••• •••• ${digits.slice(-4)}`, fingerprint, issuedOn: b.issuedOn || null,
      issuingAuthority: b.issuingAuthority || null, expiresOn: b.expiresOn || null, frontFileId: b.frontFileId || null, backFileId: b.backFileId || null, verifiedBy: null, verifiedAt: null,
    };
    ctx.db.identityDocuments.push(doc);
    const otherOwner = dupe && dupe.tenantId !== t.id ? find(ctx.db.tenants, dupe.tenantId) : null;
    audit(ctx.db, ctx, { action: 'identity_document.add', tableName: 'tenant_identity_documents', recordId: doc.id, after: { documentType: doc.documentType, numberMasked: doc.numberMasked } });
    return { ...tenantDetail(ctx, t), warning: otherOwner ? `Số giấy tờ trùng với hồ sơ ${otherOwner.code} – ${otherOwner.fullName}. Kiểm tra lại trước khi xác minh.` : null };
  }, { perm: 'tenants.write' });

  r.post('/api/v1/tenants/:id/identity-documents/:docId/verify', (ctx) => {
    const t = tenantInScope(ctx, ctx.params.id);
    const doc = ctx.db.identityDocuments.find((d) => d.id === ctx.params.docId && d.tenantId === t.id);
    if (!doc) fail(404, 'not_found', 'Không tìm thấy giấy tờ.');
    if (doc.verifiedAt) conflict('already_verified', 'Giấy tờ đã được xác minh.');
    doc.verifiedBy = ctx.user.id;
    doc.verifiedAt = ctx.now;
    audit(ctx.db, ctx, { action: 'identity_document.verify', tableName: 'tenant_identity_documents', recordId: doc.id, after: { verifiedAt: ctx.now } });
    return tenantDetail(ctx, t);
  }, { perm: 'tenants.identity.read' });

  r.post('/api/v1/tenants/:id/portal-invitation', (ctx) => {
    const t = tenantInScope(ctx, ctx.params.id);
    if (!t.email) fail(422, 'validation_failed', 'Khách chưa có email để gửi lời mời.', { email: ['Cập nhật email trước khi mời.'] });
    if (t.userId) conflict('portal_exists', 'Khách đã có tài khoản cổng khách thuê. Có thể gửi liên kết đặt lại mật khẩu.');
    const delivery = queueEmail(ctx.db, { organizationId: ctx.organizationId, toEmail: t.email, templateCode: 'portal_invitation', eventKey: `${t.id}:${ctx.now}`, subject: 'Mời dùng cổng khách thuê SmartRent', at: ctx.now });
    return { simulated: true, deliveryStatus: delivery?.status || 'sent', toEmail: t.email };
  }, { perm: 'tenants.write' });

  r.post('/api/v1/tenants/:id/password-reset-link', (ctx) => {
    const t = tenantInScope(ctx, ctx.params.id);
    if (!t.userId) fail(422, 'no_portal_account', 'Khách chưa có tài khoản cổng khách thuê.');
    const user = find(ctx.db.users, t.userId);
    queueEmail(ctx.db, { organizationId: ctx.organizationId, recipientUserId: user.id, toEmail: user.email, templateCode: 'password_reset', eventKey: `${t.id}:${ctx.now}`, subject: 'Đặt lại mật khẩu SmartRent', at: ctx.now });
    return { simulated: true, toEmail: user.email };
  }, { perm: 'tenants.write' });

  // Quản trị đặt mật khẩu mới cho khách: thu hồi mọi phiên; backend thật cần buộc đổi ở lần đăng nhập kế tiếp (xem BACKEND_HANDOFF).
  r.post('/api/v1/tenants/:id/password', (ctx) => {
    const t = tenantInScope(ctx, ctx.params.id);
    const { newPassword } = ctx.body;
    const v = validator();
    v.required('newPassword', newPassword, 'Mật khẩu mới');
    if (newPassword && newPassword.length < 8) v.add('newPassword', 'Mật khẩu cần ít nhất 8 ký tự.');
    v.check();
    if (!t.userId) fail(422, 'no_portal_account', 'Khách chưa có tài khoản nên chưa thể đổi mật khẩu.');
    const user = find(ctx.db.users, t.userId);
    user.mockPassword = newPassword;
    ctx.db.sessions.filter((s) => s.userId === user.id && !s.revokedAt).forEach((s) => { s.revokedAt = ctx.now; });
    audit(ctx.db, ctx, { action: 'tenant.password_reset_by_staff', tableName: 'users', recordId: user.id, after: { tenant: t.code } });
    return { simulated: true };
  }, { perm: 'tenants.write' });

  // ---------------------------------------------------------------- đề nghị sửa hồ sơ
  r.get('/api/v1/profile-change-requests', (ctx) => {
    const all = ctx.db.profileChangeRequests.filter((p) => tenantVisible(ctx, find(ctx.db.tenants, p.tenantId))).map((p) => ({
      ...p, tenant: tenantSummary(ctx.db, find(ctx.db.tenants, p.tenantId), ctx.today), requestedBy: userRef(ctx.db, p.requestedBy), reviewedBy: userRef(ctx.db, p.reviewedBy),
    }));
    return listResponse(all, ctx.query, { filter: (p) => !ctx.query.status || p.status === ctx.query.status, search: (p) => [p.tenant.fullName, p.tenant.code], defaultSort: '-createdAt', sortable: ['createdAt', 'status'] });
  }, { perm: 'tenants.read' });

  const review = (approve) => (ctx) => {
    const req = must(ctx.db.profileChangeRequests, ctx.params.id, 'đề nghị');
    const t = tenantInScope(ctx, req.tenantId);
    if (req.status !== 'pending') conflict('request_closed', 'Đề nghị đã được xử lý.');
    if (!approve) {
      const v = validator();
      v.reason('reviewNotes', ctx.body.reviewNotes, 'Lý do từ chối');
      v.check();
    }
    req.status = approve ? 'approved' : 'rejected';
    req.reviewNotes = ctx.body.reviewNotes || null;
    req.reviewedBy = ctx.user.id;
    req.reviewedAt = ctx.now;
    if (approve) {
      const before = {};
      for (const [field, change] of Object.entries(req.changes)) {
        before[field] = t[field];
        t[field] = change.to;
      }
      audit(ctx.db, ctx, { action: 'tenant.profile_change.approve', tableName: 'tenants', recordId: t.id, before, after: Object.fromEntries(Object.entries(req.changes).map(([k, c]) => [k, c.to])), reason: req.reviewNotes });
    }
    if (t.userId) notify(ctx.db, { organizationId: ctx.organizationId, recipientIds: [t.userId], eventKey: `pcr:${req.id}:${req.status}`, title: approve ? 'Đã cập nhật hồ sơ theo đề nghị' : 'Đề nghị sửa hồ sơ bị từ chối', body: req.reviewNotes || '', url: '/account', at: ctx.now });
    return req;
  };
  r.post('/api/v1/profile-change-requests/:id/approve', review(true), { perm: 'tenants.write' });
  r.post('/api/v1/profile-change-requests/:id/reject', review(false), { perm: 'tenants.write' });

  void tenancyContext;
}
