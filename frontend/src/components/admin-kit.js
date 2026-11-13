// Mảnh giao diện riêng của khu quản trị. Quy ước màu: vàng = đang chờ bạn xử lý, đỏ = quá hạn, xanh cửa = bình thường.
import { session } from '../services/session.js';
import { formatNumber } from '../utils/money.js';
import { html } from '../utils/html.js';
import { asset, icon, link } from './ui.js';

/** Dải số liệu liền khối; ô có `href` mở đúng danh sách đã lọc. */
export function statBand(items) {
  const stats = items.filter(Boolean);
  return html`<div class="ad-stats ${stats.length === 5 ? 'is-five' : ''}">${stats.map((s) => {
    const inner = html`<span class="ad-stat-label">${s.label}</span><span class="ad-stat-value">${s.value}</span>${s.note ? html`<span class="ad-stat-note">${s.note}</span>` : ''}`;
    const cls = `ad-stat ${s.tone ? `is-${s.tone}` : ''}`;
    return s.href ? html`<a class="${cls}" href="${link(s.href)}">${inner}</a>` : html`<div class="${cls}">${inner}</div>`;
  })}</div>`;
}

/** Nút thao tác trên dòng bảng. Mỗi nút có nhãn cho trình đọc màn hình và vùng bấm 36px. */
export function rowActions(items) {
  return html`<div class="ad-row-actions">${items.filter(Boolean).map((i) => (i.href
    ? html`<a class="ad-icon-btn" href="${link(i.href)}" title="${i.label}" aria-label="${i.label}">${icon(i.icon)}</a>`
    : html`<button type="button" class="ad-icon-btn ${i.danger ? 'is-danger' : ''}" data-action="${i.action}" data-id="${i.id}" title="${i.label}" aria-label="${i.label}">${icon(i.icon)}</button>`))}</div>`;
}

export const roomThumb = (url) => html`<span class="ad-thumb">${url ? html`<img src="${asset(url)}" alt="" loading="lazy" referrerpolicy="no-referrer">` : icon('image')}</span>`;

/** Ô chọn cơ sở dùng ngoài trang danh sách; lựa chọn được nhớ giữa các trang qua session.propertyId. */
export function propertySelect({ id, value, all = true, label = 'Cơ sở' }) {
  const org = session.organization;
  return html`<div class="ad-field"><label class="form-label" for="${id}">${label}</label>
    <select class="form-select form-select-sm" id="${id}" data-property-select>
      ${all ? html`<option value="">${org?.propertyScope === 'all' ? 'Tất cả cơ sở' : 'Tất cả cơ sở được giao'}</option>` : ''}
      ${(org?.properties || []).map((p) => html`<option value="${p.id}" ${p.id === value ? 'selected' : ''}>${p.name}</option>`)}
    </select></div>`;
}

const PAYMENT_STATES = { unpaid: ['Chưa thanh toán', 'info'], partial: ['Thanh toán một phần', 'warn'], paid: ['Đã thanh toán', 'ok'] };

/** Trạng thái hóa đơn theo cách chủ trọ đọc: tách riêng quá hạn và khoản chờ xác minh (thu một phần vẫn có thể quá hạn). */
export function invoiceBadges(inv) {
  if (inv.status === 'draft') return html`<span class="sr-badge tone-muted">Nháp</span>`;
  if (inv.status === 'void') return html`<span class="sr-badge tone-muted">Đã hủy</span>`;
  const state = PAYMENT_STATES[inv.paymentStatus];
  return html`<span class="ad-badges">
    ${state ? html`<span class="sr-badge tone-${state[1]}">${state[0]}</span>` : html`<span class="sr-badge tone-muted">Điều chỉnh</span>`}
    ${inv.isOverdue ? html`<span class="sr-badge tone-danger">Quá hạn ${inv.daysOverdue} ngày</span>` : ''}
    ${inv.pendingPaymentCount ? html`<span class="sr-badge tone-wash">Chờ xác minh</span>` : ''}
  </span>`;
}

/** Các khoản giá dùng chung cho cơ sở và phòng. `unit` hiển thị đúng đơn vị người dùng quen gọi. */
export const RATE_FIELDS = [
  { code: 'ELECTRICITY', label: 'Giá điện', short: 'Điện/kWh', unit: 'đ/kWh' },
  { code: 'WATER', label: 'Giá nước', short: 'Nước/m³', unit: 'đ/m³' },
  { code: 'GARBAGE', label: 'Phí rác', short: 'Rác/tháng', unit: 'đ/tháng' },
  { code: 'SERVICE', label: 'Phí dịch vụ', short: 'Dịch vụ/tháng', unit: 'đ/tháng' },
];
export const ROOM_RATE_FIELDS = [...RATE_FIELDS, { code: 'INTERNET', label: 'Internet', unit: 'đ/tháng' }];

export const priceText = (value, unit) => (value == null ? 'Chưa đặt' : `${formatNumber(value)} ${unit}`);

/** Thanh ba đoạn; luôn có nhãn số liệu đi kèm nên không chỉ dựa vào màu. */
export function progressBar(segments, total) {
  return html`<div class="ad-progress" role="img" aria-label="${segments.map((s) => `${s.label}: ${s.value}`).join(', ')}">
    ${segments.filter((s) => s.value > 0).map((s) => html`<span class="is-${s.tone}" style="width:${(s.value / Math.max(total, 1)) * 100}%"></span>`)}
  </div>`;
}
