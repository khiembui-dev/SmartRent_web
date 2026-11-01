// Hóa đơn: nháp → phát hành → (điều chỉnh / hủy / thay thế). Đã phát hành thì không sửa giá, tổng, hạn.
import { uuid } from '../../utils/ids.js';
import { addDays, compareIso, formatDate, isIsoDate, nextMonthStart } from '../../utils/date.js';
import { lineAmount } from '../../utils/money.js';
import { asBool, conflict, fail, listResponse, rule, validator } from '../respond.js';
import {
  assertPeriodOpen, audit, createDraftInvoice, find, invoiceBalance, invoiceTotal, issueInvoice, must, nextCode, queueEmail,
  recomputeDraft, tenancyContext,
} from '../engine.js';
import { invoiceDetail, invoiceSummary, userRef } from '../dto.js';
import { invoiceInScope, periodInScope, propertyFilter, tenancyInScope } from '../scope.js';

const ADJUSTMENT = ['debit_adjustment', 'credit_adjustment'];

function manualLine(ctx, line, index) {
  const v = validator();
  v.required(`lines.${index}.description`, line.description, 'Nội dung');
  v.money(`lines.${index}.amount`, line.amount, 'Số tiền', { positive: true });
  v.check();
  const type = line.chargeTypeId ? find(ctx.db.chargeTypes, line.chargeTypeId) : ctx.db.chargeTypes.find((t) => t.organizationId === ctx.organizationId && t.code === 'OTHER');
  if (!type || type.organizationId !== ctx.organizationId) fail(422, 'validation_failed', 'Khoản thu không hợp lệ.', { [`lines.${index}.chargeTypeId`]: ['Không hợp lệ.'] });
  return {
    chargeTypeId: type.id, chargeInstanceId: null, sourceRateId: null, sourceScope: 'manual', descriptionSnapshot: line.description.trim(), unitSnapshot: type.unitLabel,
    quantity: 1, unitPrice: line.amount, sign: line.isDiscount ? -1 : 1, prorationNumerator: 1, prorationDenominator: 1,
  };
}

function batchDto(ctx, batch) {
  return {
    ...batch,
    requestedBy: userRef(ctx.db, batch.requestedBy),
    items: batch.items.map((item) => ({ ...item, room: tenancyContext(ctx.db, item.tenancyId).room.code, representative: tenancyContext(ctx.db, item.tenancyId).tenant.fullName, invoice: item.invoiceId ? invoiceSummary(ctx.db, find(ctx.db.invoices, item.invoiceId), ctx.today) : null })),
    summary: {
      succeeded: batch.items.filter((i) => i.status === 'succeeded').length,
      failed: batch.items.filter((i) => i.status === 'failed').length,
      skipped: batch.items.filter((i) => i.status === 'skipped').length,
    },
  };
}

function runBatchItem(ctx, period, item, action) {
  const { db } = ctx;
  try {
    // Mỗi phòng chạy trên bản sao riêng: lỗi phòng này không làm hỏng phòng khác.
    const snapshot = structuredClone(db);
    const local = { ...ctx, db: snapshot };
    let invoice = snapshot.invoices.find((i) => i.tenancyId === item.tenancyId && i.billingPeriodId === period.id && i.kind === 'periodic' && i.status !== 'void');
    if (invoice?.status === 'issued') {
      item.status = 'skipped';
      item.invoiceId = invoice.id;
      item.message = `Đã phát hành ${invoice.code} trước đó.`;
      return;
    }
    if (!invoice) invoice = createDraftInvoice(snapshot, local, { tenancyId: item.tenancyId, periodId: period.id });
    else if (invoice.stale) recomputeDraft(snapshot, invoice);
    if (action === 'issue') issueInvoice(snapshot, local, invoice.id, {});
    else if (invoice.problems?.length) throw Object.assign(new Error(invoice.problems.map((p) => p.message).join(' ')), { code: 'invoice_blocked' });
    Object.keys(snapshot).forEach((key) => { db[key] = snapshot[key]; });
    item.status = 'succeeded';
    item.invoiceId = invoice.id;
    item.message = action === 'issue' ? `Đã phát hành ${invoice.code}.` : 'Đã lập nháp.';
  } catch (error) {
    item.status = 'failed';
    item.code = error.code || 'error';
    item.message = error.detail || error.message;
  }
}

export default function register(r) {
  r.get('/api/v1/invoices', (ctx) => {
    const q = ctx.query;
    const allowed = propertyFilter(ctx);
    const all = ctx.db.invoices.filter((i) => allowed.has(tenancyContext(ctx.db, i.tenancyId).property.id)).map((i) => invoiceSummary(ctx.db, i, ctx.today));
    return listResponse(all, q, {
      filter: (i) => (!q.status || i.status === q.status)
        && (!q.kind || (q.kind === 'adjustment' ? ADJUSTMENT.includes(i.kind) : i.kind === q.kind))
        && (!q.paymentStatus || (i.status === 'issued' && i.paymentStatus === q.paymentStatus))
        && (!q.overdue || i.isOverdue === asBool(q.overdue))
        && (!q.periodMonth || i.period?.monthStart?.startsWith(q.periodMonth) || (!i.period && i.serviceFrom.startsWith(q.periodMonth)))
        && (!q.periodId || i.period?.id === q.periodId)
        && (!q.tenancyId || i.tenancyId === q.tenancyId)
        && (!q.tenantId || i.representative.id === q.tenantId)
        && (!q.roomId || i.room.id === q.roomId)
        && (!q.dueFrom || (i.dueOn && i.dueOn >= q.dueFrom)) && (!q.dueTo || (i.dueOn && i.dueOn <= q.dueTo))
        && (!q.issuedFrom || (i.issuedOn && i.issuedOn >= q.issuedFrom)) && (!q.issuedTo || (i.issuedOn && i.issuedOn <= q.issuedTo))
        && (!q.stale || i.stale)
        && (!q.hasPending || i.pendingPaymentCount > 0)
        && (!q.outstanding || (i.status === 'issued' && i.outstandingAmount > 0)),
      search: (i) => [i.code, i.room.code, i.representative.fullName, i.representative.code],
      sortable: ['code', 'issuedOn', 'dueOn', 'totalAmount', 'outstandingAmount', 'room.code', 'representative.fullName', 'serviceFrom', 'createdAt'],
      defaultSort: '-serviceFrom',
      summarize: (items) => {
        const effective = items.filter((i) => i.status === 'issued' && !ADJUSTMENT.includes(i.kind));
        const sum = (rows, key) => rows.reduce((s, i) => s + (i[key] || 0), 0);
        return {
          count: effective.length, receivableAmount: sum(effective, 'receivableAmount'), paidAmount: sum(effective, 'paidAmount'), outstandingAmount: sum(effective, 'outstandingAmount'),
          overdueAmount: sum(effective.filter((i) => i.isOverdue), 'outstandingAmount'), overdueCount: effective.filter((i) => i.isOverdue).length, pendingAmount: sum(effective, 'pendingPaymentAmount'),
        };
      },
    });
  }, { perm: 'invoices.read' });

  r.get('/api/v1/invoices/:id', (ctx) => invoiceDetail(ctx.db, invoiceInScope(ctx, ctx.params.id), ctx.today), { perm: 'invoices.read' });

  // Lập nháp: định kỳ theo kỳ, hoặc phát sinh riêng (one_time) không dùng để tính lại tiền thuê.
  r.post('/api/v1/invoices/drafts', (ctx) => {
    const b = ctx.body;
    const c = tenancyInScope(ctx, b.tenancyId);
    const v = validator();
    v.oneOf('kind', b.kind, ['periodic', 'one_time'], 'Loại chứng từ');
    v.check();
    if (b.kind === 'periodic') {
      const period = periodInScope(ctx, b.periodId);
      const invoice = createDraftInvoice(ctx.db, ctx, { tenancyId: c.tenancy.id, periodId: period.id, kind: 'periodic', idempotencyKey: ctx.idempotencyKey });
      return invoiceDetail(ctx.db, invoice, ctx.today);
    }
    if (!b.lines?.length) fail(422, 'validation_failed', 'Chứng từ phát sinh cần ít nhất một khoản.', { lines: ['Thêm khoản thu.'] });
    const lines = b.lines.map((line, index) => manualLine(ctx, line, index));
    const serviceFrom = b.serviceOn || ctx.today;
    const invoice = createDraftInvoice(ctx.db, ctx, { tenancyId: c.tenancy.id, kind: 'one_time', from: serviceFrom, to: addDays(serviceFrom, 1), manualLines: lines, notes: b.notes, meteredOnly: false });
    // one_time không tính tiền thuê/điện nước định kỳ: chỉ giữ dòng nhập tay.
    invoice.lines = invoice.lines.filter((l) => l.sourceScope === 'manual').map((l, i) => ({ ...l, lineNo: i + 1 }));
    invoice.segments = [];
    invoice.problems = [];
    invoice.serviceFrom = serviceFrom;
    invoice.serviceTo = addDays(serviceFrom, 1);
    return invoiceDetail(ctx.db, invoice, ctx.today);
  }, { perm: 'invoices.write' });

  r.post('/api/v1/invoices/:id/recompute', (ctx) => {
    const invoice = invoiceInScope(ctx, ctx.params.id);
    if (invoice.kind === 'one_time') rule('not_recomputable', 'Chứng từ phát sinh riêng không tính lại theo giá/chỉ số.');
    assertPeriodOpen(ctx.db, invoice.billingPeriodId, 'tính lại hóa đơn');
    recomputeDraft(ctx.db, invoice);
    return invoiceDetail(ctx.db, invoice, ctx.today);
  }, { perm: 'invoices.write' });

  // Sửa nháp: thêm dòng giảm trừ/phát sinh có căn cứ, ghi chú, ngày lập/hạn (cần quyền phát hành).
  r.put('/api/v1/invoices/:id', (ctx) => {
    const invoice = invoiceInScope(ctx, ctx.params.id);
    if (invoice.status !== 'draft') conflict('invoice_not_draft', 'Hóa đơn đã phát hành/hủy; dùng chứng từ điều chỉnh thay vì sửa.');
    assertPeriodOpen(ctx.db, invoice.billingPeriodId, 'sửa hóa đơn');
    const b = ctx.body;
    if (b.manualLines) {
      invoice.manualLines = b.manualLines.map((line, index) => manualLine(ctx, line, index));
      if (invoice.kind === 'one_time') {
        invoice.lines = invoice.manualLines.map((l, i) => ({ ...l, id: uuid(), lineNo: i + 1 }));
      } else {
        recomputeDraft(ctx.db, invoice);
      }
    }
    if (b.notes !== undefined) invoice.notes = b.notes || null;
    if (b.issuedOn !== undefined || b.dueOn !== undefined) {
      ctx.require('invoices.issue');
      const v = validator();
      if (b.issuedOn) v.date('issuedOn', b.issuedOn, 'Ngày lập');
      if (b.dueOn) v.date('dueOn', b.dueOn, 'Hạn thanh toán');
      v.check();
      if (b.issuedOn && b.dueOn && b.dueOn < b.issuedOn) fail(422, 'validation_failed', 'Hạn không được trước ngày lập.', { dueOn: ['Phải từ ngày lập trở đi.'] });
      invoice.plannedIssuedOn = b.issuedOn || null;
      invoice.plannedDueOn = b.dueOn || null;
    }
    return invoiceDetail(ctx.db, invoice, ctx.today);
  }, { perm: 'invoices.write' });

  r.delete('/api/v1/invoices/:id', (ctx) => {
    const invoice = invoiceInScope(ctx, ctx.params.id);
    if (invoice.status !== 'draft') conflict('invoice_not_draft', 'Chỉ xóa được hóa đơn nháp. Hóa đơn đã phát hành phải hủy có lý do.');
    assertPeriodOpen(ctx.db, invoice.billingPeriodId, 'xóa hóa đơn');
    ctx.db.invoices = ctx.db.invoices.filter((i) => i.id !== invoice.id);
    audit(ctx.db, ctx, { action: 'DELETE', tableName: 'invoices', recordId: invoice.id, before: { kind: invoice.kind, total: invoiceTotal(invoice) } });
    return null;
  }, { perm: 'invoices.write' });

  r.post('/api/v1/invoices/:id/issue', (ctx) => {
    const invoice = invoiceInScope(ctx, ctx.params.id);
    issueInvoice(ctx.db, ctx, invoice.id, { issuedOn: ctx.body.issuedOn || invoice.plannedIssuedOn, dueOn: ctx.body.dueOn || invoice.plannedDueOn });
    return invoiceDetail(ctx.db, invoice, ctx.today);
  }, { perm: 'invoices.issue' });

  r.post('/api/v1/invoices/:id/void', (ctx) => {
    const invoice = invoiceInScope(ctx, ctx.params.id);
    const v = validator();
    v.reason('reason', ctx.body.reason, 'Lý do hủy');
    v.check();
    if (invoice.status !== 'issued') conflict('invoice_not_issued', 'Chỉ hủy hóa đơn đã phát hành; nháp thì xóa.');
    const balance = ADJUSTMENT.includes(invoice.kind) ? null : invoiceBalance(ctx.db, invoice, ctx.today);
    if (balance && balance.paidAmount !== 0) {
      rule('invoice_has_allocations', `Hóa đơn đang có ${new Intl.NumberFormat('vi-VN').format(balance.paidAmount)} đ đã phân bổ. Đảo hoặc chuyển phân bổ trước khi hủy.`);
    }
    const activeAdjustments = ctx.db.invoices.filter((i) => i.originalInvoiceId === invoice.id && i.status === 'issued' && ADJUSTMENT.includes(i.kind));
    if (activeAdjustments.length) rule('invoice_has_adjustments', `Hủy các chứng từ điều chỉnh liên quan trước (${activeAdjustments.map((i) => i.code).join(', ')}).`);
    Object.assign(invoice, { status: 'void', voidedAt: ctx.now, voidedBy: ctx.user.id, voidReason: ctx.body.reason });
    audit(ctx.db, ctx, { action: 'invoice.void', tableName: 'invoices', recordId: invoice.id, before: { status: 'issued' }, after: { status: 'void' }, reason: ctx.body.reason });
    return invoiceDetail(ctx.db, invoice, ctx.today);
  }, { perm: 'invoices.void' });

  r.post('/api/v1/invoices/:id/adjustments', (ctx) => {
    const original = invoiceInScope(ctx, ctx.params.id);
    const b = ctx.body;
    const v = validator();
    v.oneOf('kind', b.kind, ['debit_adjustment', 'credit_adjustment'], 'Loại điều chỉnh');
    v.reason('reason', b.reason, 'Căn cứ điều chỉnh');
    if (!b.lines?.length) v.add('lines', 'Thêm ít nhất một khoản điều chỉnh.');
    v.check();
    if (original.status !== 'issued' || ADJUSTMENT.includes(original.kind)) rule('invalid_original', 'Chỉ điều chỉnh hóa đơn gốc đang có hiệu lực.');
    const lines = b.lines.map((line, index) => ({ ...manualLine(ctx, { ...line, isDiscount: false }, index), id: uuid(), lineNo: index + 1 }));
    const amount = lines.reduce((s, l) => s + lineAmount(l), 0);
    const balance = invoiceBalance(ctx.db, original, ctx.today);
    if (b.kind === 'credit_adjustment' && amount > balance.outstandingAmount) {
      rule('credit_exceeds_outstanding', `Điều chỉnh giảm ${new Intl.NumberFormat('vi-VN').format(amount)} đ vượt số còn phải thu (${new Intl.NumberFormat('vi-VN').format(balance.outstandingAmount)} đ). Phần vượt cần nghiệp vụ ghi có/hoàn riêng.`);
    }
    const c = tenancyContext(ctx.db, original.tenancyId);
    const monthIso = original.serviceFrom;
    const adjustment = {
      id: uuid(), tenancyId: original.tenancyId, billingPeriodId: null, kind: b.kind, originalInvoiceId: original.id,
      code: nextCode(ctx.db, `adjustment:${c.property.code}`, (n) => `DC-${c.property.code}${monthIso.slice(2, 4)}${monthIso.slice(5, 7)}-${String(n).padStart(3, '0')}`),
      status: 'issued', serviceFrom: original.serviceFrom, serviceTo: original.serviceTo, issuedOn: ctx.today, dueOn: b.kind === 'debit_adjustment' ? (b.dueOn || (original.dueOn > ctx.today ? original.dueOn : addDays(ctx.today, 7))) : ctx.today,
      issuedAt: ctx.now, issuedBy: ctx.user.id, voidedAt: null, voidedBy: null, voidReason: null, notes: b.reason, idempotencyKey: ctx.idempotencyKey || uuid(),
      createdBy: ctx.user.id, createdAt: ctx.now, lines, segments: [], problems: [], manualLines: [],
    };
    ctx.db.invoices.push(adjustment);
    audit(ctx.db, ctx, { action: `invoice.${b.kind}`, tableName: 'invoices', recordId: adjustment.id, after: { original: original.code, amount }, reason: b.reason });
    return invoiceDetail(ctx.db, original, ctx.today);
  }, { perm: 'invoices.adjust' });

  r.post('/api/v1/invoices/:id/replacement', (ctx) => {
    const original = invoiceInScope(ctx, ctx.params.id);
    if (original.status !== 'void') rule('original_not_void', 'Chỉ lập hóa đơn thay thế cho chứng từ đã hủy.');
    if (ctx.db.invoices.some((i) => i.originalInvoiceId === original.id && i.kind === 'replacement' && i.status !== 'void')) conflict('replacement_exists', 'Đã có hóa đơn thay thế.');
    const draft = {
      ...structuredClone(original), id: uuid(), kind: 'replacement', originalInvoiceId: original.id, code: null, status: 'draft', issuedOn: null, dueOn: null,
      issuedAt: null, issuedBy: null, voidedAt: null, voidedBy: null, voidReason: null, idempotencyKey: uuid(), createdBy: ctx.user.id, createdAt: ctx.now,
      billingPeriodId: original.billingPeriodId, problems: [], stale: false,
    };
    draft.lines = draft.lines.map((l) => ({ ...l, id: uuid() }));
    draft.manualLines = draft.lines.map((l) => ({ ...l }));
    ctx.db.invoices.push(draft);
    return invoiceDetail(ctx.db, draft, ctx.today);
  }, { perm: 'invoices.write' });

  r.post('/api/v1/invoices/:id/send', (ctx) => {
    const invoice = invoiceInScope(ctx, ctx.params.id);
    if (invoice.status !== 'issued') rule('invoice_not_issued', 'Chỉ gửi hóa đơn đã phát hành.');
    const c = tenancyContext(ctx.db, invoice.tenancyId);
    const delivery = queueEmail(ctx.db, { organizationId: ctx.organizationId, recipientUserId: c.tenant.userId, toEmail: c.tenant.email, templateCode: ctx.body.template || 'invoice_issued', eventKey: `${invoice.id}:resend:${ctx.now}`, subject: `Hóa đơn ${invoice.code}`, at: ctx.now });
    return { simulated: true, status: delivery.status, toEmail: c.tenant.email, error: delivery.attempts[0].error };
  }, { perm: 'invoices.read' });

  // ---------------------------------------------------------------- phát hành hàng loạt
  r.post('/api/v1/invoice-batches', (ctx) => {
    const b = ctx.body;
    const period = periodInScope(ctx, b.periodId);
    const v = validator();
    v.oneOf('action', b.action, ['draft', 'issue'], 'Hành động');
    if (!b.tenancyIds?.length) v.add('tenancyIds', 'Chọn ít nhất một đợt thuê.');
    v.check();
    if (b.action === 'issue') ctx.require('invoices.issue');
    assertPeriodOpen(ctx.db, period.id, 'phát hành hóa đơn');
    const batch = {
      id: uuid(), periodId: period.id, action: b.action, requestedBy: ctx.user.id, requestedAt: ctx.now, idempotencyKey: ctx.idempotencyKey || uuid(),
      items: b.tenancyIds.map((tenancyId) => ({ tenancyId, status: 'pending', invoiceId: null, message: null, code: null })),
    };
    for (const item of batch.items) {
      tenancyInScope(ctx, item.tenancyId);
      runBatchItem(ctx, period, item, b.action);
    }
    ctx.db.issueBatches.push(batch);
    audit(ctx.db, ctx, { action: `invoice_batch.${b.action}`, tableName: 'invoice_issue_batches', recordId: batch.id, after: { period: period.monthStart, items: batch.items.length, failed: batch.items.filter((i) => i.status === 'failed').length } });
    return batchDto(ctx, batch);
  }, { perm: 'invoices.write' });

  r.get('/api/v1/invoice-batches/:id', (ctx) => {
    const batch = must(ctx.db.issueBatches, ctx.params.id, 'lô phát hành');
    periodInScope(ctx, batch.periodId);
    return batchDto(ctx, batch);
  }, { perm: 'invoices.read' });

  r.post('/api/v1/invoice-batches/:id/retry', (ctx) => {
    const batch = must(ctx.db.issueBatches, ctx.params.id, 'lô phát hành');
    const period = periodInScope(ctx, batch.periodId);
    if (batch.action === 'issue') ctx.require('invoices.issue');
    assertPeriodOpen(ctx.db, period.id, 'phát hành hóa đơn');
    // Chỉ chạy lại phòng lỗi; phòng đã thành công không bị lập/phát hành lần hai.
    batch.items.filter((i) => i.status === 'failed').forEach((item) => runBatchItem(ctx, period, item, batch.action));
    batch.retriedAt = ctx.now;
    return batchDto(ctx, batch);
  }, { perm: 'invoices.write' });

  void compareIso;
  void formatDate;
  void isIsoDate;
  void nextMonthStart;
}
