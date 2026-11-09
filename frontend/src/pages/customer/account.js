// Tài khoản của khách: thông tin cá nhân, đề nghị sửa liên hệ, đổi mật khẩu.
import { toast } from '../../components/dialogs.js';
import { bindForm, formAlert, renderFields } from '../../components/form.js';
import { formModal } from '../../components/modal.js';
import { errorState, icon, loadingBlock, note } from '../../components/ui.js';
import { session } from '../../services/session.js';
import { authApi, portalApi } from '../../services/api.js';
import { formatPhone, initials } from '../../utils/format.js';
import { html, setHtml } from '../../utils/html.js';
import { pageHead } from './common.js';

const PASSWORD_FIELDS = [
  { name: 'currentPassword', label: 'Mật khẩu hiện tại', type: 'password', required: true, autocomplete: 'current-password' },
  { name: 'newPassword', label: 'Mật khẩu mới', type: 'password', required: true, autocomplete: 'new-password', help: 'Tối thiểu 8 ký tự.' },
  { name: 'confirmPassword', label: 'Nhập lại mật khẩu mới', type: 'password', required: true, autocomplete: 'new-password' },
];

export default async function AccountPage(ctx) {
  ctx.setTitle('Tài khoản của tôi');
  setHtml(ctx.outlet, html`<div class="cu-page cu-medium" data-root>${loadingBlock(6)}</div>`);
  const root = ctx.outlet.querySelector('[data-root]');
  let profile;
  try {
    profile = (await portalApi.profile()).profiles[0];
  } catch (error) {
    if (error?.isAborted || ctx.signal.aborted) return;
    setHtml(root, errorState(error));
    return;
  }
  if (ctx.signal.aborted) return;

  const pending = profile.changeRequests.find((r) => r.status === 'pending');
  const doc = profile.identityDocuments[0];
  const address = [profile.address?.line, profile.address?.locality].filter(Boolean).join(', ');
  setHtml(root, html`${pageHead({ title: 'Tài khoản của tôi', subtitle: 'Thông tin cá nhân và mật khẩu đăng nhập.' })}
    <div class="cu-account">
      <section class="cu-card">
        <div class="cu-person"><span class="sr-avatar">${initials(profile.fullName)}</span><div class="min-w-0"><h2>${profile.fullName}</h2><small>Mã khách ${profile.code}</small></div></div>
        <dl class="cu-facts">
          <div><dt>Số điện thoại</dt><dd>${profile.phone ? formatPhone(profile.phone) : '—'}</dd></div>
          <div><dt>Email</dt><dd>${profile.email || '—'}</dd></div>
          ${doc ? html`<div><dt>Giấy tờ</dt><dd>${doc.numberMasked}${doc.verified ? ' (đã đối chiếu)' : ''}</dd></div>` : ''}
          ${address ? html`<div><dt>Địa chỉ</dt><dd>${address}</dd></div>` : ''}
        </dl>
        ${pending ? html`<div class="mt-3">${note('Bạn đang có đề nghị sửa thông tin chờ quản lý duyệt.')}<button type="button" class="btn btn-link btn-sm px-0" data-cancel="${pending.id}">Hủy đề nghị</button></div>`
    : html`<button type="button" class="btn btn-outline-primary btn-sm mt-3" data-edit>${icon('pencil')} Đề nghị sửa thông tin</button>`}
      </section>
      <section class="cu-card">
        <h2>Đổi mật khẩu</h2>
        <form novalidate data-password>${formAlert()}${renderFields(PASSWORD_FIELDS)}<button type="submit" class="btn btn-primary w-100 mt-3">Cập nhật mật khẩu</button></form>
      </section>
    </div>`);

  root.querySelector('[data-edit]')?.addEventListener('click', async () => {
    const result = await formModal({
      title: 'Đề nghị sửa thông tin liên hệ', submitLabel: 'Gửi đề nghị',
      fields: [
        { name: 'changes.phone', label: 'Số điện thoại', type: 'tel', autocomplete: 'tel' },
        { name: 'changes.email', label: 'Email', type: 'email', autocomplete: 'email' },
        { name: 'reason', label: 'Lý do', optional: true },
      ],
      values: { changes: { phone: profile.phone, email: profile.email } },
      onSubmit: (v) => portalApi.requestProfileChange({ ...v, tenantId: profile.id }),
    });
    if (result) {
      toast('Đã gửi đề nghị tới quản lý');
      ctx.refresh();
    }
  });

  root.querySelector('[data-cancel]')?.addEventListener('click', async (event) => {
    try {
      await portalApi.cancelProfileChange(event.currentTarget.dataset.cancel);
      toast('Đã hủy đề nghị');
      ctx.refresh();
    } catch (error) {
      toast(error.message || 'Chưa hủy được đề nghị', 'error');
    }
  });

  const form = root.querySelector('[data-password]');
  const binding = bindForm(form, {
    fields: PASSWORD_FIELDS, guardDirty: false, submittingLabel: 'Đang cập nhật…',
    validate: (v) => {
      if (v.newPassword && v.newPassword.length < 8) return { newPassword: ['Mật khẩu mới cần ít nhất 8 ký tự.'] };
      if (v.newPassword !== v.confirmPassword) return { confirmPassword: ['Mật khẩu nhập lại chưa khớp.'] };
      return null;
    },
    onSubmit: async ({ currentPassword, newPassword }) => {
      await authApi.changePassword({ currentPassword, newPassword });
      session.clearLocal();
      ctx.navigate('/login');
      form.reset();
      toast('Đã đổi mật khẩu');
    },
  });
  ctx.onCleanup(() => binding.destroy());
}
