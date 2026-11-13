// Tạo hợp đồng: gắn khách với phòng trống, chốt giá, ghi cọc đã thu và số điện nước đầu kỳ, lưu bản ký.
// Có ?tenancyId là chế độ bổ sung: khách đã ở phòng từ trước, khách và phòng cố định, phòng không đổi trạng thái.
// Lưu xong phòng chuyển sang đã thuê và tính tiền từ ngày vào ở. Một lệnh duy nhất nên lỗi ở bước nào cũng không để dữ liệu dở dang.
import { toast } from '../../components/dialogs.js';
import { bindForm, enhance, FormError, formAlert, renderFields } from '../../components/form.js';
import { errorState, icon, link, loadingBlock, note, pageHeader, plate } from '../../components/ui.js';
import { contractsApi, inquiriesApi, propertiesApi, roomsApi, tenanciesApi, tenantsApi } from '../../services/api.js';
import { session } from '../../services/session.js';
import { addDays, formatDate, quickContractEndExclusive, todayIso } from '../../utils/date.js';
import { formatNumber, formatVnd, parseVnd } from '../../utils/money.js';
import { html, setHtml } from '../../utils/html.js';
import { dataChanged } from './common.js';
import { tenantFormModal } from './tenant-dialogs.js';
import { contractTenantErrors } from '../../utils/contract-tenant.js';

const DEFAULT_TERMS = 'Bên thuê thanh toán đúng hạn, giữ gìn tài sản trong phòng và tuân thủ nội quy của cơ sở. Hai bên báo trước 30 ngày khi muốn chấm dứt hợp đồng.';
const METHOD_OPTIONS = [{ value: 'cash', label: 'Tiền mặt' }, { value: 'bank_transfer', label: 'Chuyển khoản' }];

export default async function ContractNewPage(ctx) {
  ctx.setTitle('Tạo hợp đồng');
  setHtml(ctx.outlet, loadingBlock(10));
  const org = session.organization;
  const today = todayIso();
  const { roomId: presetRoom, inquiryId, tenancyId } = ctx.query;
  const presetTenant = ctx.query.tenantId || ctx.query.tenant;
  let inquiry = null;
  let preset = null;
  let tenantPreset = null;
  // Khách đã ở phòng (ghi nhận từ form phòng): chỉ bổ sung hợp đồng, khách và phòng đã cố định.
  let existing = null;
  try {
    [inquiry, preset, tenantPreset, existing] = await Promise.all([
      inquiryId ? inquiriesApi.get(inquiryId) : null,
      presetRoom ? roomsApi.get(presetRoom) : null,
      presetTenant ? tenantsApi.get(presetTenant) : null,
      tenancyId ? tenanciesApi.get(tenancyId) : null,
    ]);
    // Xác định khách trước khi tải phòng: phòng đang giữ cho khách này vẫn có
    // thể ký hợp đồng từ lịch xem, nhưng không được hiện cho khách khác.
    if (!tenantPreset && inquiry?.tenantId) tenantPreset = await tenantsApi.get(inquiry.tenantId);
  } catch (error) {
    setHtml(ctx.outlet, errorState(error));
    return;
  }
  if (existing?.contracts.length) {
    ctx.navigate(`/admin/contracts/${existing.contracts[0].id}`, { replace: true });
    return;
  }
  if (existing) ctx.setTitle(`Bổ sung hợp đồng phòng ${existing.room.code}`);
  let propertyId = existing?.property.id || preset?.property.id || session.propertyId || org.properties[0]?.id;
  let room = null;
  let roomReady = false;
  let billing = null;
  let tenantLabel = existing?.representative.fullName || tenantPreset?.fullName || null;

  const tenantOptions = tenantPreset ? [{ value: tenantPreset.id, label: tenantPreset.fullName, sub: tenantPreset.code }] : [];
  const partyFields = existing ? [] : [
    { name: 'tenantId', label: 'Khách thuê', type: 'tomselect', remote: 'contractTenants', required: true, options: tenantOptions, placeholderOption: 'Chọn khách hoặc gõ tên, số điện thoại', col: 'col-12', help: 'Khách đang hoạt động, chưa có hợp đồng đang thuê hoặc sắp vào ở. Khách đã trả phòng có thể thuê lại.' },
    { name: 'propertyId', label: 'Cơ sở', type: 'select', required: true, placeholderOption: false, col: 'col-md-6', options: org.properties.map((p) => ({ value: p.id, label: p.name })) },
    { name: 'roomId', label: 'Phòng trống', type: 'select', required: true, col: 'col-md-6', options: [], placeholderOption: 'Chọn phòng' },
  ];
  const termFields = [
    { name: 'moveInOn', label: existing ? 'Ngày hợp đồng có hiệu lực' : 'Ngày vào ở', type: 'date', required: true, col: 'col-md-6', max: today, help: existing ? 'Thường là ngày khách vào ở.' : 'Tính tiền từ ngày này. Không chọn ngày tương lai.' },
    { name: 'lastDay', label: 'Ngày cuối hợp đồng', type: 'date', required: true, col: 'col-md-6', min: existing ? undefined : today },
  ];
  const fileFields = [{ name: 'termsText', label: 'Điều khoản', type: 'textarea', rows: 3, required: true }];
  const baseFields = [...partyFields, ...termFields, ...fileFields];
  const fields = [...baseFields];

  setHtml(ctx.outlet, html`${pageHeader({
    title: existing ? `Bổ sung hợp đồng phòng ${existing.room.code}` : 'Tạo hợp đồng',
    breadcrumbs: [{ label: 'Hợp đồng', href: '/admin/contracts' }, { label: existing ? 'Bổ sung hợp đồng' : 'Tạo hợp đồng' }],
  })}
  <form id="contract-form" class="ad-form has-rail" novalidate>
    <div class="ad-form-main">
      ${formAlert()}
      ${inquiry ? html`<div class="mb-3">${note(html`Từ yêu cầu <strong>${inquiry.code}</strong> của ${inquiry.contactName}${inquiry.phone ? `, ${inquiry.phone}` : ''}.
        ${inquiry.tenantId ? '' : html`<button type="button" class="btn btn-link btn-sm p-0 align-baseline" data-from-inquiry>Tạo hồ sơ khách từ yêu cầu này</button>`}`)}</div>` : ''}
      <section class="sr-panel"><div class="sr-panel-head"><h2>Khách và phòng</h2>
        <button type="button" class="btn btn-outline-secondary btn-sm" data-edit-tenant>Bổ sung thông tin khách</button>
        ${!existing && session.can('tenants.write') ? html`<div class="sr-panel-actions"><button type="button" class="btn btn-outline-secondary btn-sm" data-add-tenant>${icon('person-plus')} Thêm khách mới</button></div>` : ''}</div>
        <div class="sr-panel-body">${existing ? html`<dl class="ad-kv">
          <div><dt>Khách thuê</dt><dd><a href="${link(`/admin/tenants/${existing.representative.id}`)}">${existing.representative.fullName}</a></dd></div>
          <div><dt>Phòng</dt><dd>${plate(existing.room)} ${existing.room.propertyName}</dd></div>
          <div><dt>Vào ở từ</dt><dd>${formatDate(existing.actualMoveIn)}</dd></div></dl>` : renderFields(partyFields, { propertyId, tenantId: tenantPreset?.id })}
          <p class="form-text mb-0">Cần số điện thoại hợp lệ. Ngày sinh có thể bổ sung sau; nếu đã nhập thì người đứng tên phải đủ 18 tuổi.</p></div></section>
      <section class="sr-panel"><div class="sr-panel-head"><h2>Thời hạn</h2><div class="sr-panel-actions ad-term-quick" role="group" aria-label="Chọn nhanh thời hạn">
        ${[6, 12, 24].map((m) => html`<button type="button" class="btn btn-outline-secondary btn-sm" data-term="${m}">${m} tháng</button>`)}</div></div>
        <div class="sr-panel-body">${renderFields(termFields, { moveInOn: existing?.actualMoveIn || today })}</div></section>
      <div data-room-part></div>
      <section class="sr-panel"><div class="sr-panel-head"><h2>Tệp hợp đồng</h2><span class="sr-panel-note">Ảnh hoặc PDF, bắt buộc có bản đã ký</span></div>
        <div class="sr-panel-body">
          <div data-uploader class="mb-3"><input type="file" data-contract-files aria-label="Tải tệp hợp đồng"></div>
          ${renderFields(fileFields, { termsText: DEFAULT_TERMS })}
        </div></section>
      <div class="ad-savebar">
        <a class="btn btn-outline-secondary" href="${link('/admin/contracts')}">Hủy</a>
        <button type="submit" class="btn btn-primary">${icon('check2')} ${existing ? 'Lưu hợp đồng' : 'Tạo hợp đồng'}</button>
      </div>
    </div>
    <aside class="ad-form-rail" aria-label="Tóm tắt hợp đồng"><div class="sr-panel" data-summary></div></aside>
  </form>`);

  const form = ctx.outlet.querySelector('form');
  ctx.onCleanup(await enhance(form));
  const input = (name) => form.querySelector(`[data-field="${CSS.escape(name)}"]`);
  const part = form.querySelector('[data-room-part]');

  const renderSummary = () => {
    const rent = parseVnd(input('rent')?.value || '');
    const deposit = parseVnd(input('deposit.amount')?.value || '');
    const required = parseVnd(input('requiredDeposit')?.value || '');
    const start = input('moveInOn').value;
    const last = input('lastDay').value;
    setHtml(form.querySelector('[data-summary]'), html`<div class="ad-rail-body">
      ${room ? plate(room.code, { size: 'lg' }) : html`<span class="ad-rail-empty">Chưa chọn phòng</span>`}
      <p class="ad-rail-name">${tenantLabel || 'Chưa chọn khách'}</p>
      <p class="ad-rail-sub">${room?.property.name || ''}</p>
      <dl>
        <div><dt>Thời hạn</dt><dd class="num">${start && last ? `${formatDate(start)} – ${formatDate(last)}` : '—'}</dd></div>
        <div><dt>Tiền thuê mỗi tháng</dt><dd class="num">${rent ? formatVnd(rent) : '—'}</dd></div>
        <div><dt>Cọc yêu cầu</dt><dd class="num">${required != null ? formatVnd(required) : '—'}</dd></div>
        <div class="is-total"><dt>Cọc thu lần này</dt><dd class="num">${formatVnd(deposit || 0)}</dd></div>
      </dl>
      ${required != null && (deposit || 0) < required ? html`<p class="ad-rail-warn">Cọc thu thấp hơn mức yêu cầu. Có thể thu thêm sau ở trang hợp đồng.</p>` : ''}
    </div>`);
  };

  const renderRoomPart = () => {
    if (!room) {
      fields.splice(0, fields.length, ...baseFields);
      setHtml(part, '');
      renderSummary();
      return;
    }
    const rates = room.rates.effective;
    const rent = rates.find((r) => r.chargeType.category === 'rent');
    const others = rates.filter((r) => r.chargeType.category !== 'rent' && r.chargeType.category !== 'compensation');
    const moneyFields = [
      { name: 'rent', label: 'Tiền thuê mỗi tháng', type: 'money', required: true, positive: true, col: 'col-md-6' },
      { name: 'requiredDeposit', label: 'Tiền cọc yêu cầu', type: 'money', required: true, col: 'col-md-6' },
      { name: 'deposit.amount', label: 'Tiền cọc đã thu', type: 'money', col: 'col-md-6', optional: true, help: 'Khác mức yêu cầu vẫn được, phần thiếu thu sau.' },
      { name: 'deposit.methodCode', label: 'Cách thu cọc', type: 'select', placeholderOption: false, col: 'col-md-6', options: METHOD_OPTIONS, default: 'cash' },
    ];
    const rateFields = others.map((r) => ({ name: `rate.${r.chargeType.code}`, label: `${r.chargeType.name} (đ/${r.chargeType.unitLabel})`, type: 'money', col: 'col-md-6', required: true, help: r.billingCycle === 'once' ? 'Thu một lần' : r.scope === 'room' ? 'Theo giá riêng của phòng' : 'Theo giá cơ sở' }));
    // SQL stores readings on contracts/invoices; older mock DTOs also expose meters.
    const roomMeters = room.meters ?? ['electricity', 'water']
      .filter((kind) => rates.some((r) => r.chargeType.category === kind && r.calculationMethod === 'metered'))
      .map((meterKind) => ({ meterKind }));
    const meters = roomMeters.filter((m) => !m.removedAt && !(existing?.meters ?? []).find((x) => x.meterKind === m.meterKind)?.hasBaseline);
    const readingFields = meters.map((m) => ({
      name: `readings.${m.meterKind}`, label: m.meterKind === 'electricity' ? 'Số điện đầu kỳ (kWh)' : 'Số nước đầu kỳ (m³)', type: 'decimal', decimals: 3, required: true, min: 0, col: 'col-md-6',
      help: m.lastReading ? `Lần chốt gần nhất: ${formatNumber(m.lastReading.value, 3)} ngày ${formatDate(m.lastReading.observedAt)}` : 'Phòng chưa có số nào. Nhập số đang hiện trên công tơ.',
    }));
    fields.splice(0, fields.length, ...baseFields, ...moneyFields, ...rateFields, ...readingFields);
    setHtml(part, html`<section class="sr-panel"><div class="sr-panel-head"><h2>Tiền thuê và tiền cọc</h2></div><div class="sr-panel-body">${renderFields(moneyFields, { rent: rent?.unitPrice, requiredDeposit: room.requiredDeposit, deposit: { amount: room.requiredDeposit, methodCode: 'cash' } })}</div></section>
      ${rateFields.length ? html`<section class="sr-panel"><div class="sr-panel-head"><h2>Giá điện nước và dịch vụ theo hợp đồng</h2><span class="sr-panel-note">Giá này được chốt trong hợp đồng</span></div>
        <div class="sr-panel-body">${renderFields(rateFields, { rate: Object.fromEntries(others.map((r) => [r.chargeType.code, r.unitPrice])) })}</div></section>` : ''}
      ${readingFields.length ? html`<section class="sr-panel"><div class="sr-panel-head"><h2>Số điện nước khi vào ở</h2><span class="sr-panel-note">Làm mốc tính tiền tháng đầu</span></div>
        <div class="sr-panel-body">${renderFields(readingFields, { readings: Object.fromEntries(meters.map((m) => [m.meterKind, m.lastReading?.value])) })}</div></section>` : ''}`);
    renderSummary();
  };

  let roomsRequest = 0;
  const loadRooms = async () => {
    const request = ++roomsRequest;
    const select = input('roomId');
    const [list, property] = await Promise.all([roomsApi.list({ propertyId, forContract: true, tenantId: input('tenantId')?.value || undefined, pageSize: 200 }), propertiesApi.get(propertyId)]);
    if (request !== roomsRequest || ctx.signal.aborted) return;
    billing = property.billingSettings;
    const free = list.items;
    const previous = select.value;
    setHtml(select, html`<option value="">${free.length ? 'Chọn phòng' : 'Không có phòng phù hợp cho khách này'}</option>${free.map((r) => html`<option value="${r.id}">${r.code} – ${r.name} (${formatVnd(r.currentRent)})${r.occupancyStatus === 'reserved' ? ' · Cọc giữ phòng' : ''}</option>`)}`);
    select.value = free.some((r) => r.id === previous) ? previous : '';
    if (!select.value && room) { room = null; roomReady = false; renderRoomPart(); }
  };

  const selectRoom = async (id) => {
    roomReady = false;
    room = null;
    renderRoomPart();
    if (input('roomId')) input('roomId').value = id || '';
    const selected = id ? await roomsApi.get(id) : null;
    if (input('roomId') && input('roomId').value !== id) return;
    room = selected;
    if (input('roomId')) input('roomId').value = id || '';
    renderRoomPart();
    roomReady = Boolean(room);
  };

  input('propertyId')?.addEventListener('change', async (event) => {
    propertyId = event.target.value;
    room = null;
    roomReady = false;
    renderRoomPart();
    await loadRooms();
  });
  input('roomId')?.addEventListener('change', async (event) => {
    try { await selectRoom(event.target.value); }
    catch (error) {
      const alert = form.querySelector('[data-form-alert]');
      setHtml(alert, note(error.detail || error.message, { tone: 'danger' }));
      alert.hidden = false;
    }
  });
  input('tenantId')?.addEventListener('change', async (event) => {
    const ts = event.target.tomselect;
    tenantLabel = ts?.options[event.target.value]?.text || null;
    renderSummary();
    try { await loadRooms(); } catch (error) {
      const alert = form.querySelector('[data-form-alert]');
      setHtml(alert, note(error.detail || error.message, { tone: 'danger' })); alert.hidden = false;
    }
  });
  form.addEventListener('input', renderSummary);
  form.addEventListener('change', renderSummary);

  const pickTenant = (tenant) => {
    const ts = input('tenantId').tomselect;
    ts.addOption({ value: tenant.id, text: tenant.fullName, sub: tenant.code });
    ts.setValue(tenant.id);
    tenantLabel = tenant.fullName;
    renderSummary();
  };
  form.querySelector('[data-add-tenant]')?.addEventListener('click', async () => {
    const created = await tenantFormModal(null, { forContract: true });
    if (created) pickTenant(created);
  });
  form.querySelector('[data-edit-tenant]').addEventListener('click', async () => {
    const id = existing?.representative.id || input('tenantId')?.value;
    if (!id) { toast('Chọn khách thuê trước khi bổ sung thông tin.'); return; }
    const tenant = await tenantsApi.get(id);
    const updated = await tenantFormModal(tenant, { forContract: true });
    if (updated && !existing) pickTenant(updated);
  });
  form.querySelector('[data-from-inquiry]')?.addEventListener('click', async (event) => {
    const { runAction } = await import('../../components/dialogs.js');
    const updated = await runAction(() => inquiriesApi.linkTenant(inquiry.id, {}));
    if (updated?.tenant) {
      pickTenant(updated.tenant);
      event.target.remove();
    }
  });
  form.querySelectorAll('[data-term]').forEach((btn) => btn.addEventListener('click', () => {
    const start = input('moveInOn').value || today;
    const last = addDays(quickContractEndExclusive(start, Number(btn.dataset.term)), -1);
    input('lastDay')._flatpickr?.setDate(last, true);
    renderSummary();
  }));

  const { createUploader } = await import('../../components/uploader.js');
  const uploader = createUploader(form.querySelector('[data-contract-files]'), { multiple: true, maxFiles: 6, visibility: 'private', purpose: 'contract_signed' });
  ctx.onCleanup(() => uploader.destroy());

  try {
    if (existing) {
      billing = (await propertiesApi.get(propertyId)).billingSettings;
      await selectRoom(existing.room.id);
    } else await loadRooms();
    if (preset) {
      if (!input('roomId').querySelector(`option[value="${preset.id}"]`)) throw new Error(`Phòng ${preset.code} hiện không còn trống hoặc đang được giữ chỗ.`);
      await selectRoom(preset.id);
    }
  } catch (error) {
    setHtml(form.querySelector('[data-form-alert]'), note(error.detail || error.message, { tone: 'danger' }));
    form.querySelector('[data-form-alert]').hidden = false;
  }
  renderSummary();
  const binding = bindForm(form, {
    fields,
    validate: (v) => (v.moveInOn && v.lastDay && v.lastDay <= v.moveInOn ? { lastDay: ['Ngày cuối phải sau ngày vào ở.'] } : null),
    onSubmit: async (v, { idempotencyKey }) => {
      if (!room || !roomReady) throw new FormError('Dữ liệu phòng chưa sẵn sàng. Chọn lại phòng trước khi tạo hợp đồng.');
      const tenant = await tenantsApi.get(existing?.representative.id || v.tenantId);
      const profileErrors = Object.values(contractTenantErrors(tenant)).flat();
      if (profileErrors.length) throw new FormError(`${profileErrors.join(' ')} Bấm “Bổ sung thông tin khách” để cập nhật.`);
      if (uploader.busy) throw new FormError('Tệp đang tải lên. Chờ tải xong rồi lưu lại.');
      const [signed, ...extras] = uploader.fileIds;
      if (!signed) throw new FormError('Cần tải lên bản hợp đồng đã ký (ảnh hoặc PDF).');
      const rates = room.rates.effective.filter((r) => r.chargeType.category !== 'compensation').map((r) => {
        const price = r.chargeType.category === 'rent' ? v.rent : v.rate?.[r.chargeType.code];
        if (price == null) throw new FormError(`Cần nhập giá ${r.chargeType.name}. Chọn lại phòng nếu trường giá chưa hiển thị.`);
        return {
        chargeTypeId: r.chargeType.id, unitPrice: price,
        calculationMethod: r.calculationMethod, billingCycle: r.billingCycle, prorationMode: r.prorationMode,
      }; });
      const common = {
        contract: { endsOn: addDays(v.lastDay, 1), requiredDeposit: v.requiredDeposit, invoiceDay: billing.invoiceDay, dueAfterDays: billing.dueAfterDays, prorationPolicy: billing.prorationPolicy || 'actual_days', termsText: v.termsText, rates },
        signature: { signatureMethod: 'paper', signedAt: new Date().toISOString(), signedFileId: signed },
        readings: v.readings, deposit: v.deposit?.amount ? { amount: v.deposit.amount, methodCode: v.deposit.methodCode, ...(v.deposit.methodCode === 'bank_transfer' ? { externalReference: `HD-${room.code}` } : {}) } : undefined,
      };
      const detail = existing
        ? await tenanciesApi.importContract(existing.id, { ...common, effectiveFrom: v.moveInOn }, idempotencyKey)
        : await tenanciesApi.checkIn({ ...common, mode: 'new', roomId: room.id, tenantId: v.tenantId, moveInOn: v.moveInOn, inquiryId: inquiry?.id, confirm: true }, idempotencyKey);
      const contractId = detail.contracts[0].id;
      await Promise.all(extras.map((fileId) => contractsApi.addAttachment(contractId, { fileId })));
      binding.reset();
      dataChanged();
      toast(existing ? `Đã bổ sung hợp đồng cho phòng ${room.code}.` : `Đã tạo hợp đồng. Phòng ${room.code} chuyển sang đã thuê.`);
      ctx.navigate(`/admin/contracts/${contractId}`);
    },
  });
  ctx.onCleanup(() => binding.destroy());
}
