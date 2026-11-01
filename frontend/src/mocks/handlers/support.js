// Ticket sự cố (SLA, hội thoại, ghi chú nội bộ, phân công, mở lại có lý do) và trung tâm thông báo.
import { uuid } from '../../utils/ids.js';
import { compareIso } from '../../utils/date.js';
import { asBool, conflict, fail, listResponse, validator } from '../respond.js';
import { activeTenancyOfRoom, audit, find, isTicketOverdue, must, nextCode, notify, slaDueAt, staffWith } from '../engine.js';
import { ticketDetail, ticketSummary } from '../dto.js';
import { propertyFilter, roomInScope, ticketInScope } from '../scope.js';

const OPEN = ['new', 'accepted', 'in_progress', 'waiting'];
const TRANSITIONS = {
  accept: { from: ['new'], to: 'accepted' },
  start: { from: ['accepted', 'new'], to: 'in_progress' },
  wait: { from: ['in_progress', 'accepted'], to: 'waiting', reason: true },
  resume: { from: ['waiting'], to: 'in_progress' },
  resolve: { from: ['accepted', 'in_progress', 'waiting'], to: 'resolved', perm: 'tickets.close' },
  close: { from: ['resolved'], to: 'closed', perm: 'tickets.close' },
  reopen: { from: ['resolved', 'closed'], to: 'accepted', reason: true, perm: 'tickets.close' },
};

export function createTicket(ctx, { roomId, tenancyId, categoryId, title, description, priority, fileIds, reporterId }) {
  const { db } = ctx;
  const room = find(db.rooms, roomId);
  const property = find(db.properties, room.propertyId);
  const v = validator();
  v.required('title', title, 'Tiêu đề');
  v.required('description', description, 'Mô tả');
  v.oneOf('priority', priority, ['urgent', 'high', 'normal', 'low'], 'Mức ưu tiên');
  v.required('categoryId', categoryId, 'Loại sự cố');
  v.check();
  const category = find(db.ticketCategories, categoryId);
  if (!category || category.organizationId !== property.organizationId) fail(422, 'validation_failed', 'Loại sự cố không hợp lệ.', { categoryId: ['Không hợp lệ.'] });
  const { policy, dueAt } = slaDueAt(db, property.organizationId, priority, ctx.now);
  const ticket = {
    id: uuid(), code: nextCode(db, 'ticket', (n) => `SC-${String(n).padStart(4, '0')}`), roomId: room.id, tenancyId: tenancyId || activeTenancyOfRoom(db, room.id)?.id || null,
    categoryId, title: title.trim(), description, priority, status: 'new', reportedBy: reporterId || ctx.user.id, assignedTo: null, slaPolicyId: policy?.id || null, dueAt,
    resolvedAt: null, closedAt: null, resolutionNotes: null, createdAt: ctx.now, fileIds: fileIds || [],
  };
  db.tickets.push(ticket);
  db.ticketEvents.push({ id: uuid(), ticketId: ticket.id, kind: 'created', fromStatus: null, toStatus: 'new', assignedTo: null, reason: null, actorId: ticket.reportedBy, occurredAt: ctx.now });
  notify(db, {
    organizationId: property.organizationId, recipientIds: staffWith(db, property.organizationId, 'tickets.assign', property.id).filter((id) => id !== ticket.reportedBy),
    eventKey: `ticket.created:${ticket.id}`, title: `Ticket mới ${ticket.code} (${priority === 'urgent' ? 'khẩn cấp' : priority === 'high' ? 'cao' : priority === 'normal' ? 'bình thường' : 'thấp'})`,
    body: `${room.code}: ${ticket.title}`, url: `/admin/tickets/${ticket.id}`, at: ctx.now,
  });
  return ticket;
}

export function addTicketMessage(ctx, ticket, { body, isInternal, fileIds }) {
  const v = validator();
  v.required('body', body, 'Nội dung');
  v.check();
  if (ticket.status === 'closed' && !isInternal) conflict('ticket_closed', 'Ticket đã đóng. Mở lại ticket nếu sự cố phát sinh lại.');
  const message = { id: uuid(), ticketId: ticket.id, authorId: ctx.user.id, body: body.trim(), isInternal: Boolean(isInternal), createdAt: ctx.now, fileIds: fileIds || [] };
  ctx.db.ticketMessages.push(message);
  const reporter = ticket.reportedBy;
  const recipients = isInternal ? [ticket.assignedTo] : [ticket.assignedTo, reporter];
  notify(ctx.db, { organizationId: find(ctx.db.properties, find(ctx.db.rooms, ticket.roomId).propertyId).organizationId, recipientIds: recipients.filter((id) => id && id !== ctx.user.id), eventKey: `ticket.message:${message.id}`, title: `Trao đổi mới trên ${ticket.code}`, body: message.body.slice(0, 120), url: reporter && ctx.db.tenants.some((t) => t.userId === reporter) && !isInternal ? `/tickets/${ticket.id}` : `/admin/tickets/${ticket.id}`, at: ctx.now });
  return message;
}

export default function register(r) {
  r.get('/api/v1/tickets', (ctx) => {
    const q = ctx.query;
    const allowed = propertyFilter(ctx);
    const all = ctx.db.tickets.filter((t) => allowed.has(find(ctx.db.rooms, t.roomId).propertyId)).map((t) => ticketSummary(ctx.db, t, ctx.now));
    return listResponse(all, q, {
      filter: (t) => (!q.status || (q.status === 'open' ? OPEN.includes(t.status) : t.status === q.status))
        && (!q.priority || t.priority === q.priority)
        && (!q.categoryId || t.category?.id === q.categoryId)
        && (!q.roomId || t.room.id === q.roomId)
        && (!q.overdue || t.isOverdue === asBool(q.overdue))
        && (!q.assignedTo || (q.assignedTo === 'me' ? t.assignedTo?.id === ctx.user.id : q.assignedTo === 'none' ? !t.assignedTo : t.assignedTo?.id === q.assignedTo)),
      search: (t) => [t.code, t.title, t.room.code],
      sortable: ['code', 'createdAt', 'dueAt', 'priority', 'status'],
      defaultSort: '-createdAt',
    });
  }, { perm: 'tickets.read' });

  r.post('/api/v1/tickets', (ctx) => {
    const room = roomInScope(ctx, ctx.body.roomId);
    const ticket = createTicket(ctx, { ...ctx.body, roomId: room.id });
    audit(ctx.db, ctx, { action: 'INSERT', tableName: 'tickets', recordId: ticket.id, after: { code: ticket.code, priority: ticket.priority } });
    return ticketDetail(ctx.db, ticket, ctx.now, { includeInternal: true });
  }, { perm: 'tickets.write' });

  r.get('/api/v1/tickets/:id', (ctx) => ticketDetail(ctx.db, ticketInScope(ctx, ctx.params.id), ctx.now, { includeInternal: true }), { perm: 'tickets.read' });

  r.post('/api/v1/tickets/:id/messages', (ctx) => {
    const ticket = ticketInScope(ctx, ctx.params.id);
    addTicketMessage(ctx, ticket, ctx.body);
    return ticketDetail(ctx.db, ticket, ctx.now, { includeInternal: true });
  }, { perm: 'tickets.write' });

  r.post('/api/v1/tickets/:id/assign', (ctx) => {
    const ticket = ticketInScope(ctx, ctx.params.id);
    const member = ctx.db.memberships.find((m) => m.userId === ctx.body.userId && m.organizationId === ctx.organizationId && m.status === 'active');
    if (!member) fail(422, 'validation_failed', 'Người xử lý không thuộc đơn vị.', { userId: ['Không hợp lệ.'] });
    if (['resolved', 'closed'].includes(ticket.status)) conflict('ticket_closed', 'Ticket đã giải quyết/đóng; mở lại trước khi phân công.');
    const from = ticket.status;
    ticket.assignedTo = ctx.body.userId;
    if (ticket.status === 'new') ticket.status = 'accepted';
    if (ctx.body.dueAt) ticket.dueAt = ctx.body.dueAt;
    ctx.db.ticketEvents.push({ id: uuid(), ticketId: ticket.id, kind: 'assign', fromStatus: from, toStatus: ticket.status, assignedTo: ctx.body.userId, reason: ctx.body.note || null, actorId: ctx.user.id, occurredAt: ctx.now });
    notify(ctx.db, { organizationId: ctx.organizationId, recipientIds: [ctx.body.userId].filter((id) => id !== ctx.user.id), eventKey: `ticket.assigned:${ticket.id}:${ctx.now}`, title: `Bạn được giao ${ticket.code}`, body: ticket.title, url: `/admin/tickets/${ticket.id}`, at: ctx.now });
    return ticketDetail(ctx.db, ticket, ctx.now, { includeInternal: true });
  }, { perm: 'tickets.assign' });

  r.post('/api/v1/tickets/:id/transitions', (ctx) => {
    const ticket = ticketInScope(ctx, ctx.params.id);
    const { db } = ctx;
    const b = ctx.body;
    const t = TRANSITIONS[b.action];
    if (!t) fail(422, 'validation_failed', 'Hành động không hợp lệ.', { action: ['Không hỗ trợ.'] });
    if (t.perm) ctx.require(t.perm);
    if (!t.from.includes(ticket.status)) conflict('invalid_transition', 'Trạng thái ticket đã thay đổi; tải lại để xem trạng thái mới nhất.');
    const v = validator();
    if (t.reason) v.reason('reason', b.reason);
    if (b.action === 'resolve') v.required('resolutionNotes', b.resolutionNotes, 'Kết quả xử lý');
    if (b.cost) v.money('cost', b.cost, 'Chi phí thực tế', { positive: true });
    v.check();
    const from = ticket.status;
    ticket.status = t.to;
    if (b.action === 'accept' && !ticket.assignedTo) ticket.assignedTo = ctx.user.id;
    if (b.action === 'resolve') {
      ticket.resolvedAt = ctx.now;
      ticket.resolutionNotes = b.resolutionNotes;
      if (b.cost) {
        ctx.require('expenses.write');
        const room = find(db.rooms, ticket.roomId);
        const category = db.expenseCategories.find((c) => c.organizationId === ctx.organizationId && c.code === 'REPAIR');
        // Chi phí sửa thực chi là sự kiện riêng, KHÔNG tự cộng vào hóa đơn của khách.
        db.expenses.push({ id: uuid(), propertyId: room.propertyId, roomId: room.id, ticketId: ticket.id, categoryId: category.id, amount: b.cost, incurredOn: ctx.today, paidAt: ctx.now, description: `Chi phí xử lý ${ticket.code}: ${ticket.title}`, evidenceFileId: null, recordedBy: ctx.user.id, reversalOfId: null, reason: null, createdAt: ctx.now });
      }
    }
    if (b.action === 'close') ticket.closedAt = ctx.now;
    if (b.action === 'reopen') {
      ticket.resolvedAt = null;
      ticket.closedAt = null;
      const { dueAt } = slaDueAt(db, ctx.organizationId, ticket.priority, ctx.now);
      ticket.dueAt = dueAt;
    }
    db.ticketEvents.push({ id: uuid(), ticketId: ticket.id, kind: b.action === 'reopen' ? 'reopen' : 'status', fromStatus: from, toStatus: ticket.status, assignedTo: null, reason: b.reason || b.resolutionNotes || null, actorId: ctx.user.id, occurredAt: ctx.now });
    notify(db, { organizationId: ctx.organizationId, recipientIds: [ticket.reportedBy, ticket.assignedTo].filter((id) => id && id !== ctx.user.id), eventKey: `ticket.status:${ticket.id}:${ctx.now}`, title: `${ticket.code}: ${{ accepted: 'đã tiếp nhận', in_progress: 'đang xử lý', waiting: 'chờ bổ sung', resolved: 'đã giải quyết', closed: 'đã đóng' }[ticket.status]}`, body: ticket.title, url: db.tenants.some((x) => x.userId === ticket.reportedBy) ? `/tickets/${ticket.id}` : `/admin/tickets/${ticket.id}`, at: ctx.now });
    audit(db, ctx, { action: `ticket.${b.action}`, tableName: 'tickets', recordId: ticket.id, before: { status: from }, after: { status: ticket.status }, reason: b.reason });
    return ticketDetail(db, ticket, ctx.now, { includeInternal: true });
  }, { perm: 'tickets.write' });

  // ---------------------------------------------------------------- thông báo (mọi người dùng đã đăng nhập)
  r.get('/api/v1/notifications', (ctx) => {
    const all = ctx.db.notifications.filter((n) => n.recipientId === ctx.user.id).sort((a, b) => compareIso(b.createdAt, a.createdAt));
    const result = listResponse(all, ctx.query, { filter: (n) => !asBool(ctx.query.unread) || !n.readAt, search: (n) => [n.title, n.body] });
    return { ...result, unreadCount: all.filter((n) => !n.readAt).length };
  }, { auth: 'user' });

  r.get('/api/v1/notifications/unread-count', (ctx) => ({ unreadCount: ctx.db.notifications.filter((n) => n.recipientId === ctx.user.id && !n.readAt).length }), { auth: 'user' });

  r.post('/api/v1/notifications/:id/read', (ctx) => {
    const n = must(ctx.db.notifications, ctx.params.id, 'thông báo');
    if (n.recipientId !== ctx.user.id) fail(404, 'not_found', 'Không tìm thấy thông báo.');
    n.readAt ||= ctx.now;
    return n;
  }, { auth: 'user' });

  r.post('/api/v1/notifications/read-all', (ctx) => {
    ctx.db.notifications.filter((n) => n.recipientId === ctx.user.id && !n.readAt).forEach((n) => { n.readAt = ctx.now; });
    return { unreadCount: 0 };
  }, { auth: 'user' });

  void isTicketOverdue;
}
