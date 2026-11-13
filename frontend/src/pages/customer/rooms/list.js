import { customerViewing, bindCustomerViewings } from '../../../components/customer-viewings.js';
// Trang Thuê phòng: chỉ có phòng đang trống ở admin. Lọc và phân trang ở máy chủ.
import { errorState, icon, link, loadingBlock } from '../../../components/ui.js';
import { replaceQuery } from '../../../router/router.js';
import { portalApi, publicApi } from '../../../services/api.js';
import { session } from '../../../services/session.js';
import { html, setHtml } from '../../../utils/html.js';
import { BUDGETS, budgetQuery, pageHead, pager, roomCard } from '../common.js';

const PAGE_SIZE = 12;
const SORTS = [
  { value: 'price', label: 'Giá thấp trước' },
  { value: '-price', label: 'Giá cao trước' },
  { value: 'newest', label: 'Mới đăng' },
  { value: '-area', label: 'Diện tích lớn trước' },
];

function myViewings(items) {
  if (!items.length) return '';
  const closed = items.filter((q) => ['cancelled', 'rejected', 'converted', 'completed', 'no_show'].includes(q.status));
  const active = items.filter((q) => !closed.includes(q));
  return html`<section aria-label="Lịch xem phòng của bạn"><h2 class="h5">Lịch xem phòng của bạn</h2>
    ${active.map(customerViewing)}
    ${closed.length ? html`<details class="mb-3"><summary>Lịch đã kết thúc (${closed.length})</summary>${closed.slice(0, 10).map(customerViewing)}</details>` : ''}
  </section>`;
}

export default async function RoomsPage(ctx) {
  ctx.setTitle('Thuê phòng');
  const search = Object.fromEntries(['q', 'province', 'locality', 'budget', 'roomType', 'priceMin', 'priceMax', 'areaMin', 'capacity', 'amenities'].map((key) => [key, ctx.query[key] || '']));
  search.sort = SORTS.some((s) => s.value === ctx.query.sort) ? ctx.query.sort : 'price';
  search.page = Math.max(1, Number(ctx.query.page) || 1);
  let filters = null;
  let controller;
  let requestId = 0;
  let timer;
  ctx.onCleanup(() => { clearTimeout(timer); controller?.abort(); });
  const select = (name, label, options, placeholder = 'Tất cả') => html`<div class="cu-filter"><label class="form-label" for="f-${name}">${label}</label>
    <select class="form-select" id="f-${name}" name="${name}" data-filter>
      ${placeholder ? html`<option value="">${placeholder}</option>` : ''}
      ${options.map((o) => html`<option value="${o.value}" ${search[name] === String(o.value) ? 'selected' : ''}>${o.label}</option>`)}
    </select></div>`;
  setHtml(ctx.outlet, html`<div class="cu-page">
    ${pageHead({ title: 'Tìm phòng phù hợp', subtitle: 'Chọn vị trí, ngân sách và tiện ích. Các phòng dưới đây đang sẵn sàng cho thuê.' })}
    ${session.isAuthenticated ? '' : html`<aside class="cu-guest"><span>${icon('calendar-check')} Đăng nhập để đặt lịch xem phòng.</span>
      <a class="btn btn-outline-primary btn-sm" href="${link('/login?next=/rooms')}">Đăng nhập</a></aside>`}
    <div data-viewings></div>
    <form class="cu-room-search" data-filters role="search" aria-label="Tìm phòng thuê">
      <div class="cu-search-top"><div><label class="form-label" for="f-q">Bạn muốn tìm phòng ở đâu?</label>
        <input class="form-control" type="search" id="f-q" name="q" data-filter value="${search.q}" maxlength="120" placeholder="Tên phòng, đường, phường… có thể gõ không dấu"></div>
        <button class="btn btn-primary" type="submit">${icon('search')} Tìm phòng</button></div>
      <div data-filter-fields></div>
      <div class="text-danger small mt-2" role="alert" data-filter-error></div>
    </form>
    <div class="cu-active-filters" data-active-filters aria-label="Bộ lọc đang dùng"></div>
    <div data-results>${loadingBlock(6)}</div>
  </div>`);
  const $ = (selector) => ctx.outlet.querySelector(selector);
  const form = $('[data-filters]'), results = $('[data-results]');
  const withSelected = (options, name) => search[name] && !options.some((o) => o.value === search[name]) ? [...options, { value: search[name], label: search[name] }] : options;
  const localities = () => [...new Set((filters?.provinces || []).filter((p) => !search.province || p.name === search.province || p.code === search.province).flatMap((p) => p.localities))].sort((a, b) => a.localeCompare(b, 'vi')).map((value) => ({ value, label: value }));
  const renderFilters = () => {
    const number = (name, label, max, step = 1) => html`<div class="cu-filter"><label class="form-label" for="f-${name}">${label}</label><input class="form-control" id="f-${name}" name="${name}" data-filter type="number" min="0" max="${max}" step="${step}" value="${search[name]}" placeholder="Không giới hạn"></div>`;
    setHtml($('[data-filter-fields]'), html`<div class="cu-search-main">
      ${select('province', 'Tỉnh / thành phố', withSelected((filters?.provinces || []).map((p) => ({ value: p.name, label: p.name })), 'province'))}
      ${select('locality', 'Phường / xã', withSelected(localities(), 'locality'))}
      ${select('budget', 'Ngân sách mỗi tháng', BUDGETS)}
      ${select('sort', 'Sắp xếp', SORTS, null)}
    </div>
    <details class="cu-search-more" ${search.roomType || search.priceMin || search.priceMax || search.areaMin || search.capacity || search.amenities ? 'open' : ''}>
      <summary>${icon('sliders')} Bộ lọc chi tiết</summary>
      <div class="cu-search-main mt-3">
        ${number('priceMin', 'Giá từ (đ/tháng)', 1000000000)}${number('priceMax', 'Giá đến (đ/tháng)', 1000000000)}
        ${number('areaMin', 'Diện tích tối thiểu (m²)', 500)}
        ${select('capacity', 'Số người ở', Array.from({ length: 20 }, (_, i) => ({ value: String(i + 1), label: `${i + 1} người trở lên` })))}
        ${select('roomType', 'Loại phòng', withSelected((filters?.roomTypes || []).map((t) => ({ value: t.code, label: t.name })), 'roomType'))}
      </div>
      <fieldset class="cu-search-amenities"><legend>Tiện ích cần có</legend>
        ${(filters?.amenities || []).map((a) => html`<label><input type="checkbox" data-amenity-filter value="${a.code}" ${search.amenities.split(',').includes(a.code) ? 'checked' : ''}> ${a.name}</label>`)}
        ${filters?.amenities?.length ? '' : html`<span class="small text-muted-sr">Chưa có tiện ích để lọc.</span>`}
      </fieldset>
    </details>
    ${filters ? '' : html`<p class="small text-warning mt-2">Chưa tải được danh mục bộ lọc. Vẫn có thể tìm theo tên và giá. <button type="button" class="btn btn-link btn-sm" data-retry-filters>Thử lại</button></p>`}`);
  };
  const chips = () => {
    const names = { q: 'Tìm', province: 'Tỉnh/thành', locality: 'Phường/xã', budget: 'Ngân sách', roomType: 'Loại phòng', priceMin: 'Giá từ', priceMax: 'Giá đến', areaMin: 'Diện tích từ', capacity: 'Số người từ', amenities: 'Tiện ích' };
    const active = Object.keys(names).filter((key) => search[key]);
    const text = (key) => key === 'budget' ? BUDGETS.find((b) => b.value === search.budget)?.label || search.budget : key === 'roomType' ? filters?.roomTypes?.find((r) => r.code === search.roomType)?.name || search.roomType : key === 'amenities' ? search.amenities.split(',').map((code) => filters?.amenities?.find((a) => a.code === code)?.name || code).join(', ') : search[key];
    setHtml($('[data-active-filters]'), html`${active.map((key) => html`<button type="button" data-remove-filter="${key}" class="cu-filter-chip" aria-label="Bỏ lọc ${names[key]}">${names[key]}: ${text(key)} ${icon('x')}</button>`)}
      ${active.length ? html`<button type="button" class="btn btn-link btn-sm" data-clear>Xóa bộ lọc</button>` : ''}`);
  };
  const syncUrl = () => replaceQuery(Object.fromEntries(Object.entries(search).map(([k, v]) => [k, (k === 'page' && v === 1) || (k === 'sort' && v === 'price') || !v ? undefined : v])));
  const load = async () => {
    clearTimeout(timer); controller?.abort(); controller = new AbortController(); const request = ++requestId;
    const range = search.budget ? budgetQuery(search.budget) : { priceMin: search.priceMin || undefined, priceMax: search.priceMax || undefined };
    const error = (range.priceMin != null && (Number(range.priceMin) < 0 || Number(range.priceMin) > 1e9)) || (range.priceMax != null && (Number(range.priceMax) < 0 || Number(range.priceMax) > 1e9)) || (range.priceMin != null && range.priceMax != null && Number(range.priceMin) > Number(range.priceMax)) ? 'Khoảng giá không hợp lệ: giá từ phải nhỏ hơn hoặc bằng giá đến.' : Number(search.areaMin) < 0 || Number(search.areaMin) > 500 ? 'Diện tích phải từ 0 đến 500 m².' : '';
    $('[data-filter-error]').textContent = error;
    if (error) return;
    chips(); syncUrl(); setHtml(results, loadingBlock(6));
    try {
      const result = await publicApi.rooms({ ...search, ...range, budget: undefined, pageSize: PAGE_SIZE }, { signal: AbortSignal.any([ctx.signal, controller.signal]) });
      if (request !== requestId || ctx.signal.aborted) return;
      search.page = result.page; syncUrl();
      if (!result.items.length) {
        setHtml(results, html`<div class="cu-empty"><h2>Chưa có phòng phù hợp</h2><p>Thử bỏ bớt điều kiện hoặc liên hệ để được tư vấn.</p>
          <button class="btn btn-outline-primary" type="button" data-clear>Xóa bộ lọc</button> <a class="btn btn-link" href="${link('/contact')}">Liên hệ</a></div>`); return;
      }
      setHtml(results, html`<p class="cu-count" aria-live="polite"><strong>${result.totalItems}</strong> phòng phù hợp · Trang ${result.page}/${result.totalPages}</p><div class="cu-room-grid">${result.items.map(roomCard)}</div>${pager(result)}`);
    } catch (error) {
      if (request !== requestId || error?.isAborted || ctx.signal.aborted) return;
      setHtml(results, errorState(error)); results.querySelector('#sr-retry')?.addEventListener('click', load);
    }
  };
  const clear = (key) => {
    if (key) { search[key] = ''; if (key === 'province') search.locality = ''; }
    else Object.keys(search).filter((k) => !['sort', 'page'].includes(k)).forEach((k) => { search[k] = ''; });
    search.page = 1; $('#f-q').value = search.q; renderFilters(); load();
  };
  ctx.outlet.addEventListener('click', (e) => {
    const page = e.target.closest('[data-page]');
    if (page && !page.disabled) { search.page = Number(page.dataset.page); load(); form.scrollIntoView({ block: 'start' }); }
    if (e.target.closest('[data-clear]')) clear();
    const chip = e.target.closest('[data-remove-filter]'); if (chip) clear(chip.dataset.removeFilter);
    if (e.target.closest('[data-retry-filters]')) loadFilters();
  }, { signal: ctx.signal });
  form.addEventListener('submit', (e) => { e.preventDefault(); search.page = 1; load(); });
  form.addEventListener('input', (e) => {
    if (e.target.name !== 'q') return;
    // Bỏ ngay kết quả đang tải của từ khóa cũ, kể cả trong khoảng debounce.
    controller?.abort(); requestId++;
    search.q = e.target.value.trim(); search.page = 1; clearTimeout(timer); timer = setTimeout(load, 350);
  });
  form.addEventListener('change', (e) => {
    if (e.target.matches('[data-amenity-filter]')) search.amenities = [...form.querySelectorAll('[data-amenity-filter]:checked')].map((el) => el.value).join(',');
    else if (e.target.matches('[data-filter]')) {
      search[e.target.name] = e.target.value;
      if (e.target.name === 'province') { search.locality = ''; renderFilters(); }
      if (e.target.name === 'budget') { search.priceMin = ''; search.priceMax = ''; renderFilters(); }
      if (['priceMin', 'priceMax'].includes(e.target.name)) { search.budget = ''; $('#f-budget').value = ''; }
    } else return;
    search.page = 1; load();
  });
  const loadFilters = async () => { try { filters = await publicApi.filters(); } catch { filters = null; } if (!ctx.signal.aborted) renderFilters(); };
  const [_, viewingsResult] = await Promise.allSettled([loadFilters(), session.isCustomer ? portalApi.inquiries() : Promise.resolve([])]);
  if (ctx.signal.aborted) return;
  let myRequests = viewingsResult.status === 'fulfilled' ? viewingsResult.value : [];
  const reloadViewings = async () => { myRequests = await portalApi.inquiries(); setHtml($('[data-viewings]'), myViewings(myRequests)); };
  setHtml($('[data-viewings]'), myViewings(myRequests));
  ctx.onCleanup(bindCustomerViewings($('[data-viewings]'), () => myRequests, reloadViewings));
  await load();
}
