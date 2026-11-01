// Chi tiết hóa đơn: bản in cho khách và khu xử lý thanh toán thủ công.
// Trạng thái không sửa tay: thanh toán tạo khoản thu đã xác nhận, hoàn tác tạo dòng đảo, hủy cần lý do. Chỗ này sau sẽ nối API ngân hàng để tự duyệt.
import { invoiceBadges } from '../../components/admin-kit.js';
import { confirmDialog, reasonDialog, runAction, toast } from '../../components/dialogs.js';
import { formModal } from '../../components/modal.js';
import { errorState, icon, link, loadingBlock, note, pageHeader, plate, simulated } from '../../components/ui.js';
import { METHOD_LABELS } from '../../components/badges.js';
import { invoicesApi, paymentsApi } from '../../services/api.js';
import { session } from '../../services/session.js';
import { downloadText, rowsToCsv } from '../../utils/csv.js';
import { formatDate, formatDateTime, monthLabel } from '../../utils/date.js';
import { uuid } from '../../utils/ids.js';
import { formatVnd } from '../../utils/money.js';
import { html, setHtml } from '../../utils/html.js';
import { bindActions, dataChanged } from './common.js';
import { invoiceLinesTable, periodText } from './invoice-view.js';

const STATUS_TEXT = (inv) => (inv.status === 'draft' ? 'Nháp' : inv.status === 'void' ? 'Đã hủy' : { unpaid: 'Chưa thanh toán', partial: 'Thanh toán một phần', paid: 'Đã thanh toán' }[inv.paymentStatus] || '');

function exportCsv(inv) {
  const issued = inv.status === 'issued';
  const rows = [
    ['Hóa đơn', inv.code || 'Nháp'],
    ['Khách thuê', inv.representative.fullName],
    ['Phòng', inv.room.code],
    ['Cơ sở', inv.room.propertyName],
    ['Chu kỳ', inv.period ? monthLabel(inv.period.monthStart) : periodText(inv)],
    ['Ngày lập', inv.issuedOn ? formatDate(inv.issuedOn) : ''],
    ['Hạn thanh toán', inv.dueOn ? formatDate(inv.dueOn) : ''],
    ['Trạng thái', STATUS_TEXT(inv)],
    [],
    ['Khoản thu', 'Số lượng', 'Đơn vị', 'Đơn giá', 'Thành tiền'],
    ...inv.lines.map((l) => [l.description, l.quantity, l.unit, l.unitPrice, l.amount]),
    [],
    ['Tổng cộng', '', '', '', inv.totalAmount],
    ...(issued ? [['Đã thu', '', '', '', inv.paidAmount], ['Còn lại', '', '', '', inv.outstandingAmount]] : []),
  ];
  downloadText(rowsToCsv(rows), `hoa-don-${inv.code || `nhap-phong-${inv.room.code}`}.csv`);
  toast('Đã xuất file hóa đơn');
}

export default async function InvoiceDetailPage(ctx) {
  const id = ctx.params.id;
  let inv;

  const render = async () => {
    setHtml(ctx.outlet, loadingBlock(10));
    try {
      inv = await invoicesApi.get(id);
    } catch (error) {
      setHtml(ctx.outlet, errorState(error));
      return;
    }
    ctx.setTitle(`Hóa đơn ${inv.code || 'nháp'}`);
    const issued = inv.status === 'issued';
    const hasBalance = issued && inv.outstandingAmount > 0;
    const applied = inv.allocations.filter((a) => a.kind === 'apply');
    const canCollect = session.can('payments.confirm') && session.can('payments.allocate');
    const canUndo = session.can('payments.allocate') && session.can('payments.reverse');
    setHtml(ctx.outlet, html`${pageHeader({
      title: `Hóa đơn ${inv.code || 'nháp'}`,
      titleExtra: invoiceBadges(inv),
      subtitle: html`${inv.representative.fullName}, phòng ${inv.room.code}`,
      breadcrumbs: [{ label: 'Hóa đơn', href: '/admin/invoices' }, { label: inv.code || 'Nháp' }],
      actions: html`<button type="button" class="btn btn-outline-secondary btn-sm" data-action="print">${icon('printer')} In hóa đơn</button>
        <button type="button" class="btn btn-outline-secondary btn-sm" data-action="export">${icon('download')} Xuất file</button>`,
    })}
    <div class="ad-invoice">
      <article class="ad-paper">
        <header class="ad-paper-head">
          <div><p class="ad-paper-org">${session.organization.name}</p><p>${inv.room.propertyName}</p></div>
          <div class="ad-paper-title"><h2>Hóa đơn tiền phòng</h2><p class="num">${inv.code || 'Bản nháp'}</p></div>
        </header>
        <dl class="ad-paper-meta">
          <div><dt>Khách thuê</dt><dd><a href="${link(`/admin/tenants/${inv.representative.id}`)}">${inv.representative.fullName}</a></dd></div>
          <div><dt>Phòng</dt><dd>${plate(inv.room)}</dd></div>
          <div><dt>Chu kỳ</dt><dd>${inv.period ? monthLabel(inv.period.monthStart) : periodText(inv)}</dd></div>
          <div><dt>Thời gian tính</dt><dd class="num">${periodText(inv)}</dd></div>
          <div><dt>Ngày lập</dt><dd class="num">${inv.issuedOn ? formatDate(inv.issuedOn) : '—'}</dd></div>
          <div><dt>Hạn thanh toán</dt><dd class="num">${inv.dueOn ? formatDate(inv.dueOn) : '—'}</dd></div>
        </dl>
        ${invoiceLinesTable(inv, { showSource: false })}
        ${inv.notes ? html`<p class="ad-paper-note">${inv.notes}</p>` : ''}
        ${inv.voidReason ? html`<div class="mt-3">${note(`Đã hủy: ${inv.voidReason}`, { tone: 'danger' })}</div>` : ''}
        <p class="sr-print-only ad-paper-foot">Trạng thái khi in: ${STATUS_TEXT(inv)}. In lúc ${formatDateTime(new Date().toISOString())}.</p>
      </article>
      <aside class="ad-invoice-rail sr-no-print">
        <section class="sr-panel"><div class="sr-panel-head"><h2>Thanh toán</h2></div><div class="sr-panel-body">
          <ul class="ad-price-list is-plain">
            <li><span>Tổng hóa đơn</span><strong class="num">${formatVnd(inv.totalAmount)}</strong></li>
            ${issued ? html`<li><span>Đã thu</span><strong class="num">${formatVnd(inv.paidAmount)}</strong></li>
            <li class="is-total"><span>Còn lại</span><strong class="num ${inv.outstandingAmount ? 'text-danger' : ''}">${formatVnd(inv.outstandingAmount)}</strong></li>` : ''}
          </ul>
          <div class="ad-stack">
            ${hasBalance && canCollect ? html`<button type="button" class="btn btn-primary" data-action="pay" data-mode="full">${icon('check2-circle')} Đánh dấu đã thanh toán</button>
              <button type="button" class="btn btn-outline-primary" data-action="pay" data-mode="partial">Ghi nhận thanh toán một phần</button>` : ''}
            ${inv.status === 'draft' && session.can('invoices.issue') ? html`<button type="button" class="btn btn-primary" data-action="issue">Phát hành hóa đơn</button>` : ''}
            ${inv.status === 'draft' && session.can('invoices.write') ? html`<button type="button" class="btn btn-outline-danger" data-action="delete-draft">Xóa bản nháp</button>` : ''}
            ${issued && session.can('invoices.void') ? html`<button type="button" class="btn btn-outline-danger" data-action="void">Hủy hóa đơn</button>` : ''}
          </div>
          ${issued ? html`<div class="mt-3 d-flex align-items-start gap-2">${simulated('Hiện xử lý thủ công. Kết nối ngân hàng tự động chưa tích hợp.')}<span class="small text-muted-sr">Hiện xử lý thủ công. Tự động duyệt qua ngân hàng chưa kết nối.</span></div>` : ''}
        </div></section>
        ${inv.pendingPayments.length ? html`<section class="sr-panel is-callout"><div class="sr-panel-head"><h2>Khách báo đã chuyển khoản</h2></div>
          <ul class="ad-pay-list">${inv.pendingPayments.map((p) => html`<li><div><strong class="num">${formatVnd(p.amount)}</strong><small>${p.code}, ${formatDateTime(p.receivedAt)}</small></div>
            ${canCollect ? html`<div class="ad-request-actions"><button type="button" class="btn btn-outline-secondary btn-sm" data-action="reject-payment" data-id="${p.id}">Từ chối</button>
              <button type="button" class="btn btn-primary btn-sm" data-action="confirm-payment" data-id="${p.id}" data-amount="${p.amount}">Xác nhận đã nhận</button></div>` : ''}</li>`)}</ul>
          <p class="ad-rail-note">Chưa tính vào số đã thu cho tới khi xác nhận.</p></section>` : ''}
        <section class="sr-panel"><div class="sr-panel-head"><h2>Lịch sử thu tiền</h2></div>
          ${applied.length ? html`<ul class="ad-pay-list">${applied.map((a) => {
    const undone = a.reversedAmount >= a.amount;
    return html`<li class="${undone ? 'is-undone' : ''}"><div><strong class="num">${formatVnd(a.amount)}</strong>
      <small>${a.source === 'deposit_offset' ? 'Bù trừ từ tiền cọc' : METHOD_LABELS[a.payment?.methodCode] || 'Thanh toán'}, ${formatDateTime(a.allocatedAt)}${undone ? ', đã hoàn tác' : ''}</small></div>
      ${!undone && canUndo ? html`<button type="button" class="btn btn-link btn-sm p-0 text-danger" data-action="undo" data-id="${a.id}" data-amount="${a.amount - a.reversedAmount}">Hoàn tác</button>` : ''}</li>`;
  })}</ul>` : html`<p class="ad-mini-empty">Chưa có khoản thu.</p>`}
        </section>
      </aside>
    </div>`);
  };

  const refresh = async () => {
    dataChanged();
    await render();
  };

  await render();
  ctx.onCleanup(bindActions(ctx.outlet, {
    print: () => window.print(),
    export: () => exportCsv(inv),
    pay: async (btn) => {
      const full = btn.dataset.mode === 'full';
      const done = await formModal({
        title: full ? 'Đánh dấu đã thanh toán' : 'Ghi nhận thanh toán một phần', submitLabel: 'Xác nhận đã nhận tiền',
        intro: html`<p class="mb-0">Còn lại <strong class="num">${formatVnd(inv.outstandingAmount)}</strong>. Chỉ xác nhận khi đã thực nhận tiền.</p>`,
        fields: [
          { name: 'amount', label: 'Số tiền nhận', type: 'money', required: true, positive: true, default: full ? inv.outstandingAmount : undefined, max: inv.outstandingAmount },
          { name: 'methodCode', label: 'Cách thanh toán', type: 'select', placeholderOption: false, default: 'bank_transfer', col: 'col-md-6', options: [{ value: 'bank_transfer', label: 'Chuyển khoản' }, { value: 'cash', label: 'Tiền mặt' }] },
          { name: 'externalReference', label: 'Mã giao dịch', col: 'col-md-6', optional: true, help: 'Bắt buộc khi chuyển khoản.' },
          { name: 'notes', label: 'Ghi chú', optional: true },
        ],
        validate: (v) => (v.methodCode === 'bank_transfer' && !v.externalReference ? { externalReference: ['Nhập mã giao dịch ngân hàng.'] } : null),
        onSubmit: (v, meta) => paymentsApi.create({
          tenantId: inv.representative.id, amount: v.amount, receivedAt: new Date().toISOString(), methodCode: v.methodCode, externalReference: v.externalReference, notes: v.notes,
          propertyId: inv.property.id, confirmNow: true, allocations: [{ invoiceId: inv.id, amount: v.amount }],
        }, meta.idempotencyKey),
      });
      if (done) { toast('Đã ghi nhận thanh toán'); await refresh(); }
    },
    'confirm-payment': async (btn) => {
      const amount = Number(btn.dataset.amount);
      const apply = Math.min(amount, inv.outstandingAmount);
      if (!(await confirmDialog({ title: 'Xác nhận đã nhận tiền?', html: html`<p class="mb-0">Đối chiếu sao kê trước khi xác nhận. <strong>${formatVnd(apply)}</strong> sẽ được tính vào hóa đơn.</p>`, confirmText: 'Đã nhận tiền' }))) return;
      if (await runAction(() => paymentsApi.confirm(btn.dataset.id, { allocations: [{ invoiceId: inv.id, amount: apply }] }, uuid()), { success: 'Đã xác nhận thanh toán' })) await refresh();
    },
    'reject-payment': async (btn) => {
      const reason = await reasonDialog({ title: 'Từ chối báo chuyển khoản', text: 'Khách thấy lý do này trong tài khoản của mình.', label: 'Lý do từ chối', confirmText: 'Từ chối', tone: 'danger' });
      if (reason && await runAction(() => paymentsApi.reject(btn.dataset.id, reason), { success: 'Đã từ chối' })) await refresh();
    },
    undo: async (btn) => {
      const reason = await reasonDialog({ title: 'Hoàn tác khoản thu', text: 'Khoản thu được đảo, hóa đơn quay lại số còn nợ. Lịch sử vẫn giữ. Hạn thanh toán không đổi.', label: 'Lý do hoàn tác', confirmText: 'Hoàn tác', tone: 'danger' });
      if (reason && await runAction(() => paymentsApi.reverseAllocation(btn.dataset.id, { amount: Number(btn.dataset.amount), reason, reversePayment: true }, uuid()), { success: 'Đã hoàn tác khoản thu' })) await refresh();
    },
    void: async () => {
      const reason = await reasonDialog({ title: 'Hủy hóa đơn', text: 'Hóa đơn đã có khoản thu cần hoàn tác trước. Hóa đơn hủy vẫn được giữ lại trong danh sách.', label: 'Lý do hủy', confirmText: 'Hủy hóa đơn', tone: 'danger' });
      if (reason && await runAction(() => invoicesApi.void(id, reason), { success: 'Đã hủy hóa đơn' })) await refresh();
    },
    issue: async () => {
      if (!(await confirmDialog({ title: 'Phát hành hóa đơn?', text: 'Hóa đơn gửi vào tài khoản khách và không sửa được nữa.', confirmText: 'Phát hành' }))) return;
      if (inv.stale && !(await runAction(() => invoicesApi.recompute(id)))) return;
      if (await runAction(() => invoicesApi.issue(id, {}, uuid()), { success: (r) => `Đã phát hành ${r.code}` })) await refresh();
    },
    'delete-draft': async () => {
      if (!(await confirmDialog({ title: 'Xóa bản nháp?', confirmText: 'Xóa bản nháp', tone: 'danger' }))) return;
      if (await runAction(async () => { await invoicesApi.removeDraft(id); return true; }, { success: 'Đã xóa bản nháp' })) {
        dataChanged();
        ctx.navigate('/admin/invoices');
      }
    },
  }));
}
