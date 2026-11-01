// Modal Bootstrap tạo động cho form nghiệp vụ (ghi chỉ số, thu tiền, thêm người ở cùng...).
import { Modal } from 'bootstrap';
import { html, setHtml } from '../utils/html.js';
import { bindForm, enhance, formAlert, renderFields } from './form.js';

let counter = 0;

export function openModal({ title, body, size = '', footer, staticBackdrop = false, onShown }) {
  counter += 1;
  const id = `sr-modal-${counter}`;
  const el = document.createElement('div');
  el.className = 'modal fade';
  el.id = id;
  el.tabIndex = -1;
  el.setAttribute('aria-labelledby', `${id}-title`);
  el.setAttribute('aria-hidden', 'true');
  setHtml(el, html`<div class="modal-dialog modal-dialog-scrollable ${size ? `modal-${size}` : ''} modal-fullscreen-sm-down">
    <div class="modal-content">
      <div class="modal-header"><h2 class="modal-title h5" id="${id}-title">${title}</h2>
        <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Đóng"></button></div>
      <div class="modal-body" data-modal-body>${body}</div>
      ${footer ? html`<div class="modal-footer">${footer}</div>` : ''}
    </div></div>`);
  document.body.append(el);
  const modal = new Modal(el, { backdrop: staticBackdrop ? 'static' : true, focus: true });
  let resolveHidden;
  const hidden = new Promise((resolve) => { resolveHidden = resolve; });
  el.addEventListener('shown.bs.modal', () => onShown?.(el), { once: true });
  el.addEventListener('hidden.bs.modal', () => {
    modal.dispose();
    el.remove();
    resolveHidden();
  }, { once: true });
  modal.show();
  return { el, modal, close: () => modal.hide(), hidden };
}

/**
 * Modal chứa form. Trả Promise kết quả onSubmit (hoặc null nếu đóng).
 * fields: định nghĩa trường (xem form.js); onSubmit(values, { idempotencyKey }) phải ném ApiError khi lỗi để gắn vào trường.
 * afterRender(form) có thể trả hàm dọn dẹp (ví dụ hủy FilePond) chạy khi đóng modal.
 */
export function formModal({ title, intro, fields, values = {}, submitLabel = 'Lưu', submitTone = 'primary', size = '', onSubmit, extra, afterRender, validate, transform }) {
  return new Promise((resolve) => {
    let result = null;
    let cleanup = () => {};
    let binding = null;
    const formId = `sr-form-${counter + 1}`;
    const { el, close, hidden } = openModal({
      title, size, staticBackdrop: true,
      body: html`<form id="${formId}" novalidate>${formAlert()}${intro ? html`<div class="mb-3">${intro}</div>` : ''}${renderFields(fields, values)}${extra || ''}</form>`,
      footer: html`<button type="button" class="btn btn-outline-secondary" data-bs-dismiss="modal">Hủy</button>
        <button type="submit" class="btn btn-${submitTone}" form="${formId}">${submitLabel}</button>`,
      onShown: async (root) => {
        const form = root.querySelector('form');
        cleanup = await enhance(form);
        binding = bindForm(form, {
          fields, guardDirty: false, validate, transform,
          onSubmit: async (vals, meta) => {
            result = await onSubmit(vals, meta);
            close();
          },
        });
        const disposeExtra = await afterRender?.(form);
        if (typeof disposeExtra === 'function') {
          const base = cleanup;
          cleanup = () => { disposeExtra(); base(); };
        }
        form.querySelector('input:not([type=hidden]), select, textarea')?.focus();
      },
    });
    hidden.then(() => {
      binding?.destroy();
      cleanup();
      resolve(result);
    });
    void el;
  });
}
