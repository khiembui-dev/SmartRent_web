// Cổng khách thuê: chỉ dữ liệu của chính khách. Người ở cùng không xem công nợ/hóa đơn của người đại diện.
import { uuid } from '../../utils/ids.js';
import { addDays, compareIso, formatDateTime, isIsoDate } from '../../utils/date.js';
import { conflict, fail, listResponse, rule, validator } from '../respond.js';
import { contractStatus, createPayment, depositHeld, find, must, nextCode, notify, roomRates, staffWith, tenancyContext } from '../engine.js';
import { invoiceDetail, invoiceSummary, paymentSummary, propertyRef, roomRef, tenantRef, ticketDetail, ticketSummary, userRef, versionDto } from '../dto.js';
import { createTenantRecord } from './leasing.js';
import { availability, findPublishedListing } from './public.js';
import { addTicketMessage, createTicket } from './support.js';

function memberships(ctx) {
  const { db } = ctx;
  const tenantIds = new Set(ctx.tenantRecords.map((t) => t.id));
  const rep = db.tenancies.filter((t) => tenantIds.has(t.representativeTenantId)).map((t) => ({ tenancy: t, role: 'representative' }));
  const res = db.residents.filter((r) => tenantIds.has(r.tenantId)).map((r) => ({ tenancy: find(db.tenancies, r.tenancyId), role: 'resident', resident: r }));
  return [...rep, ...res];
}

function repTenancyIds(ctx) {
  return new Set(memberships(ctx).filter((m) => m.role === 'representative').map((m) => m.tenancy.id));
}

function tenancyView(ctx, { tenancy, role, resident }) {
  const { db, today } = ctx;
  const c = tenancyContext(db, tenancy);
  const contract = db.contracts.filter((k) => k.tenancyId === tenancy.id).sort((a, b) => compareIso(b.createdAt, a.createdAt))[0];
  const cs = contract ? contractStatus(db, contract, today) : null;
  const isRep = role === 'representative';
  return {
    id: tenancy.id, role, status: tenancy.status, room: { ...roomRef(db, c.room), areaM2: c.room.areaM2 }, property: { ...propertyRef(c.property), addressLine: c.property.address.line, locality: c.property.address.locality, contactName: c.property.contactName, phone: c.property.phone },
    representative: tenantRef(c.tenant), plannedMoveIn: tenancy.plannedMoveIn, actualMoveIn: tenancy.actualMoveIn, actualMoveOut: tenancy.actualMoveOut,
    joinedOn: resident?.joinedOn || null, leftOn: resident?.leftOn || null,
    contract: contract ? { id: contract.id, code: contract.code, status: cs.status, expiring: cs.expiring, endsOn: cs.endsOn, displayEndOn: cs.endsOn ? addDays(cs.endsOn, -1) : null, daysLeft: cs.daysLeft } : null,
    rent: isRep ? tenancyRent(db, c.room, cs?.currentVersion, today) : null,
    requiredDeposit: isRep ? cs?.currentVersion?.requiredDeposit ?? null : null,
    depositHeld: isRep ? depositHeld(db, tenancy.id) : null,
    financeVisible: isRep,
  };
}

/** Tiền thuê: theo hợp đồng đang hiệu lực, chưa có hợp đồng thì theo bảng giá phòng. Người ở cùng không xem. */
function tenancyRent(db, room, version, today) {
  const rate = version
    ? db.chargeRates.find((r) => r.ratePlanId === db.ratePlans.find((p) => p.contractVersionId === version.id)?.id && find(db.chargeTypes, r.chargeTypeId)?.category === 'rent')
    : [...roomRates(db, room.id, today).values()].map((x) => x.rate).find((r) => find(db.chargeTypes, r.chargeTypeId)?.category === 'rent');
  return rate?.unitPrice ?? null;
}

const OPEN_INQUIRY = ['new', 'accepted', 'consulting', 'viewing', 'approved'];

function inquiryView(ctx, q) {
  const { db } = ctx;
  const room = find(db.rooms, q.roomId);
  const viewing = db.viewings.filter((v) => v.inquiryId === q.id && v.status === 'scheduled').sort((a, b) => compareIso(a.startsAt, b.startsAt))[0];
  return {
    id: q.id, code: q.code, status: q.status, room: roomRef(db, room), slug: db.roomListings.find((l) => l.roomId === room.id)?.slug || null,
    preferredViewingAt: q.preferredViewingAt || null, occupants: q.occupants, message: q.message, createdAt: q.createdAt,
    scheduledAt: viewing?.startsAt || null,
  };
}

function myInvoice(ctx, id) {
  const inv = must(ctx.db.invoices, id, 'hóa đơn');
  if (!repTenancyIds(ctx).has(inv.tenancyId) || inv.status === 'draft') fail(404, 'not_found', 'Không tìm thấy hóa đơn.');
  return inv;
}

function myTicket(ctx, id) {
  const ticket = must(ctx.db.tickets, id, 'ticket');
  const tenancyIds = new Set(memberships(ctx).map((m) => m.tenancy.id));
  if (!(ticket.tenancyId && tenancyIds.has(ticket.tenancyId)) && ticket.reportedBy !== ctx.user.id) fail(404, 'not_found', 'Không tìm thấy ticket.');
  return ticket;
}

export default function register(r) {
  r.get('/api/v1/portal/overview', (ctx) => {
    const { db, today } = ctx;
    const list = memberships(ctx);
    const current = list.filter((m) => ['active', 'planned'].includes(m.tenancy.status));
    const repIds = repTenancyIds(ctx);
    const invoices = db.invoices.filter((i) => repIds.has(i.tenancyId) && i.status === 'issued' && !['debit_adjustment', 'credit_adjustment'].includes(i.kind)).map((i) => invoiceSummary(db, i, today));
    const open = invoices.filter((i) => i.outstandingAmount > 0).sort((a, b) => compareIso(a.dueOn, b.dueOn));
    const tenantIds = new Set(ctx.tenantRecords.map((t) => t.id));
    const pending = db.payments.filter((p) => tenantIds.has(p.tenantId) && p.status === 'pending');
    const tenancyIds = new Set(list.map((m) => m.tenancy.id));
    return {
      fullName: ctx.tenantRecords[0].fullName,
      tenancies: current.map((m) => tenancyView(ctx, m)),
      hasRepresentativeRole: repIds.size > 0,
      openInvoices: open,
      outstandingTotal: open.reduce((s, i) => s + i.outstandingAmount, 0),
      overdueTotal: open.filter((i) => i.isOverdue).reduce((s, i) => s + i.outstandingAmount, 0),
      pendingPayments: pending.map((p) => paymentSummary(db, p)),
      openTickets: db.tickets.filter((t) => (tenancyIds.has(t.tenancyId) || t.reportedBy === ctx.user.id) && !['closed'].includes(t.status)).map((t) => ticketSummary(db, t, ctx.now)),
      pendingRequests: db.tenancyRequests.filter((x) => tenancyIds.has(x.tenancyId) && x.status === 'pending').length,
      unreadNotifications: db.notifications.filter((n) => n.recipientId === ctx.user.id && !n.readAt).length,
    };
  }, { auth: 'customer' });

  r.get('/api/v1/portal/inquiries', (ctx) => {
    const tenantIds = new Set(ctx.tenantRecords.map((t) => t.id));
    return ctx.db.inquiries.filter((q) => tenantIds.has(q.tenantId)).sort((a, b) => compareIso(b.createdAt, a.createdAt)).map((q) => inquiryView(ctx, q));
  }, { auth: 'customer' });

  // Đặt lịch xem phòng: bắt buộc đăng nhập. Gửi yêu cầu chưa giữ phòng và không đổi trạng thái phòng.
  r.post('/api/v1/portal/inquiries', (ctx) => {
    const b = ctx.body;
    const v = validator();
    v.required('slug', b.slug, 'Phòng');
    v.required('preferredViewingAt', b.preferredViewingAt, 'Ngày giờ muốn xem');
    v.number('occupants', b.occupants, 'Số người ở', { min: 1, max: 10 });
    v.check();
    if (b.preferredViewingAt <= ctx.now) fail(422, 'validation_failed', 'Ngày giờ xem phòng phải ở tương lai.', { preferredViewingAt: ['Chọn thời điểm trong tương lai.'] });
    const listing = findPublishedListing(ctx.db, b.slug);
    if (!listing) fail(404, 'not_found', 'Tin đăng không còn hiển thị.');
    const room = find(ctx.db.rooms, listing.roomId);
    const property = find(ctx.db.properties, room.propertyId);
    if (availability(ctx.db, room, ctx.today).status !== 'available') conflict('room_not_available', 'Phòng này không còn trống. Hãy chọn phòng khác.');
    // Tài khoản đăng ký ở một đơn vị vẫn đặt được phòng của đơn vị khác: tạo hồ sơ ở đơn vị đó để admin thấy.
    let tenant = ctx.tenantRecords.find((t) => t.organizationId === property.organizationId);
    if (!tenant) {
      const base = ctx.tenantRecords[0];
      tenant = createTenantRecord({ ...ctx, organizationId: property.organizationId }, { fullName: base.fullName, phone: base.phone, email: base.email });
      tenant.userId = ctx.user.id;
    }
    if (ctx.db.inquiries.some((q) => q.tenantId === tenant.id && q.roomId === room.id && OPEN_INQUIRY.includes(q.status))) {
      conflict('inquiry_exists', 'Bạn đã có yêu cầu xem phòng này đang chờ xử lý.');
    }
    const code = nextCode(ctx.db, 'inquiry', (n) => `YC-${String(n).padStart(4, '0')}`);
    const inquiry = {
      id: uuid(), code, roomId: room.id, contactName: tenant.fullName, phone: tenant.phone, email: tenant.email, desiredMoveIn: null, occupants: b.occupants,
      preferredViewingAt: b.preferredViewingAt, message: [b.message, `Muốn xem phòng: ${formatDateTime(b.preferredViewingAt)}`].filter(Boolean).join('\n'),
      status: 'new', assignedTo: null, tenantId: tenant.id, closedReason: null, source: 'portal', createdAt: ctx.now,
    };
    ctx.db.inquiries.push(inquiry);
    ctx.db.inquiryEvents.push({ id: uuid(), inquiryId: inquiry.id, kind: 'created', body: 'Khách đặt lịch xem phòng từ tài khoản của mình.', fromStatus: null, toStatus: 'new', actorId: ctx.user.id, occurredAt: ctx.now });
    notify(ctx.db, {
      organizationId: property.organizationId, recipientIds: staffWith(ctx.db, property.organizationId, 'inquiries.write', property.id),
      eventKey: `inquiry:${inquiry.id}`, title: `Lịch xem phòng mới ${code}`, body: `${inquiry.contactName} muốn xem phòng ${room.code} (${property.name}).`,
      url: `/admin/viewings?inquiry=${inquiry.id}`, at: ctx.now,
    });
    return { ...inquiryView(ctx, inquiry), referenceCode: code, propertyName: property.name, overCapacity: b.occupants > room.capacity, capacity: room.capacity };
  }, { auth: 'customer' });

  r.get('/api/v1/portal/profile', (ctx) => ({
    profiles: ctx.tenantRecords.map((t) => ({
      id: t.id, code: t.code, fullName: t.fullName, email: t.email, phone: t.phone, dateOfBirth: t.dateOfBirth, address: t.address,
      emergencyContactName: t.emergencyContactName, emergencyContactPhone: t.emergencyContactPhone, organizationName: find(ctx.db.organizations, t.organizationId).name,
      identityDocuments: ctx.db.identityDocuments.filter((d) => d.tenantId === t.id).map((d) => ({ id: d.id, documentType: d.documentType, numberMasked: d.numberMasked, verified: Boolean(d.verifiedAt), expiresOn: d.expiresOn })),
      changeRequests: ctx.db.profileChangeRequests.filter((p) => p.tenantId === t.id).sort((a, b) => compareIso(b.createdAt, a.createdAt)).map((p) => ({ ...p, reviewedBy: userRef(ctx.db, p.reviewedBy) })),
    })),
  }), { auth: 'customer' });

  r.post('/api/v1/portal/profile-change-requests', (ctx) => {
    const b = ctx.body;
    const tenant = ctx.tenantRecords.find((t) => t.id === b.tenantId) || ctx.tenantRecords[0];
    const allowedFields = ['phone', 'email', 'emergencyContactName', 'emergencyContactPhone'];
    const changes = {};
    const v = validator();
    for (const [field, value] of Object.entries(b.changes || {})) {
      if (!allowedFields.includes(field)) v.add(field, 'Trường này cần liên hệ quản lý để thay đổi.');
      else if ((tenant[field] || '') !== (value || '')) changes[field] = { from: tenant[field] || null, to: value || null };
    }
    v.email('changes.email', b.changes?.email);
    v.phone('changes.phone', b.changes?.phone);
    v.phone('changes.emergencyContactPhone', b.changes?.emergencyContactPhone);
    if (!Object.keys(changes).length) v.add('changes', 'Chưa có thông tin nào thay đổi.');
    v.check();
    if (ctx.db.profileChangeRequests.some((p) => p.tenantId === tenant.id && p.status === 'pending')) conflict('pending_request_exists', 'Bạn đang có một đề nghị chờ duyệt. Hủy đề nghị đó trước khi gửi đề nghị mới.');
    const req = { id: uuid(), tenantId: tenant.id, requestedBy: ctx.user.id, changes, reason: b.reason || null, status: 'pending', reviewNotes: null, reviewedBy: null, reviewedAt: null, createdAt: ctx.now };
    ctx.db.profileChangeRequests.push(req);
    notify(ctx.db, { organizationId: tenant.organizationId, recipientIds: staffWith(ctx.db, tenant.organizationId, 'tenants.write'), eventKey: `pcr:${req.id}`, title: 'Khách đề nghị sửa hồ sơ', body: `${tenant.fullName}: ${Object.keys(changes).join(', ')}.`, url: `/admin/tenants/${tenant.id}`, at: ctx.now });
    return req;
  }, { auth: 'customer' });

  r.post('/api/v1/portal/profile-change-requests/:id/cancel', (ctx) => {
    const req = must(ctx.db.profileChangeRequests, ctx.params.id, 'đề nghị');
    if (!ctx.tenantRecords.some((t) => t.id === req.tenantId)) fail(404, 'not_found', 'Không tìm thấy đề nghị.');
    if (req.status !== 'pending') conflict('request_closed', 'Đề nghị đã được xử lý.');
    req.status = 'cancelled';
    return req;
  }, { auth: 'customer' });

  r.get('/api/v1/portal/tenancies', (ctx) => memberships(ctx).map((m) => tenancyView(ctx, m)).sort((a, b) => compareIso(b.plannedMoveIn, a.plannedMoveIn)), { auth: 'customer' });

  r.get('/api/v1/portal/tenancies/:id', (ctx) => {
    const m = memberships(ctx).find((x) => x.tenancy.id === ctx.params.id);
    if (!m) fail(404, 'not_found', 'Không tìm thấy đợt thuê.');
    const { db } = ctx;
    const view = tenancyView(ctx, m);
    const contracts = db.contracts.filter((k) => k.tenancyId === m.tenancy.id);
    return {
      ...view,
      residents: db.residents.filter((x) => x.tenancyId === m.tenancy.id).map((x) => ({ fullName: find(db.tenants, x.tenantId).fullName, joinedOn: x.joinedOn, leftOn: x.leftOn, relationship: x.relationship })),
      contracts: contracts.map((k) => ({
        id: k.id, code: k.code, status: contractStatus(db, k, ctx.today).status,
        versions: db.contractVersions.filter((x) => x.contractId === k.id && x.signedAt).sort((a, b) => a.versionNo - b.versionNo).map((x) => {
          const dto = versionDto(db, x);
          // Người ở cùng thấy thời hạn và điều khoản, không thấy bảng giá/cọc của người đại diện.
          return m.role === 'representative' ? dto : { ...dto, rates: [], requiredDeposit: null, files: [] };
        }),
      })),
      handovers: m.role === 'representative' ? db.handovers.filter((h) => h.tenancyId === m.tenancy.id).map((h) => ({
        id: h.id, kind: h.kind, occurredAt: h.occurredAt, notes: h.notes, assets: h.assets,
        readings: db.readings.filter((x) => x.handoverId === h.id && x.status === 'valid').map((x) => {
          const meter = find(db.meters, x.meterId);
          return { meterKind: meter?.meterKind, serialNumber: meter?.serialNumber, readingValue: x.readingValue, observedAt: x.observedAt };
        }),
      })) : [],
    };
  }, { auth: 'customer' });

  r.get('/api/v1/portal/invoices', (ctx) => {
    const repIds = repTenancyIds(ctx);
    const all = ctx.db.invoices.filter((i) => repIds.has(i.tenancyId) && i.status !== 'draft').map((i) => invoiceSummary(ctx.db, i, ctx.today));
    return listResponse(all, ctx.query, {
      filter: (i) => (!ctx.query.status || (ctx.query.status === 'open' ? i.status === 'issued' && i.outstandingAmount > 0 : i.status === ctx.query.status))
        && (!ctx.query.paymentStatus || (i.status === 'issued' && i.paymentStatus === ctx.query.paymentStatus))
        && (ctx.query.hasPending !== 'true' || i.pendingPaymentCount > 0),
      search: (i) => [i.code, i.room.code],
      sortable: ['serviceFrom', 'dueOn', 'totalAmount'],
      defaultSort: '-serviceFrom',
    });
  }, { auth: 'customer' });

  r.get('/api/v1/portal/invoices/:id', (ctx) => {
    const detail = invoiceDetail(ctx.db, myInvoice(ctx, ctx.params.id), ctx.today);
    delete detail.deliveries;
    delete detail.createdBy;
    return detail;
  }, { auth: 'customer' });

  r.get('/api/v1/portal/payments', (ctx) => {
    const tenantIds = new Set(ctx.tenantRecords.map((t) => t.id));
    const all = ctx.db.payments.filter((p) => tenantIds.has(p.tenantId)).map((p) => paymentSummary(ctx.db, p));
    return listResponse(all, ctx.query, { defaultSort: '-receivedAt', sortable: ['receivedAt', 'amount'], filter: (p) => !ctx.query.status || p.status === ctx.query.status });
  }, { auth: 'customer' });

  // Báo chuyển khoản: tạo khoản "chờ xác minh"; KHÔNG cộng vào đã thu cho tới khi quản lý xác nhận.
  r.post('/api/v1/portal/payments', (ctx) => {
    const b = ctx.body;
    const v = validator();
    v.money('amount', b.amount, 'Số tiền đã chuyển', { positive: true });
    v.required('receivedAt', b.receivedAt, 'Thời điểm chuyển');
    v.required('externalReference', b.externalReference, 'Mã giao dịch');
    if (!b.invoiceIds?.length) v.add('invoiceIds', 'Chọn hóa đơn bạn thanh toán.');
    v.check();
    if (b.receivedAt > ctx.now) fail(422, 'validation_failed', 'Thời điểm chuyển không được ở tương lai.', { receivedAt: ['Không được ở tương lai.'] });
    const invoices = b.invoiceIds.map((id) => myInvoice(ctx, id));
    const c = tenancyContext(ctx.db, invoices[0].tenancyId);
    const payment = createPayment(ctx.db, { ...ctx, user: ctx.user }, {
      tenantId: c.tenant.id, amount: b.amount, receivedAt: b.receivedAt, methodCode: 'bank_transfer', externalReference: b.externalReference, notes: b.notes || null,
      status: 'pending', propertyId: c.property.id, reportedBy: ctx.user.id, fileIds: b.fileIds || [], idempotencyKey: ctx.idempotencyKey,
    });
    payment.intendedInvoiceIds = invoices.map((i) => i.id);
    notify(ctx.db, { organizationId: c.organizationId, recipientIds: staffWith(ctx.db, c.organizationId, 'payments.confirm', c.property.id), eventKey: `payment.reported:${payment.id}`, title: `Khách báo chuyển khoản ${new Intl.NumberFormat('vi-VN').format(b.amount)} đ`, body: `${c.tenant.fullName} (${c.room.code}) – chờ xác minh.`, url: '/admin/invoices?hasPending=true', at: ctx.now });
    return paymentSummary(ctx.db, payment);
  }, { auth: 'customer' });

  r.get('/api/v1/portal/tickets', (ctx) => {
    const tenancyIds = new Set(memberships(ctx).map((m) => m.tenancy.id));
    const all = ctx.db.tickets.filter((t) => tenancyIds.has(t.tenancyId) || t.reportedBy === ctx.user.id).map((t) => ticketSummary(ctx.db, t, ctx.now));
    return listResponse(all, ctx.query, { defaultSort: '-createdAt', sortable: ['createdAt', 'status'], filter: (t) => !ctx.query.status || (ctx.query.status === 'open' ? !['resolved', 'closed'].includes(t.status) : t.status === ctx.query.status) });
  }, { auth: 'customer' });

  r.get('/api/v1/portal/tickets/:id', (ctx) => ticketDetail(ctx.db, myTicket(ctx, ctx.params.id), ctx.now, { includeInternal: false }), { auth: 'customer' });

  r.post('/api/v1/portal/tickets', (ctx) => {
    const b = ctx.body;
    const m = memberships(ctx).find((x) => x.tenancy.id === b.tenancyId && x.tenancy.status === 'active');
    if (!m) fail(422, 'validation_failed', 'Chọn phòng bạn đang ở.', { tenancyId: ['Không hợp lệ.'] });
    const c = tenancyContext(ctx.db, m.tenancy);
    const v = validator();
    v.oneOf('priority', b.priority || 'normal', ['urgent', 'high', 'normal', 'low'], 'Mức độ');
    v.check();
    const ticket = createTicket({ ...ctx, organizationId: c.organizationId }, { roomId: c.room.id, tenancyId: m.tenancy.id, categoryId: b.categoryId, title: b.title, description: b.description, priority: b.priority || 'normal', fileIds: b.fileIds, reporterId: ctx.user.id });
    return ticketDetail(ctx.db, ticket, ctx.now, { includeInternal: false });
  }, { auth: 'customer' });

  r.post('/api/v1/portal/tickets/:id/messages', (ctx) => {
    const ticket = myTicket(ctx, ctx.params.id);
    addTicketMessage(ctx, ticket, { body: ctx.body.body, isInternal: false, fileIds: ctx.body.fileIds });
    return ticketDetail(ctx.db, ticket, ctx.now, { includeInternal: false });
  }, { auth: 'customer' });

  r.post('/api/v1/portal/tickets/:id/confirm', (ctx) => {
    const ticket = myTicket(ctx, ctx.params.id);
    if (ticket.status !== 'resolved') conflict('ticket_not_resolved', 'Chỉ xác nhận khi ticket đã được báo giải quyết.');
    ticket.status = 'closed';
    ticket.closedAt = ctx.now;
    ctx.db.ticketEvents.push({ id: uuid(), ticketId: ticket.id, kind: 'status', fromStatus: 'resolved', toStatus: 'closed', assignedTo: null, reason: 'Khách xác nhận đã xử lý xong.', actorId: ctx.user.id, occurredAt: ctx.now });
    return ticketDetail(ctx.db, ticket, ctx.now, { includeInternal: false });
  }, { auth: 'customer' });

  r.post('/api/v1/portal/tickets/:id/reopen', (ctx) => {
    const ticket = myTicket(ctx, ctx.params.id);
    const v = validator();
    v.reason('reason', ctx.body.reason);
    v.check();
    if (!['resolved', 'closed'].includes(ticket.status)) conflict('ticket_open', 'Ticket vẫn đang được xử lý.');
    const from = ticket.status;
    Object.assign(ticket, { status: 'accepted', resolvedAt: null, closedAt: null });
    ctx.db.ticketEvents.push({ id: uuid(), ticketId: ticket.id, kind: 'reopen', fromStatus: from, toStatus: 'accepted', assignedTo: null, reason: ctx.body.reason, actorId: ctx.user.id, occurredAt: ctx.now });
    const property = find(ctx.db.properties, find(ctx.db.rooms, ticket.roomId).propertyId);
    notify(ctx.db, { organizationId: property.organizationId, recipientIds: [ticket.assignedTo, ...staffWith(ctx.db, property.organizationId, 'tickets.assign', property.id)], eventKey: `ticket.reopen:${ticket.id}:${ctx.now}`, title: `Khách mở lại ${ticket.code}`, body: ctx.body.reason, url: `/admin/tickets/${ticket.id}`, at: ctx.now });
    return ticketDetail(ctx.db, ticket, ctx.now, { includeInternal: false });
  }, { auth: 'customer' });

  r.get('/api/v1/portal/requests', (ctx) => {
    const tenancyIds = new Set(memberships(ctx).filter((m) => m.role === 'representative').map((m) => m.tenancy.id));
    return ctx.db.tenancyRequests.filter((x) => tenancyIds.has(x.tenancyId)).sort((a, b) => compareIso(b.createdAt, a.createdAt)).map((x) => ({
      ...x, targetRoom: x.targetRoomId ? roomRef(ctx.db, find(ctx.db.rooms, x.targetRoomId)) : null, room: roomRef(ctx.db, tenancyContext(ctx.db, x.tenancyId).room), reviewedBy: userRef(ctx.db, x.reviewedBy),
    }));
  }, { auth: 'customer' });

  r.post('/api/v1/portal/requests', (ctx) => {
    const b = ctx.body;
    const m = memberships(ctx).find((x) => x.tenancy.id === b.tenancyId && x.role === 'representative' && x.tenancy.status === 'active');
    if (!m) fail(403, 'forbidden', 'Chỉ người đại diện của đợt thuê đang ở mới gửi đề nghị gia hạn/chuyển/trả.');
    const v = validator();
    v.oneOf('requestType', b.requestType, ['renewal', 'transfer', 'checkout'], 'Loại đề nghị');
    v.date('desiredOn', b.desiredOn, 'Ngày mong muốn');
    if (b.requestType === 'transfer') v.required('targetRoomId', b.targetRoomId, 'Phòng muốn chuyển đến');
    v.check();
    if (b.desiredOn < ctx.today) fail(422, 'validation_failed', 'Ngày mong muốn không được ở quá khứ.', { desiredOn: ['Chọn từ hôm nay trở đi.'] });
    if (ctx.db.tenancyRequests.some((x) => x.tenancyId === m.tenancy.id && x.requestType === b.requestType && x.status === 'pending')) conflict('request_pending', 'Bạn đã có một đề nghị cùng loại đang chờ xử lý.');
    const c = tenancyContext(ctx.db, m.tenancy);
    if (b.requestType === 'transfer') {
      const target = find(ctx.db.rooms, b.targetRoomId);
      if (!target || find(ctx.db.properties, target.propertyId).organizationId !== c.organizationId || target.id === c.room.id) fail(422, 'validation_failed', 'Phòng muốn chuyển không hợp lệ.', { targetRoomId: ['Không hợp lệ.'] });
    }
    const req = { id: uuid(), tenancyId: m.tenancy.id, requestType: b.requestType, desiredOn: b.desiredOn, targetRoomId: b.requestType === 'transfer' ? b.targetRoomId : null, message: b.message || null, status: 'pending', requestedBy: ctx.user.id, reviewedBy: null, decisionNotes: null, createdAt: ctx.now, reviewedAt: null };
    ctx.db.tenancyRequests.push(req);
    notify(ctx.db, { organizationId: c.organizationId, recipientIds: staffWith(ctx.db, c.organizationId, 'contracts.write', c.property.id), eventKey: `treq:${req.id}`, title: `Đề nghị ${{ renewal: 'gia hạn', transfer: 'chuyển phòng', checkout: 'trả phòng' }[b.requestType]} từ ${c.room.code}`, body: `${c.tenant.fullName}: ${b.message || ''}`.trim(), url: '/admin/contracts?requests=pending', at: ctx.now });
    return { ...req, note: 'Đề nghị chưa thay đổi hợp đồng hay đợt thuê cho tới khi quản lý hoàn tất thủ tục.' };
  }, { auth: 'customer' });

  r.post('/api/v1/portal/requests/:id/cancel', (ctx) => {
    const req = must(ctx.db.tenancyRequests, ctx.params.id, 'đề nghị');
    if (!repTenancyIds(ctx).has(req.tenancyId)) fail(404, 'not_found', 'Không tìm thấy đề nghị.');
    if (req.status !== 'pending') conflict('request_closed', 'Đề nghị đã được xử lý.');
    req.status = 'cancelled';
    return req;
  }, { auth: 'customer' });

  r.get('/api/v1/portal/catalog', (ctx) => {
    const orgIds = new Set(ctx.tenantRecords.map((t) => t.organizationId));
    const listings = ctx.db.roomListings.filter((l) => l.status === 'published').map((l) => find(ctx.db.rooms, l.roomId)).filter((room) => orgIds.has(find(ctx.db.properties, room.propertyId).organizationId));
    return {
      ticketCategories: ctx.db.ticketCategories.filter((x) => orgIds.has(x.organizationId)),
      transferTargets: listings.map((room) => roomRef(ctx.db, room)),
      bankAccounts: ctx.db.bankAccounts.filter((x) => orgIds.has(x.organizationId)),
    };
  }, { auth: 'customer' });

  void isIsoDate;
  void rule;
}
