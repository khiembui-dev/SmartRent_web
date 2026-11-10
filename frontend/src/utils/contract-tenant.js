import { addMonths, isIsoDate, todayIso } from './date.js';

export function contractTenantErrors(tenant, today = todayIso()) {
  const errors = {};
  if (!tenant?.phone || !/^(\+84|0)\d{9,10}$/.test(tenant.phone.replace(/[\s.-]/g, ''))) {
    errors.phone = ['Người đứng tên hợp đồng phải có số điện thoại Việt Nam hợp lệ.'];
  }
  if (!isIsoDate(tenant?.dateOfBirth)) errors.dateOfBirth = ['Cần nhập ngày sinh của người đứng tên hợp đồng.'];
  else if (addMonths(tenant.dateOfBirth, 18 * 12) > today) errors.dateOfBirth = ['Người đứng tên hợp đồng phải đủ 18 tuổi.'];
  return errors;
}
