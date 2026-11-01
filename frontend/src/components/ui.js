// Mảnh giao diện dùng lại: đầu trang, khối nội dung, biển số phòng, số liệu, trạng thái tải/rỗng/lỗi.
import { href } from '../router/router.js';
import { ApiError, errorHint } from '../services/errors.js';
import { formatDate, formatDateTime, formatRelative } from '../utils/date.js';
import { formatVnd } from '../utils/money.js';
import { html, raw, setHtml } from '../utils/html.js';
import { initials } from '../utils/format.js';

export const link = (path) => href(path);
/** Ảnh tĩnh trong public/ cần tiền tố base path khi deploy dưới thư mục con. */
export const asset = (url) => (url && url.startsWith('/') && !url.startsWith('//') ? href(url) : url);

export function icon(name, extra = '') {
  return html`<i class="bi bi-${name} ${extra}" aria-hidden="true"></i>`;
}

export function pageHeader({ title, subtitle, breadcrumbs = [], actions, titleExtra }) {
  return html`<header class="sr-page-head">
    <div class="min-w-0">
      ${breadcrumbs.length ? html`<nav aria-label="Đường dẫn"><ol class="breadcrumb">
        ${breadcrumbs.map((b) => (b.href ? html`<li class="breadcrumb-item"><a href="${link(b.href)}">${b.label}</a></li>` : html`<li class="breadcrumb-item active" aria-current="page">${b.label}</li>`))}
      </ol></nav>` : ''}
      <h1 tabindex="-1">${title}${titleExtra ? html` ${titleExtra}` : ''}</h1>
      ${subtitle ? html`<p class="sr-page-sub">${subtitle}</p>` : ''}
    </div>
    ${actions ? html`<div class="sr-page-actions">${actions}</div>` : ''}
  </header>`;
}

export function panel({ title, note, actions, body, flush = false, className = '', id }) {
  return html`<section class="sr-panel ${className}" ${id ? html`id="${id}"` : ''}>
    ${title ? html`<div class="sr-panel-head"><h2>${title}</h2>${note ? html`<span class="sr-panel-note">${note}</span>` : ''}${actions ? html`<div class="sr-panel-actions">${actions}</div>` : ''}</div>` : ''}
    <div class="${flush ? 'sr-panel-flush' : 'sr-panel-body'}">${body}</div>
  </section>`;
}

/** Biển số phòng: nhận diện chính của SmartRent. */
export function plate(room, { size, linkTo = true, withProperty = false, muted = false } = {}) {
  if (!room) return html`<span class="text-muted-sr">—</span>`;
  const code = typeof room === 'string' ? room : room.code;
  const cls = `sr-plate ${size ? `sr-plate-${size}` : ''} ${muted ? 'is-muted' : ''}`;
  const content = html`${withProperty && room.propertyCode ? html`<span class="sr-plate-prop">${room.propertyCode}</span>` : ''}${code}`;
  if (linkTo && typeof room !== 'string' && room.id) return html`<a class="${cls}" href="${link(`/admin/rooms/${room.id}`)}" aria-label="Phòng ${code}">${content}</a>`;
  return html`<span class="${cls}">${content}</span>`;
}

export const money = (value, opts) => html`<span class="sr-money">${formatVnd(value, opts)}</span>`;
export const date = (iso) => html`<span class="num">${formatDate(iso)}</span>`;
export const dateTime = (iso) => html`<span class="num" title="${formatDateTime(iso)}">${formatDateTime(iso)}</span>`;
export const relative = (iso) => html`<time datetime="${iso || ''}" title="${formatDateTime(iso)}">${formatRelative(iso)}</time>`;

export function person(name, sub) {
  if (!name) return html`<span class="text-muted-sr">—</span>`;
  return html`<span class="d-inline-flex align-items-center gap-2 min-w-0"><span class="sr-avatar" aria-hidden="true">${initials(name)}</span><span class="min-w-0"><span class="d-block text-truncate">${name}</span>${sub ? html`<span class="d-block small text-muted-sr text-truncate">${sub}</span>` : ''}</span></span>`;
}

export function dl(rows) {
  return html`<dl class="sr-dl">${rows.filter(Boolean).map(([k, v]) => html`<dt>${k}</dt><dd>${v ?? html`<span class="text-muted-sr">—</span>`}</dd>`)}</dl>`;
}

export function note(text, { tone = 'info', iconName } = {}) {
  const icons = { info: 'info-circle', warn: 'exclamation-triangle', danger: 'x-octagon', ok: 'check-circle', sim: 'cone-striped' };
  return html`<div class="sr-note ${tone !== 'info' ? `is-${tone}` : ''}" role="${tone === 'danger' ? 'alert' : 'note'}">${icon(iconName || icons[tone])}<div>${text}</div></div>`;
}

/** Nhãn "mô phỏng" cho chức năng chưa kết nối dịch vụ thật. */
export const simulated = (text = 'Mô phỏng – chưa kết nối dịch vụ thật') => html`<span class="sr-badge tone-wash no-dot" title="${text}">${icon('cone-striped')} Mô phỏng</span>`;

// ------------------------------------------------------------ trạng thái dữ liệu

export function loadingBlock(lines = 4) {
  return html`<div class="p-3" role="status" aria-live="polite"><span class="visually-hidden">Đang tải…</span>${Array.from({ length: lines }, (_, i) => html`<span class="sr-skeleton" style="width:${[92, 76, 84, 60, 70][i % 5]}%"></span>`)}</div>`;
}

export function emptyState({ title = 'Chưa có dữ liệu', text, action, iconName = 'inbox' } = {}) {
  return html`<div class="sr-state">${icon(iconName, 'sr-state-icon')}<h3>${title}</h3>${text ? html`<p>${text}</p>` : ''}${action || ''}</div>`;
}

export function errorState(error, { retryId = 'sr-retry' } = {}) {
  const forbidden = error instanceof ApiError && error.isForbidden;
  const notFound = error instanceof ApiError && error.isNotFound;
  const title = forbidden ? 'Bạn không có quyền xem nội dung này' : notFound ? 'Không tìm thấy dữ liệu' : (error?.title || 'Không tải được dữ liệu');
  const detail = error instanceof ApiError ? error.detail : error?.message;
  return html`<div class="sr-state ${forbidden ? 'is-forbidden' : 'is-error'}" role="alert">
    ${icon(forbidden ? 'shield-lock' : notFound ? 'search' : 'wifi-off', 'sr-state-icon')}
    <h3>${title}</h3>
    ${detail ? html`<p>${detail}</p>` : ''}
    <p>${errorHint(error)}${error?.traceId ? html` Mã tra cứu: <code>${error.traceId}</code>` : ''}</p>
    ${forbidden || notFound ? '' : html`<button type="button" class="btn btn-outline-primary btn-sm mt-1" id="${retryId}">${icon('arrow-clockwise')} Thử lại</button>`}
  </div>`;
}

export function forbiddenPage(permission) {
  return html`<div class="sr-panel">${emptyState({
    iconName: 'shield-lock',
    title: 'Vai trò hiện tại không có quyền mở trang này',
    text: raw(`Trang cần quyền <code>${permission}</code>. Liên hệ chủ trọ để được cấp quyền. Máy chủ vẫn kiểm tra quyền ở mọi thao tác.`),
  })}</div>`;
}

/** Tải dữ liệu vào một vùng: hiện khung chờ, lỗi có nút thử lại. */
export async function loadInto(element, loader, renderFn, { lines = 4, signal } = {}) {
  setHtml(element, loadingBlock(lines));
  try {
    const data = await loader();
    if (signal?.aborted) return null;
    await renderFn(data);
    return data;
  } catch (error) {
    if (signal?.aborted || (error instanceof ApiError && error.isAborted)) return null;
    setHtml(element, errorState(error));
    element.querySelector('#sr-retry')?.addEventListener('click', () => loadInto(element, loader, renderFn, { lines, signal }));
    return null;
  }
}
