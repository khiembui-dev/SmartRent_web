// Quên mật khẩu: luôn trả cùng một thông báo để không lộ email nào đã có tài khoản.
import { bindForm, formAlert, renderFields } from '../../components/form.js';
import { icon, link, note } from '../../components/ui.js';
import { config } from '../../config.js';
import { authApi } from '../../services/api.js';
import { html, setHtml } from '../../utils/html.js';

export default function ForgotPage(ctx) {
  ctx.setTitle('Quên mật khẩu');
  const fields = [{ name: 'email', label: 'Email đăng nhập', type: 'email', required: true, autocomplete: 'email', attrs: { 'data-autofocus': true } }];
  setHtml(ctx.outlet, html`<h1 class="h3 mb-1">Quên mật khẩu</h1>
    <p class="text-muted-sr mb-4">Nhập email đăng nhập. Nếu email có tài khoản, bạn sẽ nhận liên kết đặt lại mật khẩu có hạn sử dụng.</p>
    <div data-wrap><form novalidate>${formAlert()}${renderFields(fields)}
      <div class="d-flex justify-content-between align-items-center mt-3"><a href="${link('/login')}" class="small">${icon('arrow-left')} Quay lại đăng nhập</a>
      <button type="submit" class="btn btn-primary">Gửi liên kết</button></div></form></div>`);
  const binding = bindForm(ctx.outlet.querySelector('form'), {
    fields, guardDirty: false,
    onSubmit: async (values) => {
      await authApi.forgotPassword(values.email);
      setHtml(ctx.outlet.querySelector('[data-wrap]'), html`${note('Nếu email đã đăng ký, liên kết đặt lại mật khẩu sẽ được gửi trong vài phút. Kiểm tra cả thư mục spam.', { tone: 'ok' })}
        ${config.isMock ? html`<div class="mt-3">${note('Chưa kết nối dịch vụ email nên chưa có thư nào được gửi.', { tone: 'sim' })}</div>` : ''}
        <a class="btn btn-outline-primary mt-3" href="${link('/login')}">Quay lại đăng nhập</a>`);
    },
  });
  return () => binding.destroy();
}
