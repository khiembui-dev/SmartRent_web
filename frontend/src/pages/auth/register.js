// Tạo tài khoản khách: hồ sơ lưu ở mục Khách thuê của admin, xong đăng nhập luôn để đặt lịch xem phòng.
import { bindForm, formAlert, renderFields } from '../../components/form.js';
import { icon, link } from '../../components/ui.js';
import { navigate } from '../../router/router.js';
import { session } from '../../services/session.js';
import { html, setHtml } from '../../utils/html.js';
import { toQueryString } from '../../utils/query.js';
import { landingAfterLogin, safeNext } from './shared.js';

export default function RegisterPage(ctx) {
  ctx.setTitle('Tạo tài khoản');
  const next = safeNext(ctx.query);
  const fields = [
    { name: 'fullName', label: 'Họ và tên', required: true, autocomplete: 'name', attrs: { 'data-autofocus': true } },
    { name: 'phone', label: 'Số điện thoại', type: 'tel', required: true, autocomplete: 'tel', col: 'col-sm-6', help: 'Quản lý gọi số này để xác nhận lịch xem.' },
    { name: 'email', label: 'Email', type: 'email', required: true, autocomplete: 'email', col: 'col-sm-6', help: 'Dùng để đăng nhập.' },
    { name: 'password', label: 'Mật khẩu', type: 'password', required: true, autocomplete: 'new-password', col: 'col-sm-6', help: 'Tối thiểu 8 ký tự.' },
    { name: 'confirmPassword', label: 'Nhập lại mật khẩu', type: 'password', required: true, autocomplete: 'new-password', col: 'col-sm-6' },
    { name: 'acceptedTerms', label: 'Đồng ý', type: 'checkbox', required: true, checkLabel: 'Tôi đồng ý để quản lý dùng thông tin này liên hệ về việc thuê phòng.', requiredMessage: 'Cần đồng ý để tạo tài khoản.' },
  ];
  setHtml(ctx.outlet, html`
    <a class="sr-auth-back" href="${link('/')}">${icon('arrow-left')} Về trang chủ</a>
    <h1 class="h3 mb-1">Tạo tài khoản</h1>
    <p class="text-muted-sr mb-4">Có tài khoản là đặt lịch xem phòng được ngay.</p>
    <form novalidate data-form>${formAlert()}${renderFields(fields)}
      <button type="submit" class="btn btn-primary w-100 mt-3">Tạo tài khoản</button>
    </form>
    <p class="sr-auth-switch">Đã có tài khoản? <a href="${link(`/login${toQueryString({ next })}`)}">Đăng nhập</a></p>`);

  const binding = bindForm(ctx.outlet.querySelector('[data-form]'), {
    fields, guardDirty: false, submittingLabel: 'Đang tạo tài khoản…',
    validate: (v) => {
      if (v.password && v.password.length < 8) return { password: ['Mật khẩu cần ít nhất 8 ký tự.'] };
      if (v.password !== v.confirmPassword) return { confirmPassword: ['Mật khẩu nhập lại chưa khớp.'] };
      return null;
    },
    onSubmit: async ({ confirmPassword, ...body }) => {
      await session.register(body);
      await navigate(landingAfterLogin(next), { replace: true, force: true });
    },
  });
  return () => binding.destroy();
}
