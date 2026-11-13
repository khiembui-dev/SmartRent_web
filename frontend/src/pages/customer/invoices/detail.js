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
function copyField(label, value) {
  return html`<div><dt>${label}</dt><dd><span>${value}</span><button type="button" class="cu-copy" data-copy="${value}" aria-label="Sao chép ${label}">${icon('copy')}</button></dd></div>`;
}
function paymentPanel(inv, state, busy) {
  if (inv.status !== 'issued') return html`<section class="cu-card"><h2>Không cần thanh toán</h2><p>Hóa đơn này không còn được thu tiền.</p></section>`;
  if (inv.outstandingAmount <= 0) return html`<section class="cu-card cu-auto-success" aria-live="polite"><span>${icon('check2-circle')}</span><h2>Đã thanh toán</h2><p>Khoản thanh toán đã được ghi nhận. Anh/chị có thể xem lịch sử bên dưới hoặc in hóa đơn.</p><a href="${link('/invoices')}">Về danh sách hóa đơn →</a></section>`;
  const pending = (inv.pendingPayments || []).reduce((s, p) => s + p.amount, 0);
  if (state?.review || state?.pendingManual || pending > 0) return html`<section class="cu-card"><h2>Đang đối chiếu khoản chuyển</h2><p>Đã có khoản cần chủ trọ kiểm tra${pending ? ` (${formatVnd(pending)})` : ''}. Chưa chuyển thêm tiền để tránh thanh toán trùng.</p><p class="cu-fine">Trang sẽ cập nhật khi khoản thu được xác nhận.</p><a href="${link('/contact')}">Liên hệ chủ trọ →</a></section>`;
  if (!state?.available) return html`<section class="cu-card"><h2>Thanh toán chuyển khoản</h2><p>Thanh toán tự động hiện chưa sẵn sàng. Vui lòng liên hệ chủ trọ để được hướng dẫn.</p><a href="${link('/contact')}" class="btn btn-outline-primary">Liên hệ chủ trọ</a></section>`;
  const qr = state.request;
  return html`<section class="cu-card cu-auto-pay"><div class="cu-auto-pay-title"><span>${icon('qr-code')}</span><div><h2>Thanh toán qua ngân hàng</h2><p>Xác nhận tự động qua ApiPay</p></div></div>
    ${qr ? html`<div class="cu-qr-frame"><img src="${qr.qrUrl}" alt="Mã QR chuyển khoản hóa đơn ${inv.code}" width="256" height="256" referrerpolicy="no-referrer"></div>
      <p class="cu-qr-help">Mở ứng dụng ngân hàng và quét mã QR</p><dl class="cu-payment-bank">
        <div><dt>Ngân hàng</dt><dd>${qr.bankCode}</dd></div>${copyField('Số tài khoản', qr.accountNumber)}
        <div><dt>Người nhận</dt><dd>${qr.accountName}</dd></div>${copyField('Số tiền', String(qr.amount))}${copyField('Nội dung', qr.content)}</dl>
      <a class="btn btn-primary w-100" href="${qr.payUrl}" target="_blank" rel="noopener noreferrer">Mở trang thanh toán ApiPay ${icon('box-arrow-up-right')}</a>
      <div class="cu-auto-wait" role="status"><span class="cu-payment-dot"></span>Đang chờ ngân hàng xác nhận</div>
      <p class="cu-fine">Giữ nguyên số tiền và nội dung chuyển khoản. Nếu đã chuyển, hãy đợi xác nhận và không chuyển lần nữa.</p>
      <small class="cu-fine">QR có hiệu lực đến ${formatDateTime(qr.expiresAt)}.</small>`
      : html`<div class="cu-qr-placeholder">${icon('qr-code-scan')}<p>Tạo mã QR riêng cho hóa đơn</p><strong>${formatVnd(inv.outstandingAmount)}</strong></div>
        <button type="button" data-create-payment class="btn btn-primary w-100" ${busy || state.creating ? 'disabled' : ''}>${busy || state.creating ? 'Đang tạo mã QR…' : 'Tạo mã QR thanh toán'}</button>
        <p class="cu-fine mt-3">Sau khi ngân hàng nhận tiền, hóa đơn tự chuyển sang đã thanh toán. Không cần gửi ảnh biên lai.</p>`}
  </section>`;
}

export default async function InvoiceDetailPage(ctx) {
  setHtml(ctx.outlet, html`<div class="cu-page cu-invoice-auto" data-root>${loadingBlock(8)}</div>`);
  const root = ctx.outlet.querySelector('[data-root]');
  let inv; let state; let busy = false; let fetching = false; let timer; let error = ''; let rendered = ''; let generation = 0;
  const options = { signal: ctx.signal };
  function render() {
    const snapshot = JSON.stringify({ inv, state, busy, error });
    if (snapshot === rendered || ctx.signal.aborted) return;
    rendered = snapshot; // Poll không thay DOM/focus khi không có dữ liệu mới.
    const paid = inv.status === 'issued' && inv.outstandingAmount <= 0;
    setHtml(root, html`${pageHead({ title: `Hóa đơn ${inv.code}`, back: { href: '/invoices', label: 'Tất cả hóa đơn' },
      actions: html`<button class="btn btn-outline-secondary btn-sm" type="button" data-print>${icon('printer')} In hóa đơn</button>` })}
      <section class="cu-payment-overview ${paid ? 'is-paid' : ''}"><div><div class="cu-invoice-status">${inv.status === 'issued' ? paymentBadge(inv.paymentStatus) : badge('invoiceStatus', inv.status)}</div>
        <p>${paid ? 'Hóa đơn đã được thanh toán đủ' : 'Số tiền còn phải thanh toán'}</p><strong>${formatVnd(inv.outstandingAmount)}</strong></div>
        <div class="cu-payment-meta"><span>Phòng <b>${inv.room.code}</b></span><span>${inv.representative.fullName}</span><span class="${inv.isOverdue && !paid ? 'text-danger' : ''}">Hạn thanh toán ${formatDate(inv.dueOn)}</span></div></section>
      ${inv.status === 'void' ? note(html`Hóa đơn đã hủy. ${inv.voidReason || ''}`, { tone: 'warn' }) : ''}
      <div class="cu-payment-sync sr-no-print"><span role="status" aria-live="polite">${error || (paid ? 'Đã cập nhật số dư từ hệ thống.' : 'Trạng thái được tự động kiểm tra khi mở trang này.')}</span><button type="button" class="btn btn-link btn-sm" data-refresh>Kiểm tra lại</button></div>
      <div class="cu-invoice-layout"><div class="cu-invoice-paper">${receipt(inv)}
        <section class="cu-card mt-3"><h2>Lịch sử thanh toán</h2>${inv.allocations.length ? html`<ul class="cu-paylist">${inv.allocations.filter(a => !a.reversesId).map(a => html`<li><span>${a.source === 'deposit_offset' ? 'Bù trừ tiền cọc' : `Phiếu thu ${a.payment?.code || ''}`}<small>${formatDateTime(a.allocatedAt)}${a.reversedAmount ? ` · Đã hoàn tác ${formatVnd(a.reversedAmount)}` : ''}</small></span><strong>${formatVnd(a.amount - a.reversedAmount)}</strong></li>`)}</ul>` : html`<p class="cu-fine mb-0">Chưa có khoản thanh toán được ghi nhận.</p>`}</section>
      </div><aside class="cu-invoice-side sr-no-print">${paymentPanel(inv, state, busy)}<ol class="cu-payment-steps"><li>Tạo mã QR cho hóa đơn</li><li>Quét mã và chuyển khoản đúng nội dung</li><li>Ngân hàng xác nhận, hóa đơn tự cập nhật</li></ol></aside></div>`);
  }
  async function refresh() {
    if (fetching || busy || ctx.signal.aborted || document.hidden) return;
    clearTimeout(timer); fetching = true;
    const requestedGeneration = generation;
    try {
      const [invoiceResult, paymentResult] = await Promise.allSettled([
        portalApi.invoice(ctx.params.id, options), portalApi.paymentRequest(ctx.params.id, options),
      ]);
      if (requestedGeneration !== generation) return;
      if (invoiceResult.status !== 'fulfilled') throw invoiceResult.reason;
      inv = invoiceResult.value;
      state = paymentResult.status === 'fulfilled' ? paymentResult.value : null;
      error = paymentResult.status === 'fulfilled' ? '' : 'Chưa tải được trạng thái thanh toán. Hãy kiểm tra lại trước khi chuyển tiền.';
      ctx.setTitle(`Hóa đơn ${inv.code}`); render();
    } catch (e) {
      if (ctx.signal.aborted || e?.isAborted || requestedGeneration !== generation) return;
      if (!inv) setHtml(root, html`${errorState(e)}<a href="${link('/invoices')}">Về danh sách hóa đơn</a>`);
      else { state = null; error = 'Mất kết nối. Chưa xác định được thanh toán mới nhất; không chuyển lại nếu đã chuyển tiền.'; render(); }
    } finally {
      fetching = false;
      if (!ctx.signal.aborted && (!inv || (inv.status === 'issued' && inv.outstandingAmount > 0)))
        timer = setTimeout(refresh, state?.available ? 5000 : 30000);
    }
  }
  async function onClick(event) {
    if (event.target.closest('[data-print]')) window.print();
    if (event.target.closest('[data-refresh]')) await refresh();
    const copy = event.target.closest('[data-copy]');
    if (copy) { try { await navigator.clipboard.writeText(copy.dataset.copy); toast('Đã sao chép'); } catch { toast('Chưa thể sao chép. Vui lòng sao chép thủ công.', 'error'); } }
    if (event.target.closest('[data-create-payment]') && !busy) {
      generation++; busy = true; error = ''; render();
      try { state = await portalApi.createPaymentRequest(inv.id, options); }
      catch (e) { if (!ctx.signal.aborted) error = e.detail || e.message || 'Chưa tạo được mã QR. Vui lòng thử lại.'; }
      finally { busy = false; render(); clearTimeout(timer); if (!ctx.signal.aborted) timer = setTimeout(refresh, 5000); }
    }
  }
  const visible = () => { if (!document.hidden) refresh(); else clearTimeout(timer); };
  root.addEventListener('click', onClick); document.addEventListener('visibilitychange', visible);
  ctx.onCleanup(() => { clearTimeout(timer); root.removeEventListener('click', onClick); document.removeEventListener('visibilitychange', visible); });
  await refresh();
}
