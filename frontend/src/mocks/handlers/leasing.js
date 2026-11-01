// Yêu cầu thuê, lịch xem, giữ chỗ. Giữ chỗ chiếm lịch phòng nhưng KHÔNG phải đang ở.
import { uuid } from '../../utils/ids.js';
import { compareIso, formatDateTime, instantToIsoDate, isIsoDate } from '../../utils/date.js';
import { conflict, fail, listResponse, rule, validator } from '../respond.js';
import { audit, createAllocation, find, must, nextCode, notify } from '../engine.js';
import { inquirySummary, reservationDto, roomSummary, tenantRef, tenantSummary, userRef } from '../dto.js';
import { propertyFilter, roomInScope, tenantInScope } from '../scope.js';

const OPEN = ['new', 'accepted', 'consulting', 'viewing', 'approved'];
const TRANSITIONS = {
  accept: { from: ['new'], to: 'accepted' },
  consult: { from: ['accepted', 'viewing', 'new'], to: 'consulting' },
  approve: { from: ['accepted', 'consulting', 'viewing'], to: 'approved' },
  reject: { from: OPEN, to: 'rejected', reason: true },
  cancel: { from: OPEN, to: 'cancelled', reason: true },
};

function inquiryInScope(ctx, id) {
  const q = must(ctx.db.inquiries, id, 'yêu cầu thuê');
  roomInScope(ctx, q.roomId);
  return q;
}

function normalizePhone(p) {
  return (p || '').replace(/\D/g, '').replace(/^84/, '0');
}

export function duplicateTenants(ctx, { phone, email, excludeId }) {
  const ph = normalizePhone(phone);
  const em = (email || '').trim().toLowerCase();
  return ctx.db.tenants.filter((t) => t.organizationId === ctx.organizationId && t.id !== excludeId
    && ((ph && normalizePhone(t.phone) === ph) || (em && (t.email || '').toLowerCase() === em)));
}

export function createTenantRecord(ctx, data) {
  const v = validator();
  v.required('fullName', data.fullName, 'Họ tên');
  v.email('email', data.email);
  v.phone('phone', data.phone);
  if (!data.phone && !data.email) v.add('phone', 'Cần ít nhất số điện thoại hoặc email.');
  v.check();
  const code = nextCode(ctx.db, `tenant:${ctx.organizationId}`, (n) => `KH-${String(n).padStart(4, '0')}`);
  const tenant = {
    id: uuid(), organizationId: ctx.organizationId, userId: null, code, fullName: data.fullName.trim(), email: data.email || null, phone: data.phone || null,
    dateOfBirth: data.dateOfBirth || null, address: { line: data.addressLine || null, locality: data.locality || null },
    emergencyContactName: data.emergencyContactName || null, emergencyContactPhone: data.emergencyContactPhone || null, notes: data.notes || null, createdAt: ctx.now,
  };
  ctx.db.tenants.push(tenant);
  audit(ctx.db, ctx, { action: 'INSERT', tableName: 'tenants', recordId: tenant.id, after: { code, fullName: tenant.fullName } });
  return tenant;
}

function inquiryDetail(ctx, q) {
  const { db } = ctx;
  const room = find(db.rooms, q.roomId);
  return {
    ...inquirySummary(db, q),
    roomDetail: roomSummary(db, room, ctx.today),
    events: db.inquiryEvents.filter((e) => e.inquiryId === q.id).sort((a, b) => compareIso(a.occurredAt, b.occurredAt))
      .map((e) => ({ ...e, actor: userRef(db, e.actorId) })),
    viewings: db.viewings.filter((v) => v.inquiryId === q.id).sort((a, b) => compareIso(b.startsAt, a.startsAt)).map((v) => ({ ...v, host: userRef(db, v.hostUserId) })),
    tenant: q.tenantId ? tenantSummary(db, find(db.tenants, q.tenantId), ctx.today) : null,
    duplicateCandidates: q.tenantId ? [] : duplicateTenants(ctx, { phone: q.phone, email: q.email }).map((t) => tenantSummary(db, t, ctx.today)),
    overCapacity: q.occupants > room.capacity,
  };
}

function reservationInScope(ctx, id) {
  const r = must(ctx.db.reservations, id, 'giữ chỗ');
  roomInScope(ctx, find(ctx.db.roomAllocations, r.allocationId).roomId);
  return r;
}

export default function register(r) {
  r.get('/api/v1/inquiries', (ctx) => {
    const q = ctx.query;
    const allowed = propertyFilter(ctx);
    const all = ctx.db.inquiries.filter((x) => allowed.has(find(ctx.db.rooms, x.roomId).propertyId)).map((x) => inquirySummary(ctx.db, x));
    return listResponse(all, q, {
      filter: (x) => (!q.status || (q.status === 'open' ? OPEN.includes(x.status) : x.status === q.status))
        && (!q.roomId || x.room.id === q.roomId)
        && (!q.assignedTo || (q.assignedTo === 'me' ? x.assignedTo?.id === ctx.user.id : q.assignedTo === 'none' ? !x.assignedTo : x.assignedTo?.id === q.assignedTo))
        && (!q.source || x.source === q.source),
      search: (x) => [x.code, x.contactName, x.phone, x.email, x.room.code],
      sortable: ['code', 'createdAt', 'desiredMoveIn', 'status', 'contactName'],
      defaultSort: '-createdAt',
    });
  }, { perm: 'inquiries.read' });

  r.get('/api/v1/inquiries/:id', (ctx) => inquiryDetail(ctx, inquiryInScope(ctx, ctx.params.id)), { perm: 'inquiries.read' });

  r.post('/api/v1/inquiries', (ctx) => {
    const b = ctx.body;
    roomInScope(ctx, b.roomId);
    const v = validator();
    v.required('contactName', b.contactName, 'Họ tên');
    if (!b.phone && !b.email) v.add('phone', 'Cần số điện thoại hoặc email.');
    v.phone('phone', b.phone);
    v.email('email', b.email);
    v.number('occupants', b.occupants, 'Số người', { min: 1, max: 20 });
    if (b.desiredMoveIn && !isIsoDate(b.desiredMoveIn)) v.add('desiredMoveIn', 'Ngày chưa hợp lệ.');
    v.check();
    const code = nextCode(ctx.db, 'inquiry', (n) => `YC-${String(n).padStart(4, '0')}`);
    const q = {
      id: uuid(), code, roomId: b.roomId, contactName: b.contactName.trim(), phone: b.phone || null, email: b.email || null, desiredMoveIn: b.desiredMoveIn || null,
      occupants: b.occupants, message: b.message || null, status: 'accepted', assignedTo: ctx.user.id, tenantId: null, closedReason: null, source: 'staff', createdAt: ctx.now,
    };
    ctx.db.inquiries.push(q);
    ctx.db.inquiryEvents.push({ id: uuid(), inquiryId: q.id, kind: 'created', body: 'Nhân viên tạo yêu cầu (điện thoại/trực tiếp) và tự tiếp nhận.', fromStatus: null, toStatus: 'accepted', actorId: ctx.user.id, occurredAt: ctx.now });
    return inquiryDetail(ctx, q);
  }, { perm: 'inquiries.write' });

  r.post('/api/v1/inquiries/:id/transitions', (ctx) => {
    const q = inquiryInScope(ctx, ctx.params.id);
    const { action, reason, note } = ctx.body;
    const t = TRANSITIONS[action];
    if (!t) fail(422, 'validation_failed', 'Hành động không hợp lệ.', { action: ['Không hỗ trợ.'] });
    if (!t.from.includes(q.status)) conflict('invalid_transition', `Không thể chuyển yêu cầu từ "${q.status}" bằng hành động này. Tải lại để xem trạng thái mới nhất.`);
    if (t.reason) {
      const v = validator();
      v.reason('reason', reason);
      v.check();
    }
    if (action === 'approve' && find(ctx.db.rooms, q.roomId).operatingStatus !== 'available') {
      rule('room_not_available', 'Phòng đang bảo trì hoặc ngừng khai thác, chưa thể chấp nhận thuê.');
    }
    const from = q.status;
    q.status = t.to;
    if (action === 'accept' && !q.assignedTo) q.assignedTo = ctx.user.id;
    if (t.reason) q.closedReason = reason;
    if (['rejected', 'cancelled'].includes(t.to)) {
      ctx.db.viewings.filter((v) => v.inquiryId === q.id && v.status === 'scheduled').forEach((v) => { v.status = 'cancelled'; });
    }
    ctx.db.inquiryEvents.push({ id: uuid(), inquiryId: q.id, kind: 'status', body: note || reason || null, fromStatus: from, toStatus: t.to, actorId: ctx.user.id, occurredAt: ctx.now });
    return inquiryDetail(ctx, q);
  }, { perm: 'inquiries.write' });

  r.post('/api/v1/inquiries/:id/events', (ctx) => {
    const q = inquiryInScope(ctx, ctx.params.id);
    const v = validator();
    v.oneOf('kind', ctx.body.kind, ['note', 'call'], 'Loại ghi chú');
    v.required('body', ctx.body.body, 'Nội dung');
    v.check();
    ctx.db.inquiryEvents.push({ id: uuid(), inquiryId: q.id, kind: ctx.body.kind, body: ctx.body.body, fromStatus: null, toStatus: null, actorId: ctx.user.id, occurredAt: ctx.now });
    return inquiryDetail(ctx, q);
  }, { perm: 'inquiries.write' });

  r.put('/api/v1/inquiries/:id/assign', (ctx) => {
    const q = inquiryInScope(ctx, ctx.params.id);
    const member = ctx.db.memberships.find((m) => m.userId === ctx.body.userId && m.organizationId === ctx.organizationId && m.status === 'active');
    if (!member) fail(422, 'validation_failed', 'Người xử lý không thuộc đơn vị.', { userId: ['Không hợp lệ.'] });
    q.assignedTo = ctx.body.userId;
    ctx.db.inquiryEvents.push({ id: uuid(), inquiryId: q.id, kind: 'note', body: `Phân công cho ${find(ctx.db.users, ctx.body.userId).displayName}.`, fromStatus: null, toStatus: null, actorId: ctx.user.id, occurredAt: ctx.now });
    notify(ctx.db, { organizationId: ctx.organizationId, recipientIds: [ctx.body.userId], eventKey: `inquiry.assigned:${q.id}:${ctx.now}`, title: `Bạn được giao ${q.code}`, body: `${q.contactName} – phòng ${find(ctx.db.rooms, q.roomId).code}.`, url: `/admin/viewings?inquiry=${q.id}`, at: ctx.now });
    return inquiryDetail(ctx, q);
  }, { perm: 'inquiries.write' });

  r.post('/api/v1/inquiries/:id/viewings', (ctx) => {
    const q = inquiryInScope(ctx, ctx.params.id);
    if (!OPEN.includes(q.status)) conflict('inquiry_closed', 'Yêu cầu đã đóng, không thể hẹn xem.');
    const b = ctx.body;
    const v = validator();
    v.required('startsAt', b.startsAt, 'Thời gian bắt đầu');
    v.required('endsAt', b.endsAt, 'Thời gian kết thúc');
    v.check();
    if (b.endsAt <= b.startsAt) fail(422, 'validation_failed', 'Thời gian kết thúc phải sau bắt đầu.', { endsAt: ['Phải sau thời gian bắt đầu.'] });
    if (b.startsAt < ctx.now) fail(422, 'validation_failed', 'Không hẹn xem trong quá khứ.', { startsAt: ['Chọn thời gian trong tương lai.'] });
    const viewing = { id: uuid(), inquiryId: q.id, startsAt: b.startsAt, endsAt: b.endsAt, hostUserId: b.hostUserId || ctx.user.id, status: 'scheduled', resultNotes: null };
    ctx.db.viewings.push(viewing);
    const from = q.status;
    if (['new', 'accepted', 'consulting'].includes(q.status)) q.status = 'viewing';
    if (!q.assignedTo) q.assignedTo = ctx.user.id;
    ctx.db.inquiryEvents.push({ id: uuid(), inquiryId: q.id, kind: 'status', body: `Hẹn xem lúc ${formatDateTime(b.startsAt)}.`, fromStatus: from, toStatus: q.status, actorId: ctx.user.id, occurredAt: ctx.now });
    return inquiryDetail(ctx, q);
  }, { perm: 'inquiries.write' });

  r.post('/api/v1/inquiries/:id/tenant', (ctx) => {
    const q = inquiryInScope(ctx, ctx.params.id);
    const b = ctx.body;
    let tenant;
    if (b.tenantId) {
      tenant = tenantInScope(ctx, b.tenantId);
    } else {
      const dupes = duplicateTenants(ctx, { phone: b.phone ?? q.phone, email: b.email ?? q.email });
      if (dupes.length && !b.confirmNew) {
        conflict('possible_duplicate_tenant', `Có ${dupes.length} hồ sơ khách trùng điện thoại/email. Chọn hồ sơ có sẵn hoặc xác nhận tạo mới.`, { tenantId: dupes.map((d) => `${d.code} – ${d.fullName}`) });
      }
      tenant = createTenantRecord(ctx, { fullName: b.fullName || q.contactName, phone: b.phone ?? q.phone, email: b.email ?? q.email });
    }
    q.tenantId = tenant.id;
    ctx.db.inquiryEvents.push({ id: uuid(), inquiryId: q.id, kind: 'note', body: `Liên kết hồ sơ khách ${tenant.code}.`, fromStatus: null, toStatus: null, actorId: ctx.user.id, occurredAt: ctx.now });
    return inquiryDetail(ctx, q);
  }, { perm: ['inquiries.write'] });

  // ---------------------------------------------------------------- lịch xem
  r.get('/api/v1/viewings', (ctx) => {
    const q = ctx.query;
    const allowed = propertyFilter(ctx);
    const all = ctx.db.viewings.map((v) => {
      const inquiry = find(ctx.db.inquiries, v.inquiryId);
      return { ...v, host: userRef(ctx.db, v.hostUserId), inquiry: inquirySummary(ctx.db, inquiry), date: instantToIsoDate(v.startsAt), propertyId: find(ctx.db.rooms, inquiry.roomId).propertyId };
    }).filter((v) => allowed.has(v.propertyId));
    return listResponse(all, { pageSize: 200, ...q }, {
      filter: (v) => (!q.status || v.status === q.status) && (!q.from || v.date >= q.from) && (!q.to || v.date <= q.to) && (!q.hostUserId || v.hostUserId === q.hostUserId),
      search: (v) => [v.inquiry.contactName, v.inquiry.code, v.inquiry.room.code],
      sortable: ['startsAt'],
      defaultSort: 'startsAt',
    });
  }, { perm: 'inquiries.read' });

  r.post('/api/v1/viewings/:id/result', (ctx) => {
    const viewing = must(ctx.db.viewings, ctx.params.id, 'lịch xem');
    inquiryInScope(ctx, viewing.inquiryId);
    const v = validator();
    v.oneOf('status', ctx.body.status, ['completed', 'no_show', 'cancelled'], 'Kết quả');
    v.check();
    if (viewing.status !== 'scheduled') conflict('viewing_closed', 'Lịch xem đã có kết quả.');
    viewing.status = ctx.body.status;
    viewing.resultNotes = ctx.body.resultNotes || null;
    const q = find(ctx.db.inquiries, viewing.inquiryId);
    ctx.db.inquiryEvents.push({ id: uuid(), inquiryId: q.id, kind: 'note', body: `Kết quả xem phòng: ${{ completed: 'đã xem', no_show: 'khách không đến', cancelled: 'đã hủy' }[ctx.body.status]}. ${viewing.resultNotes || ''}`.trim(), fromStatus: null, toStatus: null, actorId: ctx.user.id, occurredAt: ctx.now });
    if (q.status === 'viewing') q.status = 'consulting';
    return { ...viewing, inquiry: inquirySummary(ctx.db, q) };
  }, { perm: 'inquiries.write' });

  // ---------------------------------------------------------------- giữ chỗ
  r.get('/api/v1/reservations', (ctx) => {
    const q = ctx.query;
    const allowed = propertyFilter(ctx);
    const all = ctx.db.reservations.filter((x) => allowed.has(find(ctx.db.rooms, find(ctx.db.roomAllocations, x.allocationId).roomId).propertyId))
      .map((x) => reservationDto(ctx.db, x, ctx.now));
    return listResponse(all, q, {
      filter: (x) => (!q.status || x.status === q.status) && (!q.expiringWithinHours || (x.status === 'holding' && new Date(x.holdExpiresAt) - new Date(ctx.now) <= Number(q.expiringWithinHours) * 3600000)),
      search: (x) => [x.code, x.tenant?.fullName, x.room.code],
      sortable: ['code', 'createdAt', 'holdExpiresAt', 'startsOn'],
      defaultSort: '-createdAt',
    });
  }, { perm: 'inquiries.read' });

  r.get('/api/v1/reservations/:id', (ctx) => reservationDto(ctx.db, reservationInScope(ctx, ctx.params.id), ctx.now), { perm: 'inquiries.read' });

  r.post('/api/v1/reservations', (ctx) => {
    const b = ctx.body;
    const room = roomInScope(ctx, b.roomId);
    const tenant = tenantInScope(ctx, b.tenantId);
    const v = validator();
    v.date('startsOn', b.startsOn, 'Ngày bắt đầu giữ');
    v.required('holdExpiresAt', b.holdExpiresAt, 'Hạn giữ chỗ');
    v.required('cancellationTerms', b.cancellationTerms, 'Điều kiện hủy');
    if (b.endsOn && !isIsoDate(b.endsOn)) v.add('endsOn', 'Ngày kết thúc chưa hợp lệ.');
    v.check();
    if (b.startsOn < ctx.today) fail(422, 'validation_failed', 'Ngày bắt đầu không được ở quá khứ.', { startsOn: ['Chọn từ hôm nay trở đi.'] });
    if (b.holdExpiresAt <= ctx.now) fail(422, 'validation_failed', 'Hạn giữ phải ở tương lai.', { holdExpiresAt: ['Chọn thời điểm sau hiện tại.'] });
    if (b.endsOn && b.endsOn <= b.startsOn) fail(422, 'validation_failed', 'Ngày kết thúc phải sau ngày bắt đầu.', { endsOn: ['Phải sau ngày bắt đầu.'] });
    if (room.operatingStatus !== 'available') rule('room_not_available', 'Phòng đang bảo trì hoặc ngừng khai thác, không thể giữ chỗ.');
    if (ctx.db.reservations.some((x) => x.tenantId === tenant.id && x.status === 'holding')) conflict('tenant_has_hold', 'Khách đang có một giữ chỗ khác còn hiệu lực.');
    const allocation = createAllocation(ctx.db, { roomId: room.id, startsOn: b.startsOn, endsOn: b.endsOn || null, state: 'held', holdExpiresAt: b.holdExpiresAt });
    const code = nextCode(ctx.db, 'reservation', (n) => `GC-${String(n).padStart(4, '0')}`);
    const reservation = { id: uuid(), code, inquiryId: b.inquiryId || null, allocationId: allocation.id, tenantId: tenant.id, status: 'holding', cancellationTerms: b.cancellationTerms, cancelledReason: null, handledBy: ctx.user.id, createdAt: ctx.now };
    ctx.db.reservations.push(reservation);
    if (b.inquiryId) {
      const q = inquiryInScope(ctx, b.inquiryId);
      if (q.status !== 'approved') {
        ctx.db.inquiryEvents.push({ id: uuid(), inquiryId: q.id, kind: 'status', body: `Giữ chỗ ${code}.`, fromStatus: q.status, toStatus: 'approved', actorId: ctx.user.id, occurredAt: ctx.now });
        q.status = 'approved';
      }
      q.tenantId ||= tenant.id;
    }
    audit(ctx.db, ctx, { action: 'reservation.create', tableName: 'reservations', recordId: reservation.id, after: { code, roomId: room.id, holdExpiresAt: b.holdExpiresAt } });
    return reservationDto(ctx.db, reservation, ctx.now);
  }, { perm: 'inquiries.write' });

  r.post('/api/v1/reservations/:id/cancel', (ctx) => {
    const reservation = reservationInScope(ctx, ctx.params.id);
    const v = validator();
    v.reason('reason', ctx.body.reason);
    v.check();
    if (reservation.status !== 'holding') conflict('reservation_not_holding', 'Giữ chỗ không còn hiệu lực.');
    reservation.status = 'cancelled';
    reservation.cancelledReason = ctx.body.reason;
    find(ctx.db.roomAllocations, reservation.allocationId).state = 'released';
    audit(ctx.db, ctx, { action: 'reservation.cancel', tableName: 'reservations', recordId: reservation.id, reason: ctx.body.reason });
    return reservationDto(ctx.db, reservation, ctx.now);
  }, { perm: 'inquiries.write' });

  r.post('/api/v1/reservations/:id/extend', (ctx) => {
    const reservation = reservationInScope(ctx, ctx.params.id);
    const v = validator();
    v.required('holdExpiresAt', ctx.body.holdExpiresAt, 'Hạn giữ mới');
    v.reason('reason', ctx.body.reason);
    v.check();
    if (reservation.status !== 'holding') conflict('reservation_not_holding', 'Giữ chỗ không còn hiệu lực.');
    const allocation = find(ctx.db.roomAllocations, reservation.allocationId);
    if (ctx.body.holdExpiresAt <= allocation.holdExpiresAt) fail(422, 'validation_failed', 'Hạn mới phải sau hạn hiện tại.', { holdExpiresAt: ['Phải sau hạn hiện tại.'] });
    allocation.holdExpiresAt = ctx.body.holdExpiresAt;
    audit(ctx.db, ctx, { action: 'reservation.extend', tableName: 'reservations', recordId: reservation.id, after: { holdExpiresAt: ctx.body.holdExpiresAt }, reason: ctx.body.reason });
    return reservationDto(ctx.db, reservation, ctx.now);
  }, { perm: 'inquiries.write' });

  r.get('/api/v1/tenants/duplicates', (ctx) => duplicateTenants(ctx, { phone: ctx.query.phone, email: ctx.query.email, excludeId: ctx.query.excludeId })
    .map((t) => ({ ...tenantRef(t), email: t.email, matchedBy: [normalizePhone(t.phone) === normalizePhone(ctx.query.phone) && ctx.query.phone ? 'phone' : null, (t.email || '').toLowerCase() === (ctx.query.email || '').toLowerCase() && ctx.query.email ? 'email' : null].filter(Boolean) })), { perm: 'tenants.read' });

}
