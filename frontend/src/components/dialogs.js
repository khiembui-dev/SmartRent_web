// Xác nhận, nhập lý do và thông báo ngắn bằng SweetAlert2. Form phức tạp dùng modal Bootstrap (modal.js).
import Swal from 'sweetalert2';
import 'sweetalert2/dist/sweetalert2.min.css';
import { ApiError, errorHint } from '../services/errors.js';
import { escapeHtml, toHtml } from '../utils/html.js';

const base = Swal.mixin({
  customClass: {
    popup: 'sr-swal',
    confirmButton: 'btn btn-primary',
    cancelButton: 'btn btn-outline-secondary',
    denyButton: 'btn btn-outline-danger',
  },
  buttonsStyling: false,
  reverseButtons: true,
  focusCancel: false,
  showClass: { popup: 'animate__animated animate__fadeIn animate__faster' },
  hideClass: { popup: '' },
});

const toastBase = Swal.mixin({
  toast: true,
  position: 'bottom-end',
  showConfirmButton: false,
  timer: 3800,
  timerProgressBar: false,
  customClass: { popup: 'sr-swal-toast' },
});

export function toast(message, icon = 'success') {
  return toastBase.fire({ icon, title: message });
}

export async function confirmDialog({ title, text, html, confirmText = 'Xác nhận', cancelText = 'Hủy', tone = 'primary' }) {
  const result = await base.fire({
    title,
    html: html ? toHtml(html) : escapeHtml(text || ''),
    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: cancelText,
    customClass: { popup: 'sr-swal', confirmButton: `btn btn-${tone}`, cancelButton: 'btn btn-outline-secondary' },
  });
  return result.isConfirmed;
}

/**
 * Hỏi lý do bắt buộc cho thao tác ảnh hưởng chứng từ/tiền (khóa/mở kỳ, hủy, đảo, đóng còn nợ...).
 * Trả chuỗi lý do hoặc null nếu người dùng hủy.
 */
export async function reasonDialog({ title, text, html, label = 'Lý do', placeholder = 'Ghi rõ căn cứ để người khác kiểm tra lại', confirmText = 'Xác nhận', tone = 'primary', minLength = 5 }) {
  const result = await base.fire({
    title,
    html: `${html ? toHtml(html) : escapeHtml(text || '')}<label class="form-label mt-3 mb-0 d-block text-start" for="swal-reason">${escapeHtml(label)}</label>`,
    input: 'textarea',
    inputAttributes: { id: 'swal-reason', 'aria-label': label, maxlength: 500 },
    inputPlaceholder: placeholder,
    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: 'Hủy',
    customClass: { popup: 'sr-swal', confirmButton: `btn btn-${tone}`, cancelButton: 'btn btn-outline-secondary' },
    inputValidator: (value) => {
      if (!value || value.trim().length < minLength) return `Nhập lý do tối thiểu ${minLength} ký tự.`;
      return null;
    },
  });
  return result.isConfirmed ? result.value.trim() : null;
}

export function infoDialog({ title, text, html, icon = 'info' }) {
  return base.fire({ title, html: html ? toHtml(html) : escapeHtml(text || ''), icon, confirmButtonText: 'Đã hiểu' });
}

/** Hiển thị lỗi API có hướng dẫn xử lý; lỗi validation thường đã gắn vào trường form nên chỉ dùng cho thao tác nhanh. */
export function errorDialog(error, fallbackTitle = 'Chưa thực hiện được') {
  if (error instanceof ApiError && error.isAborted) return Promise.resolve();
  const title = error instanceof ApiError ? error.title || fallbackTitle : fallbackTitle;
  const detail = error instanceof ApiError ? error.detail : error?.message;
  const fields = error instanceof ApiError ? Object.values(error.fieldErrors).flat() : [];
  const unique = [...new Set(fields)].filter((m) => m !== detail);
  return base.fire({
    icon: 'error',
    title,
    html: `${detail ? `<p class="mb-2">${escapeHtml(detail)}</p>` : ''}${unique.length ? `<ul class="mb-2 ps-3">${unique.map((m) => `<li>${escapeHtml(m)}</li>`).join('')}</ul>` : ''}<p class="mb-0 small text-muted">${escapeHtml(errorHint(error))}${error?.traceId ? ` Mã tra cứu: ${escapeHtml(error.traceId)}` : ''}</p>`,
    confirmButtonText: 'Đóng',
  });
}

/** Chạy một thao tác: hiển thị toast khi thành công, hộp lỗi khi thất bại. Trả kết quả hoặc undefined. */
export async function runAction(fn, { success, onError } = {}) {
  try {
    const result = await fn();
    if (success) toast(typeof success === 'function' ? success(result) : success);
    return result;
  } catch (error) {
    if (onError) onError(error);
    else await errorDialog(error);
    return undefined;
  }
}
