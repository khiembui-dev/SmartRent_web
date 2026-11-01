// Trang Hóa đơn: hóa đơn admin phát hành cho phòng của khách. Lọc và phân trang ở máy chủ.
import { badge } from '../../../components/badges.js';
import { errorState, icon, link, loadingBlock } from '../../../components/ui.js';
import { replaceQuery } from '../../../router/router.js';
import { portalApi } from '../../../services/api.js';
import { formatDate, monthLabel } from '../../../utils/date.js';
import { html, setHtml } from '../../../utils/html.js';
import { formatVnd } from '../../../utils/money.js';
import { periodText } from '../../admin/invoice-view.js';
import { loadStay, noRoomPanel, pageHead, pager, paymentBadge, residentPanel } from '../common.js';

const FILTERS = [
  { key: 'all', label: 'Tất cả', query: {} },
  { key: 'open', label: 'Cần thanh toán', query: { status: 'open' } },
  { key: 'pending', label: 'Chờ xác nhận', query: { hasPending: 'true' } },
  { key: 'paid', label: 'Đã thanh toán', query: { paymentStatus: 'paid' } },
];

function dueCard(overview) {
  const invoice = overview.openInvoices[0];
  if (!invoice) {
    return html`<section class="cu-due is-clear"><span class="cu-due-icon">${icon('check2-circle')}</span><div><h2>Bạn không có khoản nào cần thanh toán</h2><p>Hóa đơn mới sẽ hiện ở đây khi quản lý phát hành.</p></div></section>`;
  }
  const overdue = overview.overdueTotal > 0;
  const pending = overview.pendingPayments.reduce((sum, p) => sum + p.amount, 0);
  return html`<section class="cu-due ${overdue ? 'is-overdue' : ''}">
    <div class="cu-due-amount">
      <span>${overdue ? 'Đã quá hạn' : 'Cần thanh toán'}</span>
      <strong>${formatVnd(overview.outstandingTotal)}</strong>
      <small>${overview.openInvoices.length > 1 ? `${overview.openInvoices.length} hóa đơn còn nợ, gần nhất hạn ${formatDate(invoice.dueOn)}` : `Hạn thanh toán ${formatDate(invoice.dueOn)}`}</small>
      ${pending > 0 ? html`<small>${icon('hourglass-split')} Đang chờ quản lý xác nhận ${formatVnd(pending)}, chưa trừ vào số nợ.</small>` : ''}
    </div>
    <a class="btn btn-primary" href="${link(`/invoices/${invoice.id}`)}">Xem và thanh toán</a>
  </section>`;
}

const statusBadges = (inv) => html`${inv.status === 'issued' && inv.paymentStatus ? paymentBadge(inv.paymentStatus) : badge('invoiceStatus', inv.status)}
  ${inv.isOverdue && inv.outstandingAmount > 0 ? html`<span class="sr-badge tone-danger">Quá hạn</span>` : ''}
  ${inv.pendingPaymentCount > 0 ? html`<span class="sr-badge tone-wash">Chờ xác nhận</span>` : ''}`;

function invoiceRow(inv) {
  const owes = inv.status === 'issued' && inv.outstandingAmount > 0;
  return html`<li><a class="cu-ledger-row" href="${link(`/invoices/${inv.id}`)}">
    <span class="cu-ledger-main">
      <strong>${inv.period ? monthLabel(inv.period.monthStart) : periodText(inv)}</strong>
      <small>${inv.code}, hạn ${formatDate(inv.dueOn)}</small>
    </span>
    <span class="cu-ledger-status">${statusBadges(inv)}</span>
    <span class="cu-ledger-money">
      <strong class="${owes ? 'text-danger' : ''}">${formatVnd(owes ? inv.outstandingAmount : inv.status === 'void' ? inv.totalAmount : inv.receivableAmount)}</strong>
      <small>${owes ? `còn nợ, tổng ${formatVnd(inv.receivableAmount)}` : inv.status === 'void' ? 'đã hủy' : 'đã thanh toán đủ'}</small>
    </span>
    ${icon('chevron-right', 'cu-ledger-go')}
  </a></li>`;
}

export default async function InvoicesPage(ctx) {
  ctx.setTitle('Hóa đơn');
  setHtml(ctx.outlet, html`<div class="cu-page cu-medium" data-root>${loadingBlock(6)}</div>`);
  const root = ctx.outlet.querySelector('[data-root]');

  let stay;
  let overview;
  try {
    stay = await loadStay();
    if (stay.current?.financeVisible) overview = await portalApi.overview();
  } catch (error) {
    if (error?.isAborted || ctx.signal.aborted) return;
    setHtml(root, errorState(error));
    return;
  }
  if (ctx.signal.aborted) return;

  const head = pageHead({ title: 'Hóa đơn', subtitle: stay.current ? `Phòng ${stay.current.room.code}, ${stay.current.property.name}` : null });
  if (!stay.current) {
    setHtml(root, html`${head}${noRoomPanel('Hóa đơn tiền phòng')}`);
    return;
  }
  if (!stay.current.financeVisible) {
    setHtml(root, html`${head}${residentPanel()}`);
    return;
  }

  let filter = FILTERS.some((f) => f.key === ctx.query.status) ? ctx.query.status : 'all';
  let page = Number(ctx.query.page) || 1;
  setHtml(root, html`${head}${dueCard(overview)}
    <div class="cu-tabs" role="group" aria-label="Lọc hóa đơn">${FILTERS.map((f) => html`<button type="button" class="${filter === f.key ? 'active' : ''}" data-filter="${f.key}" aria-pressed="${String(filter === f.key)}">${f.label}</button>`)}</div>
    <div data-list>${loadingBlock(4)}</div>`);
  const list = root.querySelector('[data-list]');

  const load = async () => {
    setHtml(list, loadingBlock(4));
    replaceQuery({ status: filter === 'all' ? undefined : filter, page: page > 1 ? page : undefined });
    let result;
    try {
      const { query } = FILTERS.find((f) => f.key === filter);
      result = await portalApi.invoices({ ...query, page, pageSize: 12, sort: '-serviceFrom' }, { signal: ctx.signal });
    } catch (error) {
      if (error?.isAborted || ctx.signal.aborted) return;
      setHtml(list, errorState(error));
      return;
    }
    if (ctx.signal.aborted) return;
    setHtml(list, result.items.length
      ? html`<ul class="cu-ledger">${result.items.map(invoiceRow)}</ul>${pager(result)}`
      : html`<div class="cu-empty"><h2>${filter === 'all' ? 'Chưa có hóa đơn nào' : 'Không có hóa đơn ở mục này'}</h2><p>Hóa đơn tiền nhà hằng tháng sẽ hiện ở đây khi quản lý phát hành.</p></div>`);
  };

  const onClick = (event) => {
    const button = event.target.closest('[data-filter]');
    if (button) {
      filter = button.dataset.filter;
      page = 1;
      root.querySelectorAll('[data-filter]').forEach((b) => {
        b.classList.toggle('active', b === button);
        b.setAttribute('aria-pressed', String(b === button));
      });
      load();
    }
    const pageButton = event.target.closest('[data-page]');
    if (pageButton && !pageButton.disabled) {
      page = Number(pageButton.dataset.page);
      load();
    }
  };
  root.addEventListener('click', onClick);
  ctx.onCleanup(() => root.removeEventListener('click', onClick));
  await load();
}
