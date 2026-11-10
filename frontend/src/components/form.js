// Hệ thống form dùng chung: vẽ trường có label/trợ giúp/lỗi, kiểm tra nhanh phía trình duyệt, gắn lỗi API đúng trường,
// chặn gửi trùng, cảnh báo rời trang khi chưa lưu, giữ Idempotency-Key ổn định khi thử lại.
import { setLeaveGuard } from '../router/router.js';
import { ApiError, errorHint } from '../services/errors.js';
import { uuid } from '../utils/ids.js';
import { formatNumber, formatMoneyEdit, parseDecimal, parseVnd } from '../utils/money.js';
import { attrs, escapeHtml, html, raw } from '../utils/html.js';
import { isIsoDate, localInputToInstant, monthOptions } from '../utils/date.js';

/** Lỗi nhập liệu do trang tự kiểm tra (ví dụ chưa chọn tệp): hiện trong form, không phải lỗi chương trình. */
export class FormError extends Error {}

let seq = 0;
const fieldId = (name) => `f-${name.replace(/[^a-zA-Z0-9]/g, '-')}-${seq}`;

function getPath(obj, path) {
  return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}
function setPath(obj, path, value) {
  const keys = path.split('.');
  let cur = obj;
  keys.slice(0, -1).forEach((k) => {
    cur[k] ??= {};
    cur = cur[k];
  });
  cur[keys[keys.length - 1]] = value;
}

function renderControl(f, value, id) {
  const common = {
    id, name: f.name, 'data-field': f.name, required: f.required, disabled: f.disabled, readonly: f.readonly,
    placeholder: f.placeholder, autocomplete: f.autocomplete, 'aria-describedby': `${id}-help ${id}-error`, ...(f.attrs || {}),
  };
  const v = value ?? f.default ?? '';
  switch (f.type) {
    case 'textarea':
      return html`<textarea class="form-control" rows="${f.rows || 3}" ${attrs({ ...common, maxlength: f.maxLength })}>${v}</textarea>`;
    case 'select':
      return html`<select class="form-select" ${attrs({ ...common, multiple: f.multiple })}>
        ${f.placeholderOption !== false && !f.multiple ? html`<option value="">${f.placeholderOption || '— Chọn —'}</option>` : ''}
        ${(f.options || []).map((o) => html`<option value="${o.value}" ${(f.multiple ? (v || []).includes(o.value) : String(v) === String(o.value)) ? raw('selected') : ''} ${o.disabled ? raw('disabled') : ''}>${o.label}</option>`)}
      </select>`;
    case 'tomselect':
      return html`<select class="form-select" data-tomselect ${attrs({ ...common, multiple: f.multiple, 'data-create': f.create ? 'true' : null, 'data-remote': f.remote || null })}>
        ${!f.multiple ? html`<option value="">${f.placeholderOption || 'Gõ để tìm…'}</option>` : ''}
        ${(f.options || []).map((o) => html`<option value="${o.value}" ${(f.multiple ? (v || []).includes(o.value) : String(v) === String(o.value)) ? raw('selected') : ''} ${o.sub ? html`data-sub="${o.sub}"` : ''}>${o.label}</option>`)}
      </select>`;
    case 'checkbox':
    case 'switch':
      return html`<div class="form-check ${f.type === 'switch' ? 'form-switch' : ''}">
        <input class="form-check-input" type="checkbox" ${attrs({ ...common, checked: Boolean(v), role: f.type === 'switch' ? 'switch' : null, required: f.required })}>
        <label class="form-check-label" for="${id}">${f.checkLabel || f.label}</label>
      </div>`;
    case 'radio':
      return html`<div class="d-flex flex-wrap gap-3" role="radiogroup" aria-labelledby="${id}-label">${(f.options || []).map((o, i) => html`<div class="form-check">
        <input class="form-check-input" type="radio" ${attrs({ name: f.name, id: `${id}-${i}`, value: o.value, checked: String(v) === String(o.value), 'data-field': f.name, disabled: f.disabled })}>
        <label class="form-check-label" for="${id}-${i}">${o.label}</label></div>`)}</div>`;
    case 'money':
      return html`<div class="input-group"><input type="text" inputmode="numeric" class="form-control text-end num" data-money ${attrs({ ...common, value: v === '' || v == null ? '' : formatNumber(v) })}><span class="input-group-text">đ</span></div>`;
    case 'decimal':
      return html`<div class="input-group"><input type="text" inputmode="decimal" class="form-control text-end num" data-decimal="${f.decimals ?? 3}" ${attrs({ ...common, value: v === '' || v == null ? '' : String(v).replace('.', ',') })}>${f.unit ? html`<span class="input-group-text">${f.unit}</span>` : ''}</div>`;
    case 'number':
      return html`<div class="input-group"><input type="number" class="form-control" ${attrs({ ...common, value: v, min: f.min, max: f.max, step: f.step || 1 })}>${f.unit ? html`<span class="input-group-text">${f.unit}</span>` : ''}</div>`;
    case 'date':
      return html`<input type="text" class="form-control" data-datepicker ${attrs({ ...common, value: v, 'data-min': f.min, 'data-max': f.max, autocomplete: 'off' })}>`;
    case 'datetime':
      return html`<input type="text" class="form-control" data-datepicker data-enable-time="true" ${attrs({ ...common, value: v, 'data-min': f.min, autocomplete: 'off' })}>`;
    case 'month':
      return html`<select class="form-select" ${attrs(common)}>
        <option value="">— Chọn tháng —</option>
        ${monthOptions({ around: v ? `${v}-01` : undefined, back: f.back ?? 12, ahead: f.ahead ?? 6, include: v || undefined }).map((o) => html`<option value="${o.value}" ${o.value === v ? raw('selected') : ''}>${o.label}</option>`)}
      </select>`;
    case 'static':
      return html`<div class="form-control-plaintext">${f.render ? f.render(value) : v}</div>`;
    default:
      return html`<input type="${f.type || 'text'}" class="form-control" ${attrs({ ...common, value: v, maxlength: f.maxLength, min: f.min, max: f.max, pattern: f.pattern, inputmode: f.inputmode })}>`;
  }
}

export function renderField(f, value) {
  seq += 1;
  if (f.type === 'hidden') return html`<input type="hidden" ${attrs({ name: f.name, 'data-field': f.name, value: value ?? f.default ?? '' })}>`;
  if (f.type === 'section') return html`<div class="col-12 ${f.className || ''}"><h3 class="h6 mt-2 mb-0">${f.label}</h3>${f.help ? html`<p class="small text-muted-sr mb-0">${f.help}</p>` : ''}</div>`;
  if (f.type === 'html') return html`<div class="${f.col || 'col-12'}">${f.html}</div>`;
  const id = fieldId(f.name);
  const isCheck = f.type === 'checkbox' || f.type === 'switch';
  return html`<div class="${f.col || 'col-12'}" data-wrap="${f.name}">
    ${isCheck ? '' : html`<label class="form-label" id="${id}-label" for="${id}">${f.label}${f.required ? html` <span class="text-danger" aria-hidden="true">*</span>` : ''}${f.optional ? html` <span class="text-muted-sr small">(không bắt buộc)</span>` : ''}</label>`}
    ${renderControl(f, value, id)}
    <div class="form-text" id="${id}-help">${f.help || ''}</div>
    <div class="invalid-feedback d-block" id="${id}-error" data-error-for="${f.name}" aria-live="polite"></div>
  </div>`;
}

export function renderFields(fields, values = {}) {
  return html`<div class="row g-3">${fields.map((f) => renderField(f, f.name ? getPath(values, f.name) : undefined))}</div>`;
}

/** Vùng hiện lỗi chung của form (lỗi không gắn được vào trường cụ thể). */
export const formAlert = () => html`<div class="sr-form-alert" data-form-alert hidden></div>`;

export function readForm(form, fields) {
  const values = {};
  for (const f of fields) {
    if (!f.name || ['section', 'html', 'static'].includes(f.type)) continue;
    const el = form.querySelector(`[data-field="${CSS.escape(f.name)}"]`);
    if (!el) continue;
    let value;
    if (f.type === 'checkbox' || f.type === 'switch') value = el.checked;
    else if (f.type === 'radio') value = form.querySelector(`[data-field="${CSS.escape(f.name)}"]:checked`)?.value ?? null;
    else if (f.multiple) value = [...el.selectedOptions].map((o) => o.value);
    else if (f.type === 'money') value = parseVnd(el.value);
    else if (f.type === 'decimal') value = parseDecimal(el.value);
    else if (f.type === 'number') value = el.value === '' ? null : Number(el.value);
    else if (f.type === 'datetime') value = el.value ? localInputToInstant(el.value) : null;
    else value = el.value.trim() === '' ? null : el.value.trim();
    setPath(values, f.name, value);
  }
  return values;
}

/** Kiểm tra nhanh phía trình duyệt. Máy chủ vẫn kiểm tra lại toàn bộ. */
export function validateFields(fields, values) {
  const errors = {};
  const add = (name, msg) => { (errors[name] ||= []).push(msg); };
  for (const f of fields) {
    if (!f.name || ['section', 'html', 'static', 'hidden'].includes(f.type)) continue;
    const v = getPath(values, f.name);
    const empty = v == null || v === '' || (Array.isArray(v) && !v.length) || (f.type === 'checkbox' && f.required && !v);
    if (f.required && empty) {
      add(f.name, f.type === 'checkbox' ? (f.requiredMessage || 'Cần xác nhận mục này.') : `${f.label} là bắt buộc.`);
      continue;
    }
    if (empty) continue;
    if (f.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) add(f.name, 'Email chưa đúng định dạng.');
    if (f.type === 'tel' && !/^(\+84|0)\d{9,10}$/.test(String(v).replace(/[\s.-]/g, ''))) add(f.name, 'Số điện thoại chưa đúng định dạng Việt Nam.');
    if (f.type === 'money' && (!Number.isSafeInteger(v) || v < 0)) add(f.name, `${f.label} phải là số tiền hợp lệ.`);
    if (f.type === 'money' && f.positive && v <= 0) add(f.name, `${f.label} phải lớn hơn 0.`);
    if (f.type === 'decimal' && (v == null || Number.isNaN(v))) add(f.name, `${f.label} phải là số (dùng dấu phẩy cho phần thập phân).`);
    if (f.type === 'date' && !isIsoDate(v)) add(f.name, `${f.label} chưa hợp lệ.`);
    if ((f.type === 'number' || f.type === 'decimal' || f.type === 'money') && f.min != null && v < f.min) add(f.name, `${f.label} không được nhỏ hơn ${formatNumber(f.min, 3)}.`);
    if ((f.type === 'number' || f.type === 'decimal' || f.type === 'money') && f.max != null && v > f.max) add(f.name, `${f.label} không được lớn hơn ${formatNumber(f.max, 3)}.`);
    if (f.minLength && String(v).length < f.minLength) add(f.name, `${f.label} cần ít nhất ${f.minLength} ký tự.`);
    if (f.validate) {
      const msg = f.validate(v, values);
      if (msg) add(f.name, msg);
    }
  }
  return errors;
}

export function clearErrors(form) {
  form.querySelectorAll('.is-invalid').forEach((el) => el.classList.remove('is-invalid'));
  form.querySelectorAll('[aria-invalid="true"]').forEach((el) => el.removeAttribute('aria-invalid'));
  form.querySelectorAll('[data-error-for]').forEach((el) => { el.textContent = ''; });
  const alert = form.querySelector('[data-form-alert]');
  if (alert) {
    alert.hidden = true;
    alert.innerHTML = '';
  }
}

function controlsFor(form, name) {
  const direct = [...form.querySelectorAll(`[data-field="${CSS.escape(name)}"]`)];
  return direct.map((el) => el._flatpickr?.altInput || el.tomselect?.wrapper || el);
}

/** Gắn lỗi theo trường; khóa không khớp trường nào hiện ở vùng lỗi chung. Trả về true nếu có lỗi. */
export function showErrors(form, errors, { detail, hint } = {}) {
  clearErrors(form);
  const leftovers = [];
  let first = null;
  for (const [name, messages] of Object.entries(errors || {})) {
    const target = form.querySelector(`[data-error-for="${CSS.escape(name)}"]`);
    const controls = controlsFor(form, name);
    if (!target || !controls.length) {
      leftovers.push(...messages);
      continue;
    }
    target.textContent = messages.join(' ');
    controls.forEach((el) => {
      el.classList.add('is-invalid');
      el.setAttribute('aria-invalid', 'true');
    });
    first ||= controls[0];
  }
  const alert = form.querySelector('[data-form-alert]');
  if (alert && (leftovers.length || detail)) {
    alert.hidden = false;
    alert.innerHTML = `<div class="sr-note is-danger mb-3" role="alert"><i class="bi bi-x-octagon" aria-hidden="true"></i><div>${detail ? `<strong>${escapeHtml(detail)}</strong>` : ''}${leftovers.length ? `<ul class="mb-0 ps-3">${[...new Set(leftovers)].map((m) => `<li>${escapeHtml(m)}</li>`).join('')}</ul>` : ''}${hint ? `<div class="small mt-1">${escapeHtml(hint)}</div>` : ''}</div></div>`;
    if (!first) alert.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
  if (first) {
    first.focus?.({ preventScroll: false });
    if (first.scrollIntoView) first.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  return Boolean(first || leftovers.length || detail);
}

export function setSubmitting(form, submitting, label = 'Đang lưu…') {
  const outside = form.id ? [...document.querySelectorAll(`button[form="${CSS.escape(form.id)}"]`)] : [];
  [...form.querySelectorAll('button[type="submit"], [data-submit]'), ...outside].forEach((btn) => {
    if (submitting) {
      btn.dataset.originalHtml ??= btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner-border spinner-border-sm me-1" aria-hidden="true"></span>${escapeHtml(label)}`;
    } else {
      btn.disabled = false;
      if (btn.dataset.originalHtml) btn.innerHTML = btn.dataset.originalHtml;
      delete btn.dataset.originalHtml;
    }
  });
  form.setAttribute('aria-busy', submitting ? 'true' : 'false');
}

/** Định dạng tiền và giữ vị trí chọn theo chữ số thay vì dấu phân cách. */
function bindMoneyInputs(root) {
  const handler = (event) => {
    const el = event.target;
    if (!el.matches('[data-money]')) return;
    if (event.isComposing) return;
    const start = formatMoneyEdit(el.value, el.selectionStart ?? el.value.length);
    const end = formatMoneyEdit(el.value, el.selectionEnd ?? el.value.length);
    el.value = start.text;
    el.setSelectionRange(start.caret, end.caret);
  };
  const beforeInput = (event) => {
    const el = event.target;
    if (!el.matches('[data-money]') || el.selectionStart !== el.selectionEnd) return;
    const pos = el.selectionStart;
    const backward = event.inputType === 'deleteContentBackward' && el.value[pos - 1] === '.';
    const forward = event.inputType === 'deleteContentForward' && el.value[pos] === '.';
    if (!backward && !forward) return;
    event.preventDefault();
    const start = backward ? Math.max(0, pos - 2) : pos;
    const end = backward ? pos : Math.min(el.value.length, pos + 2);
    el.value = el.value.slice(0, start) + el.value.slice(end);
    el.setSelectionRange(start, start);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };
  root.addEventListener('input', handler);
  root.addEventListener('beforeinput', beforeInput);
  return () => {
    root.removeEventListener('input', handler);
    root.removeEventListener('beforeinput', beforeInput);
  };
}

/** Khởi tạo các điều khiển nâng cao trong vùng (chỉ tải thư viện khi có trường cần). */
export async function enhance(root) {
  const cleanups = [bindMoneyInputs(root)];
  if (root.querySelector('[data-datepicker]')) {
    const { initDatepickers } = await import('./datepicker.js');
    cleanups.push(initDatepickers(root));
  }
  if (root.querySelector('[data-tomselect]')) {
    const { initTomSelects } = await import('./select.js');
    cleanups.push(initTomSelects(root));
  }
  return () => cleanups.forEach((fn) => fn());
}

/**
 * Gắn hành vi cho một form.
 * onSubmit(values, { idempotencyKey }) trả Promise; lỗi ApiError validation tự gắn vào trường.
 */
/**
 * Theo dõi "có thay đổi chưa lưu" theo GIÁ TRỊ: chụp giá trị các ô ở lần người dùng tương tác thật đầu tiên
 * (chuột/bàn phím/focus) rồi so sánh mỗi khi có input/change. Sự kiện do thư viện phát lúc khởi tạo
 * (Tom Select, Flatpickr) không làm trang bị coi là chưa lưu; đổi rồi đổi lại cũng hết "chưa lưu".
 */
export function trackDirty(root, onChange) {
  let baseline = null;
  let dirty = false;
  const serialize = () => [...root.querySelectorAll('input, select, textarea')]
    .filter((el) => (el.name || el.dataset.field) && el.type !== 'file')
    .map((el) => {
      if (el.type === 'checkbox' || el.type === 'radio') return `${el.checked}`;
      if (el.multiple) return [...el.selectedOptions].map((o) => o.value).join(',');
      return el.value;
    })
    .join('␟');
  const capture = (event) => {
    if (event.isTrusted && baseline === null) baseline = serialize();
  };
  const check = () => {
    if (baseline === null) return;
    const next = serialize() !== baseline;
    if (next !== dirty) {
      dirty = next;
      onChange?.(dirty);
    }
  };
  root.addEventListener('pointerdown', capture, true);
  root.addEventListener('keydown', capture, true);
  root.addEventListener('focusin', capture);
  root.addEventListener('input', check);
  root.addEventListener('change', check);
  return {
    get dirty() { return dirty; },
    reset() {
      baseline = null;
      if (dirty) { dirty = false; onChange?.(false); }
    },
    destroy() {
      root.removeEventListener('pointerdown', capture, true);
      root.removeEventListener('keydown', capture, true);
      root.removeEventListener('focusin', capture);
      root.removeEventListener('input', check);
      root.removeEventListener('change', check);
    },
  };
}

/** Chặn rời trang khi vùng `root` có thay đổi chưa lưu. Trả { reset, destroy }. */
export function guardUnsaved(root) {
  let release = null;
  const tracker = trackDirty(root, (dirty) => {
    if (dirty && !release) release = setLeaveGuard(() => tracker.dirty);
    if (!dirty && release) { release(); release = null; }
  });
  return {
    get dirty() { return tracker.dirty; },
    reset() { tracker.reset(); release?.(); release = null; },
    destroy() { tracker.destroy(); release?.(); release = null; },
  };
}

export function bindForm(form, { fields, onSubmit, guardDirty = true, submittingLabel, transform, validate } = {}) {
  let submitting = false;
  let key = uuid();
  const guard = guardDirty ? guardUnsaved(form) : null;

  const submit = async (event) => {
    event.preventDefault();
    if (submitting) return;
    let values = readForm(form, fields);
    if (transform) values = transform(values);
    const errors = validateFields(fields, values);
    const extra = validate ? validate(values) : null;
    if (extra) Object.entries(extra).forEach(([k, v]) => { (errors[k] ||= []).push(...[].concat(v)); });
    if (Object.keys(errors).length) {
      showErrors(form, errors, { detail: 'Kiểm tra lại các trường được đánh dấu.' });
      return;
    }
    clearErrors(form);
    submitting = true;
    setSubmitting(form, true, submittingLabel);
    try {
      await onSubmit(values, { idempotencyKey: key });
      guard?.reset();
      key = uuid();
    } catch (error) {
      if (error instanceof ApiError && error.isAborted) return;
      if (error instanceof ApiError) {
        showErrors(form, error.fieldErrors, { detail: error.detail || error.title, hint: errorHint(error) });
      } else {
        showErrors(form, {}, { detail: error?.message || 'Đã có lỗi xảy ra.' });
        if (!(error instanceof FormError)) console.error(error);
      }
    } finally {
      submitting = false;
      setSubmitting(form, false);
    }
  };
  form.addEventListener('submit', submit);
  form.noValidate = true;

  return {
    get dirty() { return guard?.dirty || false; },
    reset() { guard?.reset(); },
    values: () => readForm(form, fields),
    newKey() { key = uuid(); },
    destroy() {
      form.removeEventListener('submit', submit);
      guard?.destroy();
    },
  };
}
