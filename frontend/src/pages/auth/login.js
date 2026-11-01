// Đăng nhập dùng chung cho khách và quản lý.
import { bindForm, formAlert, renderFields } from '../../components/form.js';
import { icon, link, note } from '../../components/ui.js';
import { navigate } from '../../router/router.js';
import { session } from '../../services/session.js';
import { html, setHtml } from '../../utils/html.js';
import { toQueryString } from '../../utils/query.js';
import { landingAfterLogin, safeNext } from './shared.js';

export default async function LoginPage(ctx) {
  ctx.setTitle('Đăng nhập');
  const next = safeNext(ctx.query);
  const fields = [
    { name: 'email', label: 'Email', type: 'email', required: true, autocomplete: 'username', attrs: { 'data-autofocus': true } },
    { name: 'password', label: 'Mật khẩu', type: 'password', required: true, autocomplete: 'current-password' },
  ];
  const bookingFirst = next?.startsWith('/rooms');
  setHtml(ctx.outlet, html`
    <a class="sr-auth-back" href="${link('/')}">${icon('arrow-left')} Về trang chủ</a>
    <h1 class="h3 mb-1">Đăng nhập</h1>
    <p class="text-muted-sr mb-4">${bookingFirst ? 'Đăng nhập để đặt lịch xem phòng.' : 'Vào tài khoản của bạn để đặt lịch xem phòng, xem hóa đơn và hợp đồng.'}</p>
    ${ctx.query.expired ? note('Phiên đăng nhập đã hết hạn. Đăng nhập lại để tiếp tục.', { tone: 'warn' }) : ''}
    ${ctx.query.reset ? note('Đã đặt lại mật khẩu. Đăng nhập bằng mật khẩu mới.', { tone: 'ok' }) : ''}
    <form novalidate class="mt-3" data-form>${formAlert()}${renderFields(fields)}
      <div class="text-end mt-2"><a href="${link('/forgot-password')}" class="small">Quên mật khẩu?</a></div>
      <button type="submit" class="btn btn-primary w-100 mt-3">Đăng nhập</button>
    </form>
    <p class="sr-auth-switch">Chưa có tài khoản? <a href="${link(`/register${toQueryString({ next })}`)}">Tạo tài khoản</a></p>`);

  const form = ctx.outlet.querySelector('[data-form]');
  const binding = bindForm(form, {
    fields, guardDirty: false, submittingLabel: 'Đang đăng nhập…',
    onSubmit: async (values) => {
      await session.login(values.email, values.password);
      await navigate(landingAfterLogin(next), { replace: true, force: true });
    },
  });
  return () => binding.destroy();
}
