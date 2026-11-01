// Trang ngoài: giữ cảnh 3D nền, giới thiệu phòng đang trống và mời khách vào trang Thuê phòng.
import { asset, icon, link } from '../../../components/ui.js';
import { publicApi } from '../../../services/api.js';
import { session } from '../../../services/session.js';
import { formatArea } from '../../../utils/format.js';
import { html, raw, setHtml } from '../../../utils/html.js';
import { toQueryString } from '../../../utils/query.js';
import { priceRange } from '../common.js';
import template from './home.html?raw';
import './home.scss';

// Đủ phủ kín hàng ngang màn lớn; ít phòng hơn thì đứng yên thay vì lặp lại vài thẻ.
const MARQUEE_MIN_ROOMS = 4;
const MARQUEE_MIN_CARDS = 8;

const rentShort = (value) => (value == null ? 'Liên hệ' : `${(value / 1000000).toLocaleString('vi-VN', { maximumFractionDigits: 2 })} Tr`);

function roomCard(room, { clone = false } = {}) {
  return html`<a class="room-card card-interactive" href="${link(`/rooms/${room.slug}`)}" ${clone ? raw('aria-hidden="true" tabindex="-1"') : ''}>
    <div class="room-image-wrap">
      ${room.coverImageUrl ? html`<img class="room-image" src="${asset(room.coverImageUrl)}" alt="${clone ? '' : `Ảnh phòng ${room.roomCode}`}" loading="lazy">` : ''}
      <span class="badge ${room.hasVideo ? 'badge-orange' : 'badge-cyan'} room-badge-top">${room.hasVideo ? 'Có video tham quan' : room.roomType.name}</span>
      <span class="badge badge-green room-badge-status">Còn trống</span>
    </div>
    <div class="room-body">
      <h3 class="room-title">${room.roomCode} - ${room.title}</h3>
      <div class="room-features">
        <span class="room-feat">${icon('aspect-ratio')} ${formatArea(room.areaM2)}</span>
        <span class="room-feat">${icon('people')} ${room.capacity} người</span>
        <span class="room-feat">${icon('geo-alt')} ${room.locality}</span>
      </div>
      <div class="room-footer">
        <div class="room-price">${rentShort(room.rent)} <span>/ tháng</span></div>
        <span class="btn-glow room-cta">Xem phòng</span>
      </div>
    </div>
  </a>`;
}

function pricingCard({ iconName, name, amount, unit, text }) {
  return html`<div class="glass-panel pricing-card card-interactive">
    <div class="pricing-icon">${icon(iconName)}</div>
    <h3 class="pricing-name">${name}</h3>
    <div class="pricing-amount">${amount} ${unit ? html`<span class="pricing-unit">/ ${unit}</span>` : ''}</div>
    <p class="pricing-desc">${text}</p>
  </div>`;
}

function renderPricing(root, filters) {
  const fee = (code) => filters.feeSummary.find((f) => f.code === code) || {};
  const [electricity, water, service] = ['ELECTRICITY', 'WATER', 'SERVICE'].map(fee);
  setHtml(root, html`
    ${pricingCard({ iconName: 'lightning-charge', name: 'Giá Điện Sinh Hoạt', amount: priceRange(electricity), unit: electricity.unitLabel, text: 'Mỗi phòng có công tơ riêng. Chỉ số được ghi hằng tháng và in trên hóa đơn để bạn đối chiếu.' })}
    ${pricingCard({ iconName: 'droplet', name: 'Giá Nước Sinh Hoạt', amount: priceRange(water), unit: water.unitLabel, text: 'Tính theo chỉ số đồng hồ nước của phòng, đơn giá theo từng khu nhà.' })}
    ${pricingCard({ iconName: 'wifi', name: 'Dịch Vụ & Internet', amount: priceRange(service), unit: service.unitLabel, text: 'Các khoản phí cố định (dịch vụ, internet, rác) khác nhau theo khu nhà và ghi rõ trong trang từng phòng.' })}
    ${pricingCard({ iconName: 'shield-check', name: 'Tiền Cọc', amount: priceRange(filters.depositRange), text: 'Số tiền cọc ghi rõ ở từng phòng và trên hợp đồng. Khi trả phòng, cọc được quyết toán theo biên bản bàn giao.' })}
  `);
}

export default async function HomePage(ctx) {
  ctx.setTitle('Tìm phòng trọ, căn hộ dịch vụ');
  document.body.classList.add('sr-page-home');
  ctx.outlet.innerHTML = template;
  const $ = (selector) => ctx.outlet.querySelector(selector);
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const homeLink = html`<a class="btn-glow" href="${link('/rooms')}">Xem phòng đang trống</a>`;

  let scene = null;
  let destroyed = false;
  // Đăng ký dọn dẹp trước mọi lệnh chờ: rời trang khi đang tải vẫn gỡ class phạm vi CSS khỏi body.
  ctx.onCleanup(() => {
    destroyed = true;
    document.body.classList.remove('sr-page-home');
    scene?.destroy();
  });

  setHtml($('#homeCta'), session.isAuthenticated
    ? html`<div><h3>Tìm được phòng ưng ý?</h3><p>Chọn phòng đang trống và đặt lịch xem trực tiếp.</p></div><div class="home-cta-actions">${homeLink}</div>`
    : html`<div><h3>Muốn xem phòng trực tiếp?</h3><p>Tạo tài khoản miễn phí rồi đặt lịch ngay ở trang từng phòng.</p></div>
      <div class="home-cta-actions"><a class="btn-glow btn-primary" href="${link('/register')}">Tạo tài khoản</a>${homeLink}</div>`);

  $('#heroSearch').addEventListener('submit', (event) => {
    event.preventDefault();
    ctx.navigate(`/rooms${toQueryString({ locality: $('#searchArea').value, budget: $('#searchPrice').value, roomType: $('#searchType').value })}`);
  });

  const track = $('#roomTrack');
  const marquee = $('#roomMarquee');
  const note = $('#roomResultNote');

  const renderRooms = (rooms) => {
    const animate = !reduceMotion && rooms.length >= MARQUEE_MIN_ROOMS;
    marquee.classList.toggle('is-static', !animate);
    if (!animate) {
      setHtml(track, html`${rooms.map((r) => roomCard(r))}`);
      return;
    }
    // Hiệu ứng chạy dịch -50%: nửa sau là bản sao của nửa đầu, ẩn với trình đọc màn hình và phím Tab.
    const sets = Math.max(1, Math.ceil(MARQUEE_MIN_CARDS / rooms.length));
    const firstHalf = Array.from({ length: sets }, (_, i) => rooms.map((r) => roomCard(r, { clone: i > 0 }))).flat();
    const secondHalf = Array.from({ length: sets }, () => rooms.map((r) => roomCard(r, { clone: true }))).flat();
    track.style.setProperty('--marquee-duration', `${firstHalf.length * 7}s`);
    setHtml(track, html`${firstHalf}${secondHalf}`);
  };

  try {
    const [filters, rooms] = await Promise.all([publicApi.filters(), publicApi.rooms({ pageSize: 12, sort: 'price' }, { signal: ctx.signal })]);
    if (destroyed) return;
    const options = html`${filters.provinces.flatMap((p) => p.localities).map((l) => html`<option value="${l}">${l}</option>`)}`;
    $('#searchArea').insertAdjacentHTML('beforeend', String(options));
    $('#searchType').insertAdjacentHTML('beforeend', String(html`${filters.roomTypes.map((t) => html`<option value="${t.code}">${t.name}</option>`)}`));
    renderPricing($('#pricingGrid'), filters);
    if (rooms.items.length) {
      renderRooms(rooms.items);
      note.textContent = `${filters.totalListings} phòng đang trống ở ${filters.propertyCount} khu nhà.`;
    } else {
      marquee.classList.add('is-static');
      setHtml(track, html`<div class="room-empty">Hiện chưa có phòng trống.</div>`);
    }
  } catch (error) {
    if (destroyed || error?.isAborted) return;
    marquee.classList.add('is-static');
    setHtml(track, html`<div class="room-empty">${error.message || 'Chưa tải được danh sách phòng.'}</div>`);
  }
  if (destroyed) return;

  // Cảnh 3D nặng nên nạp sau cùng: nội dung đã dùng được trong lúc chờ.
  const { createHomeScene } = await import('./tour/index.js').catch((error) => {
    console.warn('Không tải được cảnh 3D:', error);
    return {};
  });
  if (destroyed || !createHomeScene) return;
  scene = createHomeScene({ canvas: $('#webgl'), reduceMotion });
}
