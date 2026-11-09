// Cài đặt: tài khoản admin (họ tên, email, điện thoại, ảnh đại diện, mật khẩu) và lịch nhắc nhập số, tạo hóa đơn hằng tháng.
import { toast } from '../../components/dialogs.js';
import { bindForm, enhance, formAlert, renderFields } from '../../components/form.js';
import { errorState, icon, loadingBlock, note, pageHeader, simulated } from '../../components/ui.js';
import { authApi, settingsApi } from '../../services/api.js';
import { session } from '../../services/session.js';
import { initials } from '../../utils/format.js';
import { html, setHtml } from '../../utils/html.js';
import { dataChanged } from './common.js';
import { bindFilePicker } from '../../components/file-picker.js';

const DAYS = Array.from({ length: 28 }, (_, i) => ({ value: String(i + 1), label: `Ngày ${i + 1}` }));

export default async function SettingsPage(ctx) {
  ctx.setTitle('Cài đặt');
  setHtml(ctx.outlet, loadingBlock(8));
  const canSchedule = session.can('billing.read');
  const canSaveSchedule = session.can('settings.manage');
  let schedule = null;
  let organization = null;
  try {
    [schedule, organization] = await Promise.all([canSchedule ? settingsApi.billingSchedule() : null, settingsApi.organization()]);
  } catch (error) {
    setHtml(ctx.outlet, errorState(error));
    return;
  }
  const user = session.user;
  let avatarFileId = user.avatarFileId;
  let avatarUrl = user.avatarUrl;

  const profileFields = [
    { name: 'displayName', label: 'Họ tên', required: true },
    { name: 'email', label: 'Email', type: 'email', required: true, col: 'col-md-6', autocomplete: 'email' },
    { name: 'phone', label: 'Số điện thoại liên hệ', type: 'tel', col: 'col-md-6', optional: true, autocomplete: 'tel' },
  ];
  const passwordFields = [
    { name: 'currentPassword', label: 'Mật khẩu hiện tại', type: 'password', required: true, autocomplete: 'current-password' },
    { name: 'newPassword', label: 'Mật khẩu mới', type: 'password', required: true, minLength: 8, col: 'col-md-6', autocomplete: 'new-password', help: 'Ít nhất 8 ký tự.' },
    { name: 'confirm', label: 'Nhập lại mật khẩu mới', type: 'password', required: true, col: 'col-md-6', autocomplete: 'new-password' },
  ];
  const bankFields = [
    { name: 'bankName', label: 'Ngân hàng', optional: true },
    { name: 'bankAccountNumber', label: 'Số tài khoản', optional: true, col: 'col-md-6' },
    { name: 'bankAccountName', label: 'Tên chủ tài khoản', optional: true, col: 'col-md-6' },
  ];
  const scheduleFields = [
    { name: 'meterReadingDay', label: 'Ngày nhập số điện nước', type: 'select', required: true, placeholderOption: false, col: 'col-md-6', options: DAYS, disabled: !canSaveSchedule },
    { name: 'invoiceCreateDay', label: 'Ngày tạo hóa đơn', type: 'select', required: true, placeholderOption: false, col: 'col-md-6', options: DAYS, disabled: !canSaveSchedule },
    { name: 'reminderEnabled', label: 'Nhắc tôi', type: 'switch', checkLabel: 'Nhắc trên trang Tổng quan khi tới ngày', disabled: !canSaveSchedule },
  ];

  setHtml(ctx.outlet, html`${pageHeader({ title: 'Cài đặt', subtitle: 'Thông tin tài khoản của bạn và lịch nhắc tính tiền hằng tháng.' })}
  <div class="ad-settings">
    <form id="profile-form" class="sr-panel" novalidate>
      <div class="sr-panel-head"><h2>Thông tin tài khoản</h2></div>
      <div class="sr-panel-body">${formAlert()}
        <div class="ad-avatar-row">
          <span class="ad-profile-avatar is-lg" data-avatar></span>
          <div><button type="button" class="btn btn-outline-secondary btn-sm mb-0" data-pick-avatar aria-controls="st-avatar">${icon('image')} Đổi ảnh đại diện</button>
            <input type="file" id="st-avatar" class="visually-hidden" accept="image/jpeg,image/png,image/webp" tabindex="-1" aria-label="Chọn ảnh đại diện">
            <button type="button" class="btn btn-link btn-sm text-danger" data-remove-avatar hidden>Xóa ảnh</button>
            <p class="small text-muted-sr mb-0 mt-1" data-avatar-hint>JPG, PNG hoặc WEBP, tối đa 2 MB.</p></div>
        </div>
        ${renderFields(profileFields, user)}
      </div>
      <div class="sr-panel-foot"><button type="submit" class="btn btn-primary">Lưu thông tin</button></div>
    </form>
    <form id="password-form" class="sr-panel" novalidate>
      <div class="sr-panel-head"><h2>Đổi mật khẩu</h2></div>
      <div class="sr-panel-body">${formAlert()}${renderFields(passwordFields, {})}</div>
      <div class="sr-panel-foot"><button type="submit" class="btn btn-primary">Đổi mật khẩu</button></div>
    </form>
    <form id="bank-form" class="sr-panel" novalidate>
      <div class="sr-panel-head"><h2>Tài khoản nhận tiền</h2></div>
      <div class="sr-panel-body">${formAlert()}<p class="small text-muted-sr">Thông tin này hiển thị trên hóa đơn khách. Nhập đủ ba mục hoặc để trống cả ba.</p>${renderFields(bankFields, organization.settings)}</div>
      <div class="sr-panel-foot"><button type="submit" class="btn btn-primary">Lưu tài khoản nhận tiền</button></div>
    </form>
    ${schedule ? html`<form id="schedule-form" class="sr-panel" novalidate>
      <div class="sr-panel-head"><h2>Lịch nhắc tính tiền</h2><span class="sr-panel-note">Nhắc trên Tổng quan</span></div>
      <div class="sr-panel-body">${formAlert()}
        <p class="ad-section-hint">Tới ngày đã chọn, trang Tổng quan nhắc còn bao nhiêu phòng chưa nhập số hoặc chưa tạo hóa đơn. Chọn tối đa ngày 28 để tháng nào cũng có.</p>
        ${renderFields(scheduleFields, { ...schedule, meterReadingDay: String(schedule.meterReadingDay), invoiceCreateDay: String(schedule.invoiceCreateDay) })}
        ${canSaveSchedule ? '' : html`<div class="mt-3">${note('Chỉ chủ trọ đổi được lịch này.')}</div>`}
      </div>
      ${canSaveSchedule ? html`<div class="sr-panel-foot"><button type="submit" class="btn btn-primary">Lưu lịch nhắc</button></div>` : ''}
    </form>` : ''}
  </div>`);

  const profile = ctx.outlet.querySelector('#profile-form');
  const avatarEl = profile.querySelector('[data-avatar]');
  const fileInput = profile.querySelector('#st-avatar');
  const removeBtn = profile.querySelector('[data-remove-avatar]');
  const hint = profile.querySelector('[data-avatar-hint]');
  ctx.onCleanup(bindFilePicker(profile, '[data-pick-avatar]', () => fileInput));
  let avatarPreviewUrl = null;
  const releasePreview = () => {
    if (avatarPreviewUrl) URL.revokeObjectURL(avatarPreviewUrl);
    avatarPreviewUrl = null;
  };
  ctx.onCleanup(releasePreview);
  const showAvatar = () => {
    setHtml(avatarEl, avatarUrl ? html`<img src="${avatarUrl}" alt="Ảnh đại diện">` : initials(profile.querySelector('[data-field="displayName"]').value));
    removeBtn.hidden = !avatarUrl;
  };
  showAvatar();

  fileInput.addEventListener('change', async () => {
    const [file] = fileInput.files;
    if (!file) return;
    fileInput.value = '';
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 2 * 1024 * 1024) {
      hint.textContent = 'Ảnh chưa hợp lệ. Chọn JPG, PNG hoặc WEBP, tối đa 2 MB.';
      hint.classList.add('text-danger');
      return;
    }
    hint.classList.remove('text-danger');
    hint.textContent = 'Đang tải ảnh…';
    try {
      const { filesApi } = await import('../../services/api.js');
      const uploaded = await filesApi.upload(file, { visibility: 'public', purpose: 'avatar' });
      avatarFileId = uploaded.id;
      // API upload trả metadata/id. Dùng URL blob để xem trước trước khi bấm Lưu;
      // sau khi lưu, /me trả URL công khai của avatar đã gắn vào tài khoản.
      releasePreview();
      avatarPreviewUrl = URL.createObjectURL(file);
      avatarUrl = avatarPreviewUrl;
      hint.textContent = 'Bấm Lưu thông tin để áp dụng ảnh mới.';
      showAvatar();
    } catch (error) {
      hint.textContent = error.detail || 'Không tải được ảnh. Thử lại.';
      hint.classList.add('text-danger');
    }
  });
  removeBtn.addEventListener('click', () => {
    releasePreview();
    avatarFileId = null;
    avatarUrl = null;
    hint.textContent = 'Bấm Lưu thông tin để xóa ảnh.';
    showAvatar();
  });

  ctx.onCleanup(await enhance(ctx.outlet));
  const bindings = [
    bindForm(profile, {
      fields: profileFields, submittingLabel: 'Đang lưu…',
      onSubmit: async (v) => {
        await authApi.updateProfile({ ...v, avatarFileId });
        await session.reload();
        toast('Đã lưu thông tin tài khoản');
        // Khung trang giữ tên và ảnh cũ cho tới lần gắn lại.
        ctx.shell?.invalidateCounts();
        window.setTimeout(() => window.location.reload(), 600);
      },
    }),
    bindForm(ctx.outlet.querySelector('#password-form'), {
      fields: passwordFields, submittingLabel: 'Đang đổi…',
      validate: (v) => (v.newPassword && v.confirm && v.newPassword !== v.confirm ? { confirm: ['Mật khẩu nhập lại chưa khớp.'] } : null),
      onSubmit: async (v) => {
        await authApi.changePassword({ currentPassword: v.currentPassword, newPassword: v.newPassword });
        ctx.outlet.querySelector('#password-form').reset();
        session.clearLocal();
        toast('Đã đổi mật khẩu. Vui lòng đăng nhập lại.');
        ctx.navigate('/admin/login');
      },
    }),
  ];
  bindings.push(bindForm(ctx.outlet.querySelector('#bank-form'), {
    fields: bankFields,
    validate: (v) => {
      const count = Object.values(v).filter((value) => String(value || '').trim()).length;
      return count > 0 && count < 3 ? { bankName: ['Cần nhập đủ ngân hàng, số tài khoản và tên chủ tài khoản.'] } : null;
    },
    onSubmit: async (v) => {
      organization = await settingsApi.saveOrganization({ name: organization.name, settings: { ...organization.settings, ...v } });
      toast('Đã lưu tài khoản nhận tiền');
    },
  }));
  const scheduleForm = ctx.outlet.querySelector('#schedule-form');
  if (scheduleForm && canSaveSchedule) {
    bindings.push(bindForm(scheduleForm, {
      fields: scheduleFields,
      validate: (v) => (Number(v.invoiceCreateDay) < Number(v.meterReadingDay) ? { invoiceCreateDay: ['Ngày tạo hóa đơn phải từ ngày nhập số trở đi.'] } : null),
      onSubmit: async (v) => {
        await settingsApi.saveBillingSchedule({ meterReadingDay: Number(v.meterReadingDay), invoiceCreateDay: Number(v.invoiceCreateDay), reminderEnabled: v.reminderEnabled });
        dataChanged();
        toast('Đã lưu lịch nhắc');
      },
    }));
  }
  ctx.onCleanup(() => bindings.forEach((b) => b.destroy()));
}
