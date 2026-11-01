// Phần thân hóa đơn dùng chung cho quản trị và cổng khách (bảng khoản thu, đoạn chỉ số, tổng, thanh tách tiền).
import { badge, SCOPE_LABELS } from '../../components/badges.js';
import { addDays, formatDate, monthLabel } from '../../utils/date.js';
import { formatNumber, formatVnd } from '../../utils/money.js';
import { html } from '../../utils/html.js';

export function invoiceLinesTable(inv, { showSource = true } = {}) {
  return html`<div class="table-responsive"><table class="sr-lines">
    <thead><tr><th>#</th><th>Khoản thu</th><th class="text-end">Lượng</th><th class="text-end">Đơn giá</th><th class="text-end">Tỷ lệ ngày</th><th class="text-end">Thành tiền</th></tr></thead>
    <tbody>${inv.lines.map((l) => {
    const segs = inv.meterSegments.filter((s) => s.lineId === l.id);
    return html`<tr class="${l.sign < 0 ? 'is-discount' : ''}">
      <td class="text-muted-sr">${l.lineNo}</td>
      <td>${l.description}${l.isOneTime ? html` <span class="sr-badge tone-info no-dot">Một lần</span>` : ''}
        ${showSource ? html`<span class="sr-line-source">${SCOPE_LABELS[l.sourceScope] || ''}${l.unitPrice === 0 ? ', giá 0 hợp lệ' : ''}</span>` : ''}
        ${segs.length ? html`<span class="sr-line-source">${segs.map((s) => `Công tơ ${s.serialNumber}: ${formatNumber(s.startValue, 3)} → ${formatNumber(s.endValue, 3)}`).join('; ')}</span>` : ''}</td>
      <td class="text-end num">${formatNumber(l.quantity, 3)} ${l.unit}</td>
      <td class="text-end num">${formatVnd(l.unitPrice)}</td>
      <td class="text-end num">${l.prorationDenominator > 1 ? `${l.prorationNumerator}/${l.prorationDenominator} ngày` : '—'}</td>
      <td class="text-end num">${formatVnd(l.amount)}</td></tr>`;
  })}</tbody>
    <tfoot>
      <tr><td colspan="5">Tổng mặt chứng từ</td><td class="text-end num">${formatVnd(inv.totalAmount)}</td></tr>
      ${inv.adjustmentAmount ? html`<tr><td colspan="5">Điều chỉnh đã phát hành</td><td class="text-end num">${formatVnd(inv.adjustmentAmount, { signed: true })}</td></tr>` : ''}
      ${inv.status === 'issued' && inv.paymentStatus ? html`<tr><td colspan="5">Phải thu sau điều chỉnh</td><td class="text-end num">${formatVnd(inv.receivableAmount)}</td></tr>
      <tr><td colspan="5">Đã thu (phân bổ tiền và bù trừ cọc đã xác nhận)</td><td class="text-end num text-success">${formatVnd(inv.paidAmount)}</td></tr>
      <tr class="is-total"><td colspan="5">Còn phải thu</td><td class="text-end num ${inv.outstandingAmount ? 'text-danger' : ''}">${formatVnd(inv.outstandingAmount)}</td></tr>` : ''}
    </tfoot></table></div>`;
}

export function moneySplit(inv) {
  if (!(inv.status === 'issued' && inv.receivableAmount > 0)) return '';
  const pending = (inv.pendingPayments || []).reduce((s, p) => s + p.amount, 0);
  const pct = (v) => `${Math.max(0, Math.min(100, (v / inv.receivableAmount) * 100))}%`;
  return html`<div class="sr-split mt-2" role="img" aria-label="Đã thu ${formatVnd(inv.paidAmount)}, còn nợ ${formatVnd(inv.outstandingAmount)}">
    <span class="is-paid" style="width:${pct(inv.paidAmount)}"></span><span class="is-pending" style="width:${pct(Math.min(pending, inv.outstandingAmount))}"></span><span class="is-due" style="width:${pct(Math.max(0, inv.outstandingAmount - pending))}"></span></div>
    <div class="d-flex flex-wrap gap-3 small text-muted-sr mt-1"><span>Đã thu ${formatVnd(inv.paidAmount)}</span>${pending ? html`<span>Chờ xác minh ${formatVnd(pending)} (chưa tính)</span>` : ''}<span>Còn nợ ${formatVnd(inv.outstandingAmount)}</span></div>`;
}

export function invoiceTitle(inv) {
  return inv.period ? `Hóa đơn ${monthLabel(inv.period.monthStart).toLowerCase()}` : badge('invoiceKind', inv.kind);
}

export function periodText(inv) {
  return `${formatDate(inv.serviceFrom)} – ${formatDate(addDays(inv.serviceTo, -1))}`;
}
