// Chi tiết hóa đơn dạng tờ biên lai và báo chuyển khoản. Báo chuyển khoản chỉ tạo khoản "chờ xác minh", chưa trừ nợ cho tới khi quản lý xác nhận.
import { badge } from '../../../components/badges.js';
import { toast } from '../../../components/dialogs.js';
import { bindForm, enhance, formAlert, renderFields } from '../../../components/form.js';
import { errorState, icon, link, loadingBlock, note } from '../../../components/ui.js';
import { config } from '../../../config.js';
import { portalApi } from '../../../services/api.js';
import { formatDate, formatDateTime, instantToLocalInput, monthLabel } from '../../../utils/date.js';
import { formatNumber, formatVnd } from '../../../utils/money.js';
import { html, setHtml } from '../../../utils/html.js';
import { periodText } from '../../admin/invoice-view.js';
import { pageHead, paymentBadge } from '../common.js';

function lineDetail(line, inv) {
  const segments = inv.meterSegments.filter((s) => s.lineId === line.id);
  if (segments.length) return segments.map((s) => `Dùng ${formatNumber(s.endValue - s.startValue)} ${line.unit} × ${formatVnd(line.unitPrice)}`).join('; ');
  return `${formatNumber(line.quantity)} ${line.unit} × ${formatVnd(line.unitPrice)}`;
}

function receipt(inv) {
  const overdue = inv.status === 'issued' && inv.isOverdue && inv.outstandingAmount > 0;
  return html`<article class="cu-receipt">
    <header class="cu-receipt-head">
      <div>
        <span class="cu-receipt-from">${inv.property.name}</span>
        <h2>${inv.period ? `Hóa đơn ${monthLabel(inv.period.monthStart).toLowerCase()}` : 'Hóa đơn'}</h2>
        <small>${inv.code}, kỳ ${periodText(inv)}</small>
      </div>
      <span class="sr-plate sr-plate-lg">${inv.room.code}</span>
    </header>
    <ul class="cu-receipt-lines">
      ${inv.lines.map((l) => html`<li class="${l.sign < 0 ? 'is-minus' : ''}"><span><strong>${l.description}</strong><small>${lineDetail(l, inv)}</small></span><span>${formatVnd(l.amount)}</span></li>`)}
    </ul>
    <dl class="cu-receipt-sum">
      <div><dt>Tổng phải thu</dt><dd>${formatVnd(inv.status === 'void' ? inv.totalAmount : inv.receivableAmount)}</dd></div>
      <div class="is-paid"><dt>Đã thu</dt><dd>${formatVnd(inv.paidAmount)}</dd></div>
    </dl>
    <div class="cu-receipt-total ${inv.outstandingAmount > 0 ? 'is-due' : ''}">
      <span>Còn phải đóng</span><strong>${formatVnd(inv.outstandingAmount)}</strong>
    </div>
    <footer class="cu-receipt-foot">
      <span>Phát hành ${formatDate(inv.issuedOn)}</span>
      <span class="${overdue ? 'text-danger fw-semibold' : ''}">Hạn thanh toán ${formatDate(inv.dueOn)}${overdue ? `, quá ${inv.daysOverdue} ngày` : ''}</span>
    </footer>
    ${inv.notes ? html`<p class="cu-receipt-note">${inv.notes}</p>` : ''}
  </article>`;
}

function bankBox(bank, memo) {
  return html`<div class="cu-bank">
    <div class="cu-qr">${icon('qr-code')}<span>Mã VietQR hiện ở đây khi kết nối ngân hàng</span></div>
    <dl>
      ${bank ? html`<div><dt>Ngân hàng</dt><dd>${bank.bankName}</dd></div><div><dt>Số tài khoản</dt><dd>${bank.accountNumberMasked}</dd></div><div><dt>Chủ tài khoản</dt><dd>${bank.accountName}</dd></div>` : ''}
      <div><dt>Nội dung</dt><dd><code>${memo}</code><button type="button" class="cu-copy" data-copy="${memo}" aria-label="Sao chép nội dung chuyển khoản">${icon('copy')}</button></dd></div>
    </dl>
    ${config.isMock ? html`<p class="cu-fine">Mô phỏng: tài khoản minh họa, chưa nối VietQR và chưa đối soát ngân hàng tự động.</p>` : ''}
  </div>`;
}

const PAYMENT_FIELDS = (remaining) => [
  { name: 'amount', label: 'Số tiền đã chuyển', type: 'money', required: true, default: remaining, help: 'Có thể sửa nếu bạn chuyển một phần.' },
  { name: 'receivedAt', label: 'Thời điểm chuyển', type: 'datetime', required: true, default: instantToLocalInput(new Date().toISOString()) },
  { name: 'externalReference', label: 'Mã giao dịch ngân hàng', required: true, maxLength: 100, help: 'Xem trong biên lai của ứng dụng ngân hàng.' },
  { name: 'notes', label: 'Ghi chú', optional: true },
  { type: 'html', html: html`<div data-uploader><label class="form-label" for="pay-proof">Ảnh biên lai chuyển khoản</label><input type="file" id="pay-proof"></div>` },
];

export default async function InvoiceDetailPage(ctx) {
  setHtml(ctx.outlet, html`<div class="cu-page" data-root>${loadingBlock(8)}</div>`);
  const root = ctx.outlet.querySelector('[data-root]');
  let inv;
  let catalog;
  try {
    [inv, catalog] = await Promise.all([portalApi.invoice(ctx.params.id), portalApi.catalog()]);
  } catch (error) {
    if (error?.isAborted || ctx.signal.aborted) return;
    setHtml(root, html`${errorState(error)}<p class="text-center"><a href="${link('/invoices')}">Về danh sách hóa đơn</a></p>`);
    return;
  }
  if (ctx.signal.aborted) return;

  ctx.setTitle(`Hóa đơn ${inv.code}`);
  const canPay = inv.status === 'issued' && inv.outstandingAmount > 0;
  const pending = inv.pendingPayments.reduce((sum, p) => sum + p.amount, 0);
  const remaining = Math.max(0, inv.outstandingAmount - pending) || inv.outstandingAmount;
  // Đã báo đủ số còn nợ: thu gọn form để khách không báo trùng một lần chuyển.
  const fullyReported = pending >= inv.outstandingAmount;
  const confirmed = inv.allocations.filter((a) => !a.reversesId);
  const bank = catalog.bankAccounts.find((b) => b.isDefault) || catalog.bankAccounts[0];
  const fields = PAYMENT_FIELDS(remaining);

  setHtml(root, html`
    ${pageHead({
    title: `Hóa đơn ${inv.code}`, back: { href: '/invoices', label: 'Tất cả hóa đơn' },
    actions: html`<button type="button" class="btn btn-outline-secondary btn-sm" data-print>${icon('printer')} In hóa đơn</button>`,
  })}
    <div class="cu-invoice-status">${inv.status === 'issued' && inv.paymentStatus ? paymentBadge(inv.paymentStatus) : badge('invoiceStatus', inv.status)}</div>
    ${inv.status === 'void' ? note(html`Hóa đơn đã hủy ngày ${formatDateTime(inv.voidedAt)}. Lý do: ${inv.voidReason || '—'}. Hóa đơn hủy không còn phải thu.`, { tone: 'warn' }) : ''}
    <div class="cu-invoice-layout">
      <div class="cu-invoice-paper">${receipt(inv)}</div>
      <aside class="cu-invoice-side sr-no-print">
        ${pending > 0 ? html`<div class="mb-3">${note(html`Bạn đã báo ${formatVnd(pending)}, đang chờ quản lý xác nhận. Khoản này chưa trừ vào số nợ.`, { tone: 'warn' })}</div>` : ''}
        ${canPay ? html`<section class="cu-card">
          <h2>Thanh toán hóa đơn</h2>
          ${fullyReported ? html`<p class="cu-text">Quản lý đang đối chiếu khoản bạn đã báo. Hóa đơn sẽ cập nhật sau khi xác nhận.</p>` : html`<p class="cu-text">Chuyển khoản theo thông tin dưới đây, sau đó báo lại để quản lý xác nhận.</p>${bankBox(bank, inv.code)}`}
          <details class="cu-pay-more" ${fullyReported ? '' : 'open'}>
            ${fullyReported ? html`<summary>Báo thêm một khoản chuyển khác</summary>` : ''}
            <form novalidate data-pay>${formAlert()}${renderFields(fields)}
              <button type="submit" class="btn btn-primary w-100 mt-3">Báo đã chuyển khoản</button>
            </form>
          </details>
        </section>` : ''}
        ${!canPay && inv.status === 'issued' ? html`<section class="cu-card cu-paid"><span class="cu-due-icon">${icon('check2-circle')}</span><h2>Đã thanh toán đủ</h2></section>` : ''}
        ${confirmed.length ? html`<section class="cu-card"><h2>Đã ghi nhận</h2><ul class="cu-paylist">${confirmed.map((a) => html`<li>
          <span>${a.source === 'deposit_offset' ? 'Bù trừ từ tiền cọc' : `Phiếu thu ${a.payment?.code || ''}`}<small>${formatDateTime(a.allocatedAt)}${a.reversedAmount ? `, đã đảo ${formatVnd(a.reversedAmount)}` : ''}</small></span>
          <strong>${formatVnd(a.amount - a.reversedAmount)}</strong></li>`)}</ul></section>` : ''}
      </aside>
    </div>`);

  const onClick = async (event) => {
    if (event.target.closest('[data-print]')) window.print();
    const copy = event.target.closest('[data-copy]');
    if (copy) {
      try {
        await navigator.clipboard.writeText(copy.dataset.copy);
        toast(`Đã sao chép ${copy.dataset.copy}`);
      } catch {
        toast('Trình duyệt chưa cho phép sao chép', 'error');
      }
    }
  };
  root.addEventListener('click', onClick);
  ctx.onCleanup(() => root.removeEventListener('click', onClick));

  const form = root.querySelector('[data-pay]');
  if (!form) return;
  ctx.onCleanup(await enhance(form));
  const { createUploader } = await import('../../../components/uploader.js');
  if (ctx.signal.aborted) return;
  const uploader = createUploader(form.querySelector('#pay-proof'), { accept: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'], purpose: 'payment_proof' });
  ctx.onCleanup(() => uploader.destroy());
  const binding = bindForm(form, {
    fields, guardDirty: false, submittingLabel: 'Đang gửi…',
    transform: (v) => ({ ...v, invoiceIds: [inv.id], fileIds: uploader.fileIds }),
    validate: (v) => {
      if (v.receivedAt && v.receivedAt > new Date().toISOString()) return { receivedAt: ['Thời điểm chuyển không được ở tương lai.'] };
      if (uploader.busy) return { notes: ['Đợi tải ảnh biên lai xong.'] };
      return null;
    },
    onSubmit: async (v, { idempotencyKey }) => {
      const result = await portalApi.reportPayment(v, idempotencyKey);
      toast(`Đã gửi ${result.code}, chờ quản lý xác nhận`);
      ctx.refresh();
    },
  });
  ctx.onCleanup(() => binding.destroy());
}
