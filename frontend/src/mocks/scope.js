// Giới hạn dữ liệu theo đơn vị + cơ sở được phân công (mô phỏng kiểm tra ở API, không phải bảo mật thật).
import { find, tenancyContext } from './engine.js';
import { notFound } from './respond.js';

export const orgProperties = (ctx) => ctx.db.properties.filter((p) => p.organizationId === ctx.organizationId && ctx.canSeeProperty(p.id));
export const orgPropertyIds = (ctx) => new Set(orgProperties(ctx).map((p) => p.id));

export function propertyInScope(ctx, propertyId) {
  const p = find(ctx.db.properties, propertyId);
  if (!p || p.organizationId !== ctx.organizationId || !ctx.canSeeProperty(p.id)) notFound('cơ sở');
  return p;
}

export function roomInScope(ctx, roomId) {
  const room = find(ctx.db.rooms, roomId);
  if (!room) notFound('phòng');
  propertyInScope(ctx, room.propertyId);
  return room;
}

export function tenancyInScope(ctx, tenancyId) {
  const tenancy = find(ctx.db.tenancies, tenancyId);
  if (!tenancy) notFound('đợt thuê');
  const c = tenancyContext(ctx.db, tenancy);
  if (c.organizationId !== ctx.organizationId || !ctx.canSeeProperty(c.property.id)) notFound('đợt thuê');
  return c;
}

/** Khách nhìn thấy nếu cùng đơn vị và có liên hệ với cơ sở trong phạm vi (hoặc chưa gắn cơ sở nào). */
export function tenantVisible(ctx, tenant) {
  if (!tenant || tenant.organizationId !== ctx.organizationId) return false;
  if (ctx.propertyIds == null) return true;
  const { db } = ctx;
  const roomIds = new Set();
  db.tenancies.filter((t) => t.representativeTenantId === tenant.id).forEach((t) => roomIds.add(find(db.roomAllocations, t.allocationId).roomId));
  db.residents.filter((r) => r.tenantId === tenant.id).forEach((r) => {
    const t = find(db.tenancies, r.tenancyId);
    roomIds.add(find(db.roomAllocations, t.allocationId).roomId);
  });
  db.reservations.filter((r) => r.tenantId === tenant.id).forEach((r) => roomIds.add(find(db.roomAllocations, r.allocationId).roomId));
  db.inquiries.filter((q) => q.tenantId === tenant.id).forEach((q) => roomIds.add(q.roomId));
  if (!roomIds.size) return true;
  return [...roomIds].some((roomId) => ctx.canSeeProperty(find(db.rooms, roomId).propertyId));
}

export function tenantInScope(ctx, tenantId) {
  const tenant = find(ctx.db.tenants, tenantId);
  if (!tenantVisible(ctx, tenant)) notFound('khách');
  return tenant;
}

export function invoiceInScope(ctx, invoiceId) {
  const invoice = find(ctx.db.invoices, invoiceId);
  if (!invoice) notFound('hóa đơn');
  tenancyInScope(ctx, invoice.tenancyId);
  return invoice;
}

export function paymentVisible(ctx, payment) {
  const tenant = find(ctx.db.tenants, payment.tenantId);
  if (!tenant || tenant.organizationId !== ctx.organizationId) return false;
  if (payment.collectedAtPropertyId && !ctx.canSeeProperty(payment.collectedAtPropertyId)) return false;
  return tenantVisible(ctx, tenant);
}

export function paymentInScope(ctx, paymentId) {
  const payment = find(ctx.db.payments, paymentId);
  if (!payment || !paymentVisible(ctx, payment)) notFound('khoản thu');
  return payment;
}

export function contractInScope(ctx, contractId) {
  const contract = find(ctx.db.contracts, contractId);
  if (!contract) notFound('hợp đồng');
  tenancyInScope(ctx, contract.tenancyId);
  return contract;
}

export function ticketInScope(ctx, ticketId) {
  const ticket = find(ctx.db.tickets, ticketId);
  if (!ticket) notFound('ticket');
  roomInScope(ctx, ticket.roomId);
  return ticket;
}

export function periodInScope(ctx, periodId) {
  const period = find(ctx.db.billingPeriods, periodId);
  if (!period) notFound('kỳ tính tiền');
  propertyInScope(ctx, period.propertyId);
  return period;
}

/** Lọc theo query.propertyId (nếu có) và phạm vi được phân công. */
export function propertyFilter(ctx) {
  const allowed = orgPropertyIds(ctx);
  const wanted = ctx.query.propertyId;
  if (wanted) {
    if (!allowed.has(wanted)) notFound('cơ sở');
    return new Set([wanted]);
  }
  return allowed;
}

export const roomPropertyId = (db, roomId) => find(db.rooms, roomId)?.propertyId;
