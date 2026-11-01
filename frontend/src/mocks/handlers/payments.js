// Thu tiền, phân bổ, đảo/hoàn, sổ cọc và công nợ. Báo chuyển khoản là "chờ xác minh", chưa cộng đã thu.
import { compareIso, diffDays, instantToIsoDate } from '../../utils/date.js';
import { asBool, conflict, fail, listResponse, rule, validator } from '../respond.js';
import {
  applyAllocation, audit, createPayment, depositBySource, depositHeld, depositOffset, depositReceipt, depositRefund, depositSigned,
  depositTransfer, find, invoiceBalance, must, notify, paymentBalance, reverseAllocation, reversePayment, staffWith, tenancyContext,
  tenantDebt,
} from '../engine.js';
import { depositEntryDto, invoiceSummary, paymentSummary, roomRef, tenancyBrief, tenantRef, tenantSummary, userRef } from '../dto.js';
import { paymentInScope, paymentVisible, propertyFilter, tenancyInScope, tenantInScope, tenantVisible } from '../scope.js';

const fmt = (n) => new Intl.NumberFormat('vi-VN').format(n);

function openInvoicesOf(ctx, tenantId) {
  const { db } = ctx;
  const tenancyIds = new Set(db.tenancies.filter((t) => t.representativeTenantId === tenantId).map((t) => t.id));
  return db.invoices.filter((i) => tenancyIds.has(i.tenancyId) && i.status === 'issued' && !['debit_adjustment', 'credit_adjustment'].includes(i.kind))
    .map((i) => invoiceSummary(db, i, ctx.today)).filter((i) => i.outstandingAmount > 0).sort((a, b) => compareIso(a.dueOn, b.dueOn));
}

function paymentDetail(ctx, p) {
  const { db } = ctx;
  const entries = db.depositEntries.filter((e) => e.paymentId === p.id);
  const entryIds = new Set(entries.map((e) => e.id));
  return {
    ...paymentSummary(db, p),
    allocations: db.paymentAllocations.filter((a) => a.paymentId === p.id || entryIds.has(a.depositEntryId)).sort((a, b) => compareIso(a.allocatedAt, b.allocatedAt)).map((a) => ({
      id: a.id, kind: a.kind, amount: a.amount, source: a.paymentId ? 'payment' : 'deposit_offset', reversesId: a.reversesId,
      reversedAmount: db.paymentAllocations.filter((x) => x.reversesId === a.id).reduce((s, x) => s + x.amount, 0),
      invoice: invoiceSummary(db, find(db.invoices, a.invoiceId), ctx.today), allocatedAt: a.allocatedAt, allocatedBy: userRef(db, a.allocatedBy), reason: a.reason,
    })),
    reversals: db.paymentReversals.filter((x) => x.paymentId === p.id).map((x) => ({ ...x, confirmedBy: userRef(db, x.confirmedBy) })),
    depositEntries: entries.map((e) => ({ ...depositEntryDto(db, e), tenancy: tenancyBrief(db, find(db.tenancies, e.tenancyId), ctx.today) })),
    intendedInvoices: (p.intendedInvoiceIds || []).map((id) => invoiceSummary(db, find(db.invoices, id), ctx.today)),
    openInvoices: openInvoicesOf(ctx, p.tenantId),
    tenancies: db.tenancies.filter((t) => t.representativeTenantId === p.tenantId && ['active', 'planned'].includes(t.status)).map((t) => tenancyBrief(db, t, ctx.today)),
  };
}

function applyUses(ctx, payment, { allocations = [], deposit }) {
  if (allocations.length) ctx.require('payments.allocate');
  for (const [index, a] of allocations.entries()) {
    if (!(a.amount > 0)) continue;
    const v = validator();
    v.money(`allocations.${index}.amount`, a.amount, 'Số tiền phân bổ', { positive: true });
    v.check();
    tenancyInScope(ctx, must(ctx.db.invoices, a.invoiceId, 'hóa đơn').tenancyId);
    applyAllocation(ctx.db, ctx, { paymentId: payment.id, invoiceId: a.invoiceId, amount: a.amount });
  }
  if (deposit?.amount > 0) {
    ctx.require('deposits.receive');
    tenancyInScope(ctx, deposit.tenancyId);
    depositReceipt(ctx.db, ctx, { tenancyId: deposit.tenancyId, paymentId: payment.id, amount: deposit.amount, reason: deposit.reason || 'Thu cọc' });
  }
}

function notifyConfirmed(ctx, payment) {
  const tenant = find(ctx.db.tenants, payment.tenantId);
  if (tenant.userId) {
    const pb = paymentBalance(ctx.db, payment);
    notify(ctx.db, {
      organizationId: ctx.organizationId, recipientIds: [tenant.userId], eventKey: `payment.confirmed:${payment.id}`, title: `Đã xác nhận khoản thu ${fmt(payment.amount)} đ`,
      body: `Phân bổ hóa đơn ${fmt(pb.invoiceAllocatedAmount)} đ, cọc ${fmt(pb.depositHeldAmount)} đ, chưa phân bổ ${fmt(pb.unappliedAmount)} đ.`, url: '/invoices', at: ctx.now,
    });
  }
}

function depositSummary(ctx, tenancy) {
  const { db } = ctx;
  const entries = db.depositEntries.filter((e) => e.tenancyId === tenancy.id);
  const sum = (kind) => entries.filter((e) => e.kind === kind).reduce((s, e) => s + e.amount, 0);
  const brief = tenancyBrief(db, tenancy, ctx.today);
  return {
    tenancy: brief, requiredDeposit: brief.requiredDeposit, heldAmount: depositHeld(db, tenancy.id),
    receivedAmount: sum('receipt'), transferInAmount: sum('transfer_in'), transferOutAmount: sum('transfer_out'),
    refundedAmount: sum('refund'), offsetAmount: sum('offset'), reversalAmount: entries.filter((e) => e.kind === 'reversal').reduce((s, e) => s + depositSigned(db, e), 0),
    shortfall: brief.requiredDeposit != null ? Math.max(0, brief.requiredDeposit - depositHeld(db, tenancy.id)) : null,
    lastMovementAt: entries.map((e) => e.occurredAt).sort().pop() || null,
  };
}

function depositLedger(ctx, tenancy) {
  const { db } = ctx;
  return {
    ...depositSummary(ctx, tenancy),
    entries: db.depositEntries.filter((e) => e.tenancyId === tenancy.id).sort((a, b) => compareIso(a.occurredAt, b.occurredAt)).map((e) => depositEntryDto(db, e)),
    sources: [...depositBySource(db, tenancy.id).entries()].map(([paymentId, amount]) => ({ payment: paymentSummary(db, find(db.payments, paymentId)), heldAmount: amount })),
    openInvoices: openInvoicesOf(ctx, tenancy.representativeTenantId),
    otherTenancies: db.tenancies.filter((t) => t.id !== tenancy.id && t.representativeTenantId === tenancy.representativeTenantId && ['active', 'planned'].includes(t.status)).map((t) => tenancyBrief(db, t, ctx.today)),
  };
}

export default function register(r) {
  r.get('/api/v1/payments', (ctx) => {
    const q = ctx.query;
    const allowed = q.propertyId ? propertyFilter(ctx) : null;
    const all = ctx.db.payments.filter((p) => paymentVisible(ctx, p)).map((p) => paymentSummary(ctx.db, p));
    return listResponse(all, q, {
      filter: (p) => (!q.status || p.status === q.status)
        && (!q.methodCode || p.methodCode === q.methodCode)
        && (!q.tenantId || p.tenant.id === q.tenantId)
        && (!allowed || (p.room && allowed.has(find(ctx.db.rooms, p.room.id).propertyId)))
        && (!q.from || instantToIsoDate(p.receivedAt) >= q.from) && (!q.to || instantToIsoDate(p.receivedAt) <= q.to)
        && (!q.unapplied || (p.unappliedAmount > 0) === asBool(q.unapplied))
        && (!q.reportedByTenant || p.isTenantReported === asBool(q.reportedByTenant)),
      search: (p) => [p.code, p.tenant.fullName, p.tenant.code, p.externalReference, p.room?.code],
      sortable: ['code', 'receivedAt', 'amount', 'status', 'tenant.fullName', 'unappliedAmount'],
      defaultSort: '-receivedAt',
    });
  }, { perm: 'payments.read' });

  r.get('/api/v1/payments/:id', (ctx) => paymentDetail(ctx, paymentInScope(ctx, ctx.params.id)), { perm: 'payments.read' });

  r.post('/api/v1/payments', (ctx) => {
    const b = ctx.body;
    const tenant = tenantInScope(ctx, b.tenantId);
    const v = validator();
    v.money('amount', b.amount, 'Số tiền thực nhận', { positive: true });
    v.required('receivedAt', b.receivedAt, 'Thời điểm nhận');
    v.required('methodCode', b.methodCode, 'Phương thức');
    if (b.methodCode === 'bank_transfer') v.required('externalReference', b.externalReference, 'Mã giao dịch ngân hàng');
    v.check();
    if (b.receivedAt > ctx.now) fail(422, 'validation_failed', 'Thời điểm nhận không được ở tương lai.', { receivedAt: ['Không được ở tương lai.'] });
    const allocated = (b.allocations || []).reduce((s, a) => s + (a.amount || 0), 0) + (b.deposit?.amount || 0);
    if (allocated > b.amount) fail(422, 'validation_failed', `Tổng phân bổ (${fmt(allocated)} đ) vượt số tiền nhận (${fmt(b.amount)} đ).`, { amount: ['Nhỏ hơn tổng phân bổ.'] });
    const confirmNow = Boolean(b.confirmNow);
    if (confirmNow) ctx.require('payments.confirm');
    const payment = createPayment(ctx.db, ctx, {
      tenantId: tenant.id, amount: b.amount, receivedAt: b.receivedAt, methodCode: b.methodCode, externalReference: b.externalReference, notes: b.notes,
      status: confirmNow ? 'confirmed' : 'pending', propertyId: b.propertyId || null, fileIds: b.fileIds || [], idempotencyKey: ctx.idempotencyKey,
    });
    payment.intendedInvoiceIds = (b.allocations || []).map((a) => a.invoiceId);
    if (confirmNow) {
      applyUses(ctx, payment, b);
      notifyConfirmed(ctx, payment);
    } else {
      payment.plannedUses = { allocations: b.allocations || [], deposit: b.deposit || null };
      notify(ctx.db, { organizationId: ctx.organizationId, recipientIds: staffWith(ctx.db, ctx.organizationId, 'payments.confirm').filter((id) => id !== ctx.user.id), eventKey: `payment.reported:${payment.id}`, title: `Khoản thu chờ xác minh ${fmt(payment.amount)} đ`, body: `${tenant.fullName} – ${payment.code}.`, url: '/admin/invoices?hasPending=true', at: ctx.now });
    }
    audit(ctx.db, ctx, { action: confirmNow ? 'payment.record_confirmed' : 'payment.report', tableName: 'payments', recordId: payment.id, after: { code: payment.code, amount: payment.amount, status: payment.status } });
    return paymentDetail(ctx, payment);
  }, { perm: 'payments.report' });

  r.post('/api/v1/payments/:id/confirm', (ctx) => {
    const payment = paymentInScope(ctx, ctx.params.id);
    if (payment.status === 'confirmed') conflict('payment_already_confirmed', `Khoản thu ${payment.code} đã được xác nhận trước đó; không ghi nhận lần hai.`);
    if (payment.status === 'rejected') conflict('payment_rejected', 'Khoản thu đã bị từ chối. Tạo khoản thu mới nếu khách gửi lại chứng từ.');
    const b = ctx.body;
    const used = (b.allocations || []).reduce((s, a) => s + (a.amount || 0), 0) + (b.deposit?.amount || 0);
    if (used > payment.amount) fail(422, 'validation_failed', `Tổng phân bổ vượt số tiền ${fmt(payment.amount)} đ.`);
    if (b.externalReference !== undefined) payment.externalReference = b.externalReference || payment.externalReference;
    Object.assign(payment, { status: 'confirmed', confirmedBy: ctx.user.id, confirmedAt: ctx.now });
    applyUses(ctx, payment, b);
    notifyConfirmed(ctx, payment);
    audit(ctx.db, ctx, { action: 'payment.confirm', tableName: 'payments', recordId: payment.id, before: { status: 'pending' }, after: { status: 'confirmed', allocated: used } });
    return paymentDetail(ctx, payment);
  }, { perm: 'payments.confirm' });

  r.post('/api/v1/payments/:id/reject', (ctx) => {
    const payment = paymentInScope(ctx, ctx.params.id);
    const v = validator();
    v.reason('reason', ctx.body.reason, 'Lý do từ chối');
    v.check();
    if (payment.status !== 'pending') conflict('payment_not_pending', 'Chỉ từ chối khoản thu đang chờ xác minh.');
    Object.assign(payment, { status: 'rejected', rejectionReason: ctx.body.reason });
    const tenant = find(ctx.db.tenants, payment.tenantId);
    if (tenant.userId) notify(ctx.db, { organizationId: ctx.organizationId, recipientIds: [tenant.userId], eventKey: `payment.rejected:${payment.id}`, title: 'Báo thanh toán chưa được xác nhận', body: ctx.body.reason, url: '/invoices', at: ctx.now });
    audit(ctx.db, ctx, { action: 'payment.reject', tableName: 'payments', recordId: payment.id, after: { status: 'rejected' }, reason: ctx.body.reason });
    return paymentDetail(ctx, payment);
  }, { perm: 'payments.confirm' });

  r.post('/api/v1/payments/:id/allocations', (ctx) => {
    const payment = paymentInScope(ctx, ctx.params.id);
    if (payment.status !== 'confirmed') rule('payment_not_confirmed', 'Chỉ phân bổ khoản thu đã xác nhận.');
    if (!ctx.body.allocations?.length) fail(422, 'validation_failed', 'Chọn hóa đơn để phân bổ.', { allocations: ['Chưa chọn hóa đơn.'] });
    applyUses(ctx, payment, { allocations: ctx.body.allocations });
    audit(ctx.db, ctx, { action: 'payment.allocate', tableName: 'payment_allocations', recordId: payment.id, after: { allocations: ctx.body.allocations } });
    return paymentDetail(ctx, payment);
  }, { perm: 'payments.allocate' });

  r.post('/api/v1/payment-allocations/:id/reverse', (ctx) => {
    const allocation = must(ctx.db.paymentAllocations, ctx.params.id, 'phân bổ');
    tenancyInScope(ctx, find(ctx.db.invoices, allocation.invoiceId).tenancyId);
    const v = validator();
    v.money('amount', ctx.body.amount, 'Số tiền đảo', { positive: true });
    v.reason('reason', ctx.body.reason, 'Lý do đảo');
    v.check();
    if (allocation.depositEntryId) ctx.require('deposits.offset');
    const reversal = reverseAllocation(ctx.db, ctx, allocation.id, { amount: ctx.body.amount, reason: ctx.body.reason });
    // Ghi nhận nhầm: đảo luôn số tiền trên khoản thu trong cùng giao dịch để không còn tiền "chưa phân bổ" ảo.
    if (ctx.body.reversePayment && allocation.paymentId) {
      ctx.require('payments.reverse');
      reversePayment(ctx.db, ctx, allocation.paymentId, { kind: 'correction', amount: ctx.body.amount, reason: ctx.body.reason });
    }
    audit(ctx.db, ctx, { action: 'payment_allocation.reverse', tableName: 'payment_allocations', recordId: reversal.id, after: { amount: ctx.body.amount, reverses: allocation.id }, reason: ctx.body.reason });
    const paymentId = allocation.paymentId || find(ctx.db.depositEntries, allocation.depositEntryId).paymentId;
    return paymentDetail(ctx, find(ctx.db.payments, paymentId));
  }, { perm: 'payments.allocate' });

  r.post('/api/v1/payments/:id/reversals', (ctx) => {
    const payment = paymentInScope(ctx, ctx.params.id);
    const b = ctx.body;
    const v = validator();
    v.oneOf('kind', b.kind, ['correction', 'refund'], 'Loại giao dịch');
    v.money('amount', b.amount, 'Số tiền', { positive: true });
    v.reason('reason', b.reason);
    if (b.kind === 'refund') v.required('methodCode', b.methodCode, 'Phương thức hoàn');
    v.check();
    const reversal = reversePayment(ctx.db, ctx, payment.id, b);
    audit(ctx.db, ctx, { action: `payment.${b.kind}`, tableName: 'payment_reversals', recordId: reversal.id, after: { payment: payment.code, amount: b.amount }, reason: b.reason });
    return paymentDetail(ctx, payment);
  }, { perm: 'payments.reverse' });

  // ---------------------------------------------------------------- cọc
  r.get('/api/v1/deposits', (ctx) => {
    const q = ctx.query;
    const allowed = propertyFilter(ctx);
    const all = ctx.db.tenancies.filter((t) => allowed.has(tenancyContext(ctx.db, t).property.id))
      .filter((t) => ctx.db.depositEntries.some((e) => e.tenancyId === t.id) || ['active', 'planned'].includes(t.status))
      .map((t) => depositSummary(ctx, t));
    return listResponse(all, q, {
      filter: (d) => (!q.status || (q.status === 'current' ? ['active', 'planned'].includes(d.tenancy.status) : d.tenancy.status === 'ended'))
        && (!q.short || d.shortfall > 0)
        && (!q.held || d.heldAmount > 0),
      search: (d) => [d.tenancy.room.code, d.tenancy.representative.fullName],
      sortable: ['tenancy.room.code', 'heldAmount', 'requiredDeposit', 'shortfall', 'lastMovementAt'],
      defaultSort: 'tenancy.room.code',
    });
  }, { perm: 'deposits.read' });

  r.get('/api/v1/tenancies/:id/deposit', (ctx) => depositLedger(ctx, tenancyInScope(ctx, ctx.params.id).tenancy), { perm: 'deposits.read' });

  r.post('/api/v1/tenancies/:id/deposit/receipts', (ctx) => {
    const c = tenancyInScope(ctx, ctx.params.id);
    const b = ctx.body;
    const v = validator();
    v.money('amount', b.amount, 'Tiền cọc', { positive: true });
    if (!b.paymentId) {
      v.required('payment.receivedAt', b.payment?.receivedAt, 'Thời điểm nhận');
      v.required('payment.methodCode', b.payment?.methodCode, 'Phương thức');
      if (b.payment?.methodCode === 'bank_transfer') v.required('payment.externalReference', b.payment?.externalReference, 'Mã giao dịch');
    }
    v.check();
    let payment;
    if (b.paymentId) {
      payment = paymentInScope(ctx, b.paymentId);
    } else {
      ctx.require('payments.confirm');
      payment = createPayment(ctx.db, ctx, { tenantId: c.tenant.id, amount: b.amount, receivedAt: b.payment.receivedAt, methodCode: b.payment.methodCode, externalReference: b.payment.externalReference, status: 'confirmed', propertyId: c.property.id, notes: b.reason || 'Thu/bổ sung cọc' });
    }
    depositReceipt(ctx.db, ctx, { tenancyId: c.tenancy.id, paymentId: payment.id, amount: b.amount, reason: b.reason || 'Thu/bổ sung cọc' });
    audit(ctx.db, ctx, { action: 'deposit.receipt', tableName: 'deposit_entries', recordId: c.tenancy.id, after: { amount: b.amount, payment: payment.code } });
    return depositLedger(ctx, c.tenancy);
  }, { perm: 'deposits.receive' });

  r.post('/api/v1/tenancies/:id/deposit/refunds', (ctx) => {
    const c = tenancyInScope(ctx, ctx.params.id);
    const b = ctx.body;
    const v = validator();
    v.money('amount', b.amount, 'Tiền hoàn', { positive: true });
    v.required('methodCode', b.methodCode, 'Phương thức hoàn');
    v.reason('reason', b.reason);
    v.check();
    depositRefund(ctx.db, ctx, { tenancyId: c.tenancy.id, amount: b.amount, reason: b.reason, methodCode: b.methodCode, externalReference: b.externalReference });
    audit(ctx.db, ctx, { action: 'deposit.refund', tableName: 'deposit_entries', recordId: c.tenancy.id, after: { amount: b.amount }, reason: b.reason });
    return depositLedger(ctx, c.tenancy);
  }, { perm: 'deposits.refund' });

  r.post('/api/v1/tenancies/:id/deposit/offsets', (ctx) => {
    const c = tenancyInScope(ctx, ctx.params.id);
    const b = ctx.body;
    const v = validator();
    v.required('invoiceId', b.invoiceId, 'Hóa đơn');
    v.money('amount', b.amount, 'Tiền bù trừ', { positive: true });
    v.reason('reason', b.reason);
    v.check();
    tenancyInScope(ctx, must(ctx.db.invoices, b.invoiceId, 'hóa đơn').tenancyId);
    depositOffset(ctx.db, ctx, { tenancyId: c.tenancy.id, invoiceId: b.invoiceId, amount: b.amount, reason: b.reason });
    audit(ctx.db, ctx, { action: 'deposit.offset', tableName: 'deposit_entries', recordId: c.tenancy.id, after: { amount: b.amount, invoiceId: b.invoiceId }, reason: b.reason });
    return depositLedger(ctx, c.tenancy);
  }, { perm: 'deposits.offset' });

  r.post('/api/v1/tenancies/:id/deposit/transfers', (ctx) => {
    const c = tenancyInScope(ctx, ctx.params.id);
    const b = ctx.body;
    const v = validator();
    v.required('toTenancyId', b.toTenancyId, 'Đợt thuê nhận cọc');
    v.money('amount', b.amount, 'Tiền chuyển', { positive: true });
    v.reason('reason', b.reason);
    v.check();
    tenancyInScope(ctx, b.toTenancyId);
    depositTransfer(ctx.db, ctx, { fromTenancyId: c.tenancy.id, toTenancyId: b.toTenancyId, amount: b.amount, reason: b.reason });
    audit(ctx.db, ctx, { action: 'deposit.transfer', tableName: 'deposit_entries', recordId: c.tenancy.id, after: { amount: b.amount, to: b.toTenancyId }, reason: b.reason });
    return depositLedger(ctx, c.tenancy);
  }, { perm: 'deposits.transfer' });

  // ---------------------------------------------------------------- công nợ
  r.get('/api/v1/debts', (ctx) => {
    const q = ctx.query;
    const { db, today } = ctx;
    const allowed = propertyFilter(ctx);
    const rows = db.tenants.filter((t) => tenantVisible(ctx, t)).map((t) => {
      const tenancyIds = new Set(db.tenancies.filter((x) => x.representativeTenantId === t.id && allowed.has(tenancyContext(db, x).property.id)).map((x) => x.id));
      const invoices = db.invoices.filter((i) => tenancyIds.has(i.tenancyId) && i.status === 'issued' && !['debit_adjustment', 'credit_adjustment'].includes(i.kind));
      const buckets = { notDue: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90p: 0 };
      let oldestDueOn = null;
      let count = 0;
      for (const inv of invoices) {
        const b = invoiceBalance(db, inv, today);
        if (b.outstandingAmount <= 0) continue;
        count += 1;
        const late = inv.dueOn < today ? diffDays(inv.dueOn, today) : 0;
        if (late === 0) buckets.notDue += b.outstandingAmount;
        else if (late <= 30) buckets.d1_30 += b.outstandingAmount;
        else if (late <= 60) buckets.d31_60 += b.outstandingAmount;
        else if (late <= 90) buckets.d61_90 += b.outstandingAmount;
        else buckets.d90p += b.outstandingAmount;
        if (!oldestDueOn || inv.dueOn < oldestDueOn) oldestDueOn = inv.dueOn;
      }
      const summary = tenantSummary(db, t, today);
      const lastPayment = db.payments.filter((p) => p.tenantId === t.id && p.status === 'confirmed').map((p) => p.receivedAt).sort().pop() || null;
      const pending = db.payments.filter((p) => p.tenantId === t.id && p.status === 'pending').reduce((s, p) => s + p.amount, 0);
      return {
        tenant: tenantRef(t), residenceStatus: summary.residenceStatus, currentRoom: summary.currentTenancy?.room || null,
        outstandingAmount: Object.values(buckets).reduce((s, x) => s + x, 0), overdueAmount: buckets.d1_30 + buckets.d31_60 + buckets.d61_90 + buckets.d90p,
        buckets, oldestDueOn, invoiceCount: count, lastPaymentAt: lastPayment, pendingReportedAmount: pending,
        depositHeld: [...tenancyIds].reduce((s, id) => s + depositHeld(db, id), 0),
      };
    }).filter((row) => row.outstandingAmount > 0);
    return {
      ...listResponse(rows, q, {
        filter: (row) => (!q.residenceStatus || row.residenceStatus === q.residenceStatus) && (!q.overdueOnly || row.overdueAmount > 0),
        search: (row) => [row.tenant.fullName, row.tenant.code, row.currentRoom?.code],
        sortable: ['outstandingAmount', 'overdueAmount', 'oldestDueOn', 'tenant.fullName'],
        defaultSort: '-overdueAmount',
      }),
      totals: rows.reduce((acc, row) => {
        acc.outstanding += row.outstandingAmount;
        acc.overdue += row.overdueAmount;
        Object.keys(row.buckets).forEach((k) => { acc.buckets[k] += row.buckets[k]; });
        return acc;
      }, { outstanding: 0, overdue: 0, buckets: { notDue: 0, d1_30: 0, d31_60: 0, d61_90: 0, d90p: 0 } }),
    };
  }, { perm: 'invoices.read' });

  void roomRef;
  void tenantDebt;
}
