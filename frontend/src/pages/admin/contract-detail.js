// Hồ sơ hợp đồng: khách, phòng, thời hạn, tiền cọc, bảng giá chốt, tệp lưu trữ, hóa đơn.
// Bản đã ký không sửa: gia hạn tạo phiên bản mới; kết thúc hợp đồng đi qua quyết toán trả phòng.
import { invoiceBadges, statBand } from '../../components/admin-kit.js';
import { badge, label as labelOf } from '../../components/badges.js';
import { confirmDialog, reasonDialog, runAction, toast } from '../../components/dialogs.js';
import { FormError } from '../../components/form.js';
import { formModal, openModal } from '../../components/modal.js';
import { emptyState, errorState, icon, link, loadingBlock, note, pageHeader, plate } from '../../components/ui.js';
import { contractsApi, filesApi, tenanciesApi, tenancyRequestsApi } from '../../services/api.js';
import { session } from '../../services/session.js';
import { addDays, formatDate, todayIso } from '../../utils/date.js';
import { formatPhone } from '../../utils/format.js';
import { formatNumber, formatVnd } from '../../utils/money.js';
import { html, setHtml } from '../../utils/html.js';
import { bindActions, dataChanged } from './common.js';

const FILE_KIND = { signed: 'Bản đã ký', appendix: 'Phụ lục', draft: 'Bản nháp', signature_proof: 'Chứng từ ký' };
const fileIcon = (f) => (f?.contentType === 'application/pdf' ? 'file-earmark-pdf' : 'file-earmark-image');

const uploaderExtra = (label) => html`<div class="mt-3" data-uploader><span class="form-label d-block">${label}</span><input type="file" data-modal-file aria-label="${label}"></div>`;

export default async function ContractDetailPage(ctx) {
  const id = ctx.params.id;
  const canWrite = session.can('contracts.write');
  let k;

  const render = async () => {
    setHtml(ctx.outlet, loadingBlock(10));
    try {
      k = await contractsApi.get(id);
    } catch (error) {
      setHtml(ctx.outlet, errorState(error));
      return;
    }
    ctx.setTitle(`Hợp đồng ${k.code}`);
    const active = k.tenancyStatus === 'active';
    const current = k.versions.filter((v) => v.isSigned).pop() || k.versions[k.versions.length - 1];
    const shortDeposit = k.deposit.required != null && k.deposit.held < k.deposit.required;
    const files = [
      ...k.versions.flatMap((v) => v.files.map((f) => ({ ...f, source: `Phiên bản ${v.versionNo}`, locked: true }))),
      ...k.attachments.map((a) => ({ file: a.file, fileKind: 'attachment', source: a.note || `Thêm ${formatDate(a.addedAt)}`, attachmentId: a.id })),
    ].filter((f) => f.file);
    const pendingRequests = k.requests.filter((r) => r.status === 'pending');
    setHtml(ctx.outlet, html`${pageHeader({
      title: `Hợp đồng ${k.code}`,
      titleExtra: badge('contract', k.status),
      subtitle: `Phiên bản ${k.currentVersionNo || 1}, hiệu lực ${formatDate(k.effectiveFrom)} đến hết ${formatDate(k.displayEndOn)}`,
      breadcrumbs: [{ label: 'Hợp đồng', href: '/admin/contracts' }, { label: k.code }],
      actions: html`
        ${active && canWrite && session.can('contracts.sign') ? html`<button type="button" class="btn btn-outline-secondary btn-sm" data-action="renew">${icon('calendar-plus')} Gia hạn</button>` : ''}
        ${active && session.can('tenancies.checkout') ? html`<button type="button" class="btn btn-outline-danger btn-sm" data-action="checkout">${icon('box-arrow-right')} Kết thúc và trả phòng</button>` : ''}
        ${!active && !k.archivedAt && canWrite && ['terminated', 'expired'].includes(k.status) ? html`<button type="button" class="btn btn-outline-secondary btn-sm" data-action="archive">${icon('archive')} Lưu trữ</button>` : ''}`,
    })}
    ${pendingRequests.map((r) => html`<section class="sr-panel is-callout"><div class="sr-panel-head"><h2>Khách đề nghị ${labelOf('requestType', r.requestType).toLowerCase()}</h2>
      <span class="sr-panel-note">Mong muốn ngày ${formatDate(r.desiredOn)}${r.targetRoom ? `, sang phòng ${r.targetRoom.code}` : ''}</span>
      ${session.can('tenants.write') ? html`<div class="sr-panel-actions"><button type="button" class="btn btn-outline-secondary btn-sm" data-action="reject-request" data-id="${r.id}">Từ chối</button><button type="button" class="btn btn-primary btn-sm" data-action="approve-request" data-id="${r.id}">Chấp nhận</button></div>` : ''}</div>
      ${r.message ? html`<div class="sr-panel-body"><p class="mb-0">${r.message}</p></div>` : ''}</section>`)}
    ${statBand([
    { label: 'Tiền thuê mỗi tháng', value: formatVnd(k.rent) },
    { label: 'Cọc đang giữ', value: formatVnd(k.deposit.held), note: k.deposit.required != null ? `Yêu cầu ${formatVnd(k.deposit.required)}` : '', tone: shortDeposit && active ? 'wash' : null },
    { label: 'Thời hạn còn lại', value: !active ? 'Đã kết thúc' : k.daysLeft == null ? '—' : k.daysLeft < 0 ? `Trễ ${-k.daysLeft} ngày` : `${k.daysLeft} ngày`, tone: k.stillOccupiedAfterExpiry ? 'danger' : k.expiring ? 'wash' : null },
    { label: 'Ngày lập hóa đơn', value: current ? `Ngày ${current.invoiceDay}` : '—', note: current ? `Hạn sau ${current.dueAfterDays} ngày` : '' },
  ])}
    <div class="ad-grid">
      <div class="ad-col-half"><section class="sr-panel h-100"><div class="sr-panel-head"><h2>Khách thuê</h2><div class="sr-panel-actions"><a class="ad-link" href="${link(`/admin/tenants/${k.tenant.id}`)}">Mở hồ sơ khách</a></div></div>
        <div class="sr-panel-body"><dl class="ad-kv">
          <div><dt>Họ tên</dt><dd><a class="fw-semibold" href="${link(`/admin/tenants/${k.tenant.id}`)}">${k.tenant.fullName}</a></dd></div>
          <div><dt>Mã khách</dt><dd>${k.tenant.code}</dd></div>
          <div><dt>Điện thoại</dt><dd>${k.tenant.phone ? html`<a href="tel:${k.tenant.phone}">${formatPhone(k.tenant.phone)}</a>` : '—'}</dd></div>
          <div><dt>Email</dt><dd>${k.tenant.email || '—'}</dd></div>
          <div><dt>Giấy tờ</dt><dd>${k.tenant.identityNumber || '—'}</dd></div>
          <div><dt>Địa chỉ</dt><dd>${k.tenant.address?.line || '—'}</dd></div>
        </dl></div></section></div>
      <div class="ad-col-half"><section class="sr-panel h-100"><div class="sr-panel-head"><h2>Phòng thuê</h2><div class="sr-panel-actions"><a class="ad-link" href="${link(`/admin/rooms/${k.room.id}`)}">Mở trang phòng</a></div></div>
        <div class="sr-panel-body"><dl class="ad-kv">
          <div><dt>Phòng</dt><dd>${plate(k.room)} ${k.roomInfo.name}</dd></div>
          <div><dt>Cơ sở</dt><dd><a href="${link(`/admin/properties/${k.room.propertyId}`)}">${k.room.propertyName}</a></dd></div>
          <div><dt>Địa chỉ</dt><dd>${[k.roomInfo.address.line, k.roomInfo.address.locality, k.roomInfo.address.province].filter(Boolean).join(', ')}</dd></div>
          <div><dt>Diện tích</dt><dd>${k.roomInfo.areaM2} m², tối đa ${k.roomInfo.capacity} người</dd></div>
          <div><dt>Người ở cùng</dt><dd>${k.tenancy.residentsCount} người</dd></div>
          <div><dt>Ngày vào ở</dt><dd>${formatDate(k.tenancy.actualMoveIn)}${k.tenancy.actualMoveOut ? `, trả ${formatDate(k.tenancy.actualMoveOut)}` : ''}</dd></div>
        </dl></div></section></div>
      <div class="ad-col-main">
        <section class="sr-panel"><div class="sr-panel-head"><h2>Tệp hợp đồng</h2><span class="sr-panel-note">${files.length} tệp</span>
          ${canWrite ? html`<div class="sr-panel-actions"><button type="button" class="btn btn-outline-primary btn-sm" data-action="add-file">${icon('paperclip')} Thêm tệp</button></div>` : ''}</div>
          ${files.length ? html`<ul class="ad-files">${files.map((f) => html`<li>${icon(fileIcon(f.file))}
            <span class="ad-file-name"><strong>${f.file.fileName}</strong><small>${FILE_KIND[f.fileKind] || 'Tệp bổ sung'}, ${f.source}${f.file.scanStatus === 'missing' ? ', thiếu nội dung tệp' : ''}</small></span>
            <button type="button" class="btn btn-outline-secondary btn-sm" data-action="view-file" data-id="${f.file.id}">Xem</button>
            ${f.attachmentId && canWrite ? html`<button type="button" class="ad-icon-btn is-danger" data-action="remove-file" data-id="${f.attachmentId}" aria-label="Xóa tệp ${f.file.fileName}" title="Xóa tệp">${icon('trash3')}</button>` : ''}</li>`)}</ul>`
    : emptyState({ iconName: 'paperclip', title: 'Chưa có tệp', text: 'Thêm ảnh hoặc PDF của hợp đồng.' })}
        </section>
        <section class="sr-panel"><div class="sr-panel-head"><h2>Hóa đơn của hợp đồng</h2></div>
          ${k.invoices.length ? html`<div class="table-responsive"><table class="table align-middle mb-0"><thead><tr><th>Mã</th><th>Hạn thanh toán</th><th class="text-end">Tổng</th><th class="text-end">Còn lại</th><th>Trạng thái</th></tr></thead><tbody>
            ${k.invoices.map((i) => html`<tr><td><a class="fw-semibold" href="${link(`/admin/invoices/${i.id}`)}">${i.code}</a></td><td class="num">${formatDate(i.dueOn)}</td><td class="text-end num">${formatVnd(i.totalAmount)}</td><td class="text-end num">${formatVnd(i.outstandingAmount)}</td><td>${invoiceBadges(i)}</td></tr>`)}</tbody></table></div>`
    : html`<p class="ad-mini-empty">Chưa có hóa đơn. Hóa đơn được tạo ở trang Tính tiền phòng.</p>`}
        </section>
        ${current?.termsText ? html`<section class="sr-panel"><div class="sr-panel-head"><h2>Điều khoản</h2></div><div class="sr-panel-body"><p class="mb-0 ad-measure">${current.termsText}</p></div></section>` : ''}
      </div>
      <div class="ad-col-side">
        <section class="sr-panel"><div class="sr-panel-head"><h2>Tiền cọc</h2>
          ${active && shortDeposit && session.can('deposits.receive') ? html`<div class="sr-panel-actions"><button type="button" class="btn btn-outline-primary btn-sm" data-action="deposit">Thu thêm cọc</button></div>` : ''}</div>
          <ul class="ad-price-list">
            <li><span>Cọc yêu cầu trên hợp đồng</span><strong class="num">${formatVnd(k.deposit.required)}</strong></li>
            <li><span>Đã thu</span><strong class="num">${formatVnd(k.deposit.received)}</strong></li>
            ${k.deposit.offset ? html`<li><span>Đã bù trừ vào nợ</span><strong class="num">${formatVnd(k.deposit.offset)}</strong></li>` : ''}
            ${k.deposit.refunded ? html`<li><span>Đã hoàn</span><strong class="num">${formatVnd(k.deposit.refunded)}</strong></li>` : ''}
            <li class="is-total"><span>Đang giữ</span><strong class="num">${formatVnd(k.deposit.held)}</strong></li>
          </ul></section>
        ${current ? html`<section class="sr-panel"><div class="sr-panel-head"><h2>Giá chốt theo hợp đồng</h2></div>
          <ul class="ad-price-list">${current.rates.filter((r) => !r.effectiveTo).map((r) => html`<li><span>${r.chargeType.name}${r.billingCycle === 'once' ? html`<small>Thu một lần</small>` : ''}</span><strong class="num">${formatNumber(r.unitPrice)} đ/${r.chargeType.unitLabel}</strong></li>`)}</ul></section>` : ''}
        ${k.versions.length > 1 ? html`<section class="sr-panel"><div class="sr-panel-head"><h2>Các phiên bản</h2></div><ul class="ad-price-list">${k.versions.map((v) => html`<li><span>Phiên bản ${v.versionNo}<small>${v.changeReason || 'Bản đầu'}</small></span><span class="small num text-end">${formatDate(v.effectiveFrom)} – ${formatDate(v.displayEndOn)}</span></li>`)}</ul></section>` : ''}
        ${k.termination ? html`<section class="sr-panel"><div class="sr-panel-head"><h2>Chấm dứt</h2></div><div class="sr-panel-body"><p class="mb-1">Ngày ${formatDate(k.termination.terminatedOn)}</p><p class="small text-muted-sr mb-0">${k.termination.reason}</p></div></section>` : ''}
      </div>
    </div>`);
  };

  const withUpload = (onReady, options) => async (form) => {
    const { createUploader } = await import('../../components/uploader.js');
    const uploader = createUploader(form.querySelector('[data-modal-file]'), { visibility: 'private', purpose: 'contract_signed', ...options });
    onReady(uploader);
    return () => uploader.destroy();
  };

  await render();
  ctx.onCleanup(bindActions(ctx.outlet, {
    'view-file': async (btn) => {
      const result = await runAction(() => filesApi.downloadUrl(btn.dataset.id));
      if (!result) return;
      const isPdf = result.url?.startsWith('data:application/pdf') || result.file?.contentType === 'application/pdf';
      openModal({ title: result.file?.fileName || 'Tệp hợp đồng', size: 'lg', body: isPdf ? html`<iframe class="ad-file-frame" src="${result.url}" title="${result.file?.fileName || 'Tệp hợp đồng'}"></iframe>` : html`<img class="img-fluid border rounded" src="${result.url}" alt="${result.file?.fileName || ''}">` });
    },
    'add-file': async () => {
      let uploader;
      const done = await formModal({
        title: 'Thêm tệp hợp đồng', submitLabel: 'Lưu tệp', fields: [{ name: 'note', label: 'Ghi chú', optional: true, placeholder: 'Ví dụ: biên bản bàn giao' }],
        intro: note('Bản đã ký được giữ nguyên. Tệp này được lưu kèm hợp đồng.'), extra: uploaderExtra('Ảnh hoặc PDF'),
        afterRender: withUpload((u) => { uploader = u; }, { multiple: true, maxFiles: 5 }),
        onSubmit: async (v) => {
          if (uploader.busy) throw new FormError('Tệp đang tải lên.');
          if (!uploader.fileIds.length) throw new FormError('Chọn ít nhất một tệp.');
          for (const fileId of uploader.fileIds) await contractsApi.addAttachment(id, { fileId, note: v.note });
          return true;
        },
      });
      if (done) { toast('Đã lưu tệp'); await render(); }
    },
    'remove-file': async (btn) => {
      if (!(await confirmDialog({ title: 'Xóa tệp này?', text: 'Chỉ xóa được tệp bổ sung; bản đã ký luôn được giữ.', confirmText: 'Xóa tệp', tone: 'danger' }))) return;
      if (await runAction(() => contractsApi.removeAttachment(id, btn.dataset.id), { success: 'Đã xóa tệp' })) await render();
    },
    deposit: async () => {
      const short = k.deposit.required - k.deposit.held;
      const done = await formModal({
        title: 'Thu thêm tiền cọc', submitLabel: 'Ghi nhận cọc',
        fields: [
          { name: 'amount', label: 'Số tiền', type: 'money', required: true, positive: true, default: short },
          { name: 'methodCode', label: 'Cách thu', type: 'select', placeholderOption: false, default: 'cash', options: [{ value: 'cash', label: 'Tiền mặt' }, { value: 'bank_transfer', label: 'Chuyển khoản' }] },
          { name: 'externalReference', label: 'Mã giao dịch', optional: true, help: 'Bắt buộc khi chuyển khoản.' },
        ],
        onSubmit: (v, meta) => tenanciesApi.depositReceipt(k.tenancyId, { amount: v.amount, payment: { receivedAt: new Date().toISOString(), methodCode: v.methodCode, externalReference: v.externalReference } }, meta.idempotencyKey),
      });
      if (done) { toast('Đã ghi nhận cọc'); dataChanged(); await render(); }
    },
    renew: async () => {
      const current = k.versions.filter((v) => v.isSigned).pop();
      const today = todayIso();
      const start = k.endsOn > today ? k.endsOn : today;
      let uploader;
      const done = await formModal({
        title: `Gia hạn hợp đồng ${k.code}`, submitLabel: 'Ký phiên bản mới',
        intro: note(html`Hợp đồng hiện tại đến hết ${formatDate(k.displayEndOn)}. Gia hạn tạo phiên bản mới, bản cũ giữ nguyên.`),
        fields: [
          { name: 'lastDay', label: 'Ngày cuối mới', type: 'date', required: true, min: addDays(start, 1) },
          { name: 'rent', label: 'Tiền thuê mỗi tháng', type: 'money', required: true, positive: true, default: k.rent },
          { name: 'changeReason', label: 'Lý do', default: 'Gia hạn hợp đồng', required: true },
        ],
        extra: uploaderExtra('Bản phụ lục đã ký (ảnh hoặc PDF)'), afterRender: withUpload((u) => { uploader = u; }),
        onSubmit: async (v, meta) => {
          const [signedFileId] = uploader.fileIds;
          if (!signedFileId) throw new FormError('Cần tải lên bản đã ký.');
          const rentType = current.rates.find((r) => r.chargeType.category === 'rent').chargeType.id;
          const body = {
            effectiveFrom: start, endsOn: addDays(v.lastDay, 1), requiredDeposit: current.requiredDeposit, invoiceDay: current.invoiceDay, dueAfterDays: current.dueAfterDays,
            prorationPolicy: current.prorationPolicy, termsText: current.termsText, changeReason: v.changeReason,
            rates: current.rates.filter((r) => !r.effectiveTo).map((r) => ({ chargeTypeId: r.chargeType.id, unitPrice: r.chargeType.id === rentType ? v.rent : r.unitPrice, calculationMethod: r.calculationMethod, billingCycle: r.billingCycle, prorationMode: r.prorationMode })),
          };
          const draft = k.versions.find((x) => !x.isSigned);
          const saved = draft ? await contractsApi.updateVersion(id, draft.id, body) : await contractsApi.createVersion(id, body);
          const version = saved.versions.find((x) => !x.isSigned);
          return contractsApi.signVersion(id, version.id, { signatureMethod: 'paper', signedAt: new Date().toISOString(), signedFileId }, meta.idempotencyKey);
        },
      });
      if (done) { toast('Đã gia hạn hợp đồng'); dataChanged(); await render(); }
    },
    archive: async () => {
      if (await runAction(() => contractsApi.archive(id), { success: 'Đã lưu trữ hợp đồng' })) await render();
    },
    'approve-request': async (btn) => {
      const reason = await reasonDialog({ title: 'Chấp nhận đề nghị', text: 'Chấp nhận chưa đổi hợp đồng. Sau đó thực hiện gia hạn hoặc trả phòng trên trang này.', label: 'Ghi chú cho khách', confirmText: 'Chấp nhận', minLength: 1 });
      if (reason && await runAction(() => tenancyRequestsApi.approve(btn.dataset.id, reason), { success: 'Đã chấp nhận đề nghị' })) { dataChanged(); await render(); }
    },
    'reject-request': async (btn) => {
      const reason = await reasonDialog({ title: 'Từ chối đề nghị', label: 'Lý do từ chối', confirmText: 'Từ chối', tone: 'danger' });
      if (reason && await runAction(() => tenancyRequestsApi.reject(btn.dataset.id, reason), { success: 'Đã từ chối đề nghị' })) { dataChanged(); await render(); }
    },
    checkout: async () => {
      const today = todayIso();
      const meters = Object.fromEntries(k.meters.map((m) => [m.meterKind, m]));
      const fields = [
        { name: 'moveOutOn', label: 'Ngày trả phòng', type: 'date', required: true, col: 'col-md-6', max: today, default: today },
        { name: 'roomStatusAfter', label: 'Phòng sau khi trả', type: 'select', col: 'col-md-6', placeholderOption: false, default: 'available', options: [{ value: 'available', label: 'Sẵn sàng cho thuê' }, { value: 'maintenance', label: 'Cần bảo trì' }] },
        ...k.meters.map((m) => ({ name: `readings.${m.meterKind}`, label: m.meterKind === 'electricity' ? 'Số điện cuối' : 'Số nước cuối', type: 'decimal', decimals: 3, required: true, col: 'col-md-6', min: meters[m.meterKind].lastReading?.value ?? 0, help: m.lastReading ? `Lần chốt gần nhất: ${formatNumber(m.lastReading.value, 3)}` : '' })),
        { name: 'terminationReason', label: 'Lý do kết thúc', type: 'textarea', rows: 2, required: true },
      ];
      const step = await formModal({
        title: 'Kết thúc hợp đồng và trả phòng', submitLabel: 'Xem quyết toán', size: 'lg', fields,
        intro: note('Thiếu số điện nước cuối thì chưa quyết toán được. Bước sau xem tiền trước khi xác nhận.'),
        onSubmit: async (v) => ({ v, preview: await tenanciesApi.checkoutPreview(k.tenancyId, { moveOutOn: v.moveOutOn, readings: v.readings }) }),
      });
      if (!step) return;
      const { v, preview } = step;
      const finalTotal = preview.finalInvoice.totalAmount;
      let left = preview.depositHeld;
      const offsets = [];
      for (const inv of preview.outstandingInvoices) {
        const take = Math.min(left, inv.outstandingAmount);
        if (take > 0) offsets.push({ invoiceId: inv.id, amount: take });
        left -= take;
      }
      const finalTake = Math.min(left, finalTotal);
      if (finalTake > 0) offsets.push({ invoiceId: 'final', amount: finalTake });
      left -= finalTake;
      const remaining = preview.outstandingTotal + finalTotal - offsets.reduce((s, o) => s + o.amount, 0);
      const done = await formModal({
        title: 'Xác nhận quyết toán', submitLabel: 'Trả phòng', submitTone: 'danger', size: 'lg',
        intro: html`<ul class="ad-breakdown">
          <li><span>Hóa đơn cuối<small>Tiền phòng và điện nước đến ngày trả</small></span><strong class="num">${formatVnd(finalTotal)}</strong></li>
          ${preview.outstandingTotal ? html`<li><span>Nợ các hóa đơn trước</span><strong class="num">${formatVnd(preview.outstandingTotal)}</strong></li>` : ''}
          <li><span>Cọc đang giữ</span><strong class="num">${formatVnd(preview.depositHeld)}</strong></li>
          <li><span>Bù trừ cọc vào nợ</span><strong class="num">−${formatVnd(preview.depositHeld - left)}</strong></li>
          <li class="is-total"><span>${remaining > 0 ? 'Khách còn nợ' : 'Hoàn lại khách'}</span><strong class="num">${formatVnd(remaining > 0 ? remaining : left)}</strong></li></ul>
          ${preview.policyNote ? html`<div class="mt-2">${note(preview.policyNote, { tone: 'warn' })}</div>` : ''}`,
        fields: [
          ...(left > 0 ? [{ name: 'refundMethod', label: 'Cách hoàn cọc', type: 'select', placeholderOption: false, default: 'cash', options: [{ value: 'cash', label: 'Tiền mặt' }, { value: 'bank_transfer', label: 'Chuyển khoản' }] }] : []),
          ...(remaining > 0 ? [{ name: 'remainingDebtReason', label: 'Lý do đóng hợp đồng khi còn nợ', type: 'textarea', rows: 2, required: true, minLength: 5 }] : []),
        ],
        onSubmit: (x, meta) => tenanciesApi.checkout(k.tenancyId, {
          moveOutOn: v.moveOutOn, readings: v.readings, terminationReason: v.terminationReason, roomStatusAfter: v.roomStatusAfter, handover: {}, offsets,
          refund: left > 0 ? { amount: left, methodCode: x.refundMethod } : undefined,
          allowRemainingDebt: remaining > 0, remainingDebtReason: x.remainingDebtReason,
        }, meta.idempotencyKey),
      });
      if (done) { toast('Đã trả phòng. Phòng trở lại danh sách cho thuê.'); dataChanged(); await render(); }
    },
  }));
}
