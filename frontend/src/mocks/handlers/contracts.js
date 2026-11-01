// Hợp đồng: phiên bản/phụ lục, ký, chấm dứt, lưu trữ. Bản đã ký bị khóa; thay đổi bằng phiên bản mới.
import { uuid } from '../../utils/ids.js';
import { addDays, compareIso, formatDate, isIsoDate } from '../../utils/date.js';
import { conflict, fail, listResponse, rule, validator } from '../respond.js';
import { assertRoomFree, audit, contractStatus, currentMeter, ensureRatePlan, find, must, notify, nextCode, tenancyContext, validReadings } from '../engine.js';
import { contractSummary, fileDto, invoiceSummary, planPrices, roomRef, roomSummary, tenancyBrief, tenantSummary, userRef, versionDto } from '../dto.js';
import { contractInScope, propertyFilter } from '../scope.js';

function contractDetail(ctx, contract) {
  const { db, today } = ctx;
  const cs = contractStatus(db, contract, today);
  const successor = db.contracts.find((k) => k.predecessorContractId === contract.id);
  const c = tenancyContext(db, contract.tenancyId);
  const entries = db.depositEntries.filter((e) => e.tenancyId === contract.tenancyId);
  const sum = (kind) => entries.filter((e) => e.kind === kind).reduce((s, e) => s + e.amount, 0);
  return {
    ...contractSummary(db, contract, today),
    tenancy: tenancyBrief(db, find(db.tenancies, contract.tenancyId), today),
    tenant: {
      ...tenantSummary(db, c.tenant, today), address: c.tenant.address, dateOfBirth: c.tenant.dateOfBirth,
      identityNumber: db.identityDocuments.find((d) => d.tenantId === c.tenant.id)?.numberMasked || null,
    },
    roomInfo: { ...roomSummary(db, c.room, today), address: c.property.address, propertyPrices: planPrices(db, db.ratePlans.find((p) => p.propertyId === c.property.id), today) },
    deposit: { required: contractSummary(db, contract, today).requiredDeposit, held: contractSummary(db, contract, today).depositHeld, received: sum('receipt') + sum('transfer_in'), refunded: sum('refund'), offset: sum('offset') },
    attachments: (db.contractAttachments || []).filter((a) => a.contractId === contract.id).map((a) => ({ id: a.id, file: fileDto(db, a.fileId), note: a.note, addedBy: userRef(db, a.addedBy), addedAt: a.addedAt })),
    invoices: db.invoices.filter((i) => i.tenancyId === contract.tenancyId && i.status !== 'draft').map((i) => invoiceSummary(db, i, today)).sort((a, b) => compareIso(b.serviceFrom, a.serviceFrom)).slice(0, 12),
    requests: db.tenancyRequests.filter((x) => x.tenancyId === contract.tenancyId).sort((a, b) => compareIso(b.createdAt, a.createdAt)).map((x) => ({
      id: x.id, requestType: x.requestType, desiredOn: x.desiredOn, targetRoom: x.targetRoomId ? roomRef(db, find(db.rooms, x.targetRoomId)) : null, message: x.message, status: x.status, decisionNotes: x.decisionNotes, createdAt: x.createdAt,
    })),
    meters: ['electricity', 'water'].map((kind) => {
      const meter = currentMeter(db, c.room.id, kind);
      const last = meter ? validReadings(db, meter.id).pop() : null;
      return meter ? { id: meter.id, meterKind: kind, lastReading: last ? { value: last.readingValue, observedAt: last.observedAt } : null } : null;
    }).filter(Boolean),
    versions: db.contractVersions.filter((v) => v.contractId === contract.id).sort((a, b) => a.versionNo - b.versionNo).map((v) => versionDto(db, v)),
    termination: cs.termination ? { ...cs.termination, confirmedBy: userRef(db, cs.termination.confirmedBy) } : null,
    predecessor: contract.predecessorContractId ? contractSummary(db, find(db.contracts, contract.predecessorContractId), today) : null,
    successor: successor ? contractSummary(db, successor, today) : null,
    archivedAt: contract.archivedAt,
    createdBy: userRef(db, contract.createdBy),
  };
}

function validateVersion(ctx, b) {
  const v = validator();
  v.date('effectiveFrom', b.effectiveFrom, 'Ngày hiệu lực');
  v.date('endsOn', b.endsOn, 'Ngày kết thúc (không tính)');
  v.money('requiredDeposit', b.requiredDeposit, 'Mức cọc yêu cầu');
  v.number('invoiceDay', b.invoiceDay, 'Ngày lập hóa đơn', { min: 1, max: 31 });
  v.number('dueAfterDays', b.dueAfterDays, 'Số ngày đến hạn', { min: 0, max: 365 });
  v.oneOf('prorationPolicy', b.prorationPolicy, ['actual_days', 'full_month'], 'Cách tính lẻ tháng');
  v.required('termsText', b.termsText, 'Điều khoản');
  v.required('changeReason', b.changeReason, 'Lý do lập phiên bản');
  if (!b.rates?.length) v.add('rates', 'Cần bảng giá thỏa thuận (ít nhất tiền thuê).');
  (b.rates || []).forEach((r, i) => v.number(`rates.${i}.unitPrice`, r.unitPrice, 'Đơn giá', { min: 0, decimals: 4 }));
  v.check();
  if (b.endsOn <= b.effectiveFrom) fail(422, 'validation_failed', 'Ngày kết thúc phải sau ngày hiệu lực.', { endsOn: ['Phải sau ngày hiệu lực.'] });
  const rentType = ctx.db.chargeTypes.find((t) => t.organizationId === ctx.organizationId && t.category === 'rent');
  if (!b.rates.some((r) => r.chargeTypeId === rentType.id)) fail(422, 'validation_failed', 'Bảng giá phải có tiền thuê.', { rates: ['Thiếu tiền thuê.'] });
}

function writeRates(ctx, version, rates) {
  const { db } = ctx;
  const plan = ensureRatePlan(db, { contractVersionId: version.id });
  db.chargeRates = db.chargeRates.filter((r) => r.ratePlanId !== plan.id);
  for (const rate of rates) {
    const type = find(db.chargeTypes, rate.chargeTypeId);
    if (!type || type.organizationId !== ctx.organizationId) fail(422, 'validation_failed', 'Khoản thu không hợp lệ.');
    db.chargeRates.push({
      id: uuid(), ratePlanId: plan.id, chargeTypeId: type.id, effectiveFrom: version.effectiveFrom, effectiveTo: null, unitPrice: rate.unitPrice,
      calculationMethod: ['electricity', 'water'].includes(type.category) ? 'metered' : rate.calculationMethod || 'fixed',
      billingCycle: rate.billingCycle || 'monthly', prorationMode: rate.prorationMode || (type.category === 'rent' ? 'actual_days' : 'full_period'),
    });
  }
}

function assertDraft(version) {
  if (version.signedAt) conflict('version_signed', `Phiên bản ${version.versionNo} đã ký và bị khóa. Tạo phụ lục/phiên bản mới để thay đổi.`);
}

export default function register(r) {
  r.get('/api/v1/contracts', (ctx) => {
    const q = ctx.query;
    const allowed = propertyFilter(ctx);
    const all = ctx.db.contracts.filter((k) => allowed.has(tenancyContext(ctx.db, k.tenancyId).property.id)).map((k) => contractSummary(ctx.db, k, ctx.today));
    return listResponse(all, q, {
      filter: (k) => (!q.status || k.status === q.status)
        && (!q.expiring || k.expiring)
        && (!q.stillOccupied || k.stillOccupiedAfterExpiry)
        && (!q.requests || k.pendingRequestCount > 0)
        && (!q.roomId || k.room.id === q.roomId)
        && (!q.tenantId || k.representative.id === q.tenantId),
      search: (k) => [k.code, k.room.code, k.representative.fullName, k.representative.code],
      sortable: ['code', 'endsOn', 'effectiveFrom', 'room.code', 'representative.fullName', 'status'],
      defaultSort: 'endsOn',
    });
  }, { perm: 'contracts.read' });

  r.get('/api/v1/contracts/:id', (ctx) => contractDetail(ctx, contractInScope(ctx, ctx.params.id)), { perm: 'contracts.read' });

  r.post('/api/v1/contracts/:id/versions', (ctx) => {
    const contract = contractInScope(ctx, ctx.params.id);
    const { db } = ctx;
    const b = ctx.body;
    validateVersion(ctx, b);
    const cs = contractStatus(db, contract, ctx.today);
    if (['terminated', 'archived'].includes(cs.status)) conflict('contract_closed', 'Hợp đồng đã chấm dứt/lưu trữ. Lập hợp đồng kế tiếp nếu khách tiếp tục thuê.');
    const versions = db.contractVersions.filter((v) => v.contractId === contract.id);
    if (versions.some((v) => !v.signedAt)) conflict('draft_exists', 'Đã có một phiên bản nháp chưa ký. Hoàn tất hoặc xóa bản nháp đó trước.');
    const latest = versions.filter((v) => v.signedAt).sort((a, x) => compareIso(x.effectiveFrom, a.effectiveFrom))[0];
    if (latest && b.effectiveFrom <= latest.effectiveFrom) {
      fail(422, 'validation_failed', `Ngày hiệu lực phải sau phiên bản ${latest.versionNo} (${formatDate(latest.effectiveFrom)}).`, { effectiveFrom: ['Phải sau ngày hiệu lực của bản đang áp dụng.'] });
    }
    const version = {
      id: uuid(), contractId: contract.id, versionNo: Math.max(...versions.map((v) => v.versionNo)) + 1, effectiveFrom: b.effectiveFrom, endsOn: b.endsOn,
      requiredDeposit: b.requiredDeposit, invoiceDay: b.invoiceDay, dueAfterDays: b.dueAfterDays, prorationPolicy: b.prorationPolicy, termsText: b.termsText,
      changeReason: b.changeReason, signedAt: null, confirmedBy: null, signatureMethod: null, externalSignatureReference: null, createdAt: ctx.now,
      parties: structuredClone(latest?.parties || versions[0]?.parties || []), files: [],
    };
    db.contractVersions.push(version);
    writeRates(ctx, version, b.rates);
    audit(db, ctx, { action: 'contract_version.draft', tableName: 'contract_versions', recordId: version.id, after: { contract: contract.code, versionNo: version.versionNo, effectiveFrom: version.effectiveFrom } });
    return contractDetail(ctx, contract);
  }, { perm: 'contracts.write' });

  r.put('/api/v1/contracts/:id/versions/:versionId', (ctx) => {
    const contract = contractInScope(ctx, ctx.params.id);
    const version = ctx.db.contractVersions.find((v) => v.id === ctx.params.versionId && v.contractId === contract.id);
    if (!version) fail(404, 'not_found', 'Không tìm thấy phiên bản.');
    assertDraft(version);
    validateVersion(ctx, ctx.body);
    const b = ctx.body;
    Object.assign(version, { effectiveFrom: b.effectiveFrom, endsOn: b.endsOn, requiredDeposit: b.requiredDeposit, invoiceDay: b.invoiceDay, dueAfterDays: b.dueAfterDays, prorationPolicy: b.prorationPolicy, termsText: b.termsText, changeReason: b.changeReason });
    writeRates(ctx, version, b.rates);
    return contractDetail(ctx, contract);
  }, { perm: 'contracts.write' });

  r.delete('/api/v1/contracts/:id/versions/:versionId', (ctx) => {
    const contract = contractInScope(ctx, ctx.params.id);
    const version = ctx.db.contractVersions.find((v) => v.id === ctx.params.versionId && v.contractId === contract.id);
    if (!version) fail(404, 'not_found', 'Không tìm thấy phiên bản.');
    assertDraft(version);
    if (version.versionNo === 1) rule('first_version', 'Không xóa phiên bản đầu; xóa cả hợp đồng nháp nếu nhập sai.');
    ctx.db.contractVersions = ctx.db.contractVersions.filter((v) => v.id !== version.id);
    const plan = ctx.db.ratePlans.find((p) => p.contractVersionId === version.id);
    if (plan) {
      ctx.db.chargeRates = ctx.db.chargeRates.filter((x) => x.ratePlanId !== plan.id);
      ctx.db.ratePlans = ctx.db.ratePlans.filter((p) => p.id !== plan.id);
    }
    return contractDetail(ctx, contract);
  }, { perm: 'contracts.write' });

  r.post('/api/v1/contracts/:id/versions/:versionId/files', (ctx) => {
    const contract = contractInScope(ctx, ctx.params.id);
    const version = ctx.db.contractVersions.find((v) => v.id === ctx.params.versionId && v.contractId === contract.id);
    if (!version) fail(404, 'not_found', 'Không tìm thấy phiên bản.');
    assertDraft(version);
    const v = validator();
    v.oneOf('fileKind', ctx.body.fileKind, ['draft', 'signed', 'appendix', 'signature_proof'], 'Loại tệp');
    v.required('fileId', ctx.body.fileId, 'Tệp');
    v.check();
    must(ctx.db.files, ctx.body.fileId, 'tệp');
    version.files.push({ fileId: ctx.body.fileId, fileKind: ctx.body.fileKind });
    return contractDetail(ctx, contract);
  }, { perm: 'contracts.write' });

  // Tệp bổ sung sau khi ký (ảnh, PDF, biên bản): lưu riêng, không chạm vào bản đã ký vốn bị khóa.
  r.post('/api/v1/contracts/:id/attachments', (ctx) => {
    const contract = contractInScope(ctx, ctx.params.id);
    const v = validator();
    v.required('fileId', ctx.body.fileId, 'Tệp');
    v.check();
    must(ctx.db.files, ctx.body.fileId, 'tệp');
    ctx.db.contractAttachments ||= [];
    const attachment = { id: uuid(), contractId: contract.id, fileId: ctx.body.fileId, note: ctx.body.note || null, addedBy: ctx.user.id, addedAt: ctx.now };
    ctx.db.contractAttachments.push(attachment);
    audit(ctx.db, ctx, { action: 'contract.attachment.add', tableName: 'contract_attachments', recordId: attachment.id, after: { contract: contract.code, fileId: attachment.fileId } });
    return contractDetail(ctx, contract);
  }, { perm: 'contracts.write' });

  r.delete('/api/v1/contracts/:id/attachments/:attachmentId', (ctx) => {
    const contract = contractInScope(ctx, ctx.params.id);
    const attachment = (ctx.db.contractAttachments || []).find((a) => a.id === ctx.params.attachmentId && a.contractId === contract.id);
    if (!attachment) fail(404, 'not_found', 'Không tìm thấy tệp đính kèm.');
    ctx.db.contractAttachments = ctx.db.contractAttachments.filter((a) => a.id !== attachment.id);
    audit(ctx.db, ctx, { action: 'contract.attachment.remove', tableName: 'contract_attachments', recordId: attachment.id, before: { contract: contract.code, fileId: attachment.fileId } });
    return contractDetail(ctx, contract);
  }, { perm: 'contracts.write' });

  r.post('/api/v1/contracts/:id/versions/:versionId/sign', (ctx) => {
    const contract = contractInScope(ctx, ctx.params.id);
    const { db } = ctx;
    const version = db.contractVersions.find((v) => v.id === ctx.params.versionId && v.contractId === contract.id);
    if (!version) fail(404, 'not_found', 'Không tìm thấy phiên bản.');
    assertDraft(version);
    const b = ctx.body;
    const v = validator();
    v.oneOf('signatureMethod', b.signatureMethod, ['paper', 'external_esign'], 'Cách ký');
    v.required('signedAt', b.signedAt, 'Thời điểm ký');
    if (b.signatureMethod === 'external_esign') v.required('externalSignatureReference', b.externalSignatureReference, 'Mã tham chiếu ký điện tử');
    v.check();
    if (b.signedAt > ctx.now) fail(422, 'validation_failed', 'Thời điểm ký không được ở tương lai.', { signedAt: ['Không được ở tương lai.'] });
    const signedFile = b.signedFileId || version.files.find((f) => ['signed', 'appendix'].includes(f.fileKind))?.fileId;
    if (!signedFile) rule('signed_file_required', 'Cần tải lên bản ký (scan/PDF) trước khi xác nhận ký. Upload ảnh không tự là ký điện tử.', { signedFileId: ['Thiếu bản ký.'] });
    if (b.signedFileId && !version.files.some((f) => f.fileId === b.signedFileId)) version.files.push({ fileId: b.signedFileId, fileKind: version.versionNo === 1 ? 'signed' : 'appendix' });
    const tenancy = find(db.tenancies, contract.tenancyId);
    if (tenancy.status === 'planned') {
      const allocation = find(db.roomAllocations, tenancy.allocationId);
      if (version.endsOn > (allocation.endsOn || version.endsOn)) {
        assertRoomFree(db, allocation.roomId, allocation.startsOn, version.endsOn, [allocation.id]);
        allocation.endsOn = version.endsOn;
      }
    }
    Object.assign(version, { signedAt: b.signedAt, confirmedBy: ctx.user.id, signatureMethod: b.signatureMethod, externalSignatureReference: b.externalSignatureReference || null });
    db.tenancyRequests.filter((x) => x.tenancyId === tenancy.id && x.requestType === 'renewal' && ['pending', 'approved'].includes(x.status)).forEach((x) => {
      x.status = 'completed';
      x.reviewedBy ||= ctx.user.id;
      x.reviewedAt ||= ctx.now;
      x.decisionNotes = `Đã ký phiên bản ${version.versionNo}, hiệu lực ${formatDate(version.effectiveFrom)}.`;
    });
    // Nháp hóa đơn sau ngày hiệu lực cần tính lại theo giá mới.
    db.invoices.filter((i) => i.tenancyId === tenancy.id && i.status === 'draft' && i.serviceTo > version.effectiveFrom).forEach((i) => { i.stale = true; });
    audit(db, ctx, { action: 'contract_version.sign', tableName: 'contract_versions', recordId: version.id, after: { contract: contract.code, versionNo: version.versionNo, signatureMethod: b.signatureMethod } });
    const tenant = find(db.tenants, tenancy.representativeTenantId);
    if (tenant.userId) notify(db, { organizationId: ctx.organizationId, recipientIds: [tenant.userId], eventKey: `contract.signed:${version.id}`, title: `Hợp đồng ${contract.code} có phiên bản mới`, body: `Phiên bản ${version.versionNo} hiệu lực từ ${formatDate(version.effectiveFrom)}.`, url: '/contract', at: ctx.now });
    return contractDetail(ctx, contract);
  }, { perm: 'contracts.sign' });

  r.post('/api/v1/contracts/:id/terminate', (ctx) => {
    const contract = contractInScope(ctx, ctx.params.id);
    const v = validator();
    v.date('terminatedOn', ctx.body.terminatedOn, 'Ngày chấm dứt');
    v.reason('reason', ctx.body.reason);
    v.check();
    if (ctx.db.contractTerminations.some((t) => t.contractId === contract.id)) conflict('already_terminated', 'Hợp đồng đã được chấm dứt.');
    const cs = contractStatus(ctx.db, contract, ctx.today);
    if (cs.status === 'draft') rule('contract_unsigned', 'Hợp đồng chưa ký; xóa bản nháp thay vì chấm dứt.');
    ctx.db.contractTerminations.push({ id: uuid(), contractId: contract.id, terminatedOn: ctx.body.terminatedOn, reason: ctx.body.reason, confirmedBy: ctx.user.id, createdAt: ctx.now });
    audit(ctx.db, ctx, { action: 'contract.terminate', tableName: 'contract_terminations', recordId: contract.id, after: { terminatedOn: ctx.body.terminatedOn }, reason: ctx.body.reason });
    const tenancy = find(ctx.db.tenancies, contract.tenancyId);
    return { ...contractDetail(ctx, contract), warning: tenancy.status === 'active' ? 'Đợt thuê vẫn đang ở. Chấm dứt hợp đồng không tự trả phòng; hãy thực hiện trả phòng và quyết toán.' : null };
  }, { perm: 'contracts.write' });

  r.post('/api/v1/contracts/:id/archive', (ctx) => {
    const contract = contractInScope(ctx, ctx.params.id);
    const tenancy = find(ctx.db.tenancies, contract.tenancyId);
    const cs = contractStatus(ctx.db, contract, ctx.today);
    if (!['terminated', 'expired'].includes(cs.status) || ['active', 'planned'].includes(tenancy.status)) {
      rule('archive_not_allowed', 'Chỉ lưu trữ hợp đồng đã chấm dứt/hết hạn và đợt thuê đã kết thúc.');
    }
    contract.archivedAt = ctx.now;
    return contractDetail(ctx, contract);
  }, { perm: 'contracts.write' });

  r.delete('/api/v1/contracts/:id', (ctx) => {
    const contract = contractInScope(ctx, ctx.params.id);
    const versions = ctx.db.contractVersions.filter((v) => v.contractId === contract.id);
    if (versions.some((v) => v.signedAt)) conflict('contract_signed', 'Hợp đồng đã có bản ký. Dùng chấm dứt hoặc lưu trữ thay vì xóa.');
    // Bản chưa ký không định giá hóa đơn nào (effective_rates chỉ dùng phiên bản đã ký) nên xóa được bản nhập nhầm;
    // chỉ chặn khi đã có hợp đồng kế tiếp trỏ về nó để không đứt chuỗi lịch sử.
    if (ctx.db.contracts.some((k) => k.predecessorContractId === contract.id)) conflict('contract_has_successor', 'Hợp đồng đã có hợp đồng kế tiếp; không xóa.');
    ctx.db.contracts = ctx.db.contracts.filter((k) => k.id !== contract.id);
    ctx.db.contractVersions = ctx.db.contractVersions.filter((v) => v.contractId !== contract.id);
    audit(ctx.db, ctx, { action: 'DELETE', tableName: 'contracts', recordId: contract.id, before: { code: contract.code } });
    return null;
  }, { perm: 'contracts.write' });

  r.post('/api/v1/contracts/:id/successor', (ctx) => {
    const contract = contractInScope(ctx, ctx.params.id);
    const { db } = ctx;
    const b = ctx.body;
    validateVersion(ctx, b);
    const tenancy = find(db.tenancies, contract.tenancyId);
    if (!['active', 'planned'].includes(tenancy.status)) conflict('tenancy_closed', 'Đợt thuê đã kết thúc; không lập hợp đồng kế tiếp.');
    if (db.contracts.some((k) => k.predecessorContractId === contract.id)) conflict('successor_exists', 'Đã có hợp đồng kế tiếp.');
    const cs = contractStatus(db, contract, ctx.today);
    if (cs.endsOn && b.effectiveFrom < cs.endsOn) fail(422, 'validation_failed', `Hợp đồng kế tiếp bắt đầu từ ${formatDate(cs.endsOn)} trở đi (hợp đồng cũ kết thúc ${formatDate(addDays(cs.endsOn, -1))}).`, { effectiveFrom: ['Không chồng thời hạn hợp đồng cũ.'] });
    const year = b.effectiveFrom.slice(0, 4);
    const next = { id: uuid(), tenancyId: tenancy.id, code: nextCode(db, `contract:${year}`, (n) => `HDT-${year}-${String(n).padStart(4, '0')}`), predecessorContractId: contract.id, archivedAt: null, createdBy: ctx.user.id, createdAt: ctx.now };
    db.contracts.push(next);
    const parties = structuredClone(cs.currentVersion?.parties || []);
    const version = { id: uuid(), contractId: next.id, versionNo: 1, effectiveFrom: b.effectiveFrom, endsOn: b.endsOn, requiredDeposit: b.requiredDeposit, invoiceDay: b.invoiceDay, dueAfterDays: b.dueAfterDays, prorationPolicy: b.prorationPolicy, termsText: b.termsText, changeReason: b.changeReason, signedAt: null, confirmedBy: null, signatureMethod: null, externalSignatureReference: null, createdAt: ctx.now, parties, files: [] };
    db.contractVersions.push(version);
    writeRates(ctx, version, b.rates);
    return contractDetail(ctx, next);
  }, { perm: 'contracts.write' });

  void isIsoDate;
}
