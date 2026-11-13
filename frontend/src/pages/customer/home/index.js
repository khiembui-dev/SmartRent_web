// Trang ngoài: giữ cảnh 3D nền, giới thiệu phòng đang trống, bảng giá thật và mời khách vào trang Thuê phòng.
import { asset, icon, link } from '../../../components/ui.js';
import { publicApi } from '../../../services/api.js';
import { favoriteButton } from '../../../services/favorites.js';
import { session } from '../../../services/session.js';
import { formatArea, formatVnd } from '../../../utils/format.js';
import { html, setHtml } from '../../../utils/html.js';
import { toQueryString } from '../../../utils/query.js';
import { priceRange } from '../common.js';
import template from './home.html?raw';
import './home.scss';

// Tên và biểu tượng các khoản phí trong feeSummary của API công khai; khoản lạ vẫn hiện bằng mã.
const FEES = {
  RENT: { label: 'Tiền phòng', icon: 'house-door' },
  ELECTRICITY: { label: 'Điện', icon: 'lightning-charge', note: 'theo công tơ riêng' },
  WATER: { label: 'Nước', icon: 'droplet', note: 'theo đồng hồ riêng' },
  SERVICE: { label: 'Dịch vụ', icon: 'stars' },
  INTERNET: { label: 'Internet', icon: 'wifi' },
  GARBAGE: { label: 'Rác', icon: 'trash3' },
  PARKING: { label: 'Gửi xe', icon: 'bicycle' },
};
const FEE_ORDER = Object.keys(FEES);

function roomCard(room) {
  const place = [room.locality, room.province].filter(Boolean).join(', ');
  return html`<article class="home-room">
    <a class="home-room-link" href="${link(`/rooms/${room.slug}`)}">
      <div class="home-room-media">
        ${room.coverImageUrl
          ? html`<img src="${asset(room.coverImageUrl)}" alt="" loading="lazy" decoding="async">`
          : html`<div class="home-room-noimg">${icon('image')}<span>Chưa có ảnh phòng</span></div>`}
        <span class="sr-plate home-room-code">${room.roomCode}</span>
        ${room.hasVideo ? html`<span class="home-room-tag">${icon('camera-video')}Có video</span>` : ''}
      </div>
      <div class="home-room-body">
        <h3>${room.title}</h3>
        <ul class="home-room-facts">
          <li>${icon('aspect-ratio')}${formatArea(room.areaM2)}</li>
          <li>${icon('people')}${room.capacity} người</li>
          ${room.roomType?.name ? html`<li>${icon('door-open')}${room.roomType.name}</li>` : ''}
        </ul>
        ${place ? html`<p class="home-room-place">${icon('geo-alt')}${place}</p>` : ''}
        <div class="home-room-foot">
          <p class="home-room-price"><strong>${room.rent == null ? 'Liên hệ' : formatVnd(room.rent)}</strong>${room.rent == null ? '' : ' / tháng'}</p>
          ${room.requiredDeposit > 0 ? html`<p class="home-room-deposit">Cọc ${formatVnd(room.requiredDeposit)}</p>` : ''}
        </div>
      </div>
    </a>
    ${favoriteButton({ id: room.id, title: room.title, slug: room.slug })}
  </article>`;
}

function rateRow({ iconName, label, amount, unit, note }) {
  return html`<div class="home-rate">
    <dt>${icon(iconName)}<span>${label}${note ? html`<small>${note}</small>` : ''}</span></dt>
    <dd><strong>${amount}</strong>${unit ? html`<span> / ${unit}</span>` : ''}</dd>
  </div>`;
}

function renderPricing(root, filters) {
  const fees = [...(filters.feeSummary || [])].sort((a, b) => {
    const ia = FEE_ORDER.indexOf(a.code);
    const ib = FEE_ORDER.indexOf(b.code);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  const rows = fees.map((fee) => {
    const meta = FEES[fee.code] || { label: fee.code, icon: 'receipt' };
    return rateRow({ iconName: meta.icon, label: meta.label, note: meta.note, amount: priceRange(fee), unit: fee.unitLabel });
  });
  if (filters.depositRange?.min != null) {
    rows.push(rateRow({ iconName: 'shield-check', label: 'Tiền cọc', note: 'ghi trên hợp đồng', amount: priceRange(filters.depositRange) }));
  }
  setHtml(root, rows.length ? html`${rows}` : html`<div class="home-rates-loading">Chưa có bảng giá công khai.</div>`);
}

export default async function HomePage(ctx) {
  ctx.setTitle('Tìm phòng trọ, căn hộ dịch vụ');
  document.body.classList.add('sr-page-home');
  ctx.outlet.innerHTML = template;
  const $ = (selector) => ctx.outlet.querySelector(selector);
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  let scene = null;
  let destroyed = false;
  // Đăng ký dọn dẹp trước mọi lệnh chờ: rời trang khi đang tải vẫn gỡ class phạm vi CSS khỏi body.
  ctx.onCleanup(() => {
    destroyed = true;
    document.body.classList.remove('sr-page-home');
    scene?.destroy();
  });

  ctx.outlet.querySelectorAll('[data-home-link]').forEach((a) => { a.href = link(a.getAttribute('href')); });

  // Lời mời đổi theo người đang xem: khách lạ, khách thuê hay chủ trọ.
  const user = session.user;
  if (session.isAdmin) {
    setHtml($('#heroAside'), html`Bạn đang đăng nhập bằng tài khoản quản trị. <a href="${link('/admin')}">Mở trang quản trị</a>`);
  } else if (session.isCustomer) {
    setHtml($('#heroAside'), html`Chào ${user?.displayName || 'bạn'}. Xem <a href="${link('/invoices')}">hóa đơn</a> hoặc <a href="${link('/contract')}">hợp đồng</a> của bạn.`);
  } else {
    setHtml($('#heroAside'), html`Đã thuê phòng ở SmartRent? <a href="${link('/login')}">Đăng nhập</a> để xem hóa đơn và hợp đồng.`);
  }
  setHtml($('#portalAside'), session.isCustomer
    ? html`<a class="home-btn is-light" href="${link('/invoices')}">Mở tài khoản cư dân</a>`
    : html`Tài khoản được cấp khi bạn nhận phòng. ${session.isAuthenticated ? '' : html`<a href="${link('/login')}">Đăng nhập</a> nếu bạn đã là cư dân.`}`);
  setHtml($('#homeCta'), session.isAuthenticated
    ? html`<div><h3>Tìm được phòng ưng ý?</h3><p>Chọn phòng đang trống và đặt lịch xem trực tiếp ở trang từng phòng.</p></div>
      <div class="home-cta-actions"><a class="home-btn is-light" href="${link('/rooms')}">Xem phòng đang trống</a></div>`
    : html`<div><h3>Muốn xem phòng trực tiếp?</h3><p>Tạo tài khoản miễn phí rồi đặt lịch ngay ở trang từng phòng.</p></div>
      <div class="home-cta-actions"><a class="home-btn is-light" href="${link('/register')}">Tạo tài khoản</a><a class="home-btn is-ghost" href="${link('/rooms')}">Xem phòng đang trống</a></div>`);

  $('#heroSearch').addEventListener('submit', (event) => {
    event.preventDefault();
    ctx.navigate(`/rooms${toQueryString({ locality: $('#searchArea').value, budget: $('#searchPrice').value, roomType: $('#searchType').value })}`);
  });

  // Dải phòng trượt ngang: nút trước/sau chỉ hiện khi có phòng bị che.
  const rail = $('#roomRail');
  const railNav = $('#roomRailNav');
  const updateRailNav = () => {
    const overflow = rail.scrollWidth - rail.clientWidth > 4;
    railNav.hidden = !overflow;
    if (!overflow) return;
    railNav.querySelector('[data-rail="-1"]').disabled = rail.scrollLeft < 4;
    railNav.querySelector('[data-rail="1"]').disabled = rail.scrollLeft > rail.scrollWidth - rail.clientWidth - 4;
  };
  // Trượt tới mép thẻ kế tiếp. Tự chạy bằng requestAnimationFrame: ở trang này scrollBy({behavior:'smooth'})
  // của trình duyệt bị bỏ qua (Lenis và vòng vẽ 3D chiếm mỗi khung hình), còn đặt scrollLeft thì luôn chạy.
  let railFrame = 0;
  const glideRail = (direction) => {
    const origin = rail.getBoundingClientRect().left - rail.scrollLeft;
    const edges = [...rail.querySelectorAll('.home-room')].map((card) => Math.round(card.getBoundingClientRect().left - origin));
    const max = rail.scrollWidth - rail.clientWidth;
    const current = rail.scrollLeft;
    const next = direction > 0 ? edges.find((x) => x > current + 4) : [...edges].reverse().find((x) => x < current - 4);
    const target = Math.max(0, Math.min(max, next ?? (direction > 0 ? max : 0)));
    cancelAnimationFrame(railFrame);
    if (reduceMotion) {
      rail.scrollLeft = target;
      return;
    }
    rail.style.scrollSnapType = 'none'; // tránh bám mép giữa chừng
    const start = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - start) / 380);
      rail.scrollLeft = current + (target - current) * (1 - (1 - t) ** 3);
      if (t < 1) railFrame = requestAnimationFrame(step);
      else {
        rail.style.scrollSnapType = '';
        updateRailNav();
      }
    };
    railFrame = requestAnimationFrame(step);
  };
  railNav.addEventListener('click', (event) => {
    const button = event.target instanceof Element ? event.target.closest('[data-rail]') : null;
    if (button) glideRail(Number(button.dataset.rail));
  });
  ctx.onCleanup(() => cancelAnimationFrame(railFrame));
  rail.addEventListener('scroll', updateRailNav, { passive: true });
  const resizeObserver = new ResizeObserver(updateRailNav);
  resizeObserver.observe(rail);
  ctx.onCleanup(() => resizeObserver.disconnect());

  const note = $('#roomResultNote');
  try {
    const [filters, rooms] = await Promise.all([publicApi.filters(), publicApi.rooms({ pageSize: 12, sort: 'price' }, { signal: ctx.signal })]);
    if (destroyed) return;

    const localities = filters.provinces.flatMap((p) => p.localities);
    if (localities.length) {
      $('#searchArea').insertAdjacentHTML('beforeend', String(html`${localities.map((l) => html`<option value="${l}">${l}</option>`)}`));
      $('#fieldArea').hidden = false;
    }
    if (filters.roomTypes.length > 1) {
      $('#searchType').insertAdjacentHTML('beforeend', String(html`${filters.roomTypes.map((t) => html`<option value="${t.code}">${t.name}</option>`)}`));
      $('#fieldType').hidden = false;
    }

    const rent = filters.feeSummary?.find((f) => f.code === 'RENT');
    const live = filters.totalListings
      ? `${filters.totalListings} phòng đang trống ở ${filters.propertyCount} khu nhà${rent?.min ? `, giá từ ${formatVnd(rent.min)}/tháng` : ''}`
      : 'Hiện đã kín phòng. Phòng mới sẽ hiện ở đây khi có.';
    $('#heroLiveText').textContent = live;
    $('#heroLive').hidden = false;
    $('#heroLive').classList.toggle('is-full', !filters.totalListings);

    renderPricing($('#pricingGrid'), filters);
    $('#ratesScope').textContent = filters.propertyCount > 1 ? `Khoảng giá của ${filters.propertyCount} khu nhà` : 'Cập nhật từ hệ thống';

    if (rooms.items.length) {
      setHtml(rail, html`${rooms.items.map((r) => roomCard(r))}`);
      note.textContent = rooms.totalItems > rooms.items.length
        ? `Đang hiện ${rooms.items.length} trong ${rooms.totalItems} phòng, xếp theo giá thuê từ thấp đến cao.`
        : `${rooms.totalItems} phòng, xếp theo giá thuê từ thấp đến cao.`;
    } else {
      setHtml(rail, html`<div class="home-rail-empty">${icon('door-closed')}<span>Hiện chưa có phòng trống. Phòng mới sẽ hiện ở đây khi chủ nhà đăng tin.</span></div>`);
      note.textContent = 'Chưa có phòng trống.';
    }
  } catch (error) {
    if (destroyed || error?.isAborted) return;
    setHtml(rail, html`<div class="home-rail-empty">${icon('exclamation-circle')}<span>${error.message || 'Chưa tải được danh sách phòng.'} Tải lại trang để thử lần nữa.</span></div>`);
    note.textContent = 'Chưa tải được danh sách phòng.';
    setHtml($('#pricingGrid'), html`<div class="home-rates-loading">Chưa tải được bảng giá.</div>`);
  }
  if (destroyed) return;
  updateRailNav();

  // Cảnh 3D nặng nên nạp sau cùng: nội dung đã dùng được trong lúc chờ.
  const { createHomeScene } = await import('./tour/index.js').catch((error) => {
    console.warn('Không tải được cảnh 3D:', error);
    return {};
  });
  if (destroyed || !createHomeScene) return;
  scene = createHomeScene({ canvas: $('#webgl'), reduceMotion });
}
