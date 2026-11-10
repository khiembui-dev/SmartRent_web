import { viewingFields } from './viewing-workflow.js';
// Ánh xạ bản ghi mock → DTO JSON (camelCase) đúng như hợp đồng trong docs/api/openapi.yaml.
import { lineAmount } from '../utils/money.js';
import { addDays, compareIso, diffDays } from '../utils/date.js';
import {
  activeTenancyOfRoom, contractStatus, depositHeld, depositSigned, find, invoiceBalance, invoiceTotal, isTicketOverdue,
  paymentBalance, roomOccupancy, roomRates, settingsOf, tenancyContext, tenantDebt,
} from './engine.js';
import { fileContent } from './db.js';

export const userRef = (db, userId) => {
  const u = find(db.users, userId);
  return u ? { id: u.id, displayName: u.displayName } : null;
};
export const propertyRef = (p) => (p ? { id: p.id, code: p.code, name: p.name } : null);
export const tenantRef = (t) => (t ? { id: t.id, code: t.code, fullName: t.fullName, phone: t.phone } : null);
export function roomRef(db, room) {
  if (!room) return null;
  const p = find(db.properties, room.propertyId);
  return { id: room.id, code: room.code, name: room.name, propertyId: p.id, propertyCode: p.code, propertyName: p.name };
}

export function fileDto(db, fileId) {
  const f = find(db.files, fileId);
  if (!f) return null;
  return {
    id: f.id, fileName: f.fileName, contentType: f.contentType, sizeBytes: f.sizeBytes, visibility: f.visibility,
    scanStatus: f.scanStatus === 'clean' && !f.generated && !fileContent(f) ? 'missing' : f.scanStatus, createdAt: f.createdAt,
  };
}

export function chargeTypeDto(t) {
  return t ? { id: t.id, code: t.code, name: t.name, category: t.category, unitLabel: t.unitLabel } : null;
}

export function rateDto(db, rate, scope) {
  return {
    id: rate.id, chargeType: chargeTypeDto(find(db.chargeTypes, rate.chargeTypeId)), unitPrice: rate.unitPrice,
    calculationMethod: rate.calculationMethod, billingCycle: rate.billingCycle, prorationMode: rate.prorationMode,
    effectiveFrom: rate.effectiveFrom, effectiveTo: rate.effectiveTo, scope,
  };
}

export function planRates(db, plan, scope) {
  if (!plan) return [];
  return db.chargeRates.filter((r) => r.ratePlanId === plan.id)
    .sort((a, b) => compareIso(b.effectiveFrom, a.effectiveFrom))
    .map((r) => rateDto(db, r, scope));
}

// ------------------------------------------------------------ cơ sở, phòng

/** Giá đang áp dụng của một bảng giá, theo mã khoản thu (ELECTRICITY, WATER, GARBAGE, SERVICE...). */
export function planPrices(db, plan, today) {
  const prices = {};
  if (!plan) return prices;
  db.chargeRates.filter((r) => r.ratePlanId === plan.id && r.effectiveFrom <= today && (!r.effectiveTo || r.effectiveTo > today)).forEach((r) => {
    const type = find(db.chargeTypes, r.chargeTypeId);
    if (type) prices[type.code] = r.unitPrice;
  });
  return prices;
}

export function propertySummary(db, p, today) {
  const rooms = db.rooms.filter((r) => r.propertyId === p.id);
  const occ = rooms.map((r) => roomOccupancy(db, r, today).occupancyStatus);
  return {
    id: p.id, code: p.code, name: p.name, address: p.address, isActive: p.isActive, contactName: p.contactName, phone: p.phone,
    roomCount: rooms.length,
    occupiedCount: occ.filter((s) => s === 'occupied').length,
    availableCount: occ.filter((s) => s === 'available').length,
    maintenanceCount: occ.filter((s) => s === 'maintenance').length,
    inactiveCount: occ.filter((s) => s === 'inactive').length,
    prices: planPrices(db, db.ratePlans.find((x) => x.propertyId === p.id), today),
    createdAt: p.createdAt,
  };
}

export function roomCurrentRent(db, room, today) {
  const rates = roomRates(db, room.id, today);
  const rent = [...rates.values()].find((x) => find(db.chargeTypes, x.rate.chargeTypeId)?.category === 'rent');
  return rent ? rent.rate.unitPrice : null;
}

export function roomSummary(db, room, today) {
  const p = find(db.properties, room.propertyId);
  const occupancy = roomOccupancy(db, room, today);
  const tenancy = occupancy.activeTenancyId ? find(db.tenancies, occupancy.activeTenancyId) : null;
  const listing = db.roomListings.find((l) => l.roomId === room.id);
  const type = find(db.roomTypes, room.roomTypeId);
  return {
    id: room.id, code: room.code, name: room.name, property: propertyRef(p), roomType: type ? { id: type.id, code: type.code, name: type.name } : null,
    floorLabel: room.floorLabel, areaM2: room.areaM2, capacity: room.capacity, operatingStatus: room.operatingStatus,
    occupancyStatus: occupancy.occupancyStatus, upcoming: occupancy.upcoming, currentRent: roomCurrentRent(db, room, today),
    requiredDeposit: room.requiredDeposit, listingStatus: listing?.status || null,
    coverImageUrl: room.images.find((i) => i.isCover)?.url || room.images[0]?.url || null,
    currentTenancy: tenancy ? {
      id: tenancy.id, since: tenancy.actualMoveIn, representative: tenantRef(find(db.tenants, tenancy.representativeTenantId)),
      onboardingMode: tenancy.onboardingMode, hasContract: db.contracts.some((k) => k.tenancyId === tenancy.id),
    } : null,
    openTicketCount: db.tickets.filter((t) => t.roomId === room.id && !['resolved', 'closed'].includes(t.status)).length,
  };
}

// ------------------------------------------------------------ khách, đợt thuê

export function tenancyBrief(db, tenancy, today) {
  const c = tenancyContext(db, tenancy);
  const contracts = db.contracts.filter((x) => x.tenancyId === tenancy.id);
  const main = contracts.sort((a, b) => compareIso(b.createdAt, a.createdAt))[0];
  const cs = main ? contractStatus(db, main, today) : null;
  const version = cs?.currentVersion;
  return {
    id: tenancy.id, status: tenancy.status, room: roomRef(db, c.room), property: propertyRef(c.property), representative: tenantRef(c.tenant),
    residentsCount: db.residents.filter((r) => r.tenancyId === tenancy.id && (!r.leftOn || r.leftOn > today)).length,
    plannedMoveIn: tenancy.plannedMoveIn, actualMoveIn: tenancy.actualMoveIn, actualMoveOut: tenancy.actualMoveOut,
    onboardingMode: tenancy.onboardingMode, endReason: tenancy.endReason,
    contract: main ? { id: main.id, code: main.code, status: cs.status, expiring: cs.expiring, endsOn: cs.endsOn, displayEndOn: cs.endsOn ? addDays(cs.endsOn, -1) : null, daysLeft: cs.daysLeft, stillOccupiedAfterExpiry: cs.stillOccupiedAfterExpiry } : null,
    requiredDeposit: version?.requiredDeposit ?? null,
    depositHeld: depositHeld(db, tenancy.id),
    outstandingAmount: db.invoices.filter((i) => i.tenancyId === tenancy.id && i.status === 'issued' && !['debit_adjustment', 'credit_adjustment'].includes(i.kind))
      .reduce((s, i) => s + invoiceBalance(db, i, today).outstandingAmount, 0),
    openGapCount: db.onboardingGaps.filter((g) => g.tenancyId === tenancy.id && !g.resolvedAt).length,
  };
}

export function tenantSummary(db, t, today) {
  const asRep = db.tenancies.filter((x) => x.representativeTenantId === t.id).sort((a, b) => compareIso(b.plannedMoveIn, a.plannedMoveIn));
  const asResident = db.residents.filter((r) => r.tenantId === t.id && (!r.leftOn || r.leftOn > today)).map((r) => find(db.tenancies, r.tenancyId)).filter((x) => x && ['active', 'planned'].includes(x.status));
  const current = asRep.find((x) => x.status === 'active') || asRep.find((x) => x.status === 'planned');
  const residentOf = !current ? asResident[0] : null;
  let residenceStatus = 'none';
  if (current?.status === 'active' || residentOf?.status === 'active') residenceStatus = 'active';
  else if (current?.status === 'planned' || residentOf?.status === 'planned') residenceStatus = 'planned';
  else if (asRep.some((x) => x.status === 'ended') || db.residents.some((r) => r.tenantId === t.id)) residenceStatus = 'former';
  const debt = tenantDebt(db, t.id, today);
  const shown = current || residentOf;
  return {
    id: t.id, code: t.code, fullName: t.fullName, email: t.email, phone: t.phone, hasPortalAccount: Boolean(t.userId),
    residenceStatus,
    currentTenancy: shown ? { id: shown.id, status: shown.status, role: current ? 'representative' : 'resident', room: roomRef(db, tenancyContext(db, shown).room) } : null,
    outstandingAmount: debt.outstandingAmount, overdueAmount: debt.overdueAmount, overdueCount: debt.overdueCount,
    identityVerified: db.identityDocuments.some((d) => d.tenantId === t.id && d.verifiedAt),
    hasPendingProfileRequest: db.profileChangeRequests.some((p) => p.tenantId === t.id && p.status === 'pending'),
    createdAt: t.createdAt,
  };
}

// ------------------------------------------------------------ hợp đồng

export function contractSummary(db, contract, today) {
  const c = tenancyContext(db, contract.tenancyId);
  const cs = contractStatus(db, contract, today);
  const versions = db.contractVersions.filter((v) => v.contractId === contract.id);
  const current = cs.currentVersion || versions[versions.length - 1];
  const rentRate = current ? db.chargeRates.find((r) => {
    const plan = db.ratePlans.find((p) => p.contractVersionId === current.id);
    return plan && r.ratePlanId === plan.id && find(db.chargeTypes, r.chargeTypeId)?.category === 'rent';
  }) : null;
  return {
    id: contract.id, code: contract.code, tenancyId: contract.tenancyId, tenancyStatus: c.tenancy.status, room: roomRef(db, c.room), property: propertyRef(c.property),
    representative: tenantRef(c.tenant), status: cs.status, expiring: cs.expiring, daysLeft: cs.daysLeft, stillOccupiedAfterExpiry: cs.stillOccupiedAfterExpiry,
    effectiveFrom: cs.effectiveFrom, endsOn: cs.endsOn, displayEndOn: cs.endsOn ? addDays(cs.endsOn, -1) : null,
    currentVersionNo: current?.versionNo || null, versionCount: versions.length, hasDraftVersion: cs.hasDraftVersion,
    rent: rentRate?.unitPrice ?? null, requiredDeposit: current?.requiredDeposit ?? null, depositHeld: depositHeld(db, contract.tenancyId),
    pendingRequestCount: db.tenancyRequests.filter((x) => x.tenancyId === contract.tenancyId && x.status === 'pending').length,
    predecessorContractId: contract.predecessorContractId, createdAt: contract.createdAt,
  };
}

export function versionDto(db, v) {
  const plan = db.ratePlans.find((p) => p.contractVersionId === v.id);
  return {
    id: v.id, versionNo: v.versionNo, effectiveFrom: v.effectiveFrom, endsOn: v.endsOn, displayEndOn: addDays(v.endsOn, -1),
    requiredDeposit: v.requiredDeposit, invoiceDay: v.invoiceDay, dueAfterDays: v.dueAfterDays, prorationPolicy: v.prorationPolicy,
    termsText: v.termsText, changeReason: v.changeReason, signedAt: v.signedAt, confirmedBy: userRef(db, v.confirmedBy), signatureMethod: v.signatureMethod,
    externalSignatureReference: v.externalSignatureReference, isSigned: Boolean(v.signedAt), createdAt: v.createdAt,
    parties: v.parties, files: v.files.map((f) => ({ fileKind: f.fileKind, file: fileDto(db, f.fileId) })),
    rates: planRates(db, plan, 'contract'),
  };
}

// ------------------------------------------------------------ hóa đơn

const ADJUSTMENT = ['debit_adjustment', 'credit_adjustment'];

export function invoiceSummary(db, inv, today) {
  const c = tenancyContext(db, inv.tenancyId);
  const period = inv.billingPeriodId ? find(db.billingPeriods, inv.billingPeriodId) : null;
  const balance = ADJUSTMENT.includes(inv.kind)
    ? { originalAmount: invoiceTotal(inv), adjustmentAmount: 0, receivableAmount: invoiceTotal(inv), paidAmount: 0, outstandingAmount: 0, paymentStatus: null, isOverdue: false, daysOverdue: 0 }
    : invoiceBalance(db, inv, today);
  const pending = db.payments.filter((p) => p.status === 'pending' && (p.intendedInvoiceIds || []).includes(inv.id));
  return {
    id: inv.id, code: inv.code, kind: inv.kind, status: inv.status, tenancyId: inv.tenancyId, room: roomRef(db, c.room), property: propertyRef(c.property),
    representative: tenantRef(c.tenant), period: period ? { id: period.id, monthStart: period.monthStart, status: period.status } : null,
    serviceFrom: inv.serviceFrom, serviceTo: inv.serviceTo, issuedOn: inv.issuedOn, dueOn: inv.dueOn, totalAmount: invoiceTotal(inv),
    ...balance, pendingPaymentCount: pending.length, pendingPaymentAmount: pending.reduce((s, p) => s + p.amount, 0),
    originalInvoiceId: inv.originalInvoiceId, problems: inv.problems || [], stale: Boolean(inv.stale), createdAt: inv.createdAt,
    voidedAt: inv.voidedAt, voidReason: inv.voidReason,
  };
}

export function invoiceDetail(db, inv, today) {
  const summary = invoiceSummary(db, inv, today);
  const allocations = db.paymentAllocations.filter((a) => a.invoiceId === inv.id).sort((a, b) => compareIso(a.allocatedAt, b.allocatedAt)).map((a) => {
    const entry = a.depositEntryId ? find(db.depositEntries, a.depositEntryId) : null;
    const payment = find(db.payments, a.paymentId || entry?.paymentId);
    return {
      id: a.id, kind: a.kind, amount: a.amount, source: a.paymentId ? 'payment' : 'deposit_offset', reversesId: a.reversesId,
      reversedAmount: db.paymentAllocations.filter((x) => x.reversesId === a.id).reduce((s, x) => s + x.amount, 0),
      payment: payment ? { id: payment.id, code: payment.code, methodCode: payment.methodCode, receivedAt: payment.receivedAt } : null,
      allocatedAt: a.allocatedAt, allocatedBy: userRef(db, a.allocatedBy), reason: a.reason,
    };
  });
  return {
    ...summary,
    notes: inv.notes, issuedAt: inv.issuedAt, issuedBy: userRef(db, inv.issuedBy), voidedBy: userRef(db, inv.voidedBy), createdBy: userRef(db, inv.createdBy),
    lines: inv.lines.map((l) => ({
      id: l.id, lineNo: l.lineNo, chargeType: chargeTypeDto(find(db.chargeTypes, l.chargeTypeId)), description: l.descriptionSnapshot, unit: l.unitSnapshot,
      quantity: l.quantity, unitPrice: l.unitPrice, sign: l.sign, prorationNumerator: l.prorationNumerator, prorationDenominator: l.prorationDenominator,
      amount: lineAmount(l), sourceScope: l.sourceScope, sourceRateId: l.sourceRateId, isOneTime: Boolean(l.chargeInstanceId), isManual: l.sourceScope === 'manual',
    })),
    meterSegments: inv.segments.map((s) => ({ ...s, meterKind: find(db.meters, s.meterId)?.meterKind, serialNumber: find(db.meters, s.meterId)?.serialNumber })),
    allocations,
    adjustments: db.invoices.filter((i) => i.originalInvoiceId === inv.id).map((i) => invoiceSummary(db, i, today)),
    original: inv.originalInvoiceId ? invoiceSummary(db, find(db.invoices, inv.originalInvoiceId), today) : null,
    pendingPayments: db.payments.filter((p) => p.status === 'pending' && (p.intendedInvoiceIds || []).includes(inv.id)).map((p) => ({ id: p.id, code: p.code, amount: p.amount, receivedAt: p.receivedAt })),
    deliveries: db.deliveries.filter((d) => d.eventKey === inv.id).map((d) => ({ id: d.id, status: d.status, toEmail: d.toEmail, createdAt: d.createdAt, simulated: true })),
  };
}

// ------------------------------------------------------------ thu tiền, cọc

export function paymentSummary(db, p) {
  const tenant = find(db.tenants, p.tenantId);
  const active = db.tenancies.find((t) => t.representativeTenantId === tenant.id && ['active', 'planned'].includes(t.status))
    || db.tenancies.filter((t) => t.representativeTenantId === tenant.id).pop();
  return {
    id: p.id, code: p.code, status: p.status, tenant: tenantRef(tenant), room: active ? roomRef(db, tenancyContext(db, active).room) : null,
    amount: p.amount, receivedAt: p.receivedAt, methodCode: p.methodCode, externalReference: p.externalReference, notes: p.notes,
    reportedBy: userRef(db, p.reportedBy), confirmedBy: userRef(db, p.confirmedBy), confirmedAt: p.confirmedAt, rejectionReason: p.rejectionReason,
    isTenantReported: Boolean(db.users.find((u) => u.id === p.reportedBy) && db.tenants.some((t) => t.userId === p.reportedBy)),
    ...paymentBalance(db, p), createdAt: p.createdAt, files: (p.fileIds || []).map((id) => fileDto(db, id)).filter(Boolean),
  };
}

export function depositEntryDto(db, e) {
  const payment = find(db.payments, e.paymentId);
  return {
    id: e.id, tenancyId: e.tenancyId, kind: e.kind, amount: e.amount, signedAmount: depositSigned(db, e), relatedEntryId: e.relatedEntryId,
    payment: payment ? { id: payment.id, code: payment.code } : null, occurredAt: e.occurredAt, reason: e.reason, confirmedBy: userRef(db, e.confirmedBy),
    settlementId: e.settlementId,
  };
}

// ------------------------------------------------------------ ticket

export function ticketSummary(db, t, now) {
  const room = find(db.rooms, t.roomId);
  const category = find(db.ticketCategories, t.categoryId);
  return {
    id: t.id, code: t.code, title: t.title, room: roomRef(db, room), category: category ? { id: category.id, code: category.code, name: category.name } : null,
    priority: t.priority, status: t.status, reportedBy: userRef(db, t.reportedBy), assignedTo: userRef(db, t.assignedTo), dueAt: t.dueAt,
    isOverdue: isTicketOverdue(t, now), createdAt: t.createdAt, resolvedAt: t.resolvedAt, closedAt: t.closedAt, tenancyId: t.tenancyId,
    messageCount: db.ticketMessages.filter((m) => m.ticketId === t.id && !m.isInternal).length,
  };
}

export function ticketDetail(db, t, now, { includeInternal }) {
  return {
    ...ticketSummary(db, t, now),
    description: t.description, resolutionNotes: t.resolutionNotes,
    files: (t.fileIds || []).map((id) => fileDto(db, id)).filter(Boolean),
    messages: db.ticketMessages.filter((m) => m.ticketId === t.id && (includeInternal || !m.isInternal)).sort((a, b) => compareIso(a.createdAt, b.createdAt))
      .map((m) => ({ id: m.id, author: userRef(db, m.authorId), body: m.body, isInternal: m.isInternal, createdAt: m.createdAt, files: (m.fileIds || []).map((id) => fileDto(db, id)).filter(Boolean) })),
    events: db.ticketEvents.filter((e) => e.ticketId === t.id).sort((a, b) => compareIso(a.occurredAt, b.occurredAt))
      .map((e) => ({ id: e.id, kind: e.kind, fromStatus: e.fromStatus, toStatus: e.toStatus, assignedTo: userRef(db, e.assignedTo), reason: e.reason, actor: userRef(db, e.actorId), occurredAt: e.occurredAt })),
    expenses: db.expenses.filter((e) => e.ticketId === t.id).map((e) => ({ id: e.id, amount: e.amount, description: e.description, incurredOn: e.incurredOn })),
  };
}

// ------------------------------------------------------------ yêu cầu thuê

export function inquirySummary(db, q) {
  const room = find(db.rooms, q.roomId);
  return {
    ...viewingFields(db, q),
    id: q.id, code: q.code, room: roomRef(db, room), contactName: q.contactName, phone: q.phone, email: q.email, desiredMoveIn: q.desiredMoveIn,
    occupants: q.occupants, message: q.message, status: q.status, assignedTo: userRef(db, q.assignedTo), tenantId: q.tenantId,
    closedReason: q.closedReason, source: q.source, createdAt: q.createdAt,
    nextViewing: db.viewings.filter((v) => v.inquiryId === q.id && v.status === 'scheduled').sort((a, b) => compareIso(a.startsAt, b.startsAt))[0] || null,
    reservation: (() => {
      const r = db.reservations.find((x) => x.inquiryId === q.id);
      return r ? { id: r.id, code: r.code, status: r.status } : null;
    })(),
  };
}

export function reservationDto(db, r, now) {
  const allocation = find(db.roomAllocations, r.allocationId);
  const room = find(db.rooms, allocation.roomId);
  return {
    id: r.id, code: r.code, status: r.status, room: roomRef(db, room), tenant: tenantRef(find(db.tenants, r.tenantId)), inquiryId: r.inquiryId,
    startsOn: allocation.startsOn, endsOn: allocation.endsOn, holdExpiresAt: allocation.holdExpiresAt, allocationState: allocation.state,
    isExpiredPendingWorker: r.status === 'holding' && allocation.holdExpiresAt && allocation.holdExpiresAt <= now,
    cancellationTerms: r.cancellationTerms, cancelledReason: r.cancelledReason, handledBy: userRef(db, r.handledBy), createdAt: r.createdAt,
    tenancyId: db.tenancies.find((t) => t.reservationId === r.id)?.id || null,
    payments: db.payments.filter((p) => p.reservationId === r.id).map((p) => paymentSummary(db, p)),
  };
}

export function daysUntil(today, iso) {
  return iso ? diffDays(today, iso) : null;
}

export { activeTenancyOfRoom, settingsOf };
