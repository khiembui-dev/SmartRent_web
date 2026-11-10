import { addDays } from '../../utils/date.js';
import { uuid } from '../../utils/ids.js';
import { conflict, fail, validator } from '../respond.js';
import { fileContent } from '../db.js';
import { find, notify, permissionsOf, staffWith, tenancyContext } from '../engine.js';
import { roomRef } from '../dto.js';
import { createTenantRecord } from './leasing.js';

const SESSION_HOURS = 12;

function openSession(ctx, user) {
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 3600000).toISOString();
  const session = { id: `mock-${uuid()}`, userId: user.id, createdAt: ctx.now, expiresAt, revokedAt: null, userAgent: navigator.userAgent.slice(0, 120) };
  ctx.db.sessions.push(session);
  user.lastLoginAt = ctx.now;
  return { accessToken: session.id, expiresAt, user: { id: user.id, displayName: user.displayName, email: user.email } };
}

export function meContext(db, user) {
  const memberships = db.memberships.filter((m) => m.userId === user.id && ['active', 'invited'].includes(m.status));
  const organizations = memberships.filter((m) => m.status === 'active').map((m) => {
    const org = find(db.organizations, m.organizationId);
    const properties = db.properties.filter((p) => p.organizationId === org.id && (m.propertyScope === 'all' || m.propertyIds.includes(p.id)));
    return {
      id: org.id, code: org.code, name: org.name, isActive: org.isActive, membershipId: m.id, status: m.status,
      permissions: [...permissionsOf(db, m)].sort(), propertyScope: m.propertyScope,
      properties: properties.map((p) => ({ id: p.id, code: p.code, name: p.name })),
    };
  });
  const tenantProfiles = db.tenants.filter((t) => t.userId === user.id).map((t) => {
    const org = find(db.organizations, t.organizationId);
    const rep = db.tenancies.filter((x) => x.representativeTenantId === t.id)
      .map((x) => ({ tenancyId: x.id, role: 'representative', status: x.status, room: roomRef(db, tenancyContext(db, x).room) }));
    const res = db.residents.filter((r) => r.tenantId === t.id).map((r) => {
      const x = find(db.tenancies, r.tenancyId);
      return { tenancyId: x.id, role: 'resident', status: x.status, room: roomRef(db, tenancyContext(db, x).room) };
    });
    return { tenantId: t.id, organizationId: org.id, organizationName: org.name, fullName: t.fullName, tenancies: [...rep, ...res] };
  });
  return {
    user: {
      id: user.id, role: user.role, displayName: user.displayName, email: user.email, phone: user.phone, twoFactorEnabled: user.twoFactorEnabled,
      avatarFileId: user.avatarFileId || null, avatarUrl: user.avatarFileId ? fileContent(find(db.files, user.avatarFileId)) : null,
    },
    organizations,
    tenantProfiles,
  };
}

export default function register(r) {
  r.post('/api/v1/auth/login', (ctx) => {
    const { email, password } = ctx.body;
    const v = validator();
    v.required('email', email, 'Email');
    v.required('password', password, 'Mật khẩu');
    v.check();
    const user = ctx.db.users.find((u) => u.email.toLowerCase() === String(email).trim().toLowerCase());
    if (!user || user.mockPassword !== password) fail(401, 'invalid_credentials', 'Email hoặc mật khẩu chưa đúng.');
    if (!user.isActive) fail(403, 'account_locked', 'Tài khoản đang bị khóa. Liên hệ chủ trọ.');
    return openSession(ctx, user);
  }, { auth: 'public' });

  // Khách tự tạo tài khoản: hồ sơ hiện ở mục Khách thuê của admin với trạng thái Chưa thuê.
  // Không tự nối vào hồ sơ có sẵn trùng email/điện thoại: chưa xác minh được đó là chính chủ.
  r.post('/api/v1/auth/register', (ctx) => {
    const b = ctx.body;
    const v = validator();
    v.required('fullName', b.fullName, 'Họ tên');
    v.phone('phone', b.phone, { required: true });
    v.email('email', b.email, { required: true });
    v.required('password', b.password, 'Mật khẩu');
    if (b.password && b.password.length < 8) v.add('password', 'Mật khẩu cần ít nhất 8 ký tự.');
    if (!b.acceptedTerms) v.add('acceptedTerms', 'Cần đồng ý để tạo tài khoản.');
    v.check();
    const email = b.email.trim();
    if (ctx.db.users.some((u) => u.email.toLowerCase() === email.toLowerCase())) {
      conflict('email_taken', 'Email này đã có tài khoản.', { email: ['Email này đã có tài khoản. Đăng nhập hoặc dùng email khác.'] });
    }
    const org = ctx.db.organizations.find((o) => o.isActive);
    if (!org) fail(503, 'registration_closed', 'Chưa nhận đăng ký tài khoản lúc này.');
    const user = {
      id: uuid(), key: null, email, displayName: b.fullName.trim(), phone: b.phone, isActive: true, role: 'user', mockPassword: b.password,
      emailConfirmed: false, twoFactorEnabled: false, createdAt: ctx.now, lastLoginAt: null,
    };
    ctx.db.users.push(user);
    const tenant = createTenantRecord({ ...ctx, organizationId: org.id, user }, { fullName: b.fullName, phone: b.phone, email });
    tenant.userId = user.id;
    notify(ctx.db, {
      organizationId: org.id, recipientIds: staffWith(ctx.db, org.id, 'tenants.write'), eventKey: `tenant.registered:${tenant.id}`,
      title: `Khách mới tạo tài khoản: ${tenant.fullName}`, body: `${tenant.code}, chưa thuê phòng.`, url: `/admin/tenants/${tenant.id}`, at: ctx.now,
    });
    return openSession(ctx, user);
  }, { auth: 'public' });

  r.post('/api/v1/auth/logout', (ctx) => {
    ctx.session.revokedAt = ctx.now;
    return null;
  }, { auth: 'user' });

  r.post('/api/v1/auth/refresh', (ctx) => {
    ctx.session.expiresAt = new Date(Date.now() + SESSION_HOURS * 3600000).toISOString();
    return { accessToken: ctx.session.id, expiresAt: ctx.session.expiresAt };
  }, { auth: 'user' });

  r.post('/api/v1/auth/forgot-password', (ctx) => {
    const v = validator();
    v.email('email', ctx.body.email, { required: true });
    v.check();
    const user = ctx.db.users.find((u) => u.email.toLowerCase() === String(ctx.body.email).toLowerCase());
    if (user) {
      ctx.db.resetTokens ||= [];
      ctx.db.resetTokens.push({ token: 'demo-reset-token', userId: user.id, expiresAt: addDays(ctx.today, 1) });
    }
    // Luôn trả cùng một kết quả để không lộ email nào đã có tài khoản.
    return { accepted: true, simulated: true };
  }, { auth: 'public' });

  r.post('/api/v1/auth/reset-password', (ctx) => {
    const { token, newPassword } = ctx.body;
    const v = validator();
    v.required('newPassword', newPassword, 'Mật khẩu mới');
    if (newPassword && newPassword.length < 8) v.add('newPassword', 'Mật khẩu cần ít nhất 8 ký tự.');
    v.check();
    const entry = (ctx.db.resetTokens || []).find((t) => t.token === token && t.expiresAt >= ctx.today);
    if (!entry) fail(422, 'invalid_reset_token', 'Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn. Hãy yêu cầu liên kết mới.');
    const user = find(ctx.db.users, entry.userId);
    user.mockPassword = newPassword;
    ctx.db.sessions.filter((s) => s.userId === user.id).forEach((s) => { s.revokedAt = ctx.now; });
    ctx.db.resetTokens = ctx.db.resetTokens.filter((t) => t !== entry);
    return null;
  }, { auth: 'public' });

  r.get('/api/v1/me', (ctx) => meContext(ctx.db, ctx.user), { auth: 'user' });

  r.put('/api/v1/me/profile', (ctx) => {
    const b = ctx.body;
    const v = validator();
    v.required('displayName', b.displayName, 'Họ tên');
    v.email('email', b.email, { required: true });
    v.phone('phone', b.phone);
    v.check();
    const email = b.email.trim();
    if (ctx.db.users.some((u) => u.id !== ctx.user.id && u.email.toLowerCase() === email.toLowerCase())) conflict('email_taken', 'Email đã thuộc tài khoản khác.', { email: ['Email đã được dùng.'] });
    Object.assign(ctx.user, { displayName: b.displayName.trim(), email, phone: b.phone || null });
    if (b.avatarFileId !== undefined) {
      if (b.avatarFileId && !find(ctx.db.files, b.avatarFileId)) fail(422, 'validation_failed', 'Ảnh đại diện không hợp lệ.', { avatarFileId: ['Tệp không tồn tại.'] });
      ctx.user.avatarFileId = b.avatarFileId;
    }
    return meContext(ctx.db, ctx.user);
  }, { auth: 'user' });

  r.post('/api/v1/me/change-password', (ctx) => {
    const { currentPassword, newPassword } = ctx.body;
    const v = validator();
    v.required('currentPassword', currentPassword, 'Mật khẩu hiện tại');
    v.required('newPassword', newPassword, 'Mật khẩu mới');
    if (newPassword && newPassword.length < 8) v.add('newPassword', 'Mật khẩu cần ít nhất 8 ký tự.');
    if (newPassword && newPassword === currentPassword) v.add('newPassword', 'Mật khẩu mới phải khác mật khẩu hiện tại.');
    v.check();
    if (ctx.user.mockPassword !== currentPassword) {
      fail(422, 'validation_failed', 'Mật khẩu hiện tại chưa đúng.', { currentPassword: ['Mật khẩu hiện tại chưa đúng.'] });
    }
    ctx.user.mockPassword = newPassword;
    // Thu hồi các phiên khác khi đổi mật khẩu.
    ctx.db.sessions.filter((s) => s.userId === ctx.user.id && s.id !== ctx.session.id && !s.revokedAt).forEach((s) => { s.revokedAt = ctx.now; });
    return null;
  }, { auth: 'user' });

  r.get('/api/v1/me/sessions', (ctx) => ctx.db.sessions
    .filter((s) => s.userId === ctx.user.id && !s.revokedAt && s.expiresAt > ctx.now)
    .map((s) => ({ id: s.id, createdAt: s.createdAt, expiresAt: s.expiresAt, userAgent: s.userAgent, isCurrent: s.id === ctx.session.id })), { auth: 'user' });

  r.delete('/api/v1/me/sessions/:id', (ctx) => {
    const s = ctx.db.sessions.find((x) => x.id === ctx.params.id && x.userId === ctx.user.id);
    if (!s) fail(404, 'not_found', 'Không tìm thấy phiên.');
    s.revokedAt = ctx.now;
    return null;
  }, { auth: 'user' });
}
