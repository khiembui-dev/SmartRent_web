// Tài khoản cá nhân: thông tin đăng nhập, đổi mật khẩu, phiên đăng nhập đang hoạt động.
import { confirmDialog, runAction, toast } from '../../components/dialogs.js';
import { bindForm, formAlert, renderFields } from '../../components/form.js';
import { dateTime, dl, emptyState, errorState, icon, loadingBlock, note, pageHeader, panel } from '../../components/ui.js';
import { authApi } from '../../services/api.js';
import { session } from '../../services/session.js';
import { html, setHtml } from '../../utils/html.js';

const PASSWORD_FIELDS = [
  { name: 'currentPassword', label: 'Mật khẩu hiện tại', type: 'password', required: true, autocomplete: 'current-password' },
  { name: 'newPassword', label: 'Mật khẩu mới', type: 'password', required: true, minLength: 8, autocomplete: 'new-password', help: 'Ít nhất 8 ký tự. Đổi mật khẩu sẽ đăng xuất các phiên khác.' },
  { name: 'confirmPassword', label: 'Nhập lại mật khẩu mới', type: 'password', required: true, autocomplete: 'new-password' },
];

function deviceName(userAgent = '') {
  const browser = /Edg\//.test(userAgent) ? 'Edge' : /Chrome\//.test(userAgent) ? 'Chrome' : /Firefox\//.test(userAgent) ? 'Firefox' : /Safari\//.test(userAgent) ? 'Safari' : 'Trình duyệt';
  const os = /Windows/.test(userAgent) ? 'Windows' : /Android/.test(userAgent) ? 'Android' : /iPhone|iPad/.test(userAgent) ? 'iOS' : /Mac OS/.test(userAgent) ? 'macOS' : /Linux/.test(userAgent) ? 'Linux' : '';
  return [browser, os].filter(Boolean).join(' trên ');
}

export default async function AccountPage(ctx) {
  ctx.setTitle('Tài khoản');
  const user = session.user;
  const me = session.me;
  const roles = [
    ...me.organizations.map((o) => `${o.roles.map((r) => r.name).join(', ')} tại ${o.name}`),
    ...(me.tenantProfiles.length ? ['Khách thuê'] : []),
    ...(me.isSystemAdmin ? ['Quản trị hệ thống'] : []),
  ];
  setHtml(ctx.outlet, html`${pageHeader({ title: 'Tài khoản', subtitle: 'Thông tin đăng nhập và bảo mật của riêng bạn.' })}
    <div class="row g-3 mt-1">
      <div class="col-lg-5">
        ${panel({ title: 'Thông tin', body: dl([['Họ tên', user.displayName], ['Email đăng nhập', user.email], ['Điện thoại', user.phone], ['Vai trò', roles.join('; ') || null]]) })}
        ${me.tenantProfiles.length ? note('Muốn sửa họ tên, số điện thoại hoặc giấy tờ trong hồ sơ thuê, gửi yêu cầu ở trang Hồ sơ để chủ trọ duyệt.') : ''}
      </div>
      <div class="col-lg-7">
        ${panel({ title: 'Đổi mật khẩu', body: html`<form novalidate data-password autocomplete="on">${formAlert()}<input type="email" class="d-none" autocomplete="username" value="${user.email}" tabindex="-1" aria-hidden="true">${renderFields(PASSWORD_FIELDS)}<button class="btn btn-primary mt-3" type="submit">Đổi mật khẩu</button></form>` })}
        <div data-sessions></div>
      </div>
    </div>`);

  const form = ctx.outlet.querySelector('[data-password]');
  const binding = bindForm(form, {
    fields: PASSWORD_FIELDS,
    guardDirty: false,
    validate: (v) => (v.newPassword && v.confirmPassword !== v.newPassword ? { confirmPassword: ['Mật khẩu nhập lại chưa khớp.'] } : null),
    onSubmit: async (v) => {
      await authApi.changePassword({ currentPassword: v.currentPassword, newPassword: v.newPassword });
      form.reset();
      toast('Đã đổi mật khẩu; các phiên khác đã bị đăng xuất');
      await loadSessions();
    },
  });
  ctx.onCleanup(() => binding.destroy());

  const sessionsEl = ctx.outlet.querySelector('[data-sessions]');
  async function loadSessions() {
    setHtml(sessionsEl, loadingBlock(3));
    let sessions;
    try {
      sessions = await authApi.sessions();
    } catch (error) {
      setHtml(sessionsEl, errorState(error));
      return;
    }
    setHtml(sessionsEl, panel({
      title: 'Phiên đăng nhập', flush: true,
      body: sessions.length ? html`<ul class="list-group list-group-flush">${sessions.map((s) => html`<li class="list-group-item d-flex align-items-center gap-2">
          ${icon('laptop', 'text-muted-sr')}
          <span class="flex-grow-1 min-w-0"><span class="d-block fw-550">${deviceName(s.userAgent)}${s.isCurrent ? html` <span class="sr-badge tone-ok">Phiên này</span>` : ''}</span>
          <span class="small text-muted-sr">Đăng nhập ${dateTime(s.createdAt)}, hết hạn ${dateTime(s.expiresAt)}</span></span>
          ${s.isCurrent ? '' : html`<button type="button" class="btn btn-sm btn-outline-danger" data-revoke="${s.id}">Đăng xuất phiên</button>`}</li>`)}</ul>` : emptyState({ title: 'Không có phiên nào khác' }),
    }));
  }
  const onClick = async (event) => {
    const btn = event.target.closest('[data-revoke]');
    if (!btn) return;
    if (!(await confirmDialog({ title: 'Đăng xuất phiên này?', text: 'Thiết bị đó sẽ phải đăng nhập lại.', confirmText: 'Đăng xuất phiên', tone: 'danger' }))) return;
    btn.disabled = true;
    if (await runAction(() => authApi.revokeSession(btn.dataset.revoke), { success: 'Đã đăng xuất phiên' }) !== undefined) await loadSessions();
    else btn.disabled = false;
  };
  sessionsEl.addEventListener('click', onClick);
  ctx.onCleanup(() => sessionsEl.removeEventListener('click', onClick));
  await loadSessions();
}
