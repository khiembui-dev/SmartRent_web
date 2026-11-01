// Mẫu trang danh sách: thanh lọc đồng bộ URL + lọc nhanh + bảng server-side + xuất CSV đúng bộ lọc.
import { replaceQuery } from '../router/router.js';
import { session } from '../services/session.js';
import { debounce } from '../utils/dom.js';
import { cleanParams } from '../utils/query.js';
import { monthOptions } from '../utils/date.js';
import { html, setHtml } from '../utils/html.js';
import { createDataTable } from './data-table.js';
import { exportList } from './export.js';
import { icon } from './ui.js';

/**
 * filters: [{ name, label, type: 'search'|'select'|'date'|'month', options?, placeholder? }]
 * quick: [{ label, params }] — nút lọc nhanh (ví dụ "Quá hạn"), params ghi đè bộ lọc.
 */
export function filterBar(filters, values) {
  return html`<form class="sr-filters" role="search" data-filter-form>
    ${filters.map((f) => {
    const id = `flt-${f.name}`;
    const v = values[f.name] ?? (f.type === 'property' ? session.propertyId : '');
    if (f.type === 'property') {
      const org = session.organization;
      return html`<div class="sr-filter"><label class="form-label" for="${id}">${f.label || 'Cơ sở'}</label>
          <select class="form-select form-select-sm" id="${id}" name="${f.name}">
            <option value="">${org?.propertyScope === 'all' ? 'Tất cả cơ sở' : 'Tất cả cơ sở được giao'}</option>
            ${(org?.properties || []).map((p) => html`<option value="${p.id}" ${String(v) === String(p.id) ? 'selected' : ''}>${p.name}</option>`)}
          </select></div>`;
    }
    if (f.type === 'search') {
      return html`<div class="sr-filter-search"><label class="form-label" for="${id}">${f.label || 'Tìm kiếm'}</label>
          <div class="input-group input-group-sm"><span class="input-group-text">${icon('search')}</span>
          <input type="search" class="form-control" id="${id}" name="${f.name}" value="${v}" placeholder="${f.placeholder || 'Gõ để tìm…'}" autocomplete="off"></div></div>`;
    }
    if (f.type === 'select') {
      return html`<div class="sr-filter"><label class="form-label" for="${id}">${f.label}</label>
          <select class="form-select form-select-sm" id="${id}" name="${f.name}">
            <option value="">${f.allLabel || 'Tất cả'}</option>
            ${f.options.map((o) => html`<option value="${o.value}" ${String(v) === String(o.value) ? 'selected' : ''}>${o.label}</option>`)}
          </select></div>`;
    }
    if (f.type === 'month') {
      return html`<div class="sr-filter"><label class="form-label" for="${id}">${f.label}</label>
          <select class="form-select form-select-sm" id="${id}" name="${f.name}"><option value="">Tất cả</option>
          ${monthOptions({ include: v || undefined }).map((o) => html`<option value="${o.value}" ${o.value === v ? 'selected' : ''}>${o.label}</option>`)}</select></div>`;
    }
    // Ngày lọc dùng Flatpickr (dd/mm/yyyy) để hiển thị giống nhau trên mọi trình duyệt; giá trị gửi đi vẫn là YYYY-MM-DD.
    return html`<div class="sr-filter"><label class="form-label" for="${id}">${f.label}</label>
        <input type="text" class="form-control form-control-sm" data-datepicker id="${id}" name="${f.name}" value="${v}" autocomplete="off"></div>`;
  })}
    ${filters.some((f) => f.type !== 'search') ? html`<button type="button" class="btn btn-sm btn-outline-secondary d-md-none sr-filter-toggle" data-filter-toggle aria-expanded="false">${icon('funnel')} Bộ lọc <span data-filter-count></span></button>` : ''}
    <div class="d-flex gap-2 ms-auto align-items-end sr-filter-actions">
      <button type="reset" class="btn btn-sm btn-outline-secondary" data-clear>${icon('x-lg')} Xóa lọc</button>
    </div>
  </form>`;
}

export function mountList(ctx, container, { filters = [], quick = [], columns, fetch, order, rowHref, onRowClick, empty, exportSpec, extraParams = () => ({}), pageLength, onLoaded }) {
  const names = filters.map((f) => f.name);
  const initial = Object.fromEntries(Object.entries(ctx.query).filter(([k]) => names.includes(k) || quick.some((q) => k in q.params)));
  const quickKeys = new Set(quick.flatMap((q) => Object.keys(q.params)));
  let quickState = Object.fromEntries(Object.entries(initial).filter(([k]) => quickKeys.has(k) && !names.includes(k)));

  setHtml(container, html`<section class="sr-panel">
    ${filters.length ? filterBar(filters, initial) : ''}
    ${quick.length || exportSpec ? html`<div class="sr-quick-filters" role="group" aria-label="Lọc nhanh">
      ${quick.length ? html`<button type="button" class="btn btn-outline-secondary" data-quick="-1" aria-pressed="${String(!Object.keys(quickState).length)}">Tất cả</button>` : ''}
      ${quick.map((q, i) => html`<button type="button" class="btn btn-outline-secondary" data-quick="${i}" aria-pressed="false">${q.label}</button>`)}
      ${exportSpec ? html`<button type="button" class="btn btn-outline-primary ms-auto" data-export title="Xuất toàn bộ dòng theo bộ lọc hiện tại">${icon('download')} Xuất CSV</button>` : ''}
    </div>` : ''}
    <div class="sr-table-wrap" data-table></div>
  </section>`);

  const form = container.querySelector('[data-filter-form]');
  const readFilters = () => {
    const values = {};
    if (form) new FormData(form).forEach((value, key) => { values[key] = value; });
    return cleanParams({ ...values, ...quickState });
  };
  const getFilters = () => {
    const filtersNow = readFilters();
    const scoped = !names.includes('propertyId') && session.propertyId ? { propertyId: session.propertyId } : {};
    return cleanParams({ ...scoped, ...extraParams(), ...filtersNow });
  };

  // Lọc nhanh trùng tên trường lọc thì đặt thẳng vào trường đó để ô chọn luôn phản ánh đúng bộ lọc đang áp dụng.
  const setField = (name, value) => {
    const el = form?.elements.namedItem(name);
    if (el) el.value = value;
  };
  const matches = (q) => {
    const current = readFilters();
    return Object.entries(q.params).every(([k, v]) => String(current[k]) === String(v));
  };
  const syncQuickButtons = () => {
    container.querySelectorAll('[data-quick]').forEach((btn) => {
      const i = Number(btn.dataset.quick);
      const active = i === -1 ? !quick.some(matches) : matches(quick[i]);
      btn.setAttribute('aria-pressed', String(active));
      btn.classList.toggle('active', active);
    });
  };
  syncQuickButtons();

  const table = createDataTable(container.querySelector('[data-table]'), { columns, fetch, getFilters, order, rowHref, onRowClick, empty, pageLength, onLoaded });
  // Màn hình nhỏ: chỉ hiện ô tìm kiếm, các bộ lọc khác mở bằng nút "Bộ lọc" (kèm số bộ lọc đang dùng).
  const syncFilterCount = () => {
    const count = form ? filters.filter((f) => f.type !== 'search' && form.elements.namedItem(f.name)?.value).length : 0;
    const badge = form?.querySelector('[data-filter-count]');
    if (badge) badge.textContent = count ? `(${count})` : '';
  };
  const apply = () => {
    replaceQuery(readFilters());
    syncFilterCount();
    table.reload(true);
  };
  const debounced = debounce(apply, 350);
  if (form) {
    syncFilterCount();
    let disposeDates = () => {};
    if (form.querySelector('[data-datepicker]')) {
      import('./datepicker.js').then(({ initDatepickers }) => { disposeDates = initDatepickers(form); });
    }
    ctx.onCleanup(() => disposeDates());
    form.querySelector('[data-filter-toggle]')?.addEventListener('click', (event) => {
      const open = form.classList.toggle('is-open');
      event.currentTarget.setAttribute('aria-expanded', String(open));
    });
    form.addEventListener('input', (event) => (event.target.type === 'search' ? debounced() : null));
    form.addEventListener('change', (event) => {
      // Bỏ qua ô hiển thị của Flatpickr (không có name); ô gốc sẽ phát sự kiện change riêng.
      if (event.target.type === 'search' || !event.target.name) return;
      if (filters.some((f) => f.type === 'property' && f.name === event.target.name)) session.setPropertyId(event.target.value);
      apply();
      syncQuickButtons();
    });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      apply();
    });
    form.addEventListener('reset', () => {
      quickState = {};
      if (filters.some((f) => f.type === 'property')) session.setPropertyId('');
      setTimeout(() => {
        form.querySelectorAll('input, select').forEach((el) => {
          if (el._flatpickr) el._flatpickr.clear(false);
          el.value = '';
        });
        syncQuickButtons();
        apply();
      });
    });
  }
  container.querySelectorAll('[data-quick]').forEach((btn) => btn.addEventListener('click', () => {
    const i = Number(btn.dataset.quick);
    quickState = {};
    if (i === -1) [...quickKeys].filter((k) => names.includes(k)).forEach((k) => setField(k, ''));
    else Object.entries(quick[i].params).forEach(([k, v]) => (names.includes(k) ? setField(k, v) : (quickState[k] = v)));
    syncQuickButtons();
    apply();
  }));
  container.querySelector('[data-export]')?.addEventListener('click', () => exportList({ ...exportSpec, filters: getFilters(), fetchPage: (query) => fetch(query, {}) }));
  ctx.onCleanup(() => {
    debounced.cancel();
    table.destroy();
  });
  return { table, getFilters, reload: () => table.reload(false) };
}
