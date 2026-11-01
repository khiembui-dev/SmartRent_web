// Hợp đồng: lưu trữ và tra cứu hợp đồng, mỗi dòng liên kết tới khách và phòng.
import { rowActions } from '../../components/admin-kit.js';
import { badge, options } from '../../components/badges.js';
import { mountList } from '../../components/list-page.js';
import { icon, link, pageHeader, plate } from '../../components/ui.js';
import { contractsApi } from '../../services/api.js';
import { session } from '../../services/session.js';
import { formatDate } from '../../utils/date.js';
import { formatVnd } from '../../utils/money.js';
import { html, setHtml } from '../../utils/html.js';
import { tenantCell } from './common.js';

export default function ContractsPage(ctx) {
  ctx.setTitle('Hợp đồng');
  setHtml(ctx.outlet, html`${pageHeader({
    title: 'Hợp đồng',
    subtitle: 'Mỗi hợp đồng gắn với một khách và một phòng. Bản đã ký không sửa được; thay đổi bằng phiên bản mới.',
    actions: session.can('tenancies.checkin') ? html`<a class="btn btn-primary btn-sm" href="${link('/admin/contracts/new')}">${icon('plus-lg')} Tạo hợp đồng</a>` : '',
  })}<div data-list></div>`);

  mountList(ctx, ctx.outlet.querySelector('[data-list]'), {
    filters: [
      { name: 'q', type: 'search', label: 'Tìm hợp đồng', placeholder: 'Mã hợp đồng, tên khách, phòng' },
      { name: 'propertyId', type: 'property' },
      { name: 'status', type: 'select', label: 'Trạng thái', options: options('contract') },
    ],
    quick: [
      { label: 'Sắp hết hạn', params: { expiring: 'true' } },
      { label: 'Hết hạn, khách vẫn ở', params: { stillOccupied: 'true' } },
      { label: 'Có đề nghị của khách', params: { requests: 'pending' } },
    ],
    columns: [
      { title: 'Mã', sortKey: 'code', render: (k) => html`<a class="fw-semibold" href="${link(`/admin/contracts/${k.id}`)}">${k.code}</a>` },
      { title: 'Khách thuê', sortKey: 'representative.fullName', render: (k) => tenantCell(k.representative) },
      { title: 'Phòng', sortKey: 'room.code', render: (k) => html`${plate(k.room)}<div class="small text-muted-sr">${k.room.propertyName}</div>` },
      { title: 'Thời hạn', sortKey: 'endsOn', render: (k) => html`<span class="num">${formatDate(k.effectiveFrom)} – ${formatDate(k.displayEndOn)}</span>${k.expiring ? html`<div class="small ad-attention">Còn ${k.daysLeft} ngày</div>` : k.stillOccupiedAfterExpiry ? html`<div class="small text-danger">Hết hạn, khách vẫn ở</div>` : ''}` },
      { title: 'Tiền thuê', className: 'text-end', render: (k) => html`<span class="num">${formatVnd(k.rent)}</span>` },
      { title: 'Cọc đã giữ', className: 'text-end', render: (k) => html`<span class="num">${formatVnd(k.depositHeld)}</span>${k.requiredDeposit != null && k.depositHeld < k.requiredDeposit ? html`<div class="small text-muted-sr">Yêu cầu ${formatVnd(k.requiredDeposit)}</div>` : ''}` },
      { title: 'Trạng thái', sortKey: 'status', render: (k) => html`${badge('contract', k.status)}${k.pendingRequestCount ? html` <span class="sr-badge tone-wash no-dot">Có đề nghị</span>` : ''}` },
      { title: '', className: 'text-end ad-actions-col', priority: 2, render: (k) => rowActions([{ href: `/admin/contracts/${k.id}`, label: `Xem hợp đồng ${k.code}`, icon: 'eye' }]) },
    ],
    fetch: (q, o) => contractsApi.list(q, o),
    order: [[3, 'asc']],
    rowHref: (k) => `/admin/contracts/${k.id}`,
    empty: { title: 'Chưa có hợp đồng', text: 'Tạo hợp đồng để gắn khách vào phòng.' },
  });
}
