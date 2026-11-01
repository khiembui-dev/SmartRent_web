// Công tơ, chỉ số, thay công tơ, kỳ tính tiền (khóa/mở khóa có lý do) và bảng ghi chỉ số theo kỳ.
import { uuid } from '../../utils/ids.js';
import { compareIso, instantToIsoDate, isIsoDate, monthLabel, monthStart, nextMonthStart, rangesOverlap, vnDateTimeToInstant } from '../../utils/date.js';
import { lineAmount } from '../../utils/money.js';
import { conflict, fail, listResponse, rule, validator } from '../respond.js';
import {
  activeTenancyOfRoom, audit, computeCharges, correctReading, currentMeter, effectiveRates, find, markDraftsStale, metersOfRoom, must, readingInUse,
  recordReading, tenancyContext, validReadings,
} from '../engine.js';
import { invoiceSummary, propertyRef, roomRef, tenancyBrief, userRef } from '../dto.js';
import { orgProperties, periodInScope, propertyFilter, propertyInScope, roomInScope } from '../scope.js';

function periodStats(ctx, period) {
  const rows = worksheetRows(ctx, period);
  const count = (group) => rows.filter((row) => row.group === group).length;
  return {
    tenancyCount: rows.length,
    missingReadings: count('missing_readings'),
    blocked: count('blocked'),
    readyToDraft: count('ready'),
    drafts: count('draft'),
    issuedUnpaid: count('issued_unpaid'),
    issuedPartial: count('issued_partial'),
    paid: count('paid'),
  };
}

function periodDto(ctx, period, withStats = true) {
  const { db } = ctx;
  return {
    id: period.id, property: propertyRef(find(db.properties, period.propertyId)), monthStart: period.monthStart, label: monthLabel(period.monthStart),
    status: period.status, lockedAt: period.lockedAt, lockedBy: userRef(db, period.lockedBy),
    stats: withStats ? periodStats(ctx, period) : null,
  };
}

function readingBlock(ctx, tenancy, room, kind, period) {
  const { db } = ctx;
  const meter = metersOfRoom(db, room.id, kind).filter((m) => m.installedAt < vnDateTimeToInstant(nextMonthStart(period.monthStart))).pop();
  if (!meter) return null;
  const readings = metersOfRoom(db, room.id, kind).flatMap((m) => validReadings(db, m.id)).filter((r) => r.tenancyId === tenancy.id).sort((a, b) => compareIso(a.observedAt, b.observedAt));
  const current = readings.find((r) => r.billingPeriodId === period.id && ['periodic', 'checkout'].includes(r.readingKind))
    || readings.find((r) => r.readingKind === 'checkout' && instantToIsoDate(r.observedAt) >= period.monthStart && instantToIsoDate(r.observedAt) < nextMonthStart(period.monthStart));
  const before = readings.filter((r) => !current || r.observedAt < current.observedAt);
  const previous = before[before.length - 1] || null;
  const consumption = current && previous && previous.meterId === current.meterId ? Math.round((current.readingValue - previous.readingValue) * 1000) / 1000 : null;
  const history = readings.filter((r) => r.readingKind === 'periodic' && r.billingPeriodId !== period.id);
  const deltas = [];
  for (let i = 1; i < history.length; i += 1) deltas.push(history[i].readingValue - history[i - 1].readingValue);
  const average = deltas.length ? deltas.reduce((s, x) => s + x, 0) / deltas.length : null;
  return {
    meterId: meter.id, serialNumber: meter.serialNumber, meterKind: kind,
    previous: previous ? { id: previous.id, value: previous.readingValue, observedAt: previous.observedAt, kind: previous.readingKind } : null,
    current: current ? { id: current.id, value: current.readingValue, observedAt: current.observedAt, kind: current.readingKind, recordedBy: userRef(db, current.recordedBy), inUse: readingInUse(db, current.id) } : null,
    consumption,
    averageConsumption: average != null ? Math.round(average * 10) / 10 : null,
    anomaly: consumption != null && average != null && average > 0 && (consumption > average * 2 || consumption < average * 0.3),
  };
}

/** Tạm tính để xem trước trên bảng kỳ. Số xác nhận chỉ có khi lập hóa đơn. */
function estimateOf(db, computed, c, onDate) {
  const types = db.chargeTypes.filter((t) => t.organizationId === c.organizationId);
  const rates = effectiveRates(db, c.tenancy.id, onDate);
  const unitPrice = (category) => rates.get(types.find((t) => t.category === category)?.id)?.rate.unitPrice ?? null;
  const meteredIds = new Set(types.filter((t) => ['electricity', 'water'].includes(t.category)).map((t) => t.id));
  const lines = computed.lines.map((l) => ({ description: l.descriptionSnapshot, amount: lineAmount(l), metered: meteredIds.has(l.chargeTypeId) }));
  return {
    lines,
    fixedTotal: lines.filter((l) => !l.metered).reduce((s, l) => s + l.amount, 0),
    total: computed.problems.length ? null : lines.reduce((s, l) => s + l.amount, 0),
    unitPrices: { electricity: unitPrice('electricity'), water: unitPrice('water') },
  };
}

function worksheetRows(ctx, period) {
  const { db, today } = ctx;
  const from = period.monthStart;
  const to = nextMonthStart(period.monthStart);
  const tenancies = db.tenancies.filter((t) => {
    if (!['active', 'ended'].includes(t.status) || !t.actualMoveIn) return false;
    const c = tenancyContext(db, t);
    return c.property.id === period.propertyId && rangesOverlap(t.actualMoveIn, t.actualMoveOut, from, to);
  });
  return tenancies.map((t) => {
    const c = tenancyContext(db, t);
    const invoices = db.invoices.filter((i) => i.tenancyId === t.id && i.status !== 'void' && ['periodic', 'final'].includes(i.kind)
      && (i.billingPeriodId === period.id || (!i.billingPeriodId && rangesOverlap(i.serviceFrom, i.serviceTo, from, to))));
    const invoice = invoices.find((i) => i.status === 'issued') || invoices[0] || null;
    const readings = { electricity: readingBlock(ctx, t, c.room, 'electricity', period), water: readingBlock(ctx, t, c.room, 'water', period) };
    let group;
    let problems = [];
    let estimate = null;
    if (invoice?.status !== 'issued') estimate = estimateOf(db, computeCharges(db, t.id, { from, to, periodId: period.id }), c, t.actualMoveIn > from ? t.actualMoveIn : from);
    if (invoice?.status === 'issued') {
      const s = invoiceSummary(db, invoice, today);
      group = s.paymentStatus === 'paid' ? 'paid' : s.paymentStatus === 'partial' ? 'issued_partial' : 'issued_unpaid';
    } else if (invoice?.status === 'draft') {
      group = 'draft';
      problems = invoice.problems || [];
    } else {
      const preview = computeCharges(db, t.id, { from, to, periodId: period.id });
      problems = preview.problems;
      if (problems.some((p) => ['missing_reading', 'missing_previous'].includes(p.code))) group = 'missing_readings';
      else if (problems.length) group = 'blocked';
      else group = 'ready';
    }
    return {
      tenancy: tenancyBrief(db, t, today), room: roomRef(db, c.room), group, problems, readings, estimate,
      invoice: invoice ? invoiceSummary(db, invoice, today) : null,
      endedInPeriod: Boolean(t.actualMoveOut && t.actualMoveOut < to),
    };
  }).sort((a, b) => a.room.code.localeCompare(b.room.code));
}

function saveReading(ctx, input) {
  const { db } = ctx;
  const meter = must(db.meters, input.meterId, 'công tơ');
  roomInScope(ctx, meter.roomId);
  const v = validator();
  v.number('readingValue', input.readingValue, 'Chỉ số', { min: 0, decimals: 3 });
  v.required('observedAt', input.observedAt, 'Thời điểm ghi');
  v.check();
  if (input.observedAt > ctx.now) fail(422, 'validation_failed', 'Thời điểm ghi không được ở tương lai.', { observedAt: ['Không được ở tương lai.'] });
  let periodId = input.billingPeriodId || null;
  if (periodId) {
    const period = periodInScope(ctx, periodId);
    if (period.propertyId !== find(db.rooms, meter.roomId).propertyId) rule('period_mismatch', 'Kỳ thuộc cơ sở khác.');
  } else {
    const iso = monthStart(instantToIsoDate(input.observedAt));
    periodId = db.billingPeriods.find((p) => p.propertyId === find(db.rooms, meter.roomId).propertyId && p.monthStart === iso)?.id || null;
  }
  const tenancy = activeTenancyOfRoom(db, meter.roomId);
  if (!tenancy) rule('no_active_tenancy', 'Phòng không có đợt thuê đang ở. Chỉ số khi nhận/trả phòng ghi trong luồng bàn giao.');
  const reading = recordReading(db, ctx, {
    meterId: meter.id, observedAt: input.observedAt, readingValue: input.readingValue, billingPeriodId: periodId, tenancyId: tenancy.id,
    readingKind: 'periodic', notes: input.notes, fileIds: input.fileIds,
  });
  markDraftsStale(db, tenancy.id);
  return reading;
}

export default function register(r) {
  r.get('/api/v1/billing-periods', (ctx) => {
    const q = ctx.query;
    const allowed = propertyFilter(ctx);
    const all = ctx.db.billingPeriods.filter((p) => allowed.has(p.propertyId)).map((p) => periodDto(ctx, p, q.stats !== 'false'));
    return listResponse(all, { pageSize: 100, ...q }, {
      filter: (p) => (!q.status || p.status === q.status) && (!q.month || p.monthStart.startsWith(q.month)),
      search: (p) => [p.property.name, p.label],
      sortable: ['monthStart', 'property.code'],
      defaultSort: '-monthStart',
    });
  }, { perm: 'billing.read' });

  r.post('/api/v1/billing-periods', (ctx) => {
    const b = ctx.body;
    propertyInScope(ctx, b.propertyId);
    const v = validator();
    v.date('monthStart', b.monthStart, 'Tháng');
    v.check();
    if (!b.monthStart.endsWith('-01')) fail(422, 'validation_failed', 'Kỳ bắt đầu từ ngày 01.', { monthStart: ['Chọn ngày đầu tháng.'] });
    if (ctx.db.billingPeriods.some((p) => p.propertyId === b.propertyId && p.monthStart === b.monthStart)) conflict('period_exists', 'Kỳ này đã tồn tại.');
    const period = { id: uuid(), propertyId: b.propertyId, monthStart: b.monthStart, status: 'open', lockedAt: null, lockedBy: null };
    ctx.db.billingPeriods.push(period);
    return periodDto(ctx, period);
  }, { perm: 'invoices.write' });

  r.get('/api/v1/billing-periods/:id', (ctx) => {
    const period = periodInScope(ctx, ctx.params.id);
    return {
      ...periodDto(ctx, period),
      events: ctx.db.periodEvents.filter((e) => e.periodId === period.id).sort((a, b) => compareIso(b.occurredAt, a.occurredAt)).map((e) => ({ ...e, actor: userRef(ctx.db, e.actorId) })),
    };
  }, { perm: 'billing.read' });

  r.get('/api/v1/billing-periods/:id/worksheet', (ctx) => {
    const period = periodInScope(ctx, ctx.params.id);
    const rows = worksheetRows(ctx, period);
    const q = ctx.query;
    const filtered = rows.filter((row) => (!q.group || row.group === q.group) && (!q.q || `${row.room.code} ${row.tenancy.representative.fullName}`.toLowerCase().includes(q.q.toLowerCase())));
    return { period: periodDto(ctx, period, false), stats: periodStats(ctx, period), rows: filtered };
  }, { perm: 'billing.read' });

  r.post('/api/v1/billing-periods/:id/lock', (ctx) => {
    const period = periodInScope(ctx, ctx.params.id);
    if (period.status === 'locked') conflict('period_locked', 'Kỳ đã khóa.');
    const stats = periodStats(ctx, period);
    if ((stats.drafts || stats.missingReadings || stats.readyToDraft) && !ctx.body.acknowledgeIncomplete) {
      conflict('period_incomplete', `Kỳ còn ${stats.missingReadings} phòng thiếu chỉ số, ${stats.readyToDraft} phòng chưa lập, ${stats.drafts} hóa đơn nháp. Xác nhận nếu vẫn muốn khóa.`);
    }
    Object.assign(period, { status: 'locked', lockedAt: ctx.now, lockedBy: ctx.user.id });
    ctx.db.periodEvents.push({ id: uuid(), periodId: period.id, action: 'lock', reason: ctx.body.reason || null, actorId: ctx.user.id, occurredAt: ctx.now });
    audit(ctx.db, ctx, { action: 'billing_period.lock', tableName: 'billing_periods', recordId: period.id, after: { status: 'locked' }, reason: ctx.body.reason });
    return periodDto(ctx, period);
  }, { perm: 'billing.lock' });

  r.post('/api/v1/billing-periods/:id/unlock', (ctx) => {
    const period = periodInScope(ctx, ctx.params.id);
    const v = validator();
    v.reason('reason', ctx.body.reason, 'Lý do mở khóa');
    v.check();
    if (period.status !== 'locked') conflict('period_open', 'Kỳ đang mở.');
    Object.assign(period, { status: 'open', lockedAt: null, lockedBy: null });
    ctx.db.periodEvents.push({ id: uuid(), periodId: period.id, action: 'unlock', reason: ctx.body.reason, actorId: ctx.user.id, occurredAt: ctx.now });
    audit(ctx.db, ctx, { action: 'billing_period.unlock', tableName: 'billing_periods', recordId: period.id, before: { status: 'locked' }, after: { status: 'open' }, reason: ctx.body.reason });
    return { ...periodDto(ctx, period), note: 'Mở khóa kỳ không cho sửa hóa đơn đã phát hành; dùng chứng từ điều chỉnh.' };
  }, { perm: 'billing.unlock' });

  // ---------------------------------------------------------------- công tơ, chỉ số
  r.get('/api/v1/meters', (ctx) => {
    const q = ctx.query;
    const allowed = propertyFilter(ctx);
    const all = ctx.db.meters.filter((m) => allowed.has(find(ctx.db.rooms, m.roomId).propertyId)).map((m) => {
      const last = validReadings(ctx.db, m.id).pop();
      return {
        id: m.id, meterKind: m.meterKind, serialNumber: m.serialNumber, installedAt: m.installedAt, removedAt: m.removedAt, isCurrent: !m.removedAt,
        room: roomRef(ctx.db, find(ctx.db.rooms, m.roomId)), lastReading: last ? { value: last.readingValue, observedAt: last.observedAt, kind: last.readingKind } : null,
      };
    });
    return listResponse(all, q, {
      filter: (m) => (!q.roomId || m.room.id === q.roomId) && (!q.meterKind || m.meterKind === q.meterKind) && (q.includeRemoved === 'true' || m.isCurrent),
      search: (m) => [m.serialNumber, m.room.code],
      sortable: ['room.code', 'serialNumber', 'installedAt'],
      defaultSort: 'room.code',
    });
  }, { perm: 'meters.read' });

  r.get('/api/v1/meters/:id/readings', (ctx) => {
    const meter = must(ctx.db.meters, ctx.params.id, 'công tơ');
    roomInScope(ctx, meter.roomId);
    return ctx.db.readings.filter((x) => x.meterId === meter.id).sort((a, b) => compareIso(b.observedAt, a.observedAt)).map((x) => ({
      id: x.id, observedAt: x.observedAt, readingValue: x.readingValue, readingKind: x.readingKind, status: x.status, voidReason: x.voidReason,
      supersedesId: x.supersedesId, notes: x.notes, recordedBy: userRef(ctx.db, x.recordedBy), recordedAt: x.recordedAt,
      period: x.billingPeriodId ? monthLabel(find(ctx.db.billingPeriods, x.billingPeriodId).monthStart) : null, inUse: readingInUse(ctx.db, x.id),
    }));
  }, { perm: 'meters.read' });

  r.post('/api/v1/meter-readings', (ctx) => {
    const reading = saveReading(ctx, ctx.body);
    audit(ctx.db, ctx, { action: 'meter_reading.record', tableName: 'meter_readings', recordId: reading.id, after: { value: reading.readingValue } });
    return reading;
  }, { perm: 'meters.write' });

  // Ghi nhiều chỉ số trong bảng kỳ: kết quả từng dòng, dòng lỗi không làm hỏng dòng khác.
  r.post('/api/v1/meter-readings/batch', (ctx) => {
    const items = ctx.body.items || [];
    if (!items.length) fail(422, 'validation_failed', 'Chưa có chỉ số nào để lưu.');
    return {
      results: items.map((item, index) => {
        try {
          const reading = saveReading(ctx, { ...item, billingPeriodId: ctx.body.billingPeriodId });
          return { index, meterId: item.meterId, status: 'succeeded', readingId: reading.id };
        } catch (error) {
          return { index, meterId: item.meterId, status: 'failed', code: error.code, message: error.detail || error.message, fieldErrors: error.fieldErrors };
        }
      }),
    };
  }, { perm: 'meters.write' });

  r.post('/api/v1/meter-readings/:id/correct', (ctx) => {
    const reading = must(ctx.db.readings, ctx.params.id, 'chỉ số');
    roomInScope(ctx, find(ctx.db.meters, reading.meterId).roomId);
    const v = validator();
    v.number('readingValue', ctx.body.readingValue, 'Chỉ số đúng', { min: 0, decimals: 3 });
    v.reason('reason', ctx.body.reason, 'Lý do sửa');
    v.check();
    const next = correctReading(ctx.db, ctx, reading.id, { readingValue: ctx.body.readingValue, reason: ctx.body.reason });
    audit(ctx.db, ctx, { action: 'meter_reading.correct', tableName: 'meter_readings', recordId: next.id, before: { value: reading.readingValue }, after: { value: next.readingValue }, reason: ctx.body.reason });
    return next;
  }, { perm: 'meters.write' });

  r.post('/api/v1/meters/:id/replace', (ctx) => {
    const old = must(ctx.db.meters, ctx.params.id, 'công tơ');
    const room = roomInScope(ctx, old.roomId);
    const b = ctx.body;
    const v = validator();
    v.required('replacedAt', b.replacedAt, 'Thời điểm thay');
    v.number('oldFinalValue', b.oldFinalValue, 'Chỉ số chốt công tơ cũ', { min: 0, decimals: 3 });
    v.required('newSerialNumber', b.newSerialNumber, 'Số serial công tơ mới');
    v.number('newInitialValue', b.newInitialValue, 'Chỉ số đầu công tơ mới', { min: 0, decimals: 3 });
    v.reason('reason', b.reason);
    v.check();
    if (old.removedAt) conflict('meter_removed', 'Công tơ này đã được tháo.');
    if (b.replacedAt > ctx.now) fail(422, 'validation_failed', 'Thời điểm thay không được ở tương lai.', { replacedAt: ['Không được ở tương lai.'] });
    if (ctx.db.meters.some((m) => m.serialNumber === b.newSerialNumber)) conflict('serial_taken', 'Số serial đã được dùng.', { newSerialNumber: ['Trùng serial.'] });
    const tenancy = activeTenancyOfRoom(ctx.db, room.id);
    // Chốt công tơ cũ và mở công tơ mới trong cùng một transaction.
    const finalReading = recordReading(ctx.db, ctx, { meterId: old.id, observedAt: b.replacedAt, readingValue: b.oldFinalValue, tenancyId: tenancy?.id || null, readingKind: 'replacement', notes: `Chốt khi thay công tơ: ${b.reason}` });
    old.removedAt = b.replacedAt;
    const meter = { id: uuid(), roomId: room.id, meterKind: old.meterKind, serialNumber: b.newSerialNumber, installedAt: b.replacedAt, removedAt: null };
    ctx.db.meters.push(meter);
    const initial = recordReading(ctx.db, ctx, { meterId: meter.id, observedAt: b.replacedAt, readingValue: b.newInitialValue, tenancyId: tenancy?.id || null, readingKind: 'replacement', notes: 'Chỉ số đầu công tơ mới' });
    ctx.db.meterReplacements.push({ id: uuid(), oldMeterId: old.id, newMeterId: meter.id, oldFinalReadingId: finalReading.id, newInitialReadingId: initial.id, replacedAt: b.replacedAt, reason: b.reason, actorId: ctx.user.id, fileIds: b.fileIds || [] });
    if (tenancy) markDraftsStale(ctx.db, tenancy.id);
    audit(ctx.db, ctx, { action: 'meter.replace', tableName: 'meter_replacements', recordId: meter.id, after: { oldSerial: old.serialNumber, newSerial: meter.serialNumber, oldFinal: b.oldFinalValue, newInitial: b.newInitialValue }, reason: b.reason });
    return { oldMeterId: old.id, newMeter: { ...meter, room: roomRef(ctx.db, room) } };
  }, { perm: 'meters.replace' });

  void currentMeter;
  void isIsoDate;
  void orgProperties;
  void tenancyBrief;
}
