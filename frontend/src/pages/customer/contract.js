// Trang Hợp đồng: bản hợp đồng đã ký admin gán cho khách, biên bản bàn giao, đề nghị gia hạn và trả phòng.
import { badge } from '../../components/badges.js';
import { confirmDialog, runAction, toast } from '../../components/dialogs.js';
import { formModal, openModal } from '../../components/modal.js';
import { errorState, icon, link, loadingBlock, note } from '../../components/ui.js';
import { filesApi, portalApi } from '../../services/api.js';
import { addDays, addMonths, formatDate, formatDateTime, todayIso } from '../../utils/date.js';
import { formatNumber, formatVnd } from '../../utils/money.js';
import { html, multiline, setHtml } from '../../utils/html.js';
import { loadStay, noRoomPanel, pageHead } from './common.js';

const REQUEST_LABEL = { renewal: 'Ngày muốn gia hạn đến', checkout: 'Ngày dự kiến trả phòng', transfer: 'Ngày muốn chuyển' };
const METERS = { electricity: ['Chỉ số điện đầu vào', 'kWh'], water: ['Chỉ số nước đầu vào', 'm³'] };

function contractPaper(tenancy, version, contractCode) {
  const finance = tenancy.financeVisible;
  const rates = (version?.rates || []).filter((r) => r.chargeType?.category !== 'rent' && !r.effectiveTo);
  return html`<article class="cu-paper">
    <header class="cu-paper-head">
      <div><span class="cu-receipt-from">${tenancy.property.name}</span><h2>Hợp đồng thuê phòng</h2><small>${contractCode}</small></div>
      <span class="sr-plate sr-plate-lg">${tenancy.room.code}</span>
    </header>
    <dl class="cu-facts">
      <div><dt>Trạng thái</dt><dd>${badge('contract', tenancy.contract.status)}</dd></div>
      <div><dt>Thời hạn</dt><dd>${version ? `${formatDate(version.effectiveFrom)} – ${formatDate(version.displayEndOn)}` : formatDate(tenancy.contract.displayEndOn)}</dd></div>
      ${tenancy.contract.daysLeft != null ? html`<div><dt>Còn lại</dt><dd>${tenancy.contract.daysLeft >= 0 ? `${tenancy.contract.daysLeft} ngày` : `Đã quá hạn ${-tenancy.contract.daysLeft} ngày`}</dd></div>` : ''}
      <div><dt>Bên thuê</dt><dd>${tenancy.representative?.fullName}</dd></div>
      <div><dt>Địa chỉ</dt><dd>${[tenancy.property.addressLine, tenancy.property.locality].filter(Boolean).join(', ')}</dd></div>
      ${version?.signedAt ? html`<div><dt>Ngày ký</dt><dd>${formatDate(version.signedAt.slice(0, 10))}</dd></div>` : ''}
      ${finance ? html`<div><dt>Tiền thuê</dt><dd>${tenancy.rent == null ? '—' : `${formatVnd(tenancy.rent)} / tháng`}</dd></div>
      <div><dt>Cọc theo hợp đồng</dt><dd>${formatVnd(tenancy.requiredDeposit || 0)}</dd></div>
      <div><dt>Cọc đang giữ</dt><dd>${formatVnd(tenancy.depositHeld || 0)}</dd></div>` : ''}
    </dl>
    ${finance && rates.length ? html`<h3>Biểu phí áp dụng</h3><dl class="cu-costs">${rates.map((r) => html`<div><dt>${r.chargeType.name}</dt><dd>${r.unitPrice === 0 ? 'Miễn phí' : `${formatVnd(r.unitPrice)} / ${r.chargeType.unitLabel}`}</dd></div>`)}</dl>` : ''}
    ${version?.termsText ? html`<h3>Điều khoản</h3><p class="cu-text">${multiline(version.termsText)}</p>` : ''}
    ${version?.files?.length ? html`<h3>Bản hợp đồng đã ký</h3><div class="d-flex flex-wrap gap-2">${version.files.filter((f) => f.file).map((f) => html`<button type="button" class="btn btn-outline-primary btn-sm" data-file="${f.file.id}">${icon('file-earmark-arrow-down')} ${f.file.fileName}</button>`)}</div>` : ''}
  </article>`;
}

function handoverCard(handover) {
  if (!handover) return '';
  return html`<section class="cu-card">
    <h2>Biên bản bàn giao</h2>
    <p class="cu-fine">Bàn giao ngày ${formatDate(handover.occurredAt.slice(0, 10))}${handover.notes ? `. ${handover.notes}` : ''}</p>
    ${handover.readings.length ? html`<ul class="cu-readings">${handover.readings.map((r) => {
    const [label, unit] = METERS[r.meterKind] || ['Chỉ số đầu vào', ''];
    return html`<li><span>${label}</span><strong>${formatNumber(r.readingValue)} <small>${unit}</small></strong><small>Công tơ ${r.serialNumber}</small></li>`;
  })}</ul>` : ''}
    ${handover.assets.length ? html`<h3>Tài sản trong phòng</h3><ul class="cu-paylist">${handover.assets.map((a) => html`<li><span>${a.nameSnapshot}${a.quantity > 1 ? ` x${a.quantity}` : ''}</span><small>${a.condition || 'Bình thường'}</small></li>`)}</ul>` : ''}
  </section>`;
}

function peopleCard(tenancy, detail) {
  const others = detail.residents.filter((r) => !r.leftOn);
  return html`<section class="cu-card"><h2>Người ở trong phòng</h2><ul class="cu-paylist">
    <li><span>${tenancy.representative?.fullName}<small>Người đại diện, đứng tên hợp đồng</small></span></li>
    ${others.map((r) => html`<li><span>${r.fullName}<small>Người ở cùng${r.relationship ? `, ${r.relationship}` : ''}, từ ${formatDate(r.joinedOn)}</small></span></li>`)}
  </ul></section>`;
}

function requestsCard(requests, canRequest) {
  const hasOpen = (type) => requests.some((r) => r.requestType === type && r.status === 'pending');
  return html`<section class="cu-card">
    <h2>Gia hạn và trả phòng</h2>
    <p class="cu-text">Gửi đề nghị để quản lý sắp xếp. Đề nghị chưa làm thay đổi hợp đồng.</p>
    ${canRequest ? html`<div class="d-grid gap-2 mb-3">
      <button type="button" class="btn btn-outline-primary btn-sm" data-request="renewal" ${hasOpen('renewal') ? 'disabled' : ''}>${icon('calendar-plus')} Đề nghị gia hạn</button>
      <button type="button" class="btn btn-outline-danger btn-sm" data-request="checkout" ${hasOpen('checkout') ? 'disabled' : ''}>${icon('box-arrow-right')} Báo trước trả phòng</button>
    </div>` : ''}
    ${requests.length ? html`<ul class="cu-paylist">${requests.map((r) => html`<li>
      <span>${badge('requestType', r.requestType)} ${badge('request', r.status)}
        <small>${REQUEST_LABEL[r.requestType]}: ${formatDate(r.desiredOn)}. Gửi ${formatDateTime(r.createdAt)}.</small>
        ${r.message ? html`<small>${r.message}</small>` : ''}
        ${r.decisionNotes ? html`<small>Phản hồi: ${r.decisionNotes}</small>` : ''}</span>
      ${r.status === 'pending' ? html`<button type="button" class="btn btn-link btn-sm text-danger p-0" data-cancel="${r.id}">Hủy</button>` : ''}
    </li>`)}</ul>` : ''}
  </section>`;
}

export default async function ContractPage(ctx) {
  ctx.setTitle('Hợp đồng');
  setHtml(ctx.outlet, html`<div class="cu-page" data-root>${loadingBlock(8)}</div>`);
  const root = ctx.outlet.querySelector('[data-root]');

  let stay;
  let detail = null;
  let requests = [];
  const load = async () => {
    stay = await loadStay();
    if (!stay.current) return;
    const finance = stay.current.financeVisible;
    [detail, requests] = await Promise.all([portalApi.tenancy(stay.current.id), finance ? portalApi.requests() : []]);
  };
  const render = async () => {
    try {
      await load();
    } catch (error) {
      if (error?.isAborted || ctx.signal.aborted) return;
      setHtml(root, errorState(error));
      return;
    }
    if (ctx.signal.aborted) return;
    const tenancy = stay.current;
    const head = pageHead({ title: 'Hợp đồng', subtitle: tenancy ? `Phòng ${tenancy.room.code}, ${tenancy.property.name}` : null });
    if (!tenancy) {
      setHtml(root, html`${head}${noRoomPanel('Hợp đồng thuê phòng')}`);
      return;
    }
    const contract = detail.contracts.find((k) => k.id === tenancy.contract?.id);
    const version = contract?.versions?.at(-1) || null;
    const handover = detail.handovers.find((h) => ['checkin', 'transfer_in'].includes(h.kind)) || null;
    const canRequest = tenancy.financeVisible && tenancy.status === 'active' && Boolean(tenancy.contract);
    setHtml(root, html`${head}
      <div class="cu-contract-layout">
        <div class="cu-contract-main">
          ${tenancy.contract ? contractPaper(tenancy, version, tenancy.contract.code) : html`<section class="cu-card"><h2>Chưa có hợp đồng</h2>${note('Quản lý đang bổ sung hợp đồng cho phòng của bạn. Hợp đồng sẽ hiện ở đây sau khi được thêm vào tài khoản.', { tone: 'warn' })}</section>`}
          ${handoverCard(tenancy.financeVisible ? handover : null)}
        </div>
        <aside class="cu-contract-side">
          ${peopleCard(tenancy, detail)}
          ${tenancy.financeVisible ? requestsCard(requests, canRequest) : ''}
        </aside>
      </div>`);
  };
  await render();

  const sendRequest = async (requestType) => {
    const tenancy = stay.current;
    const isRenewal = requestType === 'renewal';
    const end = tenancy.contract?.displayEndOn;
    const base = end && end > todayIso() ? end : todayIso();
    const result = await formModal({
      title: isRenewal ? 'Đề nghị gia hạn hợp đồng' : 'Báo trước trả phòng',
      submitLabel: isRenewal ? 'Gửi đề nghị gia hạn' : 'Gửi đề nghị trả phòng',
      submitTone: isRenewal ? 'primary' : 'danger',
      intro: note(isRenewal ? 'Đề nghị chưa đổi hợp đồng cho tới khi quản lý hoàn tất thủ tục.' : 'Đề nghị chưa kết thúc đợt thuê. Quản lý sẽ liên hệ để hẹn kiểm tra phòng và quyết toán cọc.', { tone: isRenewal ? 'info' : 'warn' }),
      fields: [
        { name: 'desiredOn', label: REQUEST_LABEL[requestType], type: 'date', required: true, min: isRenewal ? addDays(base, 1) : todayIso() },
        { name: 'message', label: isRenewal ? 'Ghi chú gửi quản lý' : 'Lý do trả phòng', type: 'textarea', rows: 2, required: !isRenewal, optional: isRenewal },
      ],
      values: { desiredOn: isRenewal ? addMonths(base, 12) : addMonths(todayIso(), 1) },
      onSubmit: (v, { idempotencyKey }) => portalApi.createRequest({ ...v, requestType, tenancyId: tenancy.id }, idempotencyKey),
    });
    if (result) {
      toast('Đã gửi đề nghị tới quản lý');
      await render();
    }
  };

  const onClick = async (event) => {
    const request = event.target.closest('[data-request]');
    if (request) await sendRequest(request.dataset.request);
    const cancel = event.target.closest('[data-cancel]');
    if (cancel) {
      if (!(await confirmDialog({ title: 'Hủy đề nghị này?', confirmText: 'Hủy đề nghị', cancelText: 'Không', tone: 'danger' }))) return;
      if (await runAction(() => portalApi.cancelRequest(cancel.dataset.cancel), { success: 'Đã hủy đề nghị' })) await render();
    }
    const file = event.target.closest('[data-file]');
    if (file) {
      const result = await runAction(() => filesApi.downloadUrl(file.dataset.file));
      if (result) {
        const isPdf = result.file?.contentType === 'application/pdf';
        openModal({ title: result.file?.fileName || 'Hợp đồng', size: 'lg', body: isPdf ? html`<a class="btn btn-primary" href="${result.url}" target="_blank" rel="noopener">Mở tệp</a>` : html`<img class="img-fluid" src="${result.url}" alt="">` });
      }
    }
  };
  root.addEventListener('click', onClick);
  ctx.onCleanup(() => root.removeEventListener('click', onClick));
}
