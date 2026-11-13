import { invoicesApi } from '../../services/api.js';
import { toast } from '../../components/dialogs.js';
import { link } from '../../components/ui.js';
import { html, setHtml } from '../../utils/html.js';
import { formatVnd } from '../../utils/money.js';

const reasons = { amount_mismatch: 'Số tiền chuyển khác yêu cầu', invoice_balance_changed: 'Số dư hóa đơn đã thay đổi',
  unknown_content: 'Không tìm thấy mã thanh toán', ambiguous_content: 'Nội dung khớp nhiều yêu cầu',
  transaction_before_request: 'Thời gian giao dịch cần kiểm tra', bank_reference_in_use: 'Mã ngân hàng đã có phiếu thu', processing_retry: 'Hệ thống đang thử lại' };

export async function mountBankReview(ctx, root) {
  let page = 1;
  async function load() {
    try {
      const data = await invoicesApi.bankEvents(page);
      if (ctx.signal.aborted) return;
      if (!data.totalItems) { setHtml(root, ''); return; }
      setHtml(root, html`<details class="card p-3 mb-3" ${new URLSearchParams(location.search).has('apipayReview') ? 'open' : ''}><summary class="fw-semibold">Đối soát ApiPay · ${data.totalItems} khoản cần kiểm tra</summary>
        <p class="small mt-3">Đối chiếu giao dịch ngân hàng trước khi thu thủ công tại chi tiết hóa đơn. Dùng đúng mã giao dịch bên dưới. Sau khi xác nhận phiếu thu, chọn Kiểm tra lại; nếu nội dung không khớp, liên kết ID phiếu thu đã xác nhận.</p>
        <div class="table-responsive"><table class="table table-sm"><thead><tr><th>Giao dịch</th><th>Số tiền</th><th>Hóa đơn</th><th>Trạng thái</th><th>Đối soát</th></tr></thead><tbody>${data.items.map(e => html`<tr>
          <td><strong>${e.referenceCode}</strong><div class="small text-break">${e.content}</div></td><td class="text-nowrap">${formatVnd(e.amount)}</td>
          <td>${e.invoiceId ? html`<a href="${link(`/admin/invoices/${e.invoiceId}`)}">${e.invoiceCode}</a>` : 'Chưa khớp'}</td>
          <td>${reasons[e.reason] || (e.state === 'pending' ? 'Đang xử lý' : 'Cần kiểm tra')}</td><td><button type="button" class="btn btn-outline-primary btn-sm" data-bank-retry="${e.transactionId}">Kiểm tra lại</button>
          ${e.state === 'review' ? html`<form class="d-flex gap-1 mt-2" data-bank-link="${e.transactionId}"><input name="paymentId" class="form-control form-control-sm" placeholder="ID phiếu thu đã xác nhận" aria-label="ID phiếu thu đã xác nhận" required><button class="btn btn-secondary btn-sm" type="submit">Liên kết</button></form>
          <details class="small mt-2"><summary>Khoản không thuộc hóa đơn</summary><form class="mt-2" data-bank-ignore="${e.transactionId}"><input name="reason" class="form-control form-control-sm mb-1" placeholder="Lý do bỏ qua" aria-label="Lý do bỏ qua" maxlength="500" required><button class="btn btn-outline-secondary btn-sm" type="submit">Bỏ qua sau đối chiếu</button></form></details>` : ''}</td></tr>`)}</tbody></table></div>
        <div><button type="button" data-bank-page="${page - 1}" class="btn btn-sm btn-light" ${page <= 1 ? 'disabled' : ''}>Trang trước</button> ${page}/${data.totalPages} <button type="button" data-bank-page="${page + 1}" class="btn btn-sm btn-light" ${page >= data.totalPages ? 'disabled' : ''}>Trang sau</button></div></details>`);
    } catch { if (!ctx.signal.aborted) setHtml(root, html`<p class="small text-muted">Chưa tải được đối soát ApiPay. <button class="btn btn-link btn-sm" type="button" data-bank-refresh>Thử lại</button></p>`); }
  }
  async function click(event) {
    const retry = event.target.closest('[data-bank-retry]');
    const next = event.target.closest('[data-bank-page]');
    if (next) { page = Number(next.dataset.bankPage); await load(); }
    if (event.target.closest('[data-bank-refresh]')) await load();
    if (retry) { retry.disabled = true; try { await invoicesApi.retryBankEvent(retry.dataset.bankRetry); toast('Đã gửi đối chiếu lại'); await load(); } catch (e) { toast(e.detail || e.message, 'error'); retry.disabled = false; } }
  }
  async function submit(event) {
    const form = event.target.closest('[data-bank-link], [data-bank-ignore]'); if (!form) return; event.preventDefault();
    const button = form.querySelector('button'); button.disabled = true;
    try {
      if (form.dataset.bankIgnore) { await invoicesApi.ignoreBankEvent(form.dataset.bankIgnore, new FormData(form).get('reason').trim()); toast('Đã ghi lý do và bỏ qua khoản này'); }
      else { await invoicesApi.reconcileBankEvent(form.dataset.bankLink, new FormData(form).get('paymentId').trim()); toast('Đã liên kết phiếu thu'); }
      await load();
    }
    catch (e) { toast(e.detail || e.message, 'error'); button.disabled = false; }
  }
  root.addEventListener('click', click); root.addEventListener('submit', submit);
  ctx.onCleanup(() => { root.removeEventListener('click', click); root.removeEventListener('submit', submit); });
  await load();
}
