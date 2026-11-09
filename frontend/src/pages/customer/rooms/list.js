// Trang Thuê phòng: chỉ có phòng đang trống ở admin. Lọc và phân trang ở máy chủ.
import { errorState, icon, link, loadingBlock } from '../../../components/ui.js';
import { replaceQuery } from '../../../router/router.js';
import { portalApi, publicApi } from '../../../services/api.js';
import { session } from '../../../services/session.js';
import { formatDateTime } from '../../../utils/date.js';
import { html, setHtml } from '../../../utils/html.js';
import { BUDGETS, budgetQuery, pageHead, pager, roomCard, viewingBadge } from '../common.js';

const PAGE_SIZE = 12;
const SORTS = [
  { value: 'price', label: 'Giá thấp trước' },
  { value: '-price', label: 'Giá cao trước' },
  { value: 'newest', label: 'Mới đăng' },
];
const OPEN_STATUS = ['new', 'accepted', 'consulting', 'scheduled', 'viewing', 'approved'];

function myViewings(items) {
  const open = items.filter((q) => OPEN_STATUS.includes(q.status));
  if (!open.length) return '';
  return html`<section class="cu-card cu-viewings" aria-label="Lịch xem phòng của bạn">
    <h2>Lịch xem phòng của bạn</h2>
    <ul>${open.map((q) => html`<li>
      <span class="sr-plate">${q.room.code}</span>
      <span class="cu-viewing-text">
        <a href="${link(`/rooms/${q.slug}`)}">${q.room.propertyName}</a>
        <small>${q.scheduledAt ? `Đã hẹn ${formatDateTime(q.scheduledAt)}` : q.preferredViewingAt ? `Bạn muốn xem lúc ${formatDateTime(q.preferredViewingAt)}, chờ quản lý xác nhận` : 'Chờ quản lý xác nhận'}</small>
      </span>
      ${viewingBadge(q.status)}
    </li>`)}</ul>
  </section>`;
}

export default async function RoomsPage(ctx) {
  ctx.setTitle('Thuê phòng');
  const search = {
    locality: ctx.query.locality || '', budget: ctx.query.budget || '', roomType: ctx.query.roomType || '',
    sort: SORTS.some((s) => s.value === ctx.query.sort) ? ctx.query.sort : 'price', page: Number(ctx.query.page) || 1,
  };
  const select = (name, label, placeholder, options) => html`<div class="cu-filter">
    <label class="form-label" for="f-${name}">${label}</label>
    <select class="form-select" id="f-${name}" name="${name}" data-filter>
      ${placeholder ? html`<option value="">${placeholder}</option>` : ''}
      ${options.map((o) => html`<option value="${o.value}" ${search[name] === o.value ? 'selected' : ''}>${o.label}</option>`)}
    </select></div>`;

  setHtml(ctx.outlet, html`<div class="cu-page">
    <div data-head>${pageHead({ title: 'Phòng đang trống', subtitle: 'Giá thuê, tiền cọc và các khoản phí ghi rõ ở từng phòng.' })}</div>
    ${session.isAuthenticated ? '' : html`<aside class="cu-guest">
      <span>${icon('calendar-check')} Đăng nhập để đặt lịch xem phòng trực tiếp.</span>
      <span class="cu-guest-actions"><a class="btn btn-primary btn-sm" href="${link('/login?next=/rooms')}">Đăng nhập</a><a class="btn btn-outline-primary btn-sm" href="${link('/register?next=/rooms')}">Tạo tài khoản</a></span>
    </aside>`}
    <div data-viewings></div>
    <form class="cu-filters" data-filters></form>
    <div data-results>${loadingBlock(6)}</div>
  </div>`);
  const $ = (selector) => ctx.outlet.querySelector(selector);
  const results = $('[data-results]');

  const load = async () => {
    setHtml(results, loadingBlock(6));
    replaceQuery({ locality: search.locality, budget: search.budget, roomType: search.roomType, sort: search.sort === 'price' ? undefined : search.sort, page: search.page > 1 ? search.page : undefined });
    let result;
    try {
      result = await publicApi.rooms({
        page: search.page, pageSize: PAGE_SIZE, sort: search.sort, locality: search.locality || undefined, roomType: search.roomType || undefined, ...budgetQuery(search.budget),
      }, { signal: ctx.signal });
    } catch (error) {
      if (error?.isAborted || ctx.signal.aborted) return;
      setHtml(results, errorState(error));
      results.querySelector('#sr-retry')?.addEventListener('click', load);
      return;
    }
    if (ctx.signal.aborted) return;
    if (!result.items.length) {
      const filtered = search.locality || search.budget || search.roomType;
      setHtml(results, html`<div class="cu-empty"><h2>${filtered ? 'Chưa có phòng khớp lựa chọn này' : 'Hiện chưa có phòng trống'}</h2>
        <p>${filtered ? 'Thử bỏ bớt điều kiện lọc.' : 'Quay lại sau hoặc liên hệ quản lý để được báo khi có phòng.'}</p>
        ${filtered ? html`<button type="button" class="btn btn-outline-primary btn-sm" data-clear>Xem tất cả phòng</button>` : html`<a class="btn btn-outline-primary btn-sm" href="${link('/contact')}">Liên hệ</a>`}</div>`);
      return;
    }
    setHtml(results, html`<p class="cu-count" aria-live="polite">${result.totalItems} phòng đang trống</p><div class="cu-room-grid">${result.items.map(roomCard)}</div>${pager(result)}`);
  };

  const onResultsClick = (event) => {
    const page = event.target.closest('[data-page]');
    if (page && !page.disabled) {
      search.page = Number(page.dataset.page);
      load();
      window.scrollTo({ top: 0 });
    }
    if (event.target.closest('[data-clear]')) {
      Object.assign(search, { locality: '', budget: '', roomType: '', page: 1 });
      $('[data-filters]').querySelectorAll('[data-filter]').forEach((el) => { if (el.name !== 'sort') el.value = ''; });
      load();
    }
  };
  results.addEventListener('click', onResultsClick);
  ctx.onCleanup(() => results.removeEventListener('click', onResultsClick));

  const [filtersResult, viewingsResult] = await Promise.allSettled([
    publicApi.filters(),
    session.isCustomer ? portalApi.inquiries() : Promise.resolve([]),
  ]);
  if (ctx.signal.aborted) return;
  if (viewingsResult.status === 'fulfilled') setHtml($('[data-viewings]'), myViewings(viewingsResult.value));
  const filters = filtersResult.status === 'fulfilled' ? filtersResult.value : null;
  setHtml($('[data-filters]'), html`
    ${select('locality', 'Khu vực', 'Mọi khu vực', (filters?.provinces || []).flatMap((p) => p.localities).map((l) => ({ value: l, label: l })))}
    ${select('budget', 'Mức giá', 'Mọi mức giá', BUDGETS)}
    ${select('roomType', 'Loại phòng', 'Mọi loại phòng', (filters?.roomTypes || []).map((t) => ({ value: t.code, label: t.name })))}
    ${select('sort', 'Sắp xếp', null, SORTS)}`);
  $('[data-filters]').addEventListener('change', (event) => {
    if (!event.target.matches('[data-filter]')) return;
    search[event.target.name] = event.target.value;
    search.page = 1;
    load();
  });
  $('[data-filters]').addEventListener('submit', (event) => event.preventDefault());
  await load();
}
