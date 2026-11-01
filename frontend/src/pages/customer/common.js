// Phần dùng chung của khu khách hàng: tiêu đề trang, chặn khi chưa có phòng, thẻ phòng, định dạng giá.
import { asset, emptyState, icon, link } from '../../components/ui.js';
import { portalApi } from '../../services/api.js';
import { formatDate } from '../../utils/date.js';
import { formatArea } from '../../utils/format.js';
import { formatVnd } from '../../utils/money.js';
import { html } from '../../utils/html.js';

export const BUDGETS = [
  { value: '0-3000000', label: 'Dưới 3 triệu' },
  { value: '3000000-4500000', label: '3 đến 4,5 triệu' },
  { value: '4500000-', label: 'Trên 4,5 triệu' },
];

const AVAILABILITY = {
  available: 'Còn trống',
  on_hold: 'Đang giữ chỗ',
  reserved: 'Đã có khách đặt',
  occupied: 'Đang có người ở',
  unavailable: 'Tạm ngừng cho thuê',
};

// Nhãn theo cách khách hiểu; khu quản trị dùng nhãn nghiệp vụ riêng.
const PAYMENT = { unpaid: ['Chưa thanh toán', 'danger'], partial: ['Thanh toán một phần', 'warn'], paid: ['Đã thanh toán', 'ok'] };
const VIEWING = { new: ['Chờ xác nhận', 'wash'], accepted: ['Đã tiếp nhận', 'info'], consulting: ['Đang tư vấn', 'info'], viewing: ['Đã hẹn xem', 'door'], approved: ['Đã duyệt', 'ok'] };

const tag = ([label, tone]) => html`<span class="sr-badge tone-${tone}">${label}</span>`;
export const paymentBadge = (status) => tag(PAYMENT[status] || ['Đã hủy', 'muted']);
export const viewingBadge = (status) => tag(VIEWING[status] || ['Đã kết thúc', 'muted']);

export const availabilityLabel = (status) => AVAILABILITY[status] || AVAILABILITY.unavailable;

export function availabilityText(a) {
  if (!a || a.status === 'available') return 'Có thể dọn vào ngay sau khi ký hợp đồng.';
  if (a.status === 'occupied' && a.availableFrom) return `Dự kiến trống từ ${formatDate(a.availableFrom)}.`;
  return 'Phòng này hiện không nhận lịch xem.';
}

/** Chuỗi "min-max" của ô chọn giá thành tham số tìm phòng. */
export function budgetQuery(value) {
  if (!value) return {};
  const [min, max] = value.split('-');
  return { priceMin: min || undefined, priceMax: max || undefined };
}

/** Một giá thì hiện một số, nhiều khu nhà khác giá thì hiện khoảng. */
export function priceRange({ min, max } = {}) {
  if (min == null) return 'Xem từng phòng';
  if (min === max) return min === 0 ? 'Miễn phí' : formatVnd(min);
  return `${formatVnd(min).replace(/\s*[đ₫]$/, '')} – ${formatVnd(max)}`;
}

export function pageHead({ title, subtitle, actions, back }) {
  return html`<header class="cu-head">
    ${back ? html`<a class="cu-back" href="${link(back.href)}">${icon('arrow-left')} ${back.label}</a>` : ''}
    <div class="cu-head-row">
      <div class="min-w-0"><h1>${title}</h1>${subtitle ? html`<p>${subtitle}</p>` : ''}</div>
      ${actions ? html`<div class="cu-head-actions">${actions}</div>` : ''}
    </div>
  </header>`;
}

/** Chưa có phòng: các trang hóa đơn, hỗ trợ, hợp đồng dừng ở đây và mời khách đi thuê phòng. */
export function noRoomPanel(what) {
  return html`<section class="cu-noroom">
    <span class="cu-noroom-door" aria-hidden="true">${icon('door-closed')}</span>
    <h2>Bạn chưa có phòng</h2>
    <p>${what} sẽ hiện ở đây sau khi quản lý thêm phòng vào tài khoản của bạn. Bạn cần thuê phòng trước.</p>
    <a class="btn btn-primary" href="${link('/rooms')}">Xem phòng đang trống</a>
  </section>`;
}

export const residentPanel = () => emptyState({
  iconName: 'people',
  title: 'Người đại diện quản lý hóa đơn',
  text: 'Bạn đang ở cùng trong một đợt thuê. Nghĩa vụ thanh toán thuộc người đại diện nên phần này chỉ hiển thị cho người đại diện.',
});

/** Luôn hỏi lại máy chủ: admin có thể vừa thêm phòng cho khách sau khi khách đăng nhập. */
export async function loadStay() {
  const tenancies = await portalApi.tenancies();
  const current = tenancies.find((t) => t.status === 'active') || tenancies.find((t) => t.status === 'planned') || tenancies[0] || null;
  return { tenancies, current };
}

export function roomCard(room) {
  return html`<a class="cu-room" href="${link(`/rooms/${room.slug}`)}">
    <span class="cu-room-photo">
      ${room.coverImageUrl ? html`<img src="${asset(room.coverImageUrl)}" alt="" loading="lazy">` : html`<span class="cu-room-nophoto">${icon('image')}</span>`}
      <span class="sr-plate">${room.roomCode}</span>
      ${room.hasVideo ? html`<span class="cu-room-video">${icon('play-fill')} Có video</span>` : ''}
    </span>
    <span class="cu-room-body">
      <span class="cu-room-title">${room.title}</span>
      <span class="cu-room-meta">${icon('geo-alt')} ${room.propertyName}, ${room.locality}</span>
      <span class="cu-room-meta">${formatArea(room.areaM2)}, tối đa ${room.capacity} người, ${room.roomType.name.toLowerCase()}</span>
      <span class="cu-room-foot">
        <span class="cu-room-price">${room.rent == null ? 'Liên hệ' : formatVnd(room.rent)} <small>/ tháng</small></span>
        <span class="cu-room-go">Xem phòng ${icon('arrow-right')}</span>
      </span>
    </span>
  </a>`;
}

/** Phân trang ở máy chủ trên toàn bộ tập. */
export function pager({ page, totalPages, totalItems }) {
  if (totalPages <= 1) return '';
  return html`<nav class="cu-pager" aria-label="Phân trang">
    <span>Trang ${page}/${totalPages}, ${totalItems} mục</span>
    <span class="btn-group btn-group-sm">
      <button type="button" class="btn btn-outline-secondary" data-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}>${icon('chevron-left')} Trước</button>
      <button type="button" class="btn btn-outline-secondary" data-page="${page + 1}" ${page >= totalPages ? 'disabled' : ''}>Sau ${icon('chevron-right')}</button>
    </span>
  </nav>`;
}
