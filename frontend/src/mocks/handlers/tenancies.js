// Đợt thuê: nhận phòng, người ở cùng, chuyển phòng, trả phòng/quyết toán, đề nghị của khách, bàn giao.
// Mỗi lệnh chạy trọn trong một "transaction" mock: lỗi ở bước nào cũng không để dữ liệu dở dang.
import { uuid } from '../../utils/ids.js';
import { addDays, compareIso, formatDate, isIsoDate, nextMonthStart, vnDateTimeToInstant } from '../../utils/date.js';
import { conflict, fail, listResponse, rule, validator } from '../respond.js';
import {
  applyAllocation, assertRoomFree, audit, contractStatus, createAllocation, createDraftInvoice, createPayment, currentMeter,
  depositBySource, depositHeld, depositOffset, depositReceipt, depositRefund, depositTransfer, ensureRatePlan, find,
  invoiceBalance, issueInvoice, lastInvoicedEnd, must, nextCode, notify, recordReading, settingsOf, staffWith, tenancyContext,
  validReadings,
} from '../engine.js';
import {
  contractSummary, depositEntryDto, fileDto, invoiceSummary, roomRef, tenancyBrief, tenantRef, tenantSummary, userRef, versionDto,
} from '../dto.js';
import { propertyFilter, roomInScope, tenancyInScope, tenantInScope } from '../scope.js';

// ---------------------------------------------------------------- tiện ích

function validateContractInput(v, contract, prefix = 'contract') {
  v.money(`${prefix}.requiredDeposit`, contract?.requiredDeposit, 'Mức cọc yêu cầu');
  v.number(`${prefix}.invoiceDay`, contract?.invoiceDay, 'Ngày lập hóa đơn', { min: 1, max: 31 });
  v.number(`${prefix}.dueAfterDays`, contract?.dueAfterDays, 'Số ngày đến hạn', { min: 0, max: 365 });
  v.oneOf(`${prefix}.prorationPolicy`, contract?.prorationPolicy, ['actual_days', 'full_month'], 'Cách tính lẻ tháng');
  v.required(`${prefix}.termsText`, contract?.termsText, 'Điều khoản');
  v.date(`${prefix}.endsOn`, contract?.endsOn, 'Ngày kết thúc hợp đồng');
  if (!contract?.rates?.length) v.add(`${prefix}.rates`, 'Hợp đồng cần bảng giá đã thỏa thuận (ít nhất tiền thuê).');
}

function validateSignature(v, signature) {
  v.oneOf('signature.signatureMethod', signature?.signatureMethod, ['paper', 'external_esign'], 'Cách ký');
  v.required('signature.signedAt', signature?.signedAt, 'Thời điểm ký');
  v.required('signature.signedFileId', signature?.signedFileId, 'Bản ký (tệp scan/PDF)');
}

function createSignedContract(ctx, { tenancy, tenant, property, contract, signature, effectiveFrom, predecessorContractId = null }) {
  const { db } = ctx;
  const rentType = db.chargeTypes.find((t) => t.organizationId === ctx.organizationId && t.category === 'rent');
  if (!contract.rates.some((r) => r.chargeTypeId === rentType.id)) rule('contract_needs_rent', 'Bảng giá hợp đồng phải có tiền thuê.', { 'contract.rates': ['Thiếu tiền thuê.'] });
  if (contract.endsOn <= effectiveFrom) fail(422, 'validation_failed', 'Ngày kết thúc phải sau ngày hiệu lực.', { 'contract.endsOn': ['Phải sau ngày bắt đầu.'] });
  const file = must(db.files, signature.signedFileId, 'bản ký');
  if (file.scanStatus === 'rejected') rule('file_rejected', 'Tệp bản ký không qua kiểm tra an toàn.');
  if (signature.signedAt > ctx.now) fail(422, 'validation_failed', 'Thời điểm ký không được ở tương lai.', { 'signature.signedAt': ['Không được ở tương lai.'] });
  const year = effectiveFrom.slice(0, 4);
  const record = {
    id: uuid(), tenancyId: tenancy.id, code: nextCode(db, `contract:${year}`, (n) => `HDT-${year}-${String(n).padStart(4, '0')}`), predecessorContractId,
    archivedAt: null, createdBy: ctx.user.id, createdAt: ctx.now,
  };
  db.contracts.push(record);
  const landlord = ctx.user;
  const version = {
    id: uuid(), contractId: record.id, versionNo: 1, effectiveFrom, endsOn: contract.endsOn, requiredDeposit: contract.requiredDeposit, invoiceDay: contract.invoiceDay,
    dueAfterDays: contract.dueAfterDays, prorationPolicy: contract.prorationPolicy, termsText: contract.termsText, changeReason: contract.changeReason || null,
    signedAt: signature.signedAt, confirmedBy: ctx.user.id, signatureMethod: signature.signatureMethod, externalSignatureReference: signature.externalSignatureReference || null,
    createdAt: ctx.now,
    parties: [
      { role: 'landlord', userId: landlord.id, tenantId: null, fullNameSnapshot: landlord.displayName, addressSnapshot: `${property.address.line}, ${property.address.locality || ''}, ${property.address.province}`, identitySnapshot: null },
      { role: 'representative', userId: null, tenantId: tenant.id, fullNameSnapshot: tenant.fullName, addressSnapshot: tenant.address?.line || null, identitySnapshot: db.identityDocuments.find((d) => d.tenantId === tenant.id)?.numberMasked || null },
    ],
    files: [{ fileId: file.id, fileKind: 'signed' }],
  };
  db.contractVersions.push(version);
  const plan = ensureRatePlan(db, { contractVersionId: version.id });
  for (const rate of contract.rates) {
    const type = find(db.chargeTypes, rate.chargeTypeId);
    if (!type || type.organizationId !== ctx.organizationId) fail(422, 'validation_failed', 'Khoản thu trong bảng giá không hợp lệ.');
    db.chargeRates.push({
      id: uuid(), ratePlanId: plan.id, chargeTypeId: type.id, effectiveFrom, effectiveTo: null, unitPrice: rate.unitPrice,
      calculationMethod: ['electricity', 'water'].includes(type.category) ? 'metered' : rate.calculationMethod || 'fixed',
      billingCycle: rate.billingCycle || 'monthly', prorationMode: rate.prorationMode || (type.category === 'rent' ? 'actual_days' : 'full_period'),
    });
  }
  return { contract: record, version };
}

function recordHandover(ctx, { tenancy, kind, occurredAt, handover, room }) {
  const { db } = ctx;
  const assets = (handover?.assets || []).map((a) => {
    const asset = db.roomAssets.find((x) => x.id === a.roomAssetId && x.roomId === room.id);
    if (!asset) fail(422, 'validation_failed', 'Tài sản bàn giao không thuộc phòng.');
    return { roomAssetId: asset.id, nameSnapshot: asset.name, quantity: asset.quantity, condition: a.condition || 'Tốt' };
  });
  const record = {
    id: uuid(), tenancyId: tenancy.id, kind, occurredAt, notes: handover?.notes || null, landlordConfirmedBy: ctx.user.id,
    tenantConfirmedBy: null, confirmedAt: ctx.now, representativeConfirmationText: handover?.tenantConfirmed ? 'Khách xác nhận hiện trạng trên biên bản.' : null,
    assets, fileIds: handover?.fileIds || [],
  };
  db.handovers.push(record);
  return record;
}

function recordHandoverReadings(ctx, { tenancy, room, handover, readings, kind, observedAt }) {
  const created = {};
  for (const meterKind of ['electricity', 'water']) {
    const meter = currentMeter(ctx.db, room.id, meterKind);
    if (!meter) continue;
    const value = readings?.[meterKind];
    if (value == null || value === '') {
      fail(422, 'validation_failed', `Thiếu chỉ số ${meterKind === 'electricity' ? 'điện' : 'nước'} khi bàn giao; không mặc định bằng 0.`, { [`readings.${meterKind}`]: ['Bắt buộc nhập chỉ số.'] });
    }
    created[meterKind] = recordReading(ctx.db, ctx, { meterId: meter.id, observedAt, readingValue: Number(value), tenancyId: tenancy.id, handoverId: handover.id, readingKind: kind });
  }
  return created;
}

function tenancyDetail(ctx, tenancy) {
  const { db, today } = ctx;
  const c = tenancyContext(db, tenancy);
  const contracts = db.contracts.filter((k) => k.tenancyId === tenancy.id);
  const transferFrom = db.roomTransfers.find((t) => t.newTenancyId === tenancy.id);
  const transferTo = db.roomTransfers.find((t) => t.oldTenancyId === tenancy.id);
  return {
    ...tenancyBrief(db, tenancy, today),
    representativeDetail: tenantSummary(db, c.tenant, today),
    residents: db.residents.filter((r) => r.tenancyId === tenancy.id).map((r) => ({ ...r, tenant: tenantRef(find(db.tenants, r.tenantId)), hasPortalAccount: Boolean(find(db.tenants, r.tenantId)?.userId) })),
    contracts: contracts.map((k) => ({ ...contractSummary(db, k, today), versions: db.contractVersions.filter((v) => v.contractId === k.id).sort((a, b) => a.versionNo - b.versionNo).map((v) => versionDto(db, v)) })),
    handovers: db.handovers.filter((h) => h.tenancyId === tenancy.id).sort((a, b) => compareIso(a.occurredAt, b.occurredAt)).map((h) => handoverDto(ctx, h)),
    invoices: db.invoices.filter((i) => i.tenancyId === tenancy.id).map((i) => invoiceSummary(db, i, today)).sort((a, b) => compareIso(b.serviceFrom, a.serviceFrom)),
    depositLedger: db.depositEntries.filter((e) => e.tenancyId === tenancy.id).sort((a, b) => compareIso(a.occurredAt, b.occurredAt)).map((e) => depositEntryDto(db, e)),
    requests: db.tenancyRequests.filter((x) => x.tenancyId === tenancy.id).map((x) => requestDto(ctx, x)),
    onboardingGaps: db.onboardingGaps.filter((g) => g.tenancyId === tenancy.id).map((g) => ({ ...g, resolvedBy: userRef(db, g.resolvedBy) })),
    transferFrom: transferFrom ? { tenancyId: transferFrom.oldTenancyId, transferOn: transferFrom.transferOn, room: roomRef(db, tenancyContext(db, transferFrom.oldTenancyId).room), reason: transferFrom.reason } : null,
    transferTo: transferTo ? { tenancyId: transferTo.newTenancyId, transferOn: transferTo.transferOn, room: roomRef(db, tenancyContext(db, transferTo.newTenancyId).room), reason: transferTo.reason } : null,
    settlement: (() => {
      const s = db.settlements.find((x) => x.tenancyId === tenancy.id);
      return s ? { ...s, confirmedBy: userRef(db, s.confirmedBy) } : null;
    })(),
    reservation: tenancy.reservationId ? find(db.reservations, tenancy.reservationId) : null,
    endedBy: userRef(db, tenancy.endedBy),
    lastInvoicedEnd: lastInvoicedEnd(db, tenancy.id),
    meters: ['electricity', 'water'].map((kind) => {
      const meter = currentMeter(db, c.room.id, kind);
      const last = meter ? validReadings(db, meter.id).pop() : null;
      const hasBaseline = meter ? validReadings(db, meter.id).some((x) => x.tenancyId === tenancy.id && ['baseline', 'checkin'].includes(x.readingKind)) : false;
      return meter ? { id: meter.id, meterKind: kind, serialNumber: meter.serialNumber, hasBaseline, lastReading: last ? { value: last.readingValue, observedAt: last.observedAt, kind: last.readingKind } : null } : null;
    }).filter(Boolean),
  };
}

function handoverDto(ctx, h) {
  const { db } = ctx;
  const c = tenancyContext(db, h.tenancyId);
  return {
    id: h.id, kind: h.kind, occurredAt: h.occurredAt, notes: h.notes, tenancyId: h.tenancyId, room: roomRef(db, c.room), representative: tenantRef(c.tenant),
    landlordConfirmedBy: userRef(db, h.landlordConfirmedBy), confirmedAt: h.confirmedAt, representativeConfirmationText: h.representativeConfirmationText,
    assets: h.assets, files: (h.fileIds || []).map((id) => fileDto(db, id)).filter(Boolean),
    readings: db.readings.filter((r) => r.handoverId === h.id).map((r) => ({ id: r.id, meterKind: find(db.meters, r.meterId).meterKind, value: r.readingValue, status: r.status })),
  };
}

function requestDto(ctx, x) {
  const { db } = ctx;
  const c = tenancyContext(db, x.tenancyId);
  return {
    id: x.id, tenancyId: x.tenancyId, requestType: x.requestType, desiredOn: x.desiredOn, targetRoom: x.targetRoomId ? roomRef(db, find(db.rooms, x.targetRoomId)) : null,
    message: x.message, status: x.status, requestedBy: userRef(db, x.requestedBy), reviewedBy: userRef(db, x.reviewedBy), decisionNotes: x.decisionNotes,
    createdAt: x.createdAt, reviewedAt: x.reviewedAt, room: roomRef(db, c.room), representative: tenantRef(c.tenant),
  };
}

function hasOtherActiveTenancy(db, tenantId, organizationId, ignoreId) {
  return db.tenancies.some((t) => t.id !== ignoreId && t.representativeTenantId === tenantId && ['planned', 'active'].includes(t.status)
    && tenancyContext(db, t).organizationId === organizationId);
}

function completeRequests(ctx, tenancyId, type, note) {
  ctx.db.tenancyRequests.filter((x) => x.tenancyId === tenancyId && x.requestType === type && ['pending', 'approved'].includes(x.status)).forEach((x) => {
    x.status = 'completed';
    x.reviewedBy ||= ctx.user.id;
    x.reviewedAt ||= ctx.now;
    x.decisionNotes = x.decisionNotes || note;
  });
}

const METER_KINDS = ['electricity', 'water'];
const METER_LABEL = { electricity: 'Số điện', water: 'Số nước' };

function validateBaseline(v, readings, prefix) {
  METER_KINDS.forEach((kind) => {
    if (readings?.[kind] != null) v.number(`${prefix}.${kind}`, readings[kind], METER_LABEL[kind], { min: 0, decimals: 3 });
  });
}

/** Chỉ số đầu của khách đang ở: mốc tính điện nước tháng đầu, không mặc định bằng 0 khi thiếu. */
function recordBaseline(ctx, { tenancy, room, readings }) {
  const moveIn = vnDateTimeToInstant(tenancy.actualMoveIn, 9);
  METER_KINDS.forEach((kind) => {
    const meter = currentMeter(ctx.db, room.id, kind);
    if (!meter || readings?.[kind] == null) return;
    // Công tơ có thể được lắp sau ngày khách vào ở (phòng mới khai báo trên hệ thống): lấy mốc lắp công tơ.
    const observedAt = meter.installedAt > moveIn ? meter.installedAt : moveIn;
    recordReading(ctx.db, ctx, { meterId: meter.id, observedAt, readingValue: readings[kind], tenancyId: tenancy.id, readingKind: 'baseline' });
  });
}

/**
 * Ghi nhận khách đang ở mà chưa có hợp đồng trong hệ thống (onboarding_mode='import'), mục "Đã thuê" ở form phòng.
 * Không tạo hợp đồng giả: phòng thành đã thuê ngay, còn hóa đơn chỉ phát hành được sau khi có bản ký.
 */
export function registerExistingTenancy(ctx, room, occupant) {
  const { db } = ctx;
  ctx.require('tenancies.checkin');
  const v = validator();
  v.required('occupant.tenantId', occupant?.tenantId, 'Khách đang thuê');
  v.date('occupant.moveInOn', occupant?.moveInOn, 'Ngày vào ở');
  validateBaseline(v, occupant?.readings, 'occupant.readings');
  v.check();
  if (occupant.moveInOn > ctx.today) fail(422, 'validation_failed', 'Ngày vào ở không được ở tương lai.', { 'occupant.moveInOn': ['Không được sau hôm nay.'] });
  if (room.operatingStatus !== 'available') rule('room_not_available', `Phòng ${room.code} đang ${room.operatingStatus === 'maintenance' ? 'bảo trì' : 'ngừng khai thác'} nên chưa ghi nhận khách được.`);
  const tenant = tenantInScope(ctx, occupant.tenantId);
  if (hasOtherActiveTenancy(db, tenant.id, ctx.organizationId)) {
    conflict('tenant_has_tenancy', `${tenant.fullName} đang là người thuê của một phòng khác.`, { 'occupant.tenantId': ['Khách đang thuê phòng khác.'] });
  }
  const allocation = createAllocation(db, { roomId: room.id, startsOn: occupant.moveInOn, endsOn: null, state: 'occupied' });
  const tenancy = {
    id: uuid(), allocationId: allocation.id, representativeTenantId: tenant.id, reservationId: null, status: 'active', plannedMoveIn: occupant.moveInOn,
    actualMoveIn: occupant.moveInOn, actualMoveOut: null, onboardingMode: 'import', endReason: null, endedBy: null, createdAt: ctx.now,
  };
  db.tenancies.push(tenancy);
  const hasIdentity = db.identityDocuments.some((d) => d.tenantId === tenant.id);
  ['Hợp đồng đã ký', ...(hasIdentity ? [] : ['Giấy tờ tùy thân']), 'Biên bản bàn giao ban đầu'].forEach((missingItem) => {
    db.onboardingGaps.push({ id: uuid(), tenancyId: tenancy.id, missingItem, sourceReference: null, notes: null, resolvedAt: null, resolvedBy: null });
  });
  recordBaseline(ctx, { tenancy, room, readings: occupant.readings });
  audit(db, ctx, { action: 'tenancy.import', tableName: 'tenancies', recordId: tenancy.id, after: { roomId: room.id, tenantId: tenant.id, moveIn: occupant.moveInOn } });
  return tenancy;
}

// ---------------------------------------------------------------- trả phòng: tính toán dùng chung cho xem trước và xác nhận

function checkoutComputation(ctx, c, b, { persist }) {
  const { db } = ctx;
  const moveOut = b.moveOutOn;
  const observedAt = vnDateTimeToInstant(moveOut, 9);
  const from = lastInvoicedEnd(db, c.tenancy.id) || c.tenancy.actualMoveIn;
  const meteredOnly = from >= moveOut;
  // Ghi tạm chỉ số + bàn giao để tính hóa đơn cuối (rollback nếu chỉ xem trước).
  const handover = recordHandover(ctx, { tenancy: c.tenancy, kind: 'checkout', occurredAt: observedAt, handover: b.handover, room: c.room });
  const readings = recordHandoverReadings(ctx, { tenancy: c.tenancy, room: c.room, handover, readings: b.readings, kind: 'checkout', observedAt });
  const original = c.tenancy.actualMoveOut;
  c.tenancy.actualMoveOut = moveOut;
  const compensation = db.chargeTypes.find((t) => t.organizationId === ctx.organizationId && t.category === 'compensation');
  const manualLines = (b.extraCharges || []).filter((x) => x.amount > 0).map((x) => ({
    chargeTypeId: x.chargeTypeId || compensation.id, chargeInstanceId: null, sourceRateId: null, sourceScope: 'manual', descriptionSnapshot: x.description,
    unitSnapshot: 'lần', quantity: 1, unitPrice: x.amount, sign: 1, prorationNumerator: 1, prorationDenominator: 1,
  }));
  const pendingDrafts = db.invoices.filter((i) => i.tenancyId === c.tenancy.id && i.status === 'draft');
  pendingDrafts.forEach((i) => { db.invoices.splice(db.invoices.indexOf(i), 1); });
  const final = createDraftInvoice(db, ctx, { tenancyId: c.tenancy.id, kind: 'final', from: meteredOnly ? addDays(moveOut, -1) : from, to: moveOut, endReadings: { electricity: readings.electricity?.id, water: readings.water?.id }, meteredOnly, manualLines });
  c.tenancy.actualMoveOut = original;
  const finalTotal = final.lines.reduce((s, l) => s + (l.sign * Math.round(l.quantity * l.unitPrice * l.prorationNumerator / l.prorationDenominator)), 0);
  const outstanding = db.invoices.filter((i) => i.tenancyId === c.tenancy.id && i.status === 'issued' && !['debit_adjustment', 'credit_adjustment'].includes(i.kind))
    .map((i) => invoiceSummary(db, i, ctx.today)).filter((i) => i.outstandingAmount > 0).sort((a, x) => compareIso(a.dueOn, x.dueOn));
  void persist;
  return { handover, readings, final, finalTotal, outstanding, from, meteredOnly, removedDrafts: pendingDrafts.map((i) => i.id) };
}

// ---------------------------------------------------------------- đăng ký route

export default function register(r) {
  r.get('/api/v1/tenancies', (ctx) => {
    const q = ctx.query;
    const allowed = propertyFilter(ctx);
    const all = ctx.db.tenancies.filter((t) => allowed.has(tenancyContext(ctx.db, t).property.id)).map((t) => tenancyBrief(ctx.db, t, ctx.today));
    return listResponse(all, q, {
      filter: (t) => (!q.status || (q.status === 'current' ? ['active', 'planned'].includes(t.status) : t.status === q.status))
        && (!q.contract || (q.contract === 'expiring' ? t.contract?.expiring : q.contract === 'expired' ? t.contract?.stillOccupiedAfterExpiry : q.contract === 'missing' ? !t.contract : true))
        && (!q.hasDebt || (q.hasDebt === 'true' ? t.outstandingAmount > 0 : t.outstandingAmount === 0))
        && (!q.onboardingMode || t.onboardingMode === q.onboardingMode)
        && (!q.depositShort || (t.requiredDeposit != null && t.depositHeld < t.requiredDeposit)),
      search: (t) => [t.room.code, t.representative.fullName, t.representative.code, t.contract?.code],
      sortable: ['room.code', 'representative.fullName', 'actualMoveIn', 'plannedMoveIn', 'outstandingAmount', 'status'],
      defaultSort: 'room.code',
    });
  }, { perm: 'tenants.read' });

  r.get('/api/v1/tenancies/:id', (ctx) => tenancyDetail(ctx, tenancyInScope(ctx, ctx.params.id).tenancy), { perm: 'tenants.read' });

  // ---------------------------------------------------------------- nhận phòng
  r.post('/api/v1/tenancies/check-in', (ctx) => {
    const b = ctx.body;
    const { db } = ctx;
    const v = validator();
    v.oneOf('mode', b.mode, ['new', 'planned'], 'Kiểu nhận phòng');
    v.date('moveInOn', b.moveInOn, 'Ngày nhận phòng thực tế');
    if (b.mode === 'new') {
      v.required('roomId', b.roomId, 'Phòng');
      v.required('tenantId', b.tenantId, 'Khách đại diện');
      validateContractInput(v, b.contract);
      validateSignature(v, b.signature);
    } else {
      v.required('tenancyId', b.tenancyId, 'Đợt thuê dự kiến');
    }
    if (b.deposit?.amount) v.money('deposit.amount', b.deposit.amount, 'Tiền cọc thực thu', { positive: true });
    if (!b.confirm) v.add('confirm', 'Xác nhận đã kiểm tra hợp đồng, bàn giao và chỉ số trước khi nhận phòng.');
    v.check();
    if (b.moveInOn > ctx.today) fail(422, 'validation_failed', 'Ngày nhận phòng thực tế không được ở tương lai. Với lịch tương lai, dùng giữ chỗ.', { moveInOn: ['Không được sau hôm nay.'] });
    if (b.deposit?.amount) ctx.require(['deposits.receive']);

    let tenancy;
    let room;
    let tenant;
    let contractInfo = null;
    if (b.mode === 'planned') {
      const c = tenancyInScope(ctx, b.tenancyId);
      ({ tenancy, room, tenant } = c);
      if (tenancy.status !== 'planned') conflict('tenancy_not_planned', 'Đợt thuê không ở trạng thái dự kiến.');
      const signed = db.contracts.filter((k) => k.tenancyId === tenancy.id).flatMap((k) => db.contractVersions.filter((x) => x.contractId === k.id && x.signedAt));
      if (!signed.length) rule('contract_not_signed', 'Đợt thuê dự kiến chưa có hợp đồng đã ký. Không nhận phòng khi chưa có bản ký.');
      const firstEffective = signed.map((x) => x.effectiveFrom).sort()[0];
      if (b.moveInOn < firstEffective) rule('move_in_before_contract', `Ngày nhận (${formatDate(b.moveInOn)}) sớm hơn hiệu lực hợp đồng (${formatDate(firstEffective)}). Lập phụ lục điều chỉnh ngày hiệu lực trước.`);
      const allocation = find(db.roomAllocations, tenancy.allocationId);
      assertRoomFree(db, room.id, b.moveInOn, null, [allocation.id]);
      Object.assign(allocation, { state: 'occupied', startsOn: b.moveInOn, endsOn: null });
    } else {
      room = roomInScope(ctx, b.roomId);
      tenant = tenantInScope(ctx, b.tenantId);
      ctx.require('contracts.sign');
      if (room.operatingStatus !== 'available') rule('room_not_available', `Phòng ${room.code} đang ${room.operatingStatus === 'maintenance' ? 'bảo trì' : 'ngừng khai thác'}; không nhận phòng.`);
      if (hasOtherActiveTenancy(db, tenant.id, ctx.organizationId)) conflict('tenant_has_tenancy', `${tenant.fullName} đang là đại diện của một đợt thuê khác trong đơn vị. Bản đầu chỉ cho một đợt thuê hoạt động mỗi đại diện.`);
      let allocation;
      let reservation = null;
      if (b.reservationId) {
        reservation = must(db.reservations, b.reservationId, 'giữ chỗ');
        allocation = find(db.roomAllocations, reservation.allocationId);
        if (allocation.roomId !== room.id) rule('reservation_room_mismatch', 'Giữ chỗ thuộc phòng khác.');
        if (reservation.status !== 'holding' || allocation.state !== 'held') conflict('reservation_not_holding', 'Giữ chỗ không còn hiệu lực (đã hủy, hết hạn hoặc đã chuyển).');
        if (allocation.holdExpiresAt && allocation.holdExpiresAt <= ctx.now) conflict('reservation_expired', 'Giữ chỗ đã quá hạn. Tạo giữ chỗ mới hoặc gia hạn có lý do trước khi nhận phòng.');
        if (reservation.tenantId !== tenant.id) rule('reservation_tenant_mismatch', 'Khách nhận phòng khác khách đã giữ chỗ.');
        assertRoomFree(db, room.id, b.moveInOn, null, [allocation.id]);
        Object.assign(allocation, { state: 'occupied', startsOn: b.moveInOn, endsOn: null, holdExpiresAt: null });
        reservation.status = 'converted';
      } else {
        allocation = createAllocation(db, { roomId: room.id, startsOn: b.moveInOn, endsOn: null, state: 'occupied' });
      }
      tenancy = {
        id: uuid(), allocationId: allocation.id, representativeTenantId: tenant.id, reservationId: reservation?.id || null, status: 'active', plannedMoveIn: b.moveInOn,
        actualMoveIn: b.moveInOn, actualMoveOut: null, onboardingMode: 'normal', endReason: null, endedBy: null, createdAt: ctx.now,
      };
      db.tenancies.push(tenancy);
      const property = find(db.properties, room.propertyId);
      contractInfo = createSignedContract(ctx, { tenancy, tenant, property, contract: b.contract, signature: b.signature, effectiveFrom: b.moveInOn });
      if (reservation?.inquiryId) {
        const q = find(db.inquiries, reservation.inquiryId);
        if (q) q.status = 'converted';
      }
      if (b.inquiryId) {
        const q = find(db.inquiries, b.inquiryId);
        if (q && q.roomId === room.id) q.status = 'converted';
      }
    }
    tenancy.status = 'active';
    tenancy.actualMoveIn = b.moveInOn;

    // Người ở cùng (không mặc định nghĩa vụ thanh toán).
    for (const resident of b.residents || []) {
      const person = tenantInScope(ctx, resident.tenantId);
      if (person.id === tenant.id) rule('resident_is_representative', 'Người ở cùng không được trùng người đại diện.');
      if (!db.residents.some((x) => x.tenancyId === tenancy.id && x.tenantId === person.id && !x.leftOn)) {
        db.residents.push({ id: uuid(), tenancyId: tenancy.id, tenantId: person.id, joinedOn: b.moveInOn, leftOn: null, relationship: resident.relationship || null });
      }
    }
    const occupants = 1 + db.residents.filter((x) => x.tenancyId === tenancy.id && !x.leftOn).length;
    if (occupants > room.capacity) rule('over_capacity', `Phòng ${room.code} chỉ ở tối đa ${room.capacity} người (đang khai báo ${occupants}).`, { residents: ['Vượt sức chứa.'] });

    // Bàn giao + chỉ số đầu.
    const observedAt = b.handover?.occurredAt || vnDateTimeToInstant(b.moveInOn, 9);
    const handover = recordHandover(ctx, { tenancy, kind: 'checkin', occurredAt: observedAt, handover: b.handover, room });
    recordHandoverReadings(ctx, { tenancy, room, handover, readings: b.readings, kind: 'checkin', observedAt });

    // Cọc thực thu (khác mức cọc yêu cầu trên hợp đồng).
    let depositPayment = null;
    if (b.deposit?.amount) {
      ctx.require('payments.confirm');
      depositPayment = createPayment(db, ctx, {
        tenantId: tenant.id, amount: b.deposit.amount, receivedAt: b.deposit.receivedAt || ctx.now, methodCode: b.deposit.methodCode || 'cash', status: 'confirmed',
        propertyId: room.propertyId, externalReference: b.deposit.externalReference || null, notes: 'Thu cọc khi nhận phòng', reservationId: tenancy.reservationId,
      });
      depositReceipt(db, ctx, { tenancyId: tenancy.id, paymentId: depositPayment.id, amount: b.deposit.amount, reason: 'Nhận cọc khi nhận phòng' });
    }
    audit(db, ctx, { action: 'tenancy.check_in', tableName: 'tenancies', recordId: tenancy.id, after: { roomId: room.id, tenantId: tenant.id, moveIn: b.moveInOn, contract: contractInfo?.contract.code, deposit: b.deposit?.amount || 0 } });
    notify(db, { organizationId: ctx.organizationId, recipientIds: staffWith(db, ctx.organizationId, 'tenants.read', room.propertyId).filter((id) => id !== ctx.user.id), eventKey: `checkin:${tenancy.id}`, title: `Nhận phòng ${room.code}`, body: `${tenant.fullName} nhận phòng ngày ${formatDate(b.moveInOn)}.`, url: contractInfo ? `/admin/contracts/${contractInfo.contract.id}` : '/admin/contracts', at: ctx.now });
    return tenancyDetail(ctx, tenancy);
  }, { perm: 'tenancies.checkin' });

  // ---------------------------------------------------------------- người ở cùng
  r.post('/api/v1/tenancies/:id/residents', (ctx) => {
    const { tenancy, room, tenant } = tenancyInScope(ctx, ctx.params.id);
    const b = ctx.body;
    const v = validator();
    v.required('tenantId', b.tenantId, 'Người ở cùng');
    v.date('joinedOn', b.joinedOn, 'Ngày bắt đầu ở');
    v.check();
    if (!['active', 'planned'].includes(tenancy.status)) conflict('tenancy_closed', 'Đợt thuê đã kết thúc.');
    const person = tenantInScope(ctx, b.tenantId);
    if (person.id === tenant.id) rule('resident_is_representative', 'Người đại diện đã thuộc đợt thuê; không thêm lại làm người ở cùng.');
    if (ctx.db.residents.some((x) => x.tenancyId === tenancy.id && x.tenantId === person.id && (!x.leftOn || x.leftOn > b.joinedOn))) conflict('resident_overlap', 'Người này đã ở cùng trong khoảng thời gian này.');
    const occupants = 2 + ctx.db.residents.filter((x) => x.tenancyId === tenancy.id && !x.leftOn).length;
    if (occupants > room.capacity) rule('over_capacity', `Phòng ${room.code} chỉ ở tối đa ${room.capacity} người.`);
    ctx.db.residents.push({ id: uuid(), tenancyId: tenancy.id, tenantId: person.id, joinedOn: b.joinedOn, leftOn: null, relationship: b.relationship || null });
    audit(ctx.db, ctx, { action: 'tenancy.resident_add', tableName: 'tenancy_residents', recordId: tenancy.id, after: { tenantId: person.id } });
    return tenancyDetail(ctx, tenancy);
  }, { perm: 'tenants.write' });

  r.post('/api/v1/tenancies/:id/residents/:residentId/leave', (ctx) => {
    const { tenancy } = tenancyInScope(ctx, ctx.params.id);
    const resident = ctx.db.residents.find((x) => x.id === ctx.params.residentId && x.tenancyId === tenancy.id);
    if (!resident) fail(404, 'not_found', 'Không tìm thấy người ở cùng.');
    const v = validator();
    v.date('leftOn', ctx.body.leftOn, 'Ngày rời');
    v.check();
    if (ctx.body.leftOn <= resident.joinedOn) fail(422, 'validation_failed', 'Ngày rời phải sau ngày bắt đầu ở.', { leftOn: ['Phải sau ngày bắt đầu.'] });
    resident.leftOn = ctx.body.leftOn;
    return tenancyDetail(ctx, tenancy);
  }, { perm: 'tenants.write' });

  r.post('/api/v1/tenancies/:id/onboarding-gaps/:gapId/resolve', (ctx) => {
    const { tenancy } = tenancyInScope(ctx, ctx.params.id);
    const gap = ctx.db.onboardingGaps.find((g) => g.id === ctx.params.gapId && g.tenancyId === tenancy.id);
    if (!gap) fail(404, 'not_found', 'Không tìm thấy mục hồ sơ thiếu.');
    if (gap.resolvedAt) conflict('gap_resolved', 'Mục này đã được hoàn thiện.');
    if (gap.missingItem === 'Hợp đồng đã ký' && !ctx.db.contracts.some((k) => k.tenancyId === tenancy.id)) {
      rule('contract_still_missing', 'Chưa có hợp đồng đã ký trong hệ thống. Nhập hợp đồng thật (kèm bản ký) trước khi đánh dấu hoàn thiện.');
    }
    gap.resolvedAt = ctx.now;
    gap.resolvedBy = ctx.user.id;
    gap.notes = ctx.body.notes || gap.notes;
    return tenancyDetail(ctx, tenancy);
  }, { perm: 'tenants.write' });

  // Nhập hợp đồng thật cho khách đang ở được nhập từ hệ thống cũ.
  r.post('/api/v1/tenancies/:id/contracts', (ctx) => {
    const c = tenancyInScope(ctx, ctx.params.id);
    const b = ctx.body;
    const v = validator();
    v.date('effectiveFrom', b.effectiveFrom, 'Ngày hiệu lực');
    validateContractInput(v, b.contract);
    validateSignature(v, b.signature);
    validateBaseline(v, b.readings, 'readings');
    if (b.deposit?.amount) v.money('deposit.amount', b.deposit.amount, 'Tiền cọc thực thu', { positive: true });
    v.check();
    if (b.deposit?.amount) ctx.require(['deposits.receive']);
    if (c.tenancy.status !== 'active') conflict('tenancy_not_active', 'Chỉ nhập hợp đồng cho đợt thuê đang ở.');
    if (ctx.db.contracts.some((k) => k.tenancyId === c.tenancy.id && contractStatus(ctx.db, k, ctx.today).status !== 'terminated')) {
      conflict('contract_exists', 'Đợt thuê đã có hợp đồng. Dùng gia hạn/phụ lục để tạo phiên bản mới.');
    }
    const info = createSignedContract(ctx, { tenancy: c.tenancy, tenant: c.tenant, property: c.property, contract: b.contract, signature: b.signature, effectiveFrom: b.effectiveFrom });
    const gap = ctx.db.onboardingGaps.find((g) => g.tenancyId === c.tenancy.id && g.missingItem === 'Hợp đồng đã ký' && !g.resolvedAt);
    if (gap) {
      gap.resolvedAt = ctx.now;
      gap.resolvedBy = ctx.user.id;
      gap.notes = `Đã nhập ${info.contract.code}.`;
    }
    recordBaseline(ctx, { tenancy: c.tenancy, room: c.room, readings: b.readings });
    if (b.deposit?.amount) {
      ctx.require('payments.confirm');
      const payment = createPayment(ctx.db, ctx, {
        tenantId: c.tenant.id, amount: b.deposit.amount, receivedAt: b.deposit.receivedAt || ctx.now, methodCode: b.deposit.methodCode || 'cash', status: 'confirmed',
        propertyId: c.room.propertyId, externalReference: b.deposit.externalReference || null, notes: 'Thu cọc khi bổ sung hợp đồng', reservationId: null,
      });
      depositReceipt(ctx.db, ctx, { tenancyId: c.tenancy.id, paymentId: payment.id, amount: b.deposit.amount, reason: 'Nhận cọc khi bổ sung hợp đồng' });
    }
    audit(ctx.db, ctx, { action: 'contract.import', tableName: 'contracts', recordId: info.contract.id, after: { code: info.contract.code } });
    return tenancyDetail(ctx, c.tenancy);
  }, { perm: 'contracts.sign' });

  // Gỡ khách ghi nhận nhầm: chỉ đợt thuê nhập tay chưa phát sinh hợp đồng, hóa đơn, tiền cọc. Có chứng từ thì đi luồng trả phòng.
  r.post('/api/v1/tenancies/:id/cancel-import', (ctx) => {
    const c = tenancyInScope(ctx, ctx.params.id);
    const { db } = ctx;
    const v = validator();
    v.reason('reason', ctx.body.reason);
    v.check();
    if (c.tenancy.status !== 'active' || c.tenancy.onboardingMode !== 'import') rule('not_cancellable', 'Chỉ gỡ được khách ghi nhận từ form phòng và chưa có hợp đồng.');
    const id = c.tenancy.id;
    if (db.contracts.some((k) => k.tenancyId === id) || db.invoices.some((i) => i.tenancyId === id) || db.depositEntries.some((e) => e.tenancyId === id)) {
      conflict('tenancy_has_records', 'Đợt thuê đã có hợp đồng, hóa đơn hoặc tiền cọc nên không gỡ được. Hãy kết thúc hợp đồng và trả phòng.');
    }
    Object.assign(c.tenancy, { status: 'cancelled', endReason: ctx.body.reason, endedBy: ctx.user.id });
    c.allocation.state = 'released';
    db.readings.filter((x) => x.tenancyId === id && x.status === 'valid').forEach((x) => { Object.assign(x, { status: 'void', voidReason: ctx.body.reason }); });
    audit(db, ctx, { action: 'tenancy.import_cancel', tableName: 'tenancies', recordId: id, before: { status: 'active' }, after: { status: 'cancelled' }, reason: ctx.body.reason });
    return tenancyDetail(ctx, c.tenancy);
  }, { perm: 'tenancies.checkin' });

  // ---------------------------------------------------------------- chuyển phòng
  r.post('/api/v1/tenancies/:id/transfer', (ctx) => {
    const old = tenancyInScope(ctx, ctx.params.id);
    const { db } = ctx;
    const b = ctx.body;
    const v = validator();
    v.required('targetRoomId', b.targetRoomId, 'Phòng chuyển đến');
    v.date('transferOn', b.transferOn, 'Ngày chuyển');
    v.reason('reason', b.reason);
    validateContractInput(v, b.contract);
    validateSignature(v, b.signature);
    if (b.depositTransferAmount != null && b.depositTransferAmount !== '') v.money('depositTransferAmount', b.depositTransferAmount, 'Tiền cọc chuyển');
    v.check();
    ctx.require('contracts.sign');
    if (old.tenancy.status !== 'active') conflict('tenancy_not_active', 'Chỉ chuyển phòng cho đợt thuê đang ở.');
    const target = roomInScope(ctx, b.targetRoomId);
    if (target.id === old.room.id) rule('same_room', 'Phòng chuyển đến trùng phòng hiện tại.');
    if (target.operatingStatus !== 'available') rule('room_not_available', `Phòng ${target.code} đang bảo trì/ngừng khai thác.`);
    if (b.transferOn <= old.tenancy.actualMoveIn) fail(422, 'validation_failed', 'Ngày chuyển phải sau ngày nhận phòng cũ.', { transferOn: ['Phải sau ngày nhận phòng.'] });
    if (b.transferOn > ctx.today) fail(422, 'validation_failed', 'Ngày chuyển thực tế không được ở tương lai.', { transferOn: ['Không được sau hôm nay.'] });
    const occupants = 1 + db.residents.filter((x) => x.tenancyId === old.tenancy.id && !x.leftOn).length;
    if (occupants > target.capacity) rule('over_capacity', `Phòng ${target.code} chỉ ở tối đa ${target.capacity} người.`);
    if (b.depositTransferAmount > 0) ctx.require('deposits.transfer');
    const invoicedEnd = lastInvoicedEnd(db, old.tenancy.id);
    if (invoicedEnd && invoicedEnd > b.transferOn) {
      conflict('invoiced_beyond_transfer', `Đợt thuê cũ đã phát hành hóa đơn đến ${formatDate(addDays(invoicedEnd, -1))}. Lập chứng từ điều chỉnh giảm cho phần sau ngày chuyển, rồi chuyển phòng.`);
    }
    // 1. Chốt phòng cũ: chỉ số cuối + bàn giao.
    const observedAt = vnDateTimeToInstant(b.transferOn, 8);
    const outHandover = recordHandover(ctx, { tenancy: old.tenancy, kind: 'transfer_out', occurredAt: observedAt, handover: b.oldHandover, room: old.room });
    const outReadings = recordHandoverReadings(ctx, { tenancy: old.tenancy, room: old.room, handover: outHandover, readings: b.oldReadings, kind: 'checkout', observedAt });
    db.invoices.filter((i) => i.tenancyId === old.tenancy.id && i.status === 'draft').forEach((i) => db.invoices.splice(db.invoices.indexOf(i), 1));
    old.tenancy.actualMoveOut = b.transferOn;
    old.tenancy.status = 'ended';
    old.tenancy.endReason = `Chuyển sang phòng ${target.code}: ${b.reason}`;
    old.tenancy.endedBy = ctx.user.id;
    Object.assign(old.allocation, { state: 'completed', endsOn: b.transferOn });
    // 2. Hóa đơn cuối của đợt cũ đến ngày chuyển (ngày chuyển thuộc đợt mới).
    const final = createDraftInvoice(db, ctx, {
      tenancyId: old.tenancy.id, kind: 'final', from: invoicedEnd || old.tenancy.actualMoveIn, to: b.transferOn,
      endReadings: { electricity: outReadings.electricity?.id, water: outReadings.water?.id },
    });
    if (b.issueFinalInvoice) issueInvoice(db, ctx, final.id, {});
    db.residents.filter((x) => x.tenancyId === old.tenancy.id && !x.leftOn).forEach((x) => { x.leftOn = b.transferOn; });
    db.contracts.filter((k) => k.tenancyId === old.tenancy.id).forEach((k) => {
      if (!db.contractTerminations.some((t) => t.contractId === k.id)) db.contractTerminations.push({ id: uuid(), contractId: k.id, terminatedOn: b.transferOn, reason: `Chấm dứt do chuyển sang phòng ${target.code}.`, confirmedBy: ctx.user.id, createdAt: ctx.now });
    });
    // 3. Mở đợt thuê mới.
    const allocation = createAllocation(db, { roomId: target.id, startsOn: b.transferOn, endsOn: null, state: 'occupied' });
    const tenancy = {
      id: uuid(), allocationId: allocation.id, representativeTenantId: old.tenant.id, reservationId: null, status: 'active', plannedMoveIn: b.transferOn,
      actualMoveIn: b.transferOn, actualMoveOut: null, onboardingMode: 'normal', endReason: null, endedBy: null, createdAt: ctx.now,
    };
    db.tenancies.push(tenancy);
    db.residents.filter((x) => x.tenancyId === old.tenancy.id).forEach((x) => db.residents.push({ id: uuid(), tenancyId: tenancy.id, tenantId: x.tenantId, joinedOn: b.transferOn, leftOn: null, relationship: x.relationship }));
    const predecessor = db.contracts.filter((k) => k.tenancyId === old.tenancy.id).sort((a, x) => compareIso(x.createdAt, a.createdAt))[0];
    createSignedContract(ctx, { tenancy, tenant: old.tenant, property: find(db.properties, target.propertyId), contract: b.contract, signature: b.signature, effectiveFrom: b.transferOn, predecessorContractId: predecessor?.id || null });
    const inHandover = recordHandover(ctx, { tenancy, kind: 'transfer_in', occurredAt: vnDateTimeToInstant(b.transferOn, 9), handover: b.newHandover, room: target });
    recordHandoverReadings(ctx, { tenancy, room: target, handover: inHandover, readings: b.newReadings, kind: 'checkin', observedAt: vnDateTimeToInstant(b.transferOn, 9) });
    // 4. Chuyển cọc hai vế, giữ nguồn payment gốc.
    if (b.depositTransferAmount > 0) depositTransfer(db, ctx, { fromTenancyId: old.tenancy.id, toTenancyId: tenancy.id, amount: b.depositTransferAmount, reason: `Chuyển cọc ${old.room.code} → ${target.code}` });
    db.roomTransfers.push({ id: uuid(), oldTenancyId: old.tenancy.id, newTenancyId: tenancy.id, transferOn: b.transferOn, reason: b.reason, confirmedBy: ctx.user.id, createdAt: ctx.now });
    completeRequests(ctx, old.tenancy.id, 'transfer', `Đã chuyển sang ${target.code} ngày ${formatDate(b.transferOn)}.`);
    audit(db, ctx, { action: 'tenancy.transfer', tableName: 'room_transfers', recordId: tenancy.id, after: { from: old.room.code, to: target.code, transferOn: b.transferOn, finalInvoice: final.code || 'nháp' }, reason: b.reason });
    return { newTenancy: tenancyDetail(ctx, tenancy), oldTenancyId: old.tenancy.id, finalInvoice: invoiceSummary(db, final, ctx.today) };
  }, { perm: 'tenancies.transfer' });

  // ---------------------------------------------------------------- trả phòng
  r.post('/api/v1/tenancies/:id/checkout/preview', (ctx) => {
    const c = tenancyInScope(ctx, ctx.params.id);
    const b = ctx.body;
    const v = validator();
    v.date('moveOutOn', b.moveOutOn, 'Ngày trả phòng');
    v.check();
    if (c.tenancy.status !== 'active') conflict('tenancy_not_active', 'Đợt thuê không còn ở trạng thái đang ở.');
    if (b.moveOutOn <= c.tenancy.actualMoveIn) fail(422, 'validation_failed', 'Ngày trả phải sau ngày nhận phòng.', { moveOutOn: ['Phải sau ngày nhận phòng.'] });
    // Tính trên bản sao để KHÔNG ghi gì khi chỉ xem trước.
    const sandbox = { ...ctx, db: structuredClone(ctx.db) };
    const sc = tenancyContext(sandbox.db, c.tenancy.id);
    const result = checkoutComputation(sandbox, sc, b, { persist: false });
    const finalDto = invoiceSummary(sandbox.db, result.final, ctx.today);
    return {
      tenancy: tenancyBrief(ctx.db, c.tenancy, ctx.today),
      lastInvoicedEnd: result.from, meteredOnly: result.meteredOnly,
      finalInvoice: { ...finalDto, lines: result.final.lines.map((l) => ({ description: l.descriptionSnapshot, quantity: l.quantity, unitPrice: l.unitPrice, prorationNumerator: l.prorationNumerator, prorationDenominator: l.prorationDenominator, sign: l.sign, sourceScope: l.sourceScope })) },
      outstandingInvoices: result.outstanding,
      outstandingTotal: result.outstanding.reduce((s, i) => s + i.outstandingAmount, 0),
      depositHeld: depositHeld(ctx.db, c.tenancy.id),
      depositSources: [...depositBySource(ctx.db, c.tenancy.id).entries()].map(([paymentId, amount]) => ({ paymentId, paymentCode: find(ctx.db.payments, paymentId)?.code, amount })),
      requiredDeposit: tenancyBrief(ctx.db, c.tenancy, ctx.today).requiredDeposit,
      policyNote: result.meteredOnly ? 'Kỳ hiện tại đã phát hành trọn tháng; hóa đơn cuối chỉ gồm điện nước và phát sinh. Hoàn tiền thuê ngày chưa ở là chính sách chưa chốt.' : null,
    };
  }, { perm: 'tenancies.checkout' });

  r.post('/api/v1/tenancies/:id/checkout', (ctx) => {
    const c = tenancyInScope(ctx, ctx.params.id);
    const { db } = ctx;
    const b = ctx.body;
    const v = validator();
    v.date('moveOutOn', b.moveOutOn, 'Ngày trả phòng');
    v.oneOf('roomStatusAfter', b.roomStatusAfter, ['available', 'maintenance'], 'Trạng thái phòng sau trả');
    v.required('terminationReason', b.terminationReason, 'Lý do kết thúc');
    (b.offsets || []).forEach((o, i) => v.money(`offsets.${i}.amount`, o.amount, 'Tiền bù trừ', { positive: true }));
    if (b.refund?.amount) v.money('refund.amount', b.refund.amount, 'Tiền hoàn cọc', { positive: true });
    if (b.extraPayment?.amount) v.money('extraPayment.amount', b.extraPayment.amount, 'Tiền khách trả thêm', { positive: true });
    v.check();
    if (c.tenancy.status !== 'active') conflict('tenancy_not_active', 'Đợt thuê không còn ở trạng thái đang ở.');
    if (b.moveOutOn <= c.tenancy.actualMoveIn) fail(422, 'validation_failed', 'Ngày trả phải sau ngày nhận phòng.', { moveOutOn: ['Phải sau ngày nhận phòng.'] });
    if (b.moveOutOn > ctx.today) fail(422, 'validation_failed', 'Ngày bàn giao trả thực tế không được ở tương lai.', { moveOutOn: ['Không được sau hôm nay.'] });
    if (b.offsets?.length) ctx.require('deposits.offset');
    if (b.refund?.amount) ctx.require('deposits.refund');
    if (b.extraPayment?.amount) ctx.require('payments.confirm');

    const result = checkoutComputation(ctx, c, b, { persist: true });
    c.tenancy.actualMoveOut = b.moveOutOn;
    const settlement = { id: uuid(), tenancyId: c.tenancy.id, checkoutHandoverId: result.handover.id, status: 'draft', allowRemainingDebt: Boolean(b.allowRemainingDebt), remainingDebtReason: b.remainingDebtReason || null, confirmedBy: null, confirmedAt: null, notes: b.notes || null, invoiceIds: [] };
    db.settlements.push(settlement);
    if (result.final.lines.length) {
      issueInvoice(db, ctx, result.final.id, { issuedOn: b.moveOutOn, dueOn: b.finalDueOn || addDays(b.moveOutOn, settingsOf(db, c.property.id).dueAfterDays) });
    } else {
      db.invoices.splice(db.invoices.indexOf(result.final), 1);
    }
    // Khách trả thêm → phân bổ theo hạn sớm nhất.
    if (b.extraPayment?.amount) {
      const payment = createPayment(db, ctx, { tenantId: c.tenant.id, amount: b.extraPayment.amount, receivedAt: ctx.now, methodCode: b.extraPayment.methodCode || 'cash', status: 'confirmed', propertyId: c.property.id, externalReference: b.extraPayment.externalReference || null, notes: 'Thu khi quyết toán trả phòng' });
      let left = payment.amount;
      for (const inv of db.invoices.filter((i) => i.tenancyId === c.tenancy.id && i.status === 'issued' && !['debit_adjustment', 'credit_adjustment'].includes(i.kind)).sort((a, x) => compareIso(a.dueOn, x.dueOn))) {
        const take = Math.min(left, invoiceBalance(db, inv, ctx.today).outstandingAmount);
        if (take > 0) {
          applyAllocation(db, ctx, { paymentId: payment.id, invoiceId: inv.id, amount: take });
          left -= take;
        }
      }
      if (left > 0) rule('overpayment', `Khách trả thêm vượt nợ ${new Intl.NumberFormat('vi-VN').format(left)} đ. Bản đầu không nhận thu dư khi quyết toán.`);
    }
    for (const o of b.offsets || []) {
      const invoiceId = o.invoiceId === 'final' ? result.final.id : o.invoiceId;
      depositOffset(db, ctx, { tenancyId: c.tenancy.id, invoiceId, amount: o.amount, reason: 'Bù trừ cọc khi quyết toán trả phòng', settlementId: settlement.id });
    }
    if (b.refund?.amount) depositRefund(db, ctx, { tenancyId: c.tenancy.id, amount: b.refund.amount, reason: 'Hoàn cọc khi trả phòng', methodCode: b.refund.methodCode || 'cash', settlementId: settlement.id, externalReference: b.refund.externalReference });
    const heldLeft = depositHeld(db, c.tenancy.id);
    if (heldLeft !== 0) rule('deposit_not_settled', `Cọc còn giữ ${new Intl.NumberFormat('vi-VN').format(heldLeft)} đ. Bù trừ vào nợ hoặc hoàn cho khách trước khi đóng đợt thuê.`, { refund: ['Chưa xử lý hết tiền cọc.'] });
    const remaining = db.invoices.filter((i) => i.tenancyId === c.tenancy.id && i.status === 'issued' && !['debit_adjustment', 'credit_adjustment'].includes(i.kind)).reduce((s, i) => s + invoiceBalance(db, i, ctx.today).outstandingAmount, 0);
    if (remaining > 0) {
      if (!b.allowRemainingDebt) rule('remaining_debt', `Đợt thuê còn nợ ${new Intl.NumberFormat('vi-VN').format(remaining)} đ. Thu thêm, bù trừ cọc, hoặc chọn đóng đợt thuê còn nợ (cần quyền và lý do).`, { allowRemainingDebt: ['Còn nợ.'] });
      ctx.require('tenancies.close_with_debt');
      const rv = validator();
      rv.reason('remainingDebtReason', b.remainingDebtReason, 'Lý do giữ nợ');
      rv.check();
    }
    settlement.invoiceIds = db.invoices.filter((i) => i.tenancyId === c.tenancy.id && i.status === 'issued').map((i) => i.id);
    Object.assign(settlement, { status: 'confirmed', confirmedBy: ctx.user.id, confirmedAt: ctx.now });
    Object.assign(c.tenancy, { status: 'ended', endReason: b.terminationReason, endedBy: ctx.user.id });
    Object.assign(c.allocation, { state: 'completed', endsOn: b.moveOutOn });
    db.residents.filter((x) => x.tenancyId === c.tenancy.id && !x.leftOn).forEach((x) => { x.leftOn = b.moveOutOn; });
    db.contracts.filter((k) => k.tenancyId === c.tenancy.id).forEach((k) => {
      const cs = contractStatus(db, k, ctx.today);
      if (cs.endsOn && cs.endsOn > b.moveOutOn && !db.contractTerminations.some((t) => t.contractId === k.id)) {
        db.contractTerminations.push({ id: uuid(), contractId: k.id, terminatedOn: b.moveOutOn, reason: b.terminationReason, confirmedBy: ctx.user.id, createdAt: ctx.now });
      }
    });
    if (b.roomStatusAfter === 'maintenance' && c.room.operatingStatus !== 'maintenance') {
      db.roomStatusEvents.push({ id: uuid(), roomId: c.room.id, fromStatus: c.room.operatingStatus, toStatus: 'maintenance', reason: b.maintenanceReason || 'Kiểm tra/sửa chữa sau khi khách trả phòng.', actorId: ctx.user.id, occurredAt: ctx.now });
      c.room.operatingStatus = 'maintenance';
    }
    completeRequests(ctx, c.tenancy.id, 'checkout', `Đã trả phòng ngày ${formatDate(b.moveOutOn)}.`);
    audit(db, ctx, { action: 'tenancy.checkout', tableName: 'checkout_settlements', recordId: settlement.id, after: { moveOut: b.moveOutOn, remainingDebt: remaining, refund: b.refund?.amount || 0 }, reason: b.allowRemainingDebt ? b.remainingDebtReason : b.terminationReason });
    return tenancyDetail(ctx, c.tenancy);
  }, { perm: 'tenancies.checkout' });

  // ---------------------------------------------------------------- đề nghị gia hạn/chuyển/trả từ khách
  r.get('/api/v1/tenancy-requests', (ctx) => {
    const q = ctx.query;
    const allowed = propertyFilter(ctx);
    const all = ctx.db.tenancyRequests.filter((x) => allowed.has(tenancyContext(ctx.db, x.tenancyId).property.id)).map((x) => requestDto(ctx, x));
    return listResponse(all, q, {
      filter: (x) => (!q.status || x.status === q.status) && (!q.requestType || x.requestType === q.requestType),
      search: (x) => [x.room.code, x.representative.fullName, x.message],
      sortable: ['createdAt', 'desiredOn', 'status'],
      defaultSort: '-createdAt',
    });
  }, { perm: 'tenants.read' });

  const decide = (approve) => (ctx) => {
    const x = must(ctx.db.tenancyRequests, ctx.params.id, 'đề nghị');
    tenancyInScope(ctx, x.tenancyId);
    if (x.status !== 'pending') conflict('request_closed', 'Đề nghị đã được xử lý.');
    const v = validator();
    if (!approve) v.reason('decisionNotes', ctx.body.decisionNotes, 'Lý do từ chối');
    v.check();
    x.status = approve ? 'approved' : 'rejected';
    x.decisionNotes = ctx.body.decisionNotes || (approve ? 'Đồng ý, nhân viên sẽ liên hệ hoàn tất thủ tục.' : null);
    x.reviewedBy = ctx.user.id;
    x.reviewedAt = ctx.now;
    const c = tenancyContext(ctx.db, x.tenancyId);
    if (c.tenant.userId) {
      notify(ctx.db, { organizationId: ctx.organizationId, recipientIds: [c.tenant.userId], eventKey: `treq:${x.id}:${x.status}`, title: approve ? 'Đề nghị đã được chấp nhận' : 'Đề nghị bị từ chối', body: `${x.decisionNotes || ''} Hợp đồng/đợt thuê chỉ thay đổi khi hoàn tất thủ tục.`.trim(), url: '/contract', at: ctx.now });
    }
    return requestDto(ctx, x);
  };
  r.post('/api/v1/tenancy-requests/:id/approve', decide(true), { perm: 'contracts.write' });
  r.post('/api/v1/tenancy-requests/:id/reject', decide(false), { perm: 'contracts.write' });

  // ---------------------------------------------------------------- bàn giao
  r.get('/api/v1/handovers', (ctx) => {
    const q = ctx.query;
    const allowed = propertyFilter(ctx);
    const all = ctx.db.handovers.filter((h) => allowed.has(tenancyContext(ctx.db, h.tenancyId).property.id)).map((h) => handoverDto(ctx, h));
    return listResponse(all, q, {
      filter: (h) => !q.kind || h.kind === q.kind,
      search: (h) => [h.room.code, h.representative.fullName, h.notes],
      sortable: ['occurredAt', 'kind'],
      defaultSort: '-occurredAt',
    });
  }, { perm: 'contracts.read' });

  r.get('/api/v1/handovers/:id', (ctx) => {
    const h = must(ctx.db.handovers, ctx.params.id, 'biên bản bàn giao');
    tenancyInScope(ctx, h.tenancyId);
    return handoverDto(ctx, h);
  }, { perm: 'contracts.read' });

  void isIsoDate;
  void nextMonthStart;
}
