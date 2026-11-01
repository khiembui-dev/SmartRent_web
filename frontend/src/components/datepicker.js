// Chọn ngày bằng Flatpickr, tiếng Việt, hiển thị dd/mm/yyyy, giá trị gửi API là YYYY-MM-DD (ngày nghiệp vụ).
// Với ngày giờ: giá trị là "YYYY-MM-DDTHH:mm" theo giờ Việt Nam, form đổi sang ISO UTC khi gửi.
import flatpickr from 'flatpickr';
import { Vietnamese } from 'flatpickr/dist/esm/l10n/vn.js';
import 'flatpickr/dist/flatpickr.min.css';

flatpickr.localize(Vietnamese);

export function initDatepickers(root) {
  const instances = [];
  root.querySelectorAll('[data-datepicker]').forEach((el) => {
    if (el._flatpickr) return;
    const withTime = el.dataset.enableTime === 'true';
    const instance = flatpickr(el, {
      allowInput: true,
      altInput: true,
      altFormat: withTime ? 'H:i d/m/Y' : 'd/m/Y',
      dateFormat: withTime ? 'Y-m-d\\TH:i' : 'Y-m-d',
      enableTime: withTime,
      time_24hr: true,
      minDate: el.dataset.min || null,
      maxDate: el.dataset.max || null,
      disableMobile: true,
      onChange: () => {
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      },
    });
    // Nhãn trỏ tới ô hiển thị để trình đọc màn hình và bàn phím dùng đúng ô.
    const alt = instance.altInput;
    if (alt) {
      alt.setAttribute('aria-describedby', el.getAttribute('aria-describedby') || '');
      const labelId = `${el.id}-alt`;
      alt.id = labelId;
      const label = root.querySelector(`label[for="${el.id}"]`);
      if (label) label.setAttribute('for', labelId);
      if (el.required) alt.required = true;
      alt.placeholder = withTime ? 'giờ:phút ngày/tháng/năm' : 'ngày/tháng/năm';
    }
    instances.push(instance);
  });
  return () => instances.forEach((i) => i.destroy());
}

export function datepicker(el, options = {}) {
  return flatpickr(el, { altInput: true, altFormat: 'd/m/Y', dateFormat: 'Y-m-d', disableMobile: true, ...options });
}
