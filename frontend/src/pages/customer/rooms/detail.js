import { customerViewing, bindCustomerViewings } from '../../../components/customer-viewings.js';
import { mapLinks } from '../../../utils/maps.js';
// Chi tiết phòng: đặt lịch xem trực tiếp chỉ mở sau khi đăng nhập. Gửi yêu cầu chưa giữ phòng và không đổi trạng thái phòng.
import { bindForm, enhance, formAlert, renderFields } from '../../../components/form.js';
import { asset, errorState, icon, link, note } from '../../../components/ui.js';
import { portalApi, publicApi } from '../../../services/api.js';
import { session } from '../../../services/session.js';
import { formatDateTime } from '../../../utils/date.js';
import { viewingBounds, viewingTimeError } from '../../../utils/viewing.js';
import { formatArea, formatPhone } from '../../../utils/format.js';
import { formatVnd } from '../../../utils/money.js';
import { html, multiline, setHtml } from '../../../utils/html.js';
import { availabilityLabel, availabilityText, viewingBadge } from '../common.js';

const OPEN_STATUS = ['new', 'accepted', 'consulting', 'scheduled', 'viewing', 'approved'];

const feeValue = (fee) => {
  if (fee.unitPrice === 0) return 'Miễn phí';
  return `${formatVnd(fee.unitPrice)} / ${fee.unitLabel}${fee.billingCycle === 'once' ? ' (thu một lần)' : ''}`;
};

function gallery(room) {
  if (!room.images.length) return html`<div class="cu-gallery-empty">${icon('image')}<span>Quản lý chưa thêm ảnh cho phòng này.</span></div>`;
  return html`<section class="cu-gallery" aria-label="Ảnh phòng">
    <button type="button" class="cu-gallery-main" data-zoom aria-label="Phóng to ảnh">
      <img data-main-photo src="${asset(room.images[0].url)}" alt="${room.images[0].caption || `Ảnh phòng ${room.roomCode}`}">
      <span class="cu-gallery-count" data-photo-count>1 / ${room.images.length}</span>
    </button>
    ${room.images.length > 1 ? html`<div class="cu-gallery-thumbs">${room.images.map((img, i) => html`<button type="button" class="${i === 0 ? 'active' : ''}" data-photo="${i}" aria-label="Xem ảnh ${i + 1}: ${img.caption || ''}"><img src="${asset(img.url)}" alt="" loading="lazy"></button>`)}</div>` : ''}
    <dialog class="cu-zoom" data-zoom-dialog aria-label="Ảnh phóng to"><button type="button" class="btn-close btn-close-white" data-zoom-close aria-label="Đóng"></button><img data-zoom-photo src="${asset(room.images[0].url)}" alt=""></dialog>
  </section>`;
}

/** Ô đặt lịch đổi theo tình huống: phòng còn trống không, đã đăng nhập chưa, đã đặt phòng này chưa. */
function bookingBox(room, myRequest) {
  const next = encodeURIComponent(`/rooms/${room.slug}`);
  if (room.availability.status !== 'available') {
    return html`<div class="cu-book-state"><p>${availabilityText(room.availability)}</p><a class="btn btn-outline-primary w-100" href="${link('/rooms')}">Xem phòng đang trống</a></div>`;
  }
  if (!session.isAuthenticated) {
    return html`<div class="cu-book-state">
      <p>Đăng nhập để đặt lịch xem phòng trực tiếp với quản lý.</p>
      <a class="btn btn-primary w-100 mb-2" href="${link(`/login?next=${next}`)}">${icon('calendar-check')} Đăng nhập để đặt lịch</a>
      <a class="btn btn-outline-primary w-100" href="${link(`/register?next=${next}`)}">Tạo tài khoản</a>
    </div>`;
  }
  if (!session.isCustomer) return html`<div class="cu-book-state"><p>Tài khoản quản lý không đặt lịch ở đây. Đăng nhập bằng tài khoản khách để đặt lịch.</p></div>`;
  if (myRequest) return bookedState(myRequest);
  return html`<form novalidate data-booking>${formAlert()}<div data-booking-fields></div>
    <button type="submit" class="btn btn-primary w-100 mt-3">${icon('calendar-check')} Đặt lịch xem phòng</button>
    <p class="cu-book-hint">Quản lý gọi số ${formatPhone(session.user?.phone)} để xác nhận lịch. Đặt lịch chưa giữ phòng cho bạn.</p>
  </form>`;
}

function bookedState(request) { return customerViewing(request); }

export default async function RoomDetailPage(ctx) {
  let room;
  let requests = [];
  try {
    [room, requests] = await Promise.all([publicApi.room(ctx.params.slug), session.isCustomer ? portalApi.inquiries() : []]);
  } catch (error) {
    if (ctx.signal.aborted) return;
    ctx.setTitle('Không tìm thấy phòng');
    setHtml(ctx.outlet, html`<div class="cu-page cu-narrow">${errorState(error)}<p class="text-center"><a href="${link('/rooms')}">Xem các phòng khác</a></p></div>`);
    return;
  }
  if (ctx.signal.aborted) return;

  ctx.setTitle(`${room.roomCode} – ${room.title}`);
  const address = [room.property.addressLine, room.locality, room.province].filter(Boolean).join(', ');
  const maps = mapLinks(room, address);
  const myRequest = requests.find((q) => q.slug === room.slug && OPEN_STATUS.includes(q.status));
  const available = room.availability.status === 'available';
  const fees = room.fees.filter((f) => f.category !== 'rent');
  const cover = room.images.find((i) => i.isCover) || room.images[0];

  setHtml(ctx.outlet, html`<div class="cu-page">
    <nav class="cu-crumbs" aria-label="Đường dẫn"><a href="${link('/rooms')}">Thuê phòng</a>${icon('chevron-right')}<span>${room.propertyName}</span>${icon('chevron-right')}<span aria-current="page">Phòng ${room.roomCode}</span></nav>
    <header class="cu-room-head">
      <span class="sr-plate sr-plate-lg">${room.roomCode}</span>
      <div class="min-w-0"><h1>${room.title}</h1><p>${icon('geo-alt')} ${address}</p></div>
    </header>
    <div class="cu-room-layout">
      <div class="cu-room-main">
        ${gallery(room)}
        ${room.videoUrl ? html`<section class="cu-card"><h2>Video tham quan</h2><video class="cu-video" src="${asset(room.videoUrl)}" poster="${asset(cover?.url)}" controls playsinline preload="metadata"></video></section>` : ''}
        <section class="cu-card">
          <h2>Thông tin phòng</h2>
          <ul class="cu-specs">
            <li>${icon('aspect-ratio')}<span>Diện tích</span><strong>${formatArea(room.areaM2)}</strong></li>
            <li>${icon('people')}<span>Sức chứa</span><strong>Tối đa ${room.capacity} người</strong></li>
            ${room.floorLabel ? html`<li>${icon('layers')}<span>Tầng</span><strong>${room.floorLabel}</strong></li>` : ''}
            <li>${icon('door-closed')}<span>Loại phòng</span><strong>${room.roomType.name}</strong></li>
          </ul>
          ${room.description ? html`<p class="cu-text">${multiline(room.description)}</p>` : ''}
        </section>
        ${room.amenities.length ? html`<section class="cu-card"><h2>Tiện nghi</h2><ul class="cu-amenities">${room.amenities.map((a) => html`<li>${icon(a.icon || 'check2')} ${a.name}</li>`)}</ul></section>` : ''}
        <section class="cu-card">
          <h2>Chi phí hằng tháng</h2>
          <dl class="cu-costs">
            <div><dt>Tiền thuê phòng</dt><dd>${room.rent == null ? 'Liên hệ' : `${formatVnd(room.rent)} / tháng`}</dd></div>
            ${fees.map((f) => html`<div><dt>${f.name}</dt><dd>${feeValue(f)}</dd></div>`)}
            <div><dt>Tiền cọc</dt><dd>${formatVnd(room.requiredDeposit)}</dd></div>
          </dl>
          <p class="cu-fine">Giá theo bảng giá đang áp dụng; giá chốt ghi trên hợp đồng khi ký.</p>
        </section>
        ${room.rulesText ? html`<section class="cu-card"><h2>Quy định</h2><p class="cu-text">${multiline(room.rulesText)}</p></section>` : ''}
        <section class="cu-card">
          <h2>Vị trí khu nhà</h2>
          ${room.property.description ? html`<p class="cu-text">${room.property.description}</p>` : ''}
          ${maps.embed ? html`<div class="cu-map"><iframe src="${maps.embed}" loading="lazy" referrerpolicy="no-referrer-when-downgrade" title="Bản đồ khu nhà ${room.propertyName}"></iframe></div>` : html`<p>Chọn liên kết bên dưới để mở vị trí do quản lý cung cấp.</p>`}
          ${maps.searched ? html`<p class="small text-muted-sr">Bản đồ tìm theo địa chỉ cơ sở. Vui lòng xác nhận vị trí với quản lý trước khi đến.</p>` : ''}
          <a class="cu-link" href="${maps.url}" target="_blank" rel="noopener noreferrer">${icon('signpost-2')} Mở bản đồ chỉ đường</a>
        </section>
      </div>
      <aside class="cu-room-side">
        <div class="cu-book" id="dat-lich">
          <div class="cu-book-top">
            <span class="cu-status ${available ? 'is-ok' : 'is-muted'}">${availabilityLabel(room.availability.status)}</span>
            <span class="cu-book-price">${room.rent == null ? 'Liên hệ' : formatVnd(room.rent)}<small> / tháng</small></span>
            <span class="cu-book-deposit">Cọc ${formatVnd(room.requiredDeposit)}</span>
          </div>
          <div data-booking-box>${bookingBox(room, myRequest)}</div>
          ${room.property.phone ? html`<a class="cu-book-call" href="tel:${room.property.phone}">${icon('telephone')} Gọi ${formatPhone(room.property.phone)}</a>` : ''}
        </div>
      </aside>
    </div>
  </div>`);

  const $ = (selector) => ctx.outlet.querySelector(selector);

  // Ảnh
  const main = $('[data-main-photo]');
  if (main) {
    const dialog = $('[data-zoom-dialog]');
    const thumbs = [...ctx.outlet.querySelectorAll('[data-photo]')];
    thumbs.forEach((thumb, index) => thumb.addEventListener('click', () => {
      const image = room.images[index];
      main.src = asset(image.url);
      main.alt = image.caption || `Ảnh phòng ${room.roomCode}`;
      $('[data-zoom-photo]').src = asset(image.url);
      $('[data-photo-count]').textContent = `${index + 1} / ${room.images.length}`;
      thumbs.forEach((t, i) => t.classList.toggle('active', i === index));
    }));
    $('[data-zoom]').addEventListener('click', () => dialog.showModal());
    $('[data-zoom-close]').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', (event) => { if (event.target === dialog) dialog.close(); });
  }

  ctx.onCleanup(bindCustomerViewings($('[data-booking-box]'), () => requests, async () => {
    requests = await portalApi.inquiries();
    const current = requests.find((q) => q.slug === room.slug && OPEN_STATUS.includes(q.status));
    if (current) setHtml($('[data-booking-box]'), bookedState(current));
    else await ctx.navigate(`/rooms/${room.slug}`, { replace: true, force: true });
  }));
  // Đặt lịch
  const form = $('[data-booking]');
  if (!form) return;
  const fields = [
    { name: 'preferredViewingAt', label: 'Ngày giờ muốn xem', type: 'datetime', required: true, min: viewingBounds().min, default: viewingBounds().defaultTime, attrs: { 'data-viewing-hours': 'true' }, help: 'Bắt đầu chậm nhất 20:00, kết thúc chậm nhất 21:00 (giờ Việt Nam). Sau 20:00 chỉ nhận lịch từ ngày mai.' },
    { name: 'occupants', label: 'Số người ở', type: 'number', min: 1, max: room.capacity, default: 1, required: true, validate: (v) => Number.isInteger(v) ? null : 'Số người ở phải là số nguyên.', help: `Phòng ở tối đa ${room.capacity} người.` },
    { name: 'message', label: 'Ghi chú', type: 'textarea', rows: 2, optional: true, maxLength: 500, placeholder: 'Ví dụ: có xe máy, xem sau 17 giờ' },
  ];
  setHtml($('[data-booking-fields]'), renderFields(fields));
  ctx.onCleanup(await enhance(form));
  if (ctx.signal.aborted) return;
  const binding = bindForm(form, {
    fields, guardDirty: false, submittingLabel: 'Đang gửi…',
    validate: (v) => { const error = viewingTimeError(v.preferredViewingAt); return error ? { preferredViewingAt: [error] } : null; },
    onSubmit: async (v, { idempotencyKey }) => {
      const result = await portalApi.createInquiry({ ...v, slug: room.slug }, idempotencyKey);
      requests = [...requests, result];
      setHtml($('[data-booking-box]'), bookedState(result));
    },
  });
  ctx.onCleanup(() => binding.destroy());
}
