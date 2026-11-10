// Hộp thoại dùng chung cho khách thuê: thêm/sửa hồ sơ (cả từ form hợp đồng) và đổi mật khẩu tài khoản khách.
import { confirmDialog } from '../../components/dialogs.js';
import { formModal } from '../../components/modal.js';
import { note } from '../../components/ui.js';
import { ApiError } from '../../services/errors.js';
import { tenantsApi } from '../../services/api.js';
import { todayIso } from '../../utils/date.js';
import { contractTenantErrors } from '../../utils/contract-tenant.js';

const FIELDS = [
  { name: 'fullName', label: 'Họ tên', required: true },
  { name: 'phone', label: 'Số điện thoại', type: 'tel', col: 'col-md-6', optional: true },
  { name: 'email', label: 'Email', type: 'email', col: 'col-md-6', optional: true },
  { name: 'dateOfBirth', label: 'Ngày sinh', type: 'date', col: 'col-md-6', optional: true, max: todayIso() },
  { name: 'addressLine', label: 'Địa chỉ thường trú', col: 'col-md-6', optional: true },
  { name: 'emergencyContactName', label: 'Người liên hệ khẩn cấp', col: 'col-md-6', optional: true },
  { name: 'emergencyContactPhone', label: 'Điện thoại khẩn cấp', type: 'tel', col: 'col-md-6', optional: true },
  { name: 'notes', label: 'Ghi chú', type: 'textarea', rows: 2, optional: true },
];

export function tenantFormModal(tenant, { forContract = false } = {}) {
  const values = tenant ? { ...tenant, addressLine: tenant.address?.line } : {};
  const save = async (v) => {
    if (tenant) return tenantsApi.update(tenant.id, { ...v, locality: tenant.address?.locality });
    try {
      return await tenantsApi.create(v);
    } catch (error) {
      if (!(error instanceof ApiError) || error.code !== 'possible_duplicate_tenant') throw error;
      const others = Object.values(error.fieldErrors).flat().join(', ');
      if (!(await confirmDialog({ title: 'Có thể trùng hồ sơ', text: `${error.detail} ${others}`, confirmText: 'Vẫn tạo hồ sơ mới' }))) throw error;
      return tenantsApi.create({ ...v, confirmDuplicate: true });
    }
  };
  const fields = FIELDS.map((field) => forContract && ['phone', 'dateOfBirth'].includes(field.name)
    ? { ...field, required: true, optional: false, help: field.name === 'dateOfBirth' ? 'Người đứng tên hợp đồng phải đủ 18 tuổi.' : '' } : field);
  return formModal({ title: tenant ? `Sửa thông tin ${tenant.fullName}` : 'Thêm khách thuê', size: 'lg', submitLabel: tenant ? 'Lưu thay đổi' : 'Thêm khách', fields, values, onSubmit: save,
    validate: forContract ? contractTenantErrors : undefined });
}

export function tenantPasswordModal(tenant) {
  return formModal({
    title: `Đổi mật khẩu ${tenant.fullName}`, submitLabel: 'Đổi mật khẩu',
    intro: note('Khách bị đăng xuất khỏi mọi thiết bị và đăng nhập lại bằng mật khẩu mới. Hãy báo mật khẩu mới trực tiếp cho khách.', { tone: 'warn' }),
    fields: [
      { name: 'newPassword', label: 'Mật khẩu mới', type: 'password', required: true, minLength: 8, autocomplete: 'new-password', help: 'Ít nhất 8 ký tự.' },
      { name: 'confirm', label: 'Nhập lại mật khẩu mới', type: 'password', required: true, autocomplete: 'new-password' },
    ],
    validate: (v) => (v.newPassword && v.confirm && v.newPassword !== v.confirm ? { confirm: ['Mật khẩu nhập lại chưa khớp.'] } : null),
    onSubmit: (v) => tenantsApi.setPassword(tenant.id, v.newPassword),
  });
}
