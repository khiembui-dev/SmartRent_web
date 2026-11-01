// Tiện ích dùng chung cho các trang quản trị.
import { catalogApi } from '../../services/api.js';
import { session } from '../../services/session.js';
import { formatVnd } from '../../utils/money.js';
import { html } from '../../utils/html.js';
import { link } from '../../components/ui.js';

let catalogCache = null;
let catalogOrg = null;

/** Danh mục của đơn vị (loại phòng, tiện nghi, khoản thu, nhân sự...). Lưu tạm theo đơn vị. */
export async function getCatalog({ fresh = false } = {}) {
  const orgId = session.organization?.id;
  if (fresh || !catalogCache || catalogOrg !== orgId) {
    catalogCache = await catalogApi.get();
    catalogOrg = orgId;
  }
  return catalogCache;
}
export function invalidateCatalog() {
  catalogCache = null;
}

/** Thông báo cho khung giao diện biết dữ liệu đã đổi (cập nhật số đếm việc cần xử lý). */
export function dataChanged() {
  document.dispatchEvent(new CustomEvent('sr:data-changed'));
}

export const tenantCell = (t, sub) => (t ? html`<a href="${link(`/admin/tenants/${t.id}`)}" class="link-quiet fw-550">${t.fullName}</a>${sub ? html`<div class="small text-muted-sr">${sub}</div>` : ''}` : html`<span class="text-muted-sr">—</span>`);
export const moneyCell = (v, { strong = false, danger = false } = {}) => html`<span class="sr-money ${strong ? 'fw-semibold' : ''} ${danger && v > 0 ? 'text-danger' : ''}">${formatVnd(v)}</span>`;

export const staffOptions = (catalog) => catalog.staff.map((s) => ({ value: s.id, label: s.displayName }));

/** Gắn xử lý cho các nút data-action trong vùng. handlers: { name: async (button) => {} } */
export function bindActions(root, handlers) {
  const listener = async (event) => {
    const button = event.target.closest('[data-action]');
    if (!button || !root.contains(button)) return;
    const handler = handlers[button.dataset.action];
    if (!handler) return;
    event.preventDefault();
    if (button.dataset.busy) return;
    button.dataset.busy = '1';
    try {
      await handler(button);
    } finally {
      delete button.dataset.busy;
    }
  };
  root.addEventListener('click', listener);
  return () => root.removeEventListener('click', listener);
}
