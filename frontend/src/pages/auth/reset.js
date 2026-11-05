// Đặt lại mật khẩu bằng token trong liên kết email. Đặt lại xong, mọi phiên cũ bị thu hồi.
import { bindForm, formAlert, renderFields } from '../../components/form.js';
import { link, note } from '../../components/ui.js';
import { navigate } from '../../router/router.js';
import { authApi } from '../../services/api.js';
import { html, setHtml } from '../../utils/html.js';

export default function ResetPage(ctx) {
  const prefix = ctx.path.startsWith('/admin/') ? '/admin' : '';
  ctx.setTitle('Đặt lại mật khẩu');
  const token = ctx.query.token || '';
  const fields = [
    { name: 'newPassword', label: 'Mật khẩu mới', type: 'password', required: true, minLength: 8, autocomplete: 'new-password', help: 'Ít nhất 8 ký tự. Nên kết hợp chữ, số và ký hiệu.' },
    { name: 'confirm', label: 'Nhập lại mật khẩu mới', type: 'password', required: true, autocomplete: 'new-password' },
  ];
  setHtml(ctx.outlet, html`<h1 class="h3 mb-1">Đặt lại mật khẩu</h1>
    ${token ? '' : note(html`Liên kết thiếu mã đặt lại. <a href="${link(`${prefix}/forgot-password`)}">Yêu cầu liên kết mới</a>.`, { tone: 'warn' })}
    <form novalidate class="mt-3">${formAlert()}${renderFields(fields)}<button type="submit" class="btn btn-primary mt-3 w-100" ${token ? '' : 'disabled'}>Lưu mật khẩu mới</button></form>`);
  const binding = bindForm(ctx.outlet.querySelector('form'), {
    fields, guardDirty: false,
    validate: (v) => (v.newPassword && v.confirm && v.newPassword !== v.confirm ? { confirm: ['Hai mật khẩu chưa khớp.'] } : null),
    onSubmit: async (values) => {
      await authApi.resetPassword(token, values.newPassword);
      await navigate(`${prefix}/login?reset=1`, { replace: true, force: true });
    },
  });
  return () => binding.destroy();
}
