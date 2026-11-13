// Hóa đơn: tìm, lọc theo cơ sở/chu kỳ/trạng thái; dải tổng tính trên toàn bộ tập đã lọc, không chỉ trang đang xem.
import { invoiceBadges, rowActions, statBand } from '../../components/admin-kit.js';
import { mountList } from '../../components/list-page.js';
import { link, pageHeader, plate } from '../../components/ui.js';
import { invoicesApi } from '../../services/api.js';
import { formatDate, monthLabel } from '../../utils/date.js';
import { formatVnd } from '../../utils/money.js';
import { html, setHtml } from '../../utils/html.js';
import { tenantCell } from './common.js';
import { mountBankReview } from './apipay-review.js';

const cycleOf = (i) => (i.period ? monthLabel(i.period.monthStart) : formatDate(i.serviceFrom));

export default function InvoicesPage(ctx) {
  ctx.setTitle('Hóa đơn');
  setHtml(ctx.outlet, html`${pageHeader({
    title: 'Hóa đơn',
    subtitle: 'ApiPay tự ghi nhận chuyển khoản hợp lệ. Các khoản cần kiểm tra được đối soát bên dưới hoặc tại chi tiết hóa đơn.',
    actions: html`<a class="btn btn-outline-primary btn-sm" href="${link('/admin/billing')}">Mở trang tính tiền</a>`,
  })}<div data-bank-review></div><div data-summary></div><div data-list></div>`);
  mountBankReview(ctx, ctx.outlet.querySelector('[data-bank-review]'));
  const summaryEl = ctx.outlet.querySelector('[data-summary]');

  mountList(ctx, ctx.outlet.querySelector('[data-list]'), {
    filters: [
      { name: 'q', type: 'search', label: 'Tìm hóa đơn', placeholder: 'Mã hóa đơn, tên khách, phòng' },
      { name: 'propertyId', type: 'property' },
      { name: 'periodMonth', type: 'month', label: 'Chu kỳ' },
      { name: 'paymentStatus', type: 'select', label: 'Thanh toán', options: [{ value: 'unpaid', label: 'Chưa thanh toán' }, { value: 'partial', label: 'Thanh toán một phần' }, { value: 'paid', label: 'Đã thanh toán' }] },
    ],
    quick: [
      { label: 'Còn nợ', params: { outstanding: 'true' } },
      { label: 'Quá hạn', params: { overdue: 'true' } },
      { label: 'Chờ xác minh', params: { hasPending: 'true' } },
      { label: 'Nháp', params: { status: 'draft' } },
      { label: 'Đã hủy', params: { status: 'void' } },
    ],
    columns: [
      { title: 'Mã hóa đơn', sortKey: 'code', render: (i) => html`<a class="fw-semibold text-nowrap" href="${link(`/admin/invoices/${i.id}`)}">${i.code || 'Nháp'}</a>` },
      { title: 'Khách thuê', sortKey: 'representative.fullName', render: (i) => tenantCell(i.representative) },
      { title: 'Phòng', sortKey: 'room.code', render: (i) => plate(i.room) },
      { title: 'Chu kỳ', sortKey: 'serviceFrom', render: (i) => html`<span class="text-nowrap">${cycleOf(i)}</span>` },
      { title: 'Tổng tiền', sortKey: 'totalAmount', className: 'text-end', render: (i) => html`<span class="num">${formatVnd(i.totalAmount)}</span>` },
      { title: 'Còn lại', sortKey: 'outstandingAmount', className: 'text-end', render: (i) => (i.status === 'issued' ? html`<span class="num ${i.outstandingAmount ? 'fw-semibold' : ''}">${formatVnd(i.outstandingAmount)}</span>` : html`<span class="text-muted-sr">—</span>`) },
      { title: 'Hạn', sortKey: 'dueOn', render: (i) => html`<span class="num">${i.dueOn ? formatDate(i.dueOn) : '—'}</span>` },
      { title: 'Trạng thái', render: invoiceBadges },
      { title: '', className: 'text-end ad-actions-col', priority: 2, render: (i) => rowActions([{ href: `/admin/invoices/${i.id}`, label: `Xem hóa đơn ${i.code || ''}`, icon: 'eye' }]) },
    ],
    fetch: (q, o) => invoicesApi.list(q, o),
    order: [[3, 'desc']],
    rowHref: (i) => `/admin/invoices/${i.id}`,
    onLoaded: (result) => {
      const s = result.summary;
      if (!s) return;
      setHtml(summaryEl, statBand([
        { label: 'Phải thu', value: formatVnd(s.receivableAmount), note: `${s.count} hóa đơn theo bộ lọc` },
        { label: 'Đã thu', value: formatVnd(s.paidAmount) },
        { label: 'Còn phải thu', value: formatVnd(s.outstandingAmount), note: s.pendingAmount ? `${formatVnd(s.pendingAmount)} chờ xác minh, chưa tính` : '' },
        { label: 'Quá hạn', value: formatVnd(s.overdueAmount), note: s.overdueCount ? `${s.overdueCount} hóa đơn` : 'Không có', tone: s.overdueCount ? 'danger' : null },
      ]));
    },
    exportSpec: {
      kind: 'invoices', filename: 'hoa-don',
      columns: [{ label: 'Mã hóa đơn', key: 'code' }, { label: 'Khách', value: (i) => i.representative.fullName }, { label: 'Phòng', value: (i) => i.room.code }, { label: 'Cơ sở', value: (i) => i.property.name }, { label: 'Chu kỳ', value: cycleOf }, { label: 'Tổng tiền', key: 'totalAmount' }, { label: 'Đã thu', key: 'paidAmount' }, { label: 'Còn lại', key: 'outstandingAmount' }, { label: 'Hạn', key: 'dueOn' }, { label: 'Trạng thái thanh toán', key: 'paymentStatus' }],
    },
    empty: { title: 'Chưa có hóa đơn', text: 'Tạo hóa đơn ở trang Tính tiền phòng.', action: html`<a class="btn btn-primary btn-sm" href="${link('/admin/billing')}">Mở trang tính tiền</a>` },
  });
}
