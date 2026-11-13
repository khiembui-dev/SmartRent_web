// Trạng thái cuối đọc từ server sau đối soát. Không tin redirect hay nút "đã chuyển tiền".
import { badge } from '../../../components/badges.js';
import { toast } from '../../../components/dialogs.js';
import { errorState, icon, link, loadingBlock, note } from '../../../components/ui.js';
import { portalApi } from '../../../services/api.js';
import { formatDate, formatDateTime, monthLabel } from '../../../utils/date.js';
import { formatNumber, formatVnd } from '../../../utils/money.js';
import { html, setHtml } from '../../../utils/html.js';
import { periodText } from '../../admin/invoice-view.js';
import { pageHead, paymentBadge } from '../common.js';

function lineDetail(line, inv) {
  const segments = (inv.meterSegments || []).filter((s) => s.lineId === line.id);
  if (segments.length) return segments.map((s) => `Dùng ${formatNumber(s.endValue - s.startValue)} ${line.unit} × ${formatVnd(line.unitPrice)}`).join('; ');
  return `${formatNumber(line.quantity)} ${line.unit} × ${formatVnd(line.unitPrice)}`;
}
function receipt(inv) {
  return html`<article class="cu-receipt">
    <header class="cu-receipt-head"><div><span class="cu-receipt-from">${inv.property.name}</span>
      <h2>${inv.period ? `Hóa đơn ${monthLabel(inv.period.monthStart).toLowerCase()}` : 'Chi tiết khoản thu'}</h2>
      <small>${inv.code} · ${periodText(inv)}</small></div><span class="sr-plate sr-plate-lg">${inv.room.code}</span></header>
    <ul class="cu-receipt-lines">${inv.lines.map((l) => html`<li class="${l.sign < 0 ? 'is-minus' : ''}"><span><strong>${l.description}</strong><small>${lineDetail(l, inv)}</small></span><span>${formatVnd(l.amount)}</span></li>`)}</ul>
    <dl class="cu-receipt-sum"><div><dt>Tổng phải thu</dt><dd>${formatVnd(inv.status === 'void' ? inv.totalAmount : inv.receivableAmount)}</dd></div>
      <div class="is-paid"><dt>Đã thanh toán</dt><dd>${formatVnd(inv.paidAmount)}</dd></div></dl>
    <div class="cu-receipt-total ${inv.outstandingAmount > 0 ? 'is-due' : ''}"><span>Còn phải đóng</span><strong>${formatVnd(inv.outstandingAmount)}</strong></div>
    <footer class="cu-receipt-foot"><span>Phát hành ${formatDate(inv.issuedOn)}</span><span>Hạn ${formatDate(inv.dueOn)}</span></footer>
    ${inv.notes ? html`<p class="cu-receipt-note">${inv.notes}</p>` : ''}
  </article>`;
}
function copyField(label, value, displayValue = value) {
  return html`<div><dt>${label}</dt><dd><span>${displayValue}</span><button type="button" class="cu-copy" data-copy="${value}" aria-label="Sao chép ${label}">${icon('copy')}</button></dd></div>`;
}
function paymentPanel(inv, state, busy) {
  if (inv.status !== 'issued') return html`<section class="cu-card"><h2>Không cần thanh toán</h2><p>Hóa đơn này không còn được thu tiền.</p></section>`;
  if (inv.outstandingAmount <= 0) return html`<section class="cu-card cu-auto-success" aria-live="polite"><span>${icon('check2-circle')}</span><h2>Thanh toán thành công</h2><p>Khoản thanh toán đã được ghi nhận. Hóa đơn đã chuyển sang trạng thái đã thanh toán.</p><a class="btn btn-primary" href="${link(`/invoices/${inv.id}`)}">Xem hóa đơn</a><p class="mt-3 mb-0"><a href="${link('/invoices')}">Tất cả hóa đơn →</a></p></section>`;
  const pending = (inv.pendingPayments || []).reduce((s, p) => s + p.amount, 0);
  if (state?.review || state?.pendingManual || pending > 0) return html`<section class="cu-card"><h2>Đang đối chiếu khoản chuyển</h2><p>Đã có khoản cần chủ trọ kiểm tra${pending ? ` (${formatVnd(pending)})` : ''}. Chưa chuyển thêm tiền để tránh thanh toán trùng.</p><p class="cu-fine">Trang sẽ cập nhật khi khoản thu được xác nhận.</p><a href="${link('/contact')}">Liên hệ chủ trọ →</a></section>`;
  if (!state?.available) return html`<section class="cu-card"><h2>Thanh toán chuyển khoản</h2><p>Thanh toán tự động hiện chưa sẵn sàng. Vui lòng liên hệ chủ trọ để được hướng dẫn.</p><a href="${link('/contact')}" class="btn btn-outline-primary">Liên hệ chủ trọ</a></section>`;
  const qr = state.request;
  return html`<section class="cu-card cu-auto-pay"><div class="cu-auto-pay-title"><span>${icon('qr-code')}</span><div><h2>Thanh toán qua ngân hàng</h2></div></div>
    ${qr ? html`<div class="cu-qr-frame"><img src="${qr.qrUrl}" alt="Mã QR chuyển khoản hóa đơn ${inv.code}" width="256" height="256" referrerpolicy="no-referrer"></div>
      <p class="cu-qr-help">Mở ứng dụng ngân hàng và quét mã QR</p><dl class="cu-payment-bank">
        <div><dt>Ngân hàng</dt><dd>${qr.bankCode}</dd></div>${copyField('Số tài khoản', qr.accountNumber)}
        <div><dt>Người nhận</dt><dd>${qr.accountName}</dd></div>${copyField('Số tiền', String(qr.amount), formatVnd(qr.amount))}${copyField('Nội dung', qr.content)}</dl>
      <a class="btn btn-outline-primary w-100" href="${qr.payUrl}" target="_blank" rel="noopener noreferrer">Thanh toán trên ApiPay ${icon('box-arrow-up-right')}</a>
      <div class="cu-auto-wait" role="status"><span class="cu-payment-dot"></span>Đang chờ ngân hàng xác nhận</div>
      <p class="cu-fine">Giữ nguyên số tiền và nội dung chuyển khoản. Nếu đã chuyển, hãy đợi xác nhận và không chuyển lần nữa.</p>
      <small class="cu-fine">QR có hiệu lực đến ${formatDateTime(qr.expiresAt)}.</small>`
      : html`<div class="cu-qr-placeholder">${icon('qr-code-scan')}<p>Tạo mã QR riêng cho hóa đơn</p><strong>${formatVnd(inv.outstandingAmount)}</strong></div>
        <button type="button" data-create-payment class="btn btn-primary w-100" ${busy || state.creating ? 'disabled' : ''}>${busy || state.creating ? 'Đang chuẩn bị mã QR…' : 'Tạo mã QR thanh toán'}</button>
        <p class="cu-fine mt-3">Sau khi ngân hàng nhận tiền, hóa đơn tự chuyển sang đã thanh toán. Không cần gửi ảnh biên lai.</p>`}
  </section>`;
}

function invoiceActions(inv, state) {
  if (inv.status !== 'issued') return html`<section class="cu-card"><h2>Hóa đơn đã hủy</h2><p>Hóa đơn này không còn phải thanh toán.</p></section>`;
  if (inv.outstandingAmount <= 0) return html`<section class="cu-card cu-auto-success"><span>${icon('check2-circle')}</span><h2>Đã thanh toán đủ</h2><p>Các khoản thanh toán đã được ghi nhận trong lịch sử hóa đơn.</p></section>`;
  const reviewing = state?.review || state?.pendingManual || (inv.pendingPayments || []).length > 0;
  return html`<section class="cu-card cu-invoice-pay-action"><span class="cu-payment-action-icon">${icon('wallet2')}</span><h2>Thanh toán hóa đơn</h2>
    <p>${reviewing ? 'Đã có khoản chuyển đang được đối chiếu. Mở trang thanh toán để theo dõi trạng thái.' : 'Mở trang thanh toán để xem mã QR và thông tin chuyển khoản của hóa đơn này.'}</p>
    <div class="cu-action-amount"><span>Còn phải thanh toán</span><strong>${formatVnd(inv.outstandingAmount)}</strong></div>
    <a class="btn btn-primary w-100" data-pay-invoice href="${link(`/invoices/${inv.id}/pay`)}">${reviewing ? 'Xem trạng thái thanh toán' : 'Thanh toán'} ${icon('arrow-right')}</a>
    <p class="cu-fine mt-3 mb-0">Hóa đơn tự cập nhật sau khi ngân hàng xác nhận khoản chuyển đúng số tiền và nội dung.</p></section>`;
}

function checkoutSummary(inv) {
  return html`<section class="cu-card cu-checkout-summary"><h2>Thông tin thanh toán</h2><dl>
    <div><dt>Hóa đơn</dt><dd>${inv.code}</dd></div><div><dt>Khách thuê</dt><dd>${inv.representative.fullName}</dd></div>
    <div><dt>Phòng</dt><dd>${inv.room.code} · ${inv.property.name}</dd></div>
    <div><dt>Kỳ thu</dt><dd>${periodText(inv)}</dd></div><div><dt>Hạn thanh toán</dt><dd>${formatDate(inv.dueOn)}</dd></div>
    <div><dt>Tổng hóa đơn</dt><dd>${formatVnd(inv.receivableAmount)}</dd></div><div><dt>Đã thanh toán</dt><dd>${formatVnd(inv.paidAmount)}</dd></div>
    <div class="is-total"><dt>Còn phải trả</dt><dd>${formatVnd(inv.outstandingAmount)}</dd></div></dl>
    <a href="${link(`/invoices/${inv.id}`)}">Xem chi tiết hóa đơn ${icon('arrow-right')}</a></section>
    <section class="cu-card cu-payment-how"><h2>Thanh toán trong 3 bước</h2><ol class="cu-payment-steps"><li>Mở ứng dụng ngân hàng và quét QR</li><li>Kiểm tra người nhận, số tiền và nội dung</li><li>Chuyển khoản và đợi xác nhận tự động</li></ol><p class="cu-fine mb-0">Nếu đã chuyển tiền, không chuyển lại. Hệ thống sẽ cập nhật khi nhận được xác nhận của ngân hàng.</p></section>`;
}

function history(inv) {
  return html`<section class="cu-card mt-3"><h2>Lịch sử thanh toán</h2>${inv.allocations.length ? html`<ul class="cu-paylist">${inv.allocations.filter(a => !a.reversesId).map(a => html`<li><span>${a.source === 'deposit_offset' ? 'Bù trừ tiền cọc' : `Phiếu thu ${a.payment?.code || ''}`}<small>${formatDateTime(a.allocatedAt)}${a.reversedAmount ? ` · Đã hoàn tác ${formatVnd(a.reversedAmount)}` : ''}</small></span><strong>${formatVnd(a.amount - a.reversedAmount)}</strong></li>`)}</ul>` : html`<p class="cu-fine mb-0">Chưa có khoản thanh toán được ghi nhận.</p>`}</section>`;
}

export default async function InvoicePage(ctx, { paymentPage = false } = {}) {
  setHtml(ctx.outlet, html`<div class="cu-page cu-invoice-auto ${paymentPage ? 'cu-payment-page' : ''}" data-root>${loadingBlock(8)}</div>`);
  const root = ctx.outlet.querySelector('[data-root]');
  let inv; let state; let busy = false; let fetching = false; let timer; let error = ''; let rendered = ''; let generation = 0;
  let autoAttempted = false; let paymentError = '';
  const options = { signal: ctx.signal };
  function render() {
    const snapshot = JSON.stringify({ inv, state, busy, error, paymentError });
    if (snapshot === rendered || ctx.signal.aborted) return;
    rendered = snapshot; // Poll không thay DOM/focus khi không có dữ liệu mới.
    const paid = inv.status === 'issued' && inv.outstandingAmount <= 0;
    setHtml(root, html`${pageHead({ title: paymentPage ? 'Thanh toán hóa đơn' : `Hóa đơn ${inv.code}`,
      subtitle: paymentPage ? `Hóa đơn ${inv.code} · Phòng ${inv.room.code}` : null,
      back: paymentPage ? { href: `/invoices/${inv.id}`, label: 'Quay lại hóa đơn' } : { href: '/invoices', label: 'Tất cả hóa đơn' },
      actions: paymentPage ? '' : html`<button class="btn btn-outline-secondary btn-sm" type="button" data-print>${icon('printer')} In hóa đơn</button>` })}
      ${paymentPage ? html`<ol class="cu-checkout-progress" aria-label="Tiến trình thanh toán"><li><span>1</span>Hóa đơn</li><li class="${paid ? '' : 'is-current'}"><span>2</span>Thanh toán</li><li class="${paid ? 'is-current' : ''}"><span>3</span>Hoàn tất</li></ol>` : ''}
      <section class="cu-payment-overview ${paid ? 'is-paid' : ''}"><div><div class="cu-invoice-status">${inv.status === 'issued' ? paymentBadge(inv.paymentStatus) : badge('invoiceStatus', inv.status)}</div>
        <p>${paid ? 'Hóa đơn đã được thanh toán đủ' : 'Số tiền còn phải thanh toán'}</p><strong>${formatVnd(inv.outstandingAmount)}</strong></div>
        <div class="cu-payment-meta"><span>Phòng <b>${inv.room.code}</b></span><span>${inv.representative.fullName}</span><span class="${inv.isOverdue && !paid ? 'text-danger' : ''}">Hạn thanh toán ${formatDate(inv.dueOn)}</span></div></section>
      ${inv.status === 'void' ? note(html`Hóa đơn đã hủy. ${inv.voidReason || ''}`, { tone: 'warn' }) : ''}
      <div class="cu-payment-sync sr-no-print"><span role="status" aria-live="polite">${error || (paid ? 'Đã cập nhật số dư từ hệ thống.' : 'Trạng thái được tự động kiểm tra khi mở trang này.')}</span><button type="button" class="btn btn-link btn-sm" data-refresh>Kiểm tra lại</button></div>
      ${paymentPage ? html`<div class="cu-checkout-layout"><div>
        ${paymentError ? html`<div class="mb-3" role="alert">${note(paymentError, { tone: 'warn' })}</div>` : ''}
        ${paymentPanel(inv, state, busy)}${paid ? history(inv) : ''}</div><aside>${checkoutSummary(inv)}</aside></div>`
        : html`<div class="cu-invoice-layout"><div class="cu-invoice-paper">${receipt(inv)}${history(inv)}</div><aside class="cu-invoice-side sr-no-print">${invoiceActions(inv, state)}</aside></div>`}`);
  }
  async function refresh() {
    if (fetching || busy || ctx.signal.aborted || document.hidden) return;
    clearTimeout(timer); fetching = true;
    const requestedGeneration = generation;
    let recheckSoon = false;
    try {
      const [invoiceResult, paymentResult] = await Promise.allSettled([
        portalApi.invoice(ctx.params.id, options), portalApi.paymentRequest(ctx.params.id, options),
      ]);
      if (requestedGeneration !== generation) return;
      if (invoiceResult.status !== 'fulfilled') throw invoiceResult.reason;
      inv = invoiceResult.value;
      state = paymentResult.status === 'fulfilled' ? paymentResult.value : null;
      error = paymentResult.status === 'fulfilled' ? '' : 'Chưa tải được trạng thái thanh toán. Hãy kiểm tra lại trước khi chuyển tiền.';
      // Hai GET có thể nằm hai phía của một webhook. Chờ lần đọc kế tiếp thay vì hiện QR khác số dư.
      if (state && state.outstandingAmount !== inv.outstandingAmount) {
        state = null; recheckSoon = true; error = 'Số dư vừa thay đổi. Đang cập nhật thông tin thanh toán mới nhất.';
      }
      if (state?.request || inv.outstandingAmount <= 0) paymentError = '';
      ctx.setTitle(`${paymentPage ? 'Thanh toán' : 'Hóa đơn'} ${inv.code}`); render();
    } catch (e) {
      if (ctx.signal.aborted || e?.isAborted || requestedGeneration !== generation) return;
      if (!inv) setHtml(root, html`${errorState(e)}<a href="${link('/invoices')}">Về danh sách hóa đơn</a>`);
      else { state = null; error = 'Mất kết nối. Chưa xác định được thanh toán mới nhất; không chuyển lại nếu đã chuyển tiền.'; render(); }
    } finally {
      fetching = false;
      if (!ctx.signal.aborted && (!inv || (inv.status === 'issued' && inv.outstandingAmount > 0)))
        timer = setTimeout(refresh, recheckSoon ? 1000 : state?.available ? 5000 : 30000);
    }
    // Chỉ trang thanh toán mới tạo QR. Tự tạo tối đa một lần mỗi lượt vào trang; poll chỉ GET.
    if (paymentPage && state?.available && !autoAttempted && !ctx.signal.aborted) {
      autoAttempted = true;
      if (inv.status === 'issued' && inv.outstandingAmount > 0 && !state.request && !state.creating &&
          !state.review && !state.pendingManual && !(inv.pendingPayments || []).length) await createPayment();
    }
  }
  async function createPayment() {
    if (!paymentPage || busy || ctx.signal.aborted) return;
    generation++; autoAttempted = true; busy = true; paymentError = ''; clearTimeout(timer); render();
    try {
      state = await portalApi.createPaymentRequest(inv.id, options);
      if (state.outstandingAmount !== inv.outstandingAmount) state = null;
    } catch (e) {
      if (!ctx.signal.aborted) paymentError = e.detail || e.message || 'Chưa tạo được mã QR. Vui lòng thử lại.';
    } finally {
      busy = false; render();
      if (!ctx.signal.aborted) timer = setTimeout(refresh, 5000);
    }
  }
  async function onClick(event) {
    if (event.target.closest('[data-print]')) window.print();
    if (event.target.closest('[data-refresh]')) await refresh();
    const copy = event.target.closest('[data-copy]');
    if (copy) { try { await navigator.clipboard.writeText(copy.dataset.copy); toast('Đã sao chép'); } catch { toast('Chưa thể sao chép. Vui lòng sao chép thủ công.', 'error'); } }
    if (event.target.closest('[data-create-payment]') && !busy) {
      await createPayment();
    }
  }
  const visible = () => { if (!document.hidden) refresh(); else clearTimeout(timer); };
  root.addEventListener('click', onClick); document.addEventListener('visibilitychange', visible);
  ctx.onCleanup(() => { clearTimeout(timer); root.removeEventListener('click', onClick); document.removeEventListener('visibilitychange', visible); });
  await refresh();
}
