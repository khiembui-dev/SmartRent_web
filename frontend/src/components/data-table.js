// Bảng dữ liệu DataTables ở chế độ server-side: lọc/tìm/sắp xếp/phân trang luôn chạy trên TOÀN BỘ tập ở máy chủ
// (mock hoặc API), không chỉ các dòng đang hiển thị. Ánh xạ tham số thống nhất:
//   start/length → page/pageSize, order → sort ("field" hoặc "-field"), bộ lọc trang → query.
import DataTable from 'datatables.net-bs5';
import 'datatables.net-responsive-bs5';
import 'datatables.net-bs5/css/dataTables.bootstrap5.min.css';
import 'datatables.net-responsive-bs5/css/responsive.bootstrap5.min.css';
import { ApiError } from '../services/errors.js';
import { html, setHtml, toHtml } from '../utils/html.js';
import { emptyState, errorState } from './ui.js';

const LANG = {
  processing: 'Đang tải…',
  lengthMenu: '_MENU_ dòng mỗi trang',
  info: 'Dòng _START_–_END_ trong _TOTAL_',
  infoEmpty: 'Không có dòng nào',
  infoFiltered: '(lọc từ _MAX_)',
  zeroRecords: '',
  emptyTable: '',
  loadingRecords: 'Đang tải…',
  paginate: { first: 'Trang đầu', previous: 'Trang trước', next: 'Trang sau', last: 'Trang cuối' },
  aria: { orderable: 'Bấm để sắp xếp', orderableReverse: 'Bấm để đảo thứ tự', paginate: { first: 'Trang đầu', previous: 'Trang trước', next: 'Trang sau', last: 'Trang cuối' } },
};

/**
 * @param {HTMLElement} container
 * @param {object} options
 *   columns: [{ title, data?, sortKey?, render(row) => html|string, className?, orderable?, priority?, width? }]
 *   fetch(query, { signal }) => Promise<{ items, totalItems, totalAll }>
 *   getFilters() => object  (bộ lọc của trang, cùng tham số với API)
 *   order: [[columnIndex, 'asc'|'desc']]
 *   rowHref(row) => string  (bấm dòng để mở; cột chính vẫn nên có link cho bàn phím)
 *   empty: { title, text, action }
 */
export function createDataTable(container, { columns, fetch, getFilters = () => ({}), order = [], pageLength = 20, rowHref, onRowClick, empty = {}, onLoaded }) {
  setHtml(container, html`<div class="sr-table-error" hidden></div>
    <div class="table-responsive-md"><table class="table table-hover align-middle w-100"><thead><tr>${columns.map((c) => html`<th scope="col" class="${c.className || ''}">${c.title}</th>`)}</tr></thead></table></div>`);
  const table = container.querySelector('table');
  const errorBox = container.querySelector('.sr-table-error');
  let controller = null;
  let lastResult = null;
  let firstLoad = true;

  const dt = new DataTable(table, {
    serverSide: true,
    processing: true,
    searching: false,
    pageLength,
    lengthMenu: [10, 20, 50, 100],
    order,
    responsive: { details: { type: 'inline' } },
    autoWidth: false,
    deferRender: true,
    language: LANG,
    layout: { topStart: null, topEnd: null, bottomStart: ['pageLength', 'info'], bottomEnd: 'paging' },
    columns: columns.map((c, i) => ({
      data: null,
      name: c.sortKey || `col${i}`,
      orderable: Boolean(c.sortKey) && c.orderable !== false,
      className: c.className || '',
      width: c.width,
      responsivePriority: c.priority ?? (i === 0 ? 1 : 10 + i),
      render: (_data, type, row) => (type === 'display' ? toHtml(c.render(row)) : ''),
    })),
    ajax: (data, callback) => {
      controller?.abort();
      controller = new AbortController();
      const ord = data.order?.[0];
      const col = ord ? columns[ord.column] : null;
      const query = {
        ...getFilters(),
        page: Math.floor(data.start / data.length) + 1,
        pageSize: data.length,
        sort: col?.sortKey ? `${ord.dir === 'desc' ? '-' : ''}${col.sortKey}` : undefined,
      };
      errorBox.hidden = true;
      container.classList.add('is-loading');
      fetch(query, { signal: controller.signal })
        .then((result) => {
          lastResult = result;
          callback({ draw: data.draw, recordsTotal: result.totalAll ?? result.totalItems, recordsFiltered: result.totalItems, data: result.items });
          const emptyCell = table.querySelector('td.dt-empty');
          if (emptyCell) {
            const filtered = result.totalAll > 0 && result.totalItems === 0;
            emptyCell.innerHTML = toHtml(emptyState(filtered
              ? { iconName: 'funnel', title: 'Không có kết quả với bộ lọc hiện tại', text: 'Bỏ bớt điều kiện lọc hoặc đổi từ khóa tìm kiếm.' }
              : { title: empty.title || 'Chưa có dữ liệu', text: empty.text, action: empty.action }));
          }
          onLoaded?.(result, { firstLoad });
          firstLoad = false;
        })
        .catch((error) => {
          if (error instanceof ApiError && error.isAborted) return;
          callback({ draw: data.draw, recordsTotal: 0, recordsFiltered: 0, data: [] });
          table.querySelector('td.dt-empty')?.replaceChildren();
          setHtml(errorBox, errorState(error, { retryId: 'sr-table-retry' }));
          errorBox.hidden = false;
          errorBox.querySelector('#sr-table-retry')?.addEventListener('click', () => dt.ajax.reload(null, false));
        })
        .finally(() => container.classList.remove('is-loading'));
    },
    createdRow: (row) => {
      if (rowHref || onRowClick) row.classList.add('is-clickable');
    },
  });

  const clickHandler = (event) => {
    if (!rowHref && !onRowClick) return;
    if (event.target.closest('a, button, input, select, label, .dtr-control')) return;
    const tr = event.target.closest('tbody tr');
    if (!tr || tr.classList.contains('child')) return;
    const row = dt.row(tr).data();
    if (!row) return;
    if (onRowClick) onRowClick(row, event);
    else import('../router/router.js').then(({ navigate }) => navigate(rowHref(row)));
  };
  table.addEventListener('click', clickHandler);

  return {
    dt,
    get lastResult() { return lastResult; },
    reload(resetPaging = true) { dt.ajax.reload(null, resetPaging); },
    destroy() {
      controller?.abort();
      table.removeEventListener('click', clickHandler);
      dt.destroy();
    },
  };
}
