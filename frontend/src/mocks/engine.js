// Quy tắc nghiệp vụ mô phỏng, bám database/02_rules.sql và database/THIET_KE_DATABASE.md:
// - Số liệu suy ra (tổng hóa đơn, còn nợ, cọc đang giữ, chưa phân bổ, trạng thái ở) tính từ chứng từ, không lưu.
// - Giá hiệu lực: hợp đồng đã ký → riêng phòng → cơ sở; giá 0 vẫn là giá hợp lệ.
// - Lịch phòng [đầu, cuối) không chồng; giữ chỗ khác đang ở.
// - Tiền: chỉ payment đã xác nhận mới phân bổ; một nguồn mỗi phân bổ; dùng không vượt tiền còn hiệu lực.
// Seed và handler đều đi qua module này để dữ liệu nhất quán giữa các màn hình.

import { uuid } from '../utils/ids.js';
import { lineAmount } from '../utils/money.js';
import {
  addDays, compareIso, daysInMonth, diffDays, formatDate, instantToIsoDate, invoiceDate, monthLabel, monthStart,
  nextMonthStart, parseIsoDate, rangesOverlap,
} from '../utils/date.js';
import { conflict, notFound, rule } from './respond.js';

// ---------------------------------------------------------------- tra cứu

export const find = (rows, id) => rows.find((row) => row.id === id) || null;
export const must = (rows, id, what) => find(rows, id) || notFound(what);

export function permissionsOf(db, membership) {
  const admin = db.users.some((u) => u.id === membership?.userId && u.role === 'admin' && u.isActive);
  return new Set(admin && membership.status === 'active' ? db.permissions.map((p) => p.code) : []);
}

export function tenancyContext(db, tenancyOrId) {
  const tenancy = typeof tenancyOrId === 'string' ? must(db.tenancies, tenancyOrId, 'đợt thuê') : tenancyOrId;
  const allocation = find(db.roomAllocations, tenancy.allocationId);
  const room = find(db.rooms, allocation.roomId);
  const property = find(db.properties, room.propertyId);
  const tenant = find(db.tenants, tenancy.representativeTenantId);
  return { tenancy, allocation, room, property, tenant, organizationId: property.organizationId };
}

export const propertyOfRoom = (db, room) => find(db.properties, room.propertyId);
export const settingsOf = (db, propertyId) => db.billingSettings.find((s) => s.propertyId === propertyId)
  || { propertyId, invoiceDay: 28, dueAfterDays: 7, contractWarningDays: 30, prorationPolicy: 'actual_days', timezone: 'Asia/Ho_Chi_Minh' };

export function chargeTypeByCode(db, organizationId, code) {
  return db.chargeTypes.find((c) => c.organizationId === organizationId && c.code === code);
}

export function nextCode(db, series, format) {
  db.counters[series] = (db.counters[series] || 0) + 1;
  return format(db.counters[series]);
}

const pad = (n, len = 3) => String(n).padStart(len, '0');
const yymm = (iso) => iso.slice(2, 4) + iso.slice(5, 7);

// ---------------------------------------------------------------- audit, thông báo, gửi mô phỏng

export function audit(db, ctx, { organizationId, action, tableName, recordId, before = null, after = null, reason = null }) {
  db.auditLogs.push({
    id: uuid(),
    organizationId: organizationId ?? ctx?.organizationId ?? null,
    actorId: ctx?.user?.id ?? null,
    action,
    tableName,
    recordKey: { id: recordId },
    before,
    after,
    reason: reason || null,
    correlationId: ctx?.correlationId || null,
    occurredAt: ctx?.now || new Date().toISOString(),
  });
}

export function notify(db, { organizationId, recipientIds, eventKey, title, body, url, at }) {
  for (const recipientId of new Set(recipientIds.filter(Boolean))) {
    if (db.notifications.some((n) => n.recipientId === recipientId && n.eventKey === eventKey)) continue;
    db.notifications.push({
      id: uuid(), organizationId, recipientId, eventKey, title, body, relativeUrl: url || null, readAt: null,
      createdAt: at || new Date().toISOString(),
    });
  }
}

/** Ghi một lần gửi email mô phỏng. Không có email nào thực sự được gửi. */
export function queueEmail(db, { organizationId, recipientUserId, toEmail, templateCode, eventKey, subject, at }) {
  const key = `${templateCode}:${eventKey}:${recipientUserId || toEmail}`;
  if (db.deliveries.some((d) => d.dedupeKey === key)) return null;
  const invalid = !toEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(toEmail) || toEmail.endsWith('.invalid');
  const time = at || new Date().toISOString();
  const delivery = {
    id: uuid(), organizationId, recipientUserId: recipientUserId || null, toEmail: toEmail || null, channel: 'email',
    templateCode, eventKey, subject, dedupeKey: key, status: invalid ? 'failed' : 'sent', createdAt: time,
    attempts: [{ at: time, result: invalid ? 'failed' : 'simulated_sent', error: invalid ? 'Địa chỉ email không hợp lệ hoặc thiếu.' : null }],
  };
  db.deliveries.push(delivery);
  return delivery;
}

export function staffWith(db, organizationId, permission, propertyId) {
  return db.memberships
    .filter((m) => m.organizationId === organizationId && m.status === 'active')
    .filter((m) => permissionsOf(db, m).has(permission))
    .filter((m) => !propertyId || m.propertyScope === 'all' || m.propertyIds.includes(propertyId))
    .map((m) => m.userId);
}

// ---------------------------------------------------------------- lịch phòng

const BLOCKING_STATES = ['held', 'reserved', 'occupied', 'completed'];

export function allocationConflicts(db, roomId, startsOn, endsOn, ignoreIds = []) {
  return db.roomAllocations.filter((a) => a.roomId === roomId && !ignoreIds.includes(a.id)
    && BLOCKING_STATES.includes(a.state) && rangesOverlap(a.startsOn, a.endsOn, startsOn, endsOn));
}

export function assertRoomFree(db, roomId, startsOn, endsOn, ignoreIds = []) {
  const clash = allocationConflicts(db, roomId, startsOn, endsOn, ignoreIds);
  if (clash.length) {
    const c = clash[0];
    const label = { held: 'đang được giữ chỗ', reserved: 'đã có đợt thuê dự kiến', occupied: 'đang có người ở', completed: 'đã có lịch sử thuê' }[c.state];
    conflict('room_overlap', `Phòng ${label} trong khoảng ${formatDate(c.startsOn)} – ${c.endsOn ? formatDate(addDays(c.endsOn, -1)) : 'chưa xác định ngày trả'}. Hai lịch không được chồng nhau.`, {
      roomId: ['Khoảng thời gian bị chồng với lịch hiện có.'],
    });
  }
}

export function createAllocation(db, { roomId, startsOn, endsOn = null, state, holdExpiresAt = null }) {
  assertRoomFree(db, roomId, startsOn, endsOn);
  const allocation = { id: uuid(), roomId, startsOn, endsOn, state, holdExpiresAt };
  db.roomAllocations.push(allocation);
  return allocation;
}

/** Hết hạn giữ chỗ (worker expire_reservations). */
export function expireReservations(db, nowIso) {
  let affected = 0;
  for (const reservation of db.reservations.filter((r) => r.status === 'holding')) {
    const allocation = find(db.roomAllocations, reservation.allocationId);
    if (allocation?.state === 'held' && allocation.holdExpiresAt && allocation.holdExpiresAt <= nowIso) {
      reservation.status = 'expired';
      allocation.state = 'released';
      affected += 1;
    }
  }
  return affected;
}

// ---------------------------------------------------------------- trạng thái phòng, hợp đồng

export function activeTenancyOfRoom(db, roomId) {
  return db.tenancies.find((t) => t.status === 'active' && find(db.roomAllocations, t.allocationId)?.roomId === roomId) || null;
}

export function roomOccupancy(db, room, today) {
  const active = activeTenancyOfRoom(db, room.id);
  const upcoming = db.roomAllocations
    .filter((a) => a.roomId === room.id && ['held', 'reserved'].includes(a.state) && (a.endsOn == null || a.endsOn > today))
    .sort((a, b) => compareIso(a.startsOn, b.startsOn))[0] || null;
  return {
    occupancyStatus: active ? 'occupied' : room.operatingStatus,
    operatingStatus: room.operatingStatus,
    activeTenancyId: active?.id || null,
    upcoming: upcoming ? { state: upcoming.state, startsOn: upcoming.startsOn, holdExpiresAt: upcoming.holdExpiresAt } : null,
  };
}

export function signedVersions(db, contractId) {
  return db.contractVersions.filter((v) => v.contractId === contractId && v.signedAt).sort((a, b) => compareIso(a.effectiveFrom, b.effectiveFrom));
}

/** Phiên bản đã ký áp dụng tại ngày: bản có ngày hiệu lực muộn nhất ≤ ngày đó. */
export function applicableVersion(db, tenancyId, onDate) {
  const contracts = db.contracts.filter((c) => c.tenancyId === tenancyId);
  const versions = contracts.flatMap((c) => signedVersions(db, c.id)).filter((v) => v.effectiveFrom <= onDate);
  return versions.sort((a, b) => compareIso(b.effectiveFrom, a.effectiveFrom))[0] || null;
}

export function contractStatus(db, contract, today) {
  const versions = db.contractVersions.filter((v) => v.contractId === contract.id);
  const signed = versions.filter((v) => v.signedAt).sort((a, b) => compareIso(a.effectiveFrom, b.effectiveFrom));
  const termination = db.contractTerminations.find((t) => t.contractId === contract.id);
  const tenancy = find(db.tenancies, contract.tenancyId);
  const ctx = tenancy ? tenancyContext(db, tenancy) : null;
  const warningDays = ctx ? settingsOf(db, ctx.property.id).contractWarningDays : 30;
  const latest = signed[signed.length - 1] || null;
  const endsOn = latest?.endsOn || versions[versions.length - 1]?.endsOn || null;
  const pendingDraft = versions.some((v) => !v.signedAt);
  let status;
  if (contract.archivedAt) status = 'archived';
  else if (termination) status = 'terminated';
  else if (!latest) status = 'draft';
  else if (signed[0].effectiveFrom > today) status = 'signed';
  else if (endsOn <= today) status = 'expired';
  else status = 'active';
  const daysLeft = endsOn ? diffDays(today, endsOn) : null;
  return {
    status,
    expiring: status === 'active' && daysLeft != null && daysLeft <= warningDays,
    stillOccupiedAfterExpiry: status === 'expired' && tenancy?.status === 'active',
    effectiveFrom: signed[0]?.effectiveFrom || versions[0]?.effectiveFrom || null,
    endsOn,
    daysLeft,
    currentVersion: latest,
    hasDraftVersion: pendingDraft,
    termination,
  };
}

// ---------------------------------------------------------------- giá hiệu lực

function ratePlanScope(db, plan) {
  if (plan.contractVersionId) return 'contract';
  if (plan.roomId) return 'room';
  return 'property';
}

function candidateRates(db, tenancyId, onDate) {
  const { room, property } = tenancyContext(db, tenancyId);
  const contractIds = new Set(db.contracts.filter((c) => c.tenancyId === tenancyId).map((c) => c.id));
  const plans = db.ratePlans.filter((p) => p.propertyId === property.id || p.roomId === room.id || (p.contractVersionId && (() => {
    const v = find(db.contractVersions, p.contractVersionId);
    return v && contractIds.has(v.contractId) && v.signedAt && v.effectiveFrom <= onDate;
  })()));
  const planInfo = new Map(plans.map((p) => {
    const version = p.contractVersionId ? find(db.contractVersions, p.contractVersionId) : null;
    return [p.id, { scope: ratePlanScope(db, p), rank: p.contractVersionId ? 3 : p.roomId ? 2 : 1, contractStart: version?.effectiveFrom || '' }];
  }));
  return db.chargeRates
    .filter((r) => planInfo.has(r.ratePlanId) && r.effectiveFrom <= onDate && (r.effectiveTo == null || r.effectiveTo > onDate))
    .map((r) => ({ rate: r, ...planInfo.get(r.ratePlanId) }));
}

/** Map chargeTypeId → { rate, scope } theo đúng thứ tự ưu tiên của effective_rates(). */
export function effectiveRates(db, tenancyId, onDate) {
  const best = new Map();
  for (const c of candidateRates(db, tenancyId, onDate)) {
    const current = best.get(c.rate.chargeTypeId);
    const better = !current
      || c.rank > current.rank
      || (c.rank === current.rank && c.contractStart > current.contractStart)
      || (c.rank === current.rank && c.contractStart === current.contractStart && c.rate.effectiveFrom > current.rate.effectiveFrom);
    if (better) best.set(c.rate.chargeTypeId, c);
  }
  return best;
}

/** Giá xem trước cho một phòng chưa có đợt thuê (trang công khai, form nhận phòng). */
export function roomRates(db, roomId, onDate) {
  const room = find(db.rooms, roomId);
  const plans = db.ratePlans.filter((p) => p.propertyId === room.propertyId || p.roomId === roomId);
  const best = new Map();
  for (const rate of db.chargeRates) {
    const plan = plans.find((p) => p.id === rate.ratePlanId);
    if (!plan || rate.effectiveFrom > onDate || (rate.effectiveTo && rate.effectiveTo <= onDate)) continue;
    const rank = plan.roomId ? 2 : 1;
    const current = best.get(rate.chargeTypeId);
    if (!current || rank > current.rank || (rank === current.rank && rate.effectiveFrom > current.rate.effectiveFrom)) {
      best.set(rate.chargeTypeId, { rate, rank, scope: plan.roomId ? 'room' : 'property' });
    }
  }
  return best;
}

export function ensureRatePlan(db, scope) {
  const key = Object.keys(scope)[0];
  let plan = db.ratePlans.find((p) => p[key] === scope[key]);
  if (!plan) {
    plan = { id: uuid(), propertyId: null, roomId: null, contractVersionId: null, ...scope };
    db.ratePlans.push(plan);
  }
  return plan;
}

/** Đổi giá: đóng effective_to của dòng cũ rồi thêm dòng mới, không sửa unit_price cũ. */
export function changeRate(db, planId, { chargeTypeId, effectiveFrom, unitPrice, calculationMethod, billingCycle, prorationMode }) {
  const rates = db.chargeRates.filter((r) => r.ratePlanId === planId && r.chargeTypeId === chargeTypeId);
  if (rates.some((r) => r.effectiveFrom >= effectiveFrom)) {
    conflict('rate_overlap', 'Đã có mức giá bắt đầu từ ngày này hoặc muộn hơn. Chọn ngày hiệu lực sau mức giá gần nhất.', {
      effectiveFrom: ['Ngày hiệu lực phải sau ngày bắt đầu của mức giá hiện tại.'],
    });
  }
  const open = rates.find((r) => r.effectiveTo == null || r.effectiveTo > effectiveFrom);
  if (open) open.effectiveTo = effectiveFrom;
  const rate = { id: uuid(), ratePlanId: planId, chargeTypeId, effectiveFrom, effectiveTo: null, unitPrice, calculationMethod, billingCycle, prorationMode };
  db.chargeRates.push(rate);
  return rate;
}

/**
 * Đặt giá hiện hành của một khoản trong bảng giá (cơ sở/phòng) từ form: trùng giá thì bỏ qua, khác giá thì đóng dòng cũ và thêm dòng mới.
 * Sửa lại trong cùng ngày: dòng vừa tạo chưa lên hóa đơn nào được thay hẳn; đã dùng thì giá mới hiệu lực từ ngày kế tiếp.
 */
export function setPlanPrice(db, plan, type, unitPrice, today) {
  const rowsOf = () => db.chargeRates.filter((r) => r.ratePlanId === plan.id && r.chargeTypeId === type.id).sort((a, b) => compareIso(a.effectiveFrom, b.effectiveFrom));
  let latest = rowsOf().pop();
  if (latest && !latest.effectiveTo && latest.unitPrice === unitPrice) return latest;
  const defaults = { calculationMethod: ['electricity', 'water'].includes(type.category) ? 'metered' : 'fixed', billingCycle: 'monthly', prorationMode: type.category === 'rent' ? 'actual_days' : 'full_period' };
  const { calculationMethod, billingCycle, prorationMode } = latest || defaults;
  let effectiveFrom = today;
  if (latest && latest.effectiveFrom >= today) {
    const used = db.invoices.some((i) => i.lines.some((l) => l.sourceRateId === latest.id));
    if (used) {
      effectiveFrom = addDays(latest.effectiveFrom, 1);
    } else {
      db.chargeRates.splice(db.chargeRates.indexOf(latest), 1);
      const previous = rowsOf().pop();
      if (previous?.effectiveTo === latest.effectiveFrom) previous.effectiveTo = null;
      latest = previous;
    }
  }
  return changeRate(db, plan.id, { chargeTypeId: type.id, effectiveFrom, unitPrice, calculationMethod, billingCycle, prorationMode });
}

// ---------------------------------------------------------------- công tơ, chỉ số

export const validReadings = (db, meterId) => db.readings
  .filter((r) => r.meterId === meterId && r.status === 'valid')
  .sort((a, b) => compareIso(a.observedAt, b.observedAt));

export function metersOfRoom(db, roomId, kind) {
  return db.meters.filter((m) => m.roomId === roomId && (!kind || m.meterKind === kind))
    .sort((a, b) => compareIso(a.installedAt, b.installedAt));
}

export function currentMeter(db, roomId, kind) {
  return metersOfRoom(db, roomId, kind).find((m) => !m.removedAt) || null;
}

export function readingInUse(db, readingId) {
  return db.invoices.some((inv) => inv.status !== 'draft'
    && inv.segments.some((s) => s.startReadingId === readingId || s.endReadingId === readingId));
}

export function assertPeriodOpen(db, periodId, action = 'ghi dữ liệu') {
  if (!periodId) return;
  const period = find(db.billingPeriods, periodId);
  if (period?.status === 'locked') {
    rule('period_locked', `${monthLabel(period.monthStart)} đã khóa nên không thể ${action}. Người có quyền cần mở khóa kèm lý do.`);
  }
}

export function recordReading(db, ctx, input) {
  const meter = must(db.meters, input.meterId, 'công tơ');
  assertPeriodOpen(db, input.billingPeriodId, 'ghi chỉ số');
  if (input.readingValue < 0) rule('reading_negative', 'Chỉ số không được âm.', { readingValue: ['Chỉ số không được âm.'] });
  if (meter.installedAt > input.observedAt || (meter.removedAt && meter.removedAt < input.observedAt)) {
    rule('reading_outside_meter', 'Thời điểm ghi nằm ngoài thời gian lắp công tơ này.', { observedAt: ['Ngoài thời gian lắp công tơ.'] });
  }
  const readings = validReadings(db, meter.id).filter((r) => r.id !== input.supersedesId);
  const before = readings.filter((r) => r.observedAt <= input.observedAt).pop();
  const after = readings.find((r) => r.observedAt > input.observedAt);
  if (before && input.readingValue < before.readingValue) {
    rule('reading_decreased', `Chỉ số mới (${input.readingValue}) nhỏ hơn lần ghi trước (${before.readingValue} lúc ${formatDate(before.observedAt)}). Nếu đã thay công tơ, dùng luồng thay công tơ.`, {
      readingValue: [`Không được nhỏ hơn ${before.readingValue}.`],
    });
  }
  if (after && input.readingValue > after.readingValue) {
    rule('reading_exceeds_next', `Chỉ số lớn hơn lần ghi sau (${after.readingValue}).`, { readingValue: [`Không được lớn hơn ${after.readingValue}.`] });
  }
  if (input.readingKind === 'periodic' && input.billingPeriodId && readings.some((r) => r.readingKind === 'periodic' && r.billingPeriodId === input.billingPeriodId)) {
    conflict('reading_exists', 'Công tơ đã có chỉ số kỳ này. Dùng "Sửa chỉ số" để thay bằng bản ghi mới có lý do.');
  }
  const reading = {
    id: uuid(), meterId: meter.id, observedAt: input.observedAt, readingValue: input.readingValue,
    billingPeriodId: input.billingPeriodId || null, tenancyId: input.tenancyId || null, handoverId: input.handoverId || null,
    readingKind: input.readingKind, status: 'valid', supersedesId: input.supersedesId || null, voidReason: null,
    notes: input.notes || null, recordedBy: ctx?.user?.id || input.recordedBy, recordedAt: ctx?.now || input.observedAt,
    fileIds: input.fileIds || [],
  };
  db.readings.push(reading);
  return reading;
}

/** Sửa chỉ số: void bản cũ (có lý do) + bản ghi kế tiếp; chỉ số đã lên chứng từ phát hành thì chặn. */
export function correctReading(db, ctx, readingId, { readingValue, reason, notes }) {
  const old = must(db.readings, readingId, 'chỉ số');
  if (old.status !== 'valid') conflict('reading_void', 'Chỉ số này đã bị thay thế trước đó.');
  if (readingInUse(db, old.id)) {
    rule('reading_in_issued_invoice', 'Chỉ số đã thuộc hóa đơn phát hành hoặc đã hủy. Giữ nguyên chỉ số và lập chứng từ điều chỉnh để sửa tiền.');
  }
  assertPeriodOpen(db, old.billingPeriodId, 'sửa chỉ số');
  old.status = 'void';
  old.voidReason = reason;
  const next = recordReading(db, ctx, { ...old, readingValue, supersedesId: old.id, notes: notes ?? old.notes });
  markDraftsStale(db, old.tenancyId);
  return next;
}

export function markDraftsStale(db, tenancyId) {
  db.invoices.filter((i) => i.status === 'draft' && i.tenancyId === tenancyId).forEach((i) => {
    i.stale = true;
  });
}

// ---------------------------------------------------------------- tính tiền

function chargeInstanceClaimed(db, instanceId, ignoreInvoiceId) {
  return db.invoices.some((inv) => inv.id !== ignoreInvoiceId && inv.status !== 'void' && inv.lines.some((l) => l.chargeInstanceId === instanceId));
}

function findInstance(db, tenancyId, chargeTypeId, billingPeriodId = null, occurrenceKey = 'default') {
  return db.chargeInstances.find((c) => c.tenancyId === tenancyId && c.chargeTypeId === chargeTypeId
    && (c.billingPeriodId || null) === billingPeriodId && c.occurrenceKey === occurrenceKey) || null;
}

function meteredSegments(db, tenancyId, roomId, kind, { periodId, endReadingId, from, to }) {
  const readings = metersOfRoom(db, roomId, kind).flatMap((m) => validReadings(db, m.id).map((r) => ({ ...r, meterKind: m.meterKind })))
    .filter((r) => r.tenancyId === tenancyId)
    .sort((a, b) => compareIso(a.observedAt, b.observedAt));
  let end = endReadingId ? readings.find((r) => r.id === endReadingId) : null;
  if (!end && periodId) end = readings.find((r) => r.billingPeriodId === periodId && ['periodic', 'checkout'].includes(r.readingKind));
  if (!end && !periodId) {
    end = readings.filter((r) => ['checkout', 'periodic'].includes(r.readingKind) && instantToIsoDate(r.observedAt) <= to).pop();
  }
  if (!end) return { problem: 'missing_reading' };
  const earlier = readings.filter((r) => r.observedAt < end.observedAt);
  // Điểm bắt đầu: lần ghi đã dùng làm điểm cuối hóa đơn trước, hoặc chỉ số nhận phòng.
  const usedEnds = new Set(db.invoices.filter((i) => i.status === 'issued' && i.tenancyId === tenancyId).flatMap((i) => i.segments.map((s) => s.endReadingId)));
  let startIndex = -1;
  for (let i = earlier.length - 1; i >= 0; i -= 1) {
    if (usedEnds.has(earlier[i].id) || ['checkin', 'baseline'].includes(earlier[i].readingKind)
      || (earlier[i].readingKind === 'periodic' && earlier[i].billingPeriodId !== periodId)) {
      startIndex = i;
      break;
    }
  }
  if (startIndex < 0) return { problem: 'missing_previous' };
  const chain = [...earlier.slice(startIndex), end];
  const segments = [];
  for (let i = 0; i < chain.length - 1; i += 1) {
    if (chain[i].meterId === chain[i + 1].meterId) {
      segments.push({ meterId: chain[i].meterId, startReadingId: chain[i].id, endReadingId: chain[i + 1].id, startValue: chain[i].readingValue, endValue: chain[i + 1].readingValue });
    }
  }
  const quantity = Math.round(segments.reduce((sum, s) => sum + (s.endValue - s.startValue), 0) * 1000) / 1000;
  return { segments, quantity, start: chain[0], end };
}

const PROBLEM_TEXT = {
  missing_reading: (kind) => `Thiếu chỉ số ${kind === 'electricity' ? 'điện' : 'nước'} cuối kỳ.`,
  missing_previous: (kind) => `Thiếu chỉ số ${kind === 'electricity' ? 'điện' : 'nước'} đầu kỳ; không mặc định bằng 0.`,
};

/**
 * Tính các dòng tiền cho [from, to) của một đợt thuê (hóa đơn định kỳ hoặc cuối).
 * Trả về lines/segments chụp giá + danh sách vấn đề chặn phát hành.
 */
export function computeCharges(db, tenancyId, { from, to, periodId = null, kind = 'periodic', endReadings = {}, meteredOnly = false }) {
  const c = tenancyContext(db, tenancyId);
  const problems = [];
  const lines = [];
  const segments = [];
  const stayFrom = c.tenancy.actualMoveIn || c.tenancy.plannedMoveIn;
  const stayTo = c.tenancy.actualMoveOut || null;
  const svcFrom = stayFrom > from ? stayFrom : from;
  const svcTo = stayTo && stayTo < to ? stayTo : to;
  if (meteredOnly) {
    // Trả phòng sau khi kỳ đã phát hành trọn tháng: chỉ còn điện/nước từ lần chốt trước tới chỉ số trả phòng.
    meteredLines(db, c, tenancyId, { periodId: null, endReadings, from: svcFrom, to: svcTo, lines, segments, problems, onDate: addDays(to, -1) });
    return { lines, segments, problems, serviceFrom: addDays(to, -1), serviceTo: to, contractVersionId: null };
  }
  if (svcTo <= svcFrom) {
    problems.push({ code: 'no_stay', message: 'Đợt thuê không có ngày ở trong khoảng tính tiền.' });
    return { lines, segments, problems, serviceFrom: from, serviceTo: to };
  }
  const version = applicableVersion(db, tenancyId, svcFrom) || applicableVersion(db, tenancyId, addDays(svcTo, -1));
  if (!version) problems.push({ code: 'unsigned_contract', message: 'Chưa có hợp đồng đã ký áp dụng cho khoảng này; không thể phát hành.' });
  const policy = version?.prorationPolicy || settingsOf(db, c.property.id).prorationPolicy;
  const chargeTypes = new Map(db.chargeTypes.filter((t) => t.organizationId === c.organizationId).map((t) => [t.id, t]));

  // Ranh giới: đầu tháng + ngày đổi giá trong khoảng → tách dòng theo đoạn ngày/nguồn giá.
  const bounds = new Set([svcFrom, svcTo]);
  for (let m = nextMonthStart(svcFrom); m < svcTo; m = nextMonthStart(m)) bounds.add(m);
  for (const cand of candidateRates(db, tenancyId, addDays(svcTo, -1)).concat(candidateRates(db, tenancyId, svcFrom))) {
    [cand.rate.effectiveFrom, cand.rate.effectiveTo].forEach((d) => d && d > svcFrom && d < svcTo && bounds.add(d));
  }
  const points = [...bounds].sort();
  const fixedPieces = new Map();
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    for (const [chargeTypeId, info] of effectiveRates(db, tenancyId, a)) {
      const type = chargeTypes.get(chargeTypeId);
      if (!type || info.rate.billingCycle !== 'monthly' || info.rate.calculationMethod === 'metered') continue;
      const key = `${chargeTypeId}:${info.rate.id}:${monthStart(a)}`;
      const piece = fixedPieces.get(key) || { type, info, from: a, to: b, month: monthStart(a) };
      piece.to = b;
      fixedPieces.set(key, piece);
    }
  }
  const rates = effectiveRates(db, tenancyId, svcFrom);
  const rentType = [...chargeTypes.values()].find((t) => t.category === 'rent');
  if (rentType && ![...fixedPieces.values()].some((p) => p.type.id === rentType.id)) {
    problems.push({ code: 'missing_rate', message: 'Chưa có giá thuê hiệu lực cho đợt thuê này.' });
  }
  const residentsCount = 1 + db.residents.filter((r) => r.tenancyId === tenancyId && r.joinedOn <= svcFrom && (!r.leftOn || r.leftOn > svcFrom)).length;

  const ordered = [...fixedPieces.values()].sort((x, y) => {
    const order = ['rent', 'service', 'other', 'compensation'];
    return order.indexOf(x.type.category) - order.indexOf(y.type.category) || compareIso(x.from, y.from) || x.type.name.localeCompare(y.type.name);
  });
  const fullCharged = new Set();
  for (const piece of ordered) {
    const { y, m } = parseIsoDate(piece.month);
    const monthDays = daysInMonth(y, m);
    const days = diffDays(piece.from, piece.to);
    const prorate = piece.type.category === 'rent'
      ? policy === 'actual_days' && piece.info.rate.prorationMode === 'actual_days'
      : piece.info.rate.prorationMode === 'actual_days';
    const full = days >= monthDays || !prorate;
    // Thu trọn kỳ: đổi giá giữa tháng không làm thu hai lần trong cùng tháng; dùng giá đầu kỳ.
    const fullKey = `${piece.type.id}:${piece.month}`;
    if (full && fullCharged.has(fullKey)) continue;
    if (full) fullCharged.add(fullKey);
    const quantity = piece.info.rate.calculationMethod === 'per_person' ? residentsCount : 1;
    lines.push({
      chargeTypeId: piece.type.id,
      chargeInstanceId: null,
      sourceRateId: piece.info.rate.id,
      sourceScope: piece.info.scope,
      descriptionSnapshot: piece.type.category === 'rent'
        ? `Tiền thuê ${monthLabel(piece.month).toLowerCase()}${full ? '' : ` (${formatDate(piece.from)} – ${formatDate(addDays(piece.to, -1))})`}`
        : `${piece.type.name} ${monthLabel(piece.month).toLowerCase()}${piece.info.rate.calculationMethod === 'per_person' ? ` (${quantity} người)` : ''}`,
      unitSnapshot: piece.type.unitLabel,
      quantity,
      unitPrice: piece.info.rate.unitPrice,
      sign: 1,
      prorationNumerator: full ? 1 : days,
      prorationDenominator: full ? 1 : monthDays,
    });
  }

  // Phí một lần: dùng lại một charge instance; đã lập trên chứng từ còn hiệu lực thì không lập lại.
  for (const [chargeTypeId, info] of rates) {
    const type = chargeTypes.get(chargeTypeId);
    if (!type || info.rate.billingCycle !== 'once') continue;
    const instance = findInstance(db, tenancyId, chargeTypeId);
    if (instance && chargeInstanceClaimed(db, instance.id)) continue;
    lines.push({
      chargeTypeId, chargeInstanceId: instance?.id || `new:${chargeTypeId}`, sourceRateId: info.rate.id, sourceScope: info.scope,
      descriptionSnapshot: `${type.name} (thu một lần)`, unitSnapshot: type.unitLabel, quantity: 1, unitPrice: info.rate.unitPrice,
      sign: 1, prorationNumerator: 1, prorationDenominator: 1,
    });
  }

  meteredLines(db, c, tenancyId, { periodId, endReadings, from: svcFrom, to: svcTo, lines, segments, problems, onDate: svcFrom });
  return { lines, segments, problems, serviceFrom: svcFrom, serviceTo: svcTo, contractVersionId: version?.id || null };
}

/** Điện, nước theo chỉ số: chuỗi segment từ lần chốt trước tới chỉ số cuối (kể cả thay công tơ). */
function meteredLines(db, c, tenancyId, { periodId, endReadings, from, to, lines, segments, problems, onDate }) {
  const chargeTypes = db.chargeTypes.filter((t) => t.organizationId === c.organizationId);
  const rates = effectiveRates(db, tenancyId, onDate);
  for (const meterKind of ['electricity', 'water']) {
    const type = chargeTypes.find((t) => t.category === meterKind);
    const info = type && rates.get(type.id);
    if (!info) {
      if (type && metersOfRoom(db, c.room.id, meterKind).length) problems.push({ code: 'missing_rate', message: `Chưa có đơn giá ${type.name.toLowerCase()} hiệu lực.` });
      continue;
    }
    const result = meteredSegments(db, tenancyId, c.room.id, meterKind, { periodId, endReadingId: endReadings?.[meterKind], from, to });
    if (result.problem) {
      problems.push({ code: result.problem, meterKind, message: PROBLEM_TEXT[result.problem](meterKind) });
      continue;
    }
    const lineKey = `line:${meterKind}`;
    const first = result.segments[0];
    const last = result.segments[result.segments.length - 1];
    lines.push({
      chargeTypeId: type.id, chargeInstanceId: null, sourceRateId: info.rate.id, sourceScope: info.scope,
      descriptionSnapshot: `${type.name}: ${first ? first.startValue : '?'} → ${last ? last.endValue : '?'}${result.segments.length > 1 ? ' (có thay công tơ)' : ''}`,
      unitSnapshot: type.unitLabel, quantity: result.quantity, unitPrice: info.rate.unitPrice, sign: 1,
      prorationNumerator: 1, prorationDenominator: 1, segmentKey: lineKey,
    });
    result.segments.forEach((s) => segments.push({ ...s, lineKey }));
  }
}

/** Ngày kết thúc (không tính) của chứng từ định kỳ/cuối đã phát hành gần nhất. */
export function lastInvoicedEnd(db, tenancyId) {
  return db.invoices.filter((i) => i.tenancyId === tenancyId && i.status === 'issued' && ['periodic', 'final', 'replacement'].includes(i.kind))
    .map((i) => i.serviceTo).sort().pop() || null;
}

export const invoiceTotal = (invoice) => invoice.lines.reduce((sum, line) => sum + lineAmount(line), 0);

function persistLines(db, invoice, computed) {
  invoice.lines = computed.lines.map((line, index) => {
    let chargeInstanceId = line.chargeInstanceId;
    if (chargeInstanceId?.startsWith('new:')) {
      const instance = { id: uuid(), tenancyId: invoice.tenancyId, chargeTypeId: line.chargeTypeId, billingPeriodId: null, occurrenceKey: 'default' };
      db.chargeInstances.push(instance);
      chargeInstanceId = instance.id;
    }
    return { ...line, id: uuid(), lineNo: index + 1, chargeInstanceId };
  });
  invoice.segments = computed.segments.map((s) => {
    const line = invoice.lines.find((l) => l.segmentKey === s.lineKey);
    return { lineId: line.id, meterId: s.meterId, startReadingId: s.startReadingId, endReadingId: s.endReadingId, startValue: s.startValue, endValue: s.endValue };
  });
  invoice.problems = computed.problems;
  invoice.stale = false;
  invoice.computedAt = new Date().toISOString();
}

export function createDraftInvoice(db, ctx, { tenancyId, periodId = null, kind = 'periodic', from, to, endReadings, notes, idempotencyKey, meteredOnly = false, manualLines = [] }) {
  const c = tenancyContext(db, tenancyId);
  let period = null;
  if (periodId) {
    period = must(db.billingPeriods, periodId, 'kỳ tính tiền');
    if (period.propertyId !== c.property.id) rule('period_mismatch', 'Kỳ tính tiền thuộc cơ sở khác với phòng của đợt thuê.');
    assertPeriodOpen(db, periodId, 'lập hóa đơn');
    from = from || period.monthStart;
    to = to || nextMonthStart(period.monthStart);
  }
  if (kind === 'periodic') {
    const existing = db.invoices.find((i) => i.tenancyId === tenancyId && i.billingPeriodId === periodId && i.kind === 'periodic' && i.status !== 'void');
    if (existing) {
      if (existing.status === 'issued') conflict('invoice_exists', `Đợt thuê đã có hóa đơn ${existing.code} cho kỳ này.`);
      return recomputeDraft(db, existing);
    }
  }
  const computed = computeCharges(db, tenancyId, { from, to, periodId, kind, endReadings, meteredOnly });
  computed.lines.push(...manualLines.map((l) => ({ ...l })));
  const invoice = {
    id: uuid(), tenancyId, billingPeriodId: periodId, kind, originalInvoiceId: null, code: null, status: 'draft',
    serviceFrom: computed.serviceFrom, serviceTo: computed.serviceTo, issuedOn: null, dueOn: null, issuedAt: null, issuedBy: null,
    voidedAt: null, voidedBy: null, voidReason: null, notes: notes || null, idempotencyKey: idempotencyKey || uuid(),
    createdBy: ctx?.user?.id || ctx?.actorId, createdAt: ctx?.now || new Date().toISOString(), lines: [], segments: [], problems: [],
    manualLines: manualLines.map((l) => ({ ...l })), endReadings: endReadings || {}, meteredOnly,
  };
  persistLines(db, invoice, computed);
  db.invoices.push(invoice);
  return invoice;
}

export function recomputeDraft(db, invoice) {
  if (invoice.status !== 'draft') conflict('invoice_not_draft', 'Chỉ tính lại được hóa đơn nháp.');
  const computed = computeCharges(db, invoice.tenancyId, {
    from: invoice.billingPeriodId ? find(db.billingPeriods, invoice.billingPeriodId).monthStart : invoice.serviceFrom,
    to: invoice.billingPeriodId ? nextMonthStart(find(db.billingPeriods, invoice.billingPeriodId).monthStart) : invoice.serviceTo,
    periodId: invoice.billingPeriodId, kind: invoice.kind, endReadings: invoice.endReadings || {}, meteredOnly: Boolean(invoice.meteredOnly),
  });
  computed.lines.push(...(invoice.manualLines || []).map((l) => ({ ...l })));
  // Instance phí một lần đã gắn với nháp này vẫn dùng lại khi tính lại.
  computed.lines.forEach((line) => {
    if (line.chargeInstanceId?.startsWith('new:')) {
      const instance = findInstance(db, invoice.tenancyId, line.chargeTypeId);
      if (instance) line.chargeInstanceId = instance.id;
    }
  });
  persistLines(db, invoice, computed);
  invoice.serviceFrom = computed.serviceFrom;
  invoice.serviceTo = computed.serviceTo;
  return invoice;
}

export function issueInvoice(db, ctx, invoiceId, { issuedOn, dueOn } = {}) {
  const invoice = must(db.invoices, invoiceId, 'hóa đơn');
  if (invoice.status !== 'draft') conflict('invoice_not_draft', `Hóa đơn ${invoice.code || ''} đã phát hành hoặc đã hủy.`);
  assertPeriodOpen(db, invoice.billingPeriodId, 'phát hành hóa đơn');
  if (invoice.stale) rule('invoice_stale', 'Chỉ số hoặc giá đã thay đổi sau khi lập nháp. Bấm "Tính lại" trước khi phát hành.');
  const blocking = (invoice.problems || []);
  if (blocking.length) rule('invoice_blocked', `Chưa thể phát hành: ${blocking.map((p) => p.message).join(' ')}`);
  if (!invoice.lines.length) rule('invoice_empty', 'Hóa đơn chưa có khoản thu nào.');
  const total = invoiceTotal(invoice);
  if (total < 0) rule('invoice_negative', 'Tổng hóa đơn âm. Không tự đưa về 0; hãy kiểm tra giảm trừ hoặc lập chứng từ ghi có riêng.');
  const c = tenancyContext(db, invoice.tenancyId);
  if (['periodic', 'final', 'replacement'].includes(invoice.kind)) {
    const clash = db.invoices.find((i) => i.id !== invoice.id && i.tenancyId === invoice.tenancyId && i.status === 'issued'
      && ['periodic', 'final', 'replacement'].includes(i.kind) && rangesOverlap(i.serviceFrom, i.serviceTo, invoice.serviceFrom, invoice.serviceTo));
    if (clash) conflict('service_range_overlap', `Khoảng tính tiền chồng với hóa đơn ${clash.code} đã phát hành.`);
  }
  for (const line of invoice.lines.filter((l) => l.chargeInstanceId)) {
    if (chargeInstanceClaimed(db, line.chargeInstanceId, invoice.id)) conflict('charge_already_billed', `Khoản "${line.descriptionSnapshot}" đã được lập trên chứng từ khác.`);
  }
  const settings = settingsOf(db, c.property.id);
  const version = applicableVersion(db, invoice.tenancyId, invoice.serviceFrom);
  const period = invoice.billingPeriodId ? find(db.billingPeriods, invoice.billingPeriodId) : null;
  const issueDate = issuedOn || (period ? invoiceDate(period.monthStart, version?.invoiceDay || settings.invoiceDay) : ctx.today);
  const due = dueOn || addDays(issueDate, version?.dueAfterDays ?? settings.dueAfterDays);
  if (due < issueDate) rule('due_before_issue', 'Hạn thanh toán không được trước ngày lập.', { dueOn: ['Hạn phải từ ngày lập trở đi.'] });
  const monthIso = period?.monthStart || invoice.serviceFrom;
  invoice.code = nextCode(db, `invoice:${c.property.code}:${yymm(monthIso)}`, (n) => `HD-${c.property.code}${yymm(monthIso)}-${pad(n)}`);
  invoice.status = 'issued';
  invoice.issuedOn = issueDate;
  invoice.dueOn = due;
  invoice.issuedAt = ctx.now;
  invoice.issuedBy = ctx.user.id;
  audit(db, ctx, { organizationId: c.organizationId, action: 'invoice.issue', tableName: 'invoices', recordId: invoice.id, after: { code: invoice.code, total, dueOn: due } });
  if (c.tenant?.userId) {
    notify(db, {
      organizationId: c.organizationId, recipientIds: [c.tenant.userId], eventKey: `invoice.issued:${invoice.id}`,
      title: `Hóa đơn ${invoice.code}`, body: `Phòng ${c.room.code}: ${new Intl.NumberFormat('vi-VN').format(total)} đ, hạn ${formatDate(due)}.`,
      url: `/invoices/${invoice.id}`, at: ctx.now,
    });
  }
  queueEmail(db, { organizationId: c.organizationId, recipientUserId: c.tenant?.userId, toEmail: c.tenant?.email, templateCode: 'invoice_issued', eventKey: invoice.id, subject: `Hóa đơn ${invoice.code}`, at: ctx.now });
  return invoice;
}

// ---------------------------------------------------------------- số dư (mô phỏng các view)

export function allocationSigned(a) {
  return a.kind === 'apply' ? a.amount : -a.amount;
}

export function depositSigned(db, entry) {
  if (entry.kind === 'receipt' || entry.kind === 'transfer_in') return entry.amount;
  if (entry.kind === 'reversal') {
    const original = find(db.depositEntries, entry.relatedEntryId);
    return original?.kind === 'receipt' ? -entry.amount : entry.amount;
  }
  return -entry.amount;
}

export function invoiceBalance(db, invoice, today) {
  const original = invoiceTotal(invoice);
  const adjustments = db.invoices.filter((i) => i.originalInvoiceId === invoice.id && i.status === 'issued' && ['debit_adjustment', 'credit_adjustment'].includes(i.kind))
    .reduce((sum, i) => sum + (i.kind === 'credit_adjustment' ? -invoiceTotal(i) : invoiceTotal(i)), 0);
  const paid = db.paymentAllocations.filter((a) => a.invoiceId === invoice.id).reduce((sum, a) => sum + allocationSigned(a), 0);
  const receivable = original + adjustments;
  const outstanding = invoice.status === 'issued' ? receivable - paid : 0;
  let paymentStatus;
  if (receivable === 0) paymentStatus = 'paid';
  else if (paid === 0) paymentStatus = 'unpaid';
  else if (paid < receivable) paymentStatus = 'partial';
  else paymentStatus = 'paid';
  return {
    originalAmount: original,
    adjustmentAmount: adjustments,
    receivableAmount: receivable,
    paidAmount: paid,
    outstandingAmount: outstanding,
    paymentStatus,
    isOverdue: invoice.status === 'issued' && invoice.dueOn != null && invoice.dueOn < today && outstanding > 0,
    daysOverdue: invoice.status === 'issued' && invoice.dueOn && invoice.dueOn < today && outstanding > 0 ? diffDays(invoice.dueOn, today) : 0,
  };
}

export function paymentBalance(db, payment) {
  const reversed = db.paymentReversals.filter((r) => r.paymentId === payment.id).reduce((s, r) => s + r.amount, 0);
  const allocated = db.paymentAllocations.filter((a) => {
    if (a.paymentId) return a.paymentId === payment.id;
    return find(db.depositEntries, a.depositEntryId)?.paymentId === payment.id;
  }).reduce((s, a) => s + allocationSigned(a), 0);
  const depositHeld = db.depositEntries.filter((d) => d.paymentId === payment.id).reduce((s, d) => s + depositSigned(db, d), 0);
  const unapplied = payment.status === 'confirmed' ? payment.amount - reversed - allocated - depositHeld : 0;
  // Phần tiền vào hóa đơn trực tiếp (không kể bù trừ cọc) để báo cáo tách cọc.
  const direct = db.paymentAllocations.filter((a) => a.paymentId === payment.id).reduce((s, a) => s + allocationSigned(a), 0);
  return { reversedAmount: reversed, invoiceAllocatedAmount: allocated, directInvoiceAmount: direct, depositHeldAmount: depositHeld, unappliedAmount: unapplied };
}

export function depositBySource(db, tenancyId) {
  const map = new Map();
  for (const entry of db.depositEntries.filter((d) => d.tenancyId === tenancyId)) {
    map.set(entry.paymentId, (map.get(entry.paymentId) || 0) + depositSigned(db, entry));
  }
  return map;
}

export function depositHeld(db, tenancyId) {
  return [...depositBySource(db, tenancyId).values()].reduce((s, v) => s + v, 0);
}

export function tenantDebt(db, tenantId, today) {
  const tenancyIds = new Set(db.tenancies.filter((t) => t.representativeTenantId === tenantId).map((t) => t.id));
  let outstanding = 0;
  let overdue = 0;
  let overdueCount = 0;
  for (const inv of db.invoices.filter((i) => tenancyIds.has(i.tenancyId) && i.status === 'issued' && !['debit_adjustment', 'credit_adjustment'].includes(i.kind))) {
    const b = invoiceBalance(db, inv, today);
    outstanding += b.outstandingAmount;
    if (b.isOverdue) {
      overdue += b.outstandingAmount;
      overdueCount += 1;
    }
  }
  return { outstandingAmount: outstanding, overdueAmount: overdue, overdueCount };
}

// ---------------------------------------------------------------- thu tiền, phân bổ, cọc

export function createPayment(db, ctx, input) {
  const tenant = must(db.tenants, input.tenantId, 'khách');
  const confirmed = input.status === 'confirmed';
  const at = input.receivedAt;
  const payment = {
    id: uuid(),
    code: nextCode(db, `payment:${yymm(instantToIsoDate(at))}`, (n) => `PT-${yymm(instantToIsoDate(at))}-${pad(n, 4)}`),
    tenantId: tenant.id, reservationId: input.reservationId || null, collectedAtPropertyId: input.propertyId || null,
    amount: input.amount, receivedAt: at, methodCode: input.methodCode, bankAccountId: input.bankAccountId || null,
    externalReference: input.externalReference || null, status: confirmed ? 'confirmed' : 'pending',
    confirmedBy: confirmed ? ctx.user.id : null, confirmedAt: confirmed ? ctx.now : null, rejectionReason: null,
    reportedBy: input.reportedBy || ctx.user.id, notes: input.notes || null, idempotencyKey: input.idempotencyKey || uuid(),
    createdAt: ctx.now, fileIds: input.fileIds || [],
  };
  if (payment.amount <= 0) rule('amount_invalid', 'Số tiền phải lớn hơn 0.', { amount: ['Số tiền phải lớn hơn 0.'] });
  if (input.externalReference && db.payments.some((p) => p.externalReference === input.externalReference && p.methodCode === input.methodCode && p.status !== 'rejected')) {
    conflict('duplicate_reference', `Mã giao dịch ${input.externalReference} đã được ghi nhận. Kiểm tra lại để tránh thu trùng.`, { externalReference: ['Mã giao dịch đã tồn tại.'] });
  }
  db.payments.push(payment);
  return payment;
}

export function applyAllocation(db, ctx, { paymentId = null, depositEntryId = null, invoiceId, amount, reason = null }) {
  const invoice = must(db.invoices, invoiceId, 'hóa đơn');
  if (invoice.status !== 'issued') rule('invoice_not_issued', 'Chỉ phân bổ vào hóa đơn đã phát hành.');
  if (['debit_adjustment', 'credit_adjustment'].includes(invoice.kind)) rule('invoice_adjustment', 'Phân bổ vào hóa đơn gốc; chứng từ điều chỉnh đã cộng/trừ vào số phải thu của bản gốc.');
  if (!(amount > 0)) rule('amount_invalid', 'Số tiền phân bổ phải lớn hơn 0.', { amount: ['Phải lớn hơn 0.'] });
  const balance = invoiceBalance(db, invoice, ctx.today);
  if (amount > balance.outstandingAmount) {
    rule('allocation_exceeds_invoice', `Phân bổ vượt số còn phải thu của ${invoice.code} (${new Intl.NumberFormat('vi-VN').format(balance.outstandingAmount)} đ). Bản đầu chặn thu dư vào hóa đơn.`, {
      amount: ['Vượt số còn phải thu.'],
    });
  }
  const representative = tenancyContext(db, invoice.tenancyId).tenant;
  if (paymentId) {
    const payment = must(db.payments, paymentId, 'khoản thu');
    if (payment.status !== 'confirmed') rule('payment_not_confirmed', 'Chỉ khoản thu đã xác nhận mới được phân bổ.');
    if (payment.tenantId !== representative.id) rule('payer_mismatch', 'Khoản thu của khách khác người đại diện đợt thuê; người ở cùng không tự có nghĩa vụ trả thay.');
    const pb = paymentBalance(db, payment);
    if (amount > pb.unappliedAmount) rule('insufficient_unapplied', `Khoản thu ${payment.code} chỉ còn ${new Intl.NumberFormat('vi-VN').format(pb.unappliedAmount)} đ chưa phân bổ.`, { amount: ['Vượt số tiền chưa phân bổ.'] });
  }
  const allocation = {
    id: uuid(), invoiceId, paymentId, depositEntryId, kind: 'apply', amount, reversesId: null, allocatedBy: ctx.user.id,
    allocatedAt: ctx.now, reason, idempotencyKey: uuid(),
  };
  db.paymentAllocations.push(allocation);
  return allocation;
}

export function reverseAllocation(db, ctx, allocationId, { amount, reason }) {
  const original = must(db.paymentAllocations, allocationId, 'phân bổ');
  if (original.kind !== 'apply') rule('not_reversible', 'Chỉ đảo được dòng phân bổ gốc.');
  const already = db.paymentAllocations.filter((a) => a.reversesId === original.id).reduce((s, a) => s + a.amount, 0);
  if (amount > original.amount - already) rule('reversal_exceeds', `Chỉ còn đảo được ${new Intl.NumberFormat('vi-VN').format(original.amount - already)} đ.`, { amount: ['Vượt số tiền còn đảo được.'] });
  const reversal = { ...original, id: uuid(), kind: 'reversal', amount, reversesId: original.id, allocatedBy: ctx.user.id, allocatedAt: ctx.now, reason, idempotencyKey: uuid() };
  db.paymentAllocations.push(reversal);
  if (original.depositEntryId) {
    // Đảo bù trừ cọc: thêm dòng đảo sổ cọc liên kết offset, cùng số tiền, cùng transaction.
    const offset = find(db.depositEntries, original.depositEntryId);
    db.depositEntries.push({
      id: uuid(), tenancyId: offset.tenancyId, paymentId: offset.paymentId, kind: 'reversal', amount, relatedEntryId: offset.id,
      paymentReversalId: null, settlementId: null, occurredAt: ctx.now, reason, confirmedBy: ctx.user.id, idempotencyKey: uuid(), createdAt: ctx.now,
    });
  }
  return reversal;
}

export function reversePayment(db, ctx, paymentId, { kind, amount, reason, methodCode, occurredAt, externalReference }) {
  const payment = must(db.payments, paymentId, 'khoản thu');
  if (payment.status !== 'confirmed') rule('payment_not_confirmed', 'Chỉ đảo/hoàn khoản thu đã xác nhận.');
  const pb = paymentBalance(db, payment);
  if (amount > pb.unappliedAmount) {
    rule('reversal_requires_release', `Khoản thu còn ${new Intl.NumberFormat('vi-VN').format(pb.unappliedAmount)} đ chưa sử dụng. Đảo phân bổ hóa đơn/cọc liên quan trước khi đảo số tiền lớn hơn.`, { amount: ['Vượt số tiền chưa sử dụng.'] });
  }
  const reversal = {
    id: uuid(), paymentId, amount, kind, occurredAt: occurredAt || ctx.now, methodCode: methodCode || payment.methodCode,
    evidenceFileId: null, externalReference: externalReference || null, reason, confirmedBy: ctx.user.id, idempotencyKey: uuid(), createdAt: ctx.now,
  };
  db.paymentReversals.push(reversal);
  return reversal;
}

export function depositReceipt(db, ctx, { tenancyId, paymentId, amount, reason }) {
  const c = tenancyContext(db, tenancyId);
  const payment = must(db.payments, paymentId, 'khoản thu');
  if (payment.status !== 'confirmed') rule('payment_not_confirmed', 'Chỉ khoản thu đã xác nhận mới được ghi vào sổ cọc.');
  if (payment.tenantId !== c.tenant.id) rule('payer_mismatch', 'Khoản thu phải của người đại diện đợt thuê.');
  const pb = paymentBalance(db, payment);
  if (amount > pb.unappliedAmount) rule('insufficient_unapplied', `Khoản thu chỉ còn ${new Intl.NumberFormat('vi-VN').format(pb.unappliedAmount)} đ chưa sử dụng.`, { amount: ['Vượt số tiền chưa sử dụng.'] });
  const entry = {
    id: uuid(), tenancyId, paymentId, kind: 'receipt', amount, relatedEntryId: null, paymentReversalId: null, settlementId: null,
    occurredAt: payment.receivedAt, reason: reason || 'Nhận cọc', confirmedBy: ctx.user.id, idempotencyKey: uuid(), createdAt: ctx.now,
  };
  db.depositEntries.push(entry);
  return entry;
}

function takeFromSources(db, tenancyId, amount) {
  const sources = [...depositBySource(db, tenancyId).entries()].filter(([, held]) => held > 0);
  const total = sources.reduce((s, [, held]) => s + held, 0);
  if (amount > total) rule('deposit_insufficient', `Cọc đang giữ chỉ còn ${new Intl.NumberFormat('vi-VN').format(total)} đ.`, { amount: ['Vượt số cọc đang giữ.'] });
  const parts = [];
  let left = amount;
  for (const [paymentId, held] of sources) {
    if (left <= 0) break;
    const take = Math.min(held, left);
    parts.push({ paymentId, amount: take });
    left -= take;
  }
  return parts;
}

export function depositOffset(db, ctx, { tenancyId, invoiceId, amount, reason, settlementId = null }) {
  const c = tenancyContext(db, tenancyId);
  const invoiceCtx = tenancyContext(db, must(db.invoices, invoiceId, 'hóa đơn').tenancyId);
  if (invoiceCtx.tenant.id !== c.tenant.id) rule('payer_mismatch', 'Chỉ bù trừ cọc vào hóa đơn của cùng người đại diện.');
  const parts = takeFromSources(db, tenancyId, amount);
  return parts.map((part) => {
    const entry = {
      id: uuid(), tenancyId, paymentId: part.paymentId, kind: 'offset', amount: part.amount, relatedEntryId: null, paymentReversalId: null,
      settlementId, occurredAt: ctx.now, reason, confirmedBy: ctx.user.id, idempotencyKey: uuid(), createdAt: ctx.now,
    };
    db.depositEntries.push(entry);
    applyAllocation(db, ctx, { depositEntryId: entry.id, invoiceId, amount: part.amount, reason });
    return entry;
  });
}

export function depositRefund(db, ctx, { tenancyId, amount, reason, methodCode, settlementId = null, externalReference }) {
  const parts = takeFromSources(db, tenancyId, amount);
  return parts.map((part) => {
    const reversal = {
      id: uuid(), paymentId: part.paymentId, amount: part.amount, kind: 'refund', occurredAt: ctx.now, methodCode,
      evidenceFileId: null, externalReference: externalReference || null, reason, confirmedBy: ctx.user.id, idempotencyKey: uuid(), createdAt: ctx.now,
    };
    db.paymentReversals.push(reversal);
    const entry = {
      id: uuid(), tenancyId, paymentId: part.paymentId, kind: 'refund', amount: part.amount, relatedEntryId: null, paymentReversalId: reversal.id,
      settlementId, occurredAt: ctx.now, reason, confirmedBy: ctx.user.id, idempotencyKey: uuid(), createdAt: ctx.now,
    };
    db.depositEntries.push(entry);
    return entry;
  });
}

export function depositTransfer(db, ctx, { fromTenancyId, toTenancyId, amount, reason }) {
  const from = tenancyContext(db, fromTenancyId);
  const to = tenancyContext(db, toTenancyId);
  if (from.tenant.id !== to.tenant.id) rule('deposit_transfer_payer', 'Chỉ chuyển cọc giữa các đợt thuê của cùng người đại diện.');
  const parts = takeFromSources(db, fromTenancyId, amount);
  return parts.map((part) => {
    const out = {
      id: uuid(), tenancyId: fromTenancyId, paymentId: part.paymentId, kind: 'transfer_out', amount: part.amount, relatedEntryId: null,
      paymentReversalId: null, settlementId: null, occurredAt: ctx.now, reason, confirmedBy: ctx.user.id, idempotencyKey: uuid(), createdAt: ctx.now,
    };
    const inn = { ...out, id: uuid(), tenancyId: toTenancyId, kind: 'transfer_in', relatedEntryId: out.id, idempotencyKey: uuid() };
    db.depositEntries.push(out, inn);
    return { out, in: inn };
  });
}

// ---------------------------------------------------------------- ticket SLA

export function slaDueAt(db, organizationId, priority, fromInstant) {
  const policy = db.slaPolicies.find((s) => s.organizationId === organizationId && s.priority === priority);
  if (!policy) return { policy: null, dueAt: null };
  return { policy, dueAt: new Date(new Date(fromInstant).getTime() + policy.targetHours * 3600000).toISOString() };
}

export const isTicketOverdue = (ticket, nowIso) => !['resolved', 'closed'].includes(ticket.status) && ticket.dueAt && ticket.dueAt < nowIso;
