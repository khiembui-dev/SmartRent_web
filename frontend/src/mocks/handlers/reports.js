// Dashboard và báo cáo. Mọi số liệu suy ra từ cùng nguồn chứng từ như các màn hình chi tiết.
import { addDays, addMonths, compareIso, daysInMonth, diffDays, instantToIsoDate, monthLabel, monthStart, monthsBetween, nextMonthStart, overlapDays, parseIsoDate, vnDateTimeToInstant } from '../../utils/date.js';
import { listResponse } from '../respond.js';
import {
  allocationSigned, computeCharges, contractStatus, depositHeld, depositSigned, find, invoiceBalance, invoiceTotal, isTicketOverdue,
  paymentBalance, roomOccupancy, tenancyContext,
} from '../engine.js';
import { contractSummary, inquirySummary, invoiceSummary, propertyRef, ticketSummary } from '../dto.js';
import { orgProperties, propertyFilter } from '../scope.js';

const ADJ = ['debit_adjustment', 'credit_adjustment'];

function scope(ctx) {
  const ids = propertyFilter(ctx);
  return { ids, props: orgProperties(ctx).filter((p) => ids.has(p.id)) };
}

const inScopeTenancy = (db, ids) => (t) => ids.has(tenancyContext(db, t).property.id);

function periodFinance(db, ids, month, today) {
  const invoices = db.invoices.filter((i) => i.status === 'issued' && !ADJ.includes(i.kind) && ids.has(tenancyContext(db, i.tenancyId).property.id))
    .filter((i) => (i.billingPeriodId ? find(db.billingPeriods, i.billingPeriodId).monthStart.startsWith(month) : i.serviceFrom.startsWith(month)));
  return invoices.reduce((acc, inv) => {
    const b = invoiceBalance(db, inv, today);
    acc.receivable += b.receivableAmount;
    acc.allocated += b.paidAmount;
    acc.outstanding += b.outstandingAmount;
    if (b.isOverdue) acc.overdue += b.outstandingAmount;
    acc.count += 1;
    return acc;
  }, { month, label: monthLabel(`${month}-01`), receivable: 0, allocated: 0, outstanding: 0, overdue: 0, count: 0 });
}

function occupancyForMonth(db, ids, month, today) {
  const from = `${month}-01`;
  const to = nextMonthStart(from);
  const end = to > addDays(today, 1) ? addDays(today, 1) : to;
  if (end <= from) return { month, label: monthLabel(from), rate: null, occupiedRoomDays: 0, roomDays: 0 };
  const rooms = db.rooms.filter((r) => ids.has(r.propertyId) && r.operatingStatus !== 'inactive');
  const roomDays = rooms.length * diffDays(from, end);
  let occupied = 0;
  for (const t of db.tenancies.filter((x) => x.actualMoveIn && inScopeTenancy(db, ids)(x))) {
    occupied += overlapDays(t.actualMoveIn, t.actualMoveOut, from, end);
  }
  return { month, label: monthLabel(from), occupiedRoomDays: occupied, roomDays, rate: roomDays ? Math.round((occupied / roomDays) * 1000) / 10 : null };
}

function cashRows(db, ids, from, to, ctx) {
  const visible = (p) => {
    const tenancy = db.tenancies.find((t) => t.representativeTenantId === p.tenantId);
    const propertyId = p.collectedAtPropertyId || (tenancy && tenancyContext(db, tenancy).property.id);
    return propertyId && ids.has(propertyId) && find(db.tenants, p.tenantId).organizationId === ctx.organizationId;
  };
  const receipts = db.payments.filter((p) => p.status === 'confirmed' && visible(p)).filter((p) => {
    const d = instantToIsoDate(p.receivedAt);
    return d >= from && d <= to;
  });
  const reversals = db.paymentReversals.filter((r) => visible(find(db.payments, r.paymentId))).filter((r) => {
    const d = instantToIsoDate(r.occurredAt);
    return d >= from && d <= to;
  });
  return { receipts, reversals };
}

export default function register(r) {
  r.get('/api/v1/dashboard', (ctx) => {
    const { db, today } = ctx;
    const { ids, props } = scope(ctx);
    const month = ctx.query.month || today.slice(0, 7);
    const rooms = db.rooms.filter((x) => ids.has(x.propertyId));
    const occ = rooms.map((x) => ({ room: x, ...roomOccupancy(db, x, today) }));
    const count = (s) => occ.filter((o) => o.occupancyStatus === s).length;
    const exploitable = rooms.filter((x) => x.operatingStatus !== 'inactive').length;
    const tenancies = db.tenancies.filter(inScopeTenancy(db, ids));
    const issued = db.invoices.filter((i) => i.status === 'issued' && !ADJ.includes(i.kind) && ids.has(tenancyContext(db, i.tenancyId).property.id));
    const balances = issued.map((i) => ({ i, b: invoiceBalance(db, i, today) }));
    const overdue = balances.filter((x) => x.b.isOverdue);
    const { receipts } = cashRows(db, ids, `${month}-01`, addDays(nextMonthStart(`${month}-01`), -1), ctx);
    const collected = receipts.reduce((acc, p) => {
      const pb = paymentBalance(db, p);
      acc.total += p.amount;
      acc.toInvoices += pb.directInvoiceAmount;
      acc.toDeposit += db.depositEntries.filter((e) => e.paymentId === p.id && e.kind === 'receipt').reduce((s, e) => s + e.amount, 0);
      acc.unapplied += pb.unappliedAmount;
      return acc;
    }, { total: 0, toInvoices: 0, toDeposit: 0, unapplied: 0 });
    const pending = db.payments.filter((p) => p.status === 'pending' && find(db.tenants, p.tenantId).organizationId === ctx.organizationId && (!p.collectedAtPropertyId || ids.has(p.collectedAtPropertyId)));
    // Tiến độ ghi số của tháng hiện tại; cơ sở chưa mở kỳ thì mọi phòng đang ở đều là "chưa nhập số".
    const currentMonth = monthStart(today);
    const billing = { tenancyCount: 0, missingReadings: 0, readyToInvoice: 0, draftCount: 0, invoiced: 0, blocked: 0 };
    const needsReading = new Set();
    for (const t of tenancies.filter((x) => x.status === 'active')) {
      const c = tenancyContext(db, t);
      const period = db.billingPeriods.find((p) => p.propertyId === c.property.id && p.monthStart === currentMonth);
      billing.tenancyCount += 1;
      const invoice = period && db.invoices.find((i) => i.tenancyId === t.id && i.billingPeriodId === period.id && i.status !== 'void');
      if (invoice) {
        billing[invoice.status === 'issued' ? 'invoiced' : 'draftCount'] += 1;
        continue;
      }
      const preview = period ? computeCharges(db, t.id, { from: period.monthStart, to: nextMonthStart(period.monthStart), periodId: period.id }) : null;
      if (!preview || preview.problems.some((p) => ['missing_reading', 'missing_previous'].includes(p.code))) {
        billing.missingReadings += 1;
        needsReading.add(c.room.id);
      } else if (!preview.problems.length) billing.readyToInvoice += 1;
      else billing.blocked += 1;
    }
    const { missingReadings, readyToInvoice: readyToDraft } = billing;
    const settings = db.orgSettings.find((s) => s.organizationId === ctx.organizationId);
    const dayOfMonth = Number(today.slice(8, 10));
    const schedule = {
      meterReadingDay: settings.meterReadingDay, invoiceCreateDay: settings.invoiceCreateDay, reminderEnabled: settings.reminderEnabled,
      readingDue: settings.reminderEnabled && dayOfMonth >= settings.meterReadingDay && missingReadings > 0,
      invoiceDue: settings.reminderEnabled && dayOfMonth >= settings.invoiceCreateDay && readyToDraft > 0,
    };
    const drafts = db.invoices.filter((i) => i.status === 'draft' && ids.has(tenancyContext(db, i.tenancyId).property.id)).length;
    const contracts = db.contracts.filter((k) => ids.has(tenancyContext(db, k.tenancyId).property.id)).map((k) => contractStatus(db, k, today));
    const inquiries = db.inquiries.filter((q) => ids.has(find(db.rooms, q.roomId).propertyId));
    const tickets = db.tickets.filter((t) => ids.has(find(db.rooms, t.roomId).propertyId));
    const holds = db.reservations.filter((x) => x.status === 'holding' && ids.has(find(db.rooms, find(db.roomAllocations, x.allocationId).roomId).propertyId));
    const soonHolds = holds.filter((x) => new Date(find(db.roomAllocations, x.allocationId).holdExpiresAt) - new Date(ctx.now) <= 72 * 3600000);
    const upcomingViewings = db.viewings.filter((v) => v.status === 'scheduled' && v.startsAt >= ctx.now && ids.has(find(db.rooms, find(db.inquiries, v.inquiryId).roomId).propertyId));
    const shortDeposit = tenancies.filter((t) => ['active', 'planned'].includes(t.status)).filter((t) => {
      const k = db.contracts.find((x) => x.tenancyId === t.id);
      const cs = k ? contractStatus(db, k, today) : null;
      return cs?.currentVersion && depositHeld(db, t.id) < cs.currentVersion.requiredDeposit;
    });
    const can = (perm) => ctx.can(perm);
    const scheduledInquiries = new Set(db.viewings.filter((v) => v.status === 'scheduled').map((v) => v.inquiryId));
    const pendingInquiries = inquiries.filter((q) => ['new', 'accepted', 'consulting'].includes(q.status) && !scheduledInquiries.has(q.id));
    const openTickets = tickets.filter((t) => !['resolved', 'closed'].includes(t.status));
    const overdueTickets = tickets.filter((t) => isTicketOverdue(t, ctx.now));
    const expiringContracts = db.contracts.filter((k) => ids.has(tenancyContext(db, k.tenancyId).property.id)).map((k) => contractSummary(db, k, today)).filter((k) => k.expiring || k.stillOccupiedAfterExpiry);
    const tasks = [
      can('invoices.read') && { key: 'overdue', label: 'Hóa đơn quá hạn còn nợ', count: overdue.length, url: '/admin/invoices?overdue=true', tone: 'danger' },
      can('contracts.read') && { key: 'expired_occupied', label: 'Hợp đồng đã hết hạn, khách vẫn ở', count: contracts.filter((c) => c.stillOccupiedAfterExpiry).length, url: '/admin/contracts?stillOccupied=true', tone: 'danger' },
      can('tickets.read') && { key: 'sla_overdue', label: 'Ticket quá hạn xử lý', count: overdueTickets.length, url: '/admin/tickets?overdue=true', tone: 'danger' },
      can('billing.read') && { key: 'missing_readings', label: 'Phòng chưa nhập số điện nước tháng này', count: missingReadings, url: '/admin/billing?group=missing_readings', tone: 'warning' },
      can('invoices.write') && { key: 'ready_to_draft', label: 'Phòng đủ số, chưa tạo hóa đơn', count: readyToDraft, url: '/admin/billing?group=ready', tone: 'warning' },
      can('contracts.read') && { key: 'missing_contracts', label: 'Phòng đã thuê chưa có hợp đồng', count: tenancies.filter((t) => t.status === 'active' && !db.contracts.some((k) => k.tenancyId === t.id)).length, url: '/admin/rooms?contract=missing', tone: 'warning' },
      can('payments.confirm') && { key: 'pending_payments', label: 'Khách báo chuyển khoản, chờ xác minh', count: pending.length, url: '/admin/invoices?hasPending=true', tone: 'warning' },
      can('inquiries.read') && { key: 'new_inquiries', label: 'Yêu cầu xem phòng chờ xếp lịch', count: pendingInquiries.length, url: '/admin/viewings', tone: 'warning' },
      can('contracts.read') && { key: 'expiring', label: 'Hợp đồng sắp hết hạn', count: contracts.filter((c) => c.expiring).length, url: '/admin/contracts?expiring=true', tone: 'warning' },
      can('tickets.read') && { key: 'new_tickets', label: 'Ticket mới chưa tiếp nhận', count: tickets.filter((t) => t.status === 'new').length, url: '/admin/tickets?status=new', tone: 'info' },
      can('invoices.issue') && { key: 'drafts', label: 'Hóa đơn nháp chưa phát hành', count: drafts, url: '/admin/invoices?status=draft', tone: 'info' },
      can('tenants.read') && { key: 'tenancy_requests', label: 'Đề nghị gia hạn, chuyển hoặc trả phòng', count: db.tenancyRequests.filter((x) => x.status === 'pending' && inScopeTenancy(db, ids)(find(db.tenancies, x.tenancyId))).length, url: '/admin/contracts?requests=pending', tone: 'info' },
      can('tenants.write') && { key: 'profile_requests', label: 'Đề nghị sửa hồ sơ khách', count: db.profileChangeRequests.filter((x) => x.status === 'pending').length, url: '/admin/tenants?profileRequests=pending', tone: 'info' },
    ].filter(Boolean);
    const months = monthsBetween(addMonths(`${month}-01`, -5), `${month}-01`).map((m) => m.slice(0, 7));
    return {
      scope: { properties: props.map(propertyRef), month, label: monthLabel(`${month}-01`), asOf: today, allProperties: !ctx.query.propertyId },
      rooms: {
        total: rooms.length, occupied: count('occupied'), available: count('available'), maintenance: count('maintenance'), inactive: count('inactive'),
        availableWithUpcoming: occ.filter((o) => o.occupancyStatus === 'available' && o.upcoming).length,
        occupancyRate: exploitable ? Math.round((count('occupied') / exploitable) * 1000) / 10 : 0,
        strip: occ.map((o) => {
          const property = find(db.properties, o.room.propertyId);
          const tenancy = o.activeTenancyId ? find(db.tenancies, o.activeTenancyId) : null;
          return {
            id: o.room.id, code: o.room.code, propertyCode: property.code, propertyName: property.name, status: o.occupancyStatus, upcoming: o.upcoming?.state || null,
            tenantName: tenancy ? find(db.tenants, tenancy.representativeTenantId)?.fullName : null,
            needsReading: needsReading.has(o.room.id),
            overdue: Boolean(tenancy) && overdue.some((x) => x.i.tenancyId === tenancy.id),
          };
        }),
      },
      finance: {
        period: ctx.can('invoices.read') ? periodFinance(db, ids, month, today) : null,
        overdueOutstanding: ctx.can('invoices.read') ? overdue.reduce((s, x) => s + x.b.outstandingAmount, 0) : null,
        overdueCount: overdue.length,
        totalOutstanding: ctx.can('invoices.read') ? balances.reduce((s, x) => s + x.b.outstandingAmount, 0) : null,
        collectedThisMonth: ctx.can('payments.read') ? collected : null,
        pendingReported: ctx.can('payments.read') ? { count: pending.length, amount: pending.reduce((s, p) => s + p.amount, 0) } : null,
        depositHeld: ctx.can('deposits.read') ? tenancies.filter((t) => ['active', 'planned'].includes(t.status)).reduce((s, t) => s + depositHeld(db, t.id), 0) : null,
      },
      tasks,
      billing: { ...billing, month: currentMonth.slice(0, 7), label: monthLabel(currentMonth), schedule },
      viewings: { pending: pendingInquiries.length, upcoming: upcomingViewings.length },
      tickets: { open: openTickets.length, overdue: overdueTickets.length, new: tickets.filter((t) => t.status === 'new').length },
      contracts: { expiring: contracts.filter((c) => c.expiring).length, expiredOccupied: contracts.filter((c) => c.stillOccupiedAfterExpiry).length },
      charts: {
        monthly: ctx.can('invoices.read') ? months.map((m) => periodFinance(db, ids, m, today)) : [],
        occupancy: months.map((m) => occupancyForMonth(db, ids, m, today)),
      },
      recent: {
        inquiries: ctx.can('inquiries.read') ? pendingInquiries.sort((a, b) => compareIso(b.createdAt, a.createdAt)).slice(0, 5).map((q) => inquirySummary(db, q)) : [],
        viewings: ctx.can('inquiries.read') ? upcomingViewings.sort((a, b) => compareIso(a.startsAt, b.startsAt)).slice(0, 5).map((v) => ({ id: v.id, startsAt: v.startsAt, inquiry: inquirySummary(db, find(db.inquiries, v.inquiryId)) })) : [],
        overdueInvoices: ctx.can('invoices.read') ? overdue.sort((a, b) => b.b.daysOverdue - a.b.daysOverdue).slice(0, 5).map((x) => invoiceSummary(db, x.i, today)) : [],
        expiringContracts: ctx.can('contracts.read') ? expiringContracts.sort((a, b) => compareIso(a.endsOn, b.endsOn)).slice(0, 5) : [],
        tickets: ctx.can('tickets.read') ? openTickets.sort((a, b) => compareIso(a.dueAt || '', b.dueAt || '')).slice(0, 5).map((t) => ticketSummary(db, t, ctx.now)) : [],
      },
    };
  }, { perm: 'properties.read' });

  r.get('/api/v1/reports/receivables', (ctx) => {
    const { db, today } = ctx;
    const { ids, props } = scope(ctx);
    const from = ctx.query.from || addMonths(monthStart(today), -2).slice(0, 7);
    const to = ctx.query.to || today.slice(0, 7);
    const months = monthsBetween(`${from}-01`, `${to}-01`).map((m) => m.slice(0, 7));
    const rows = [];
    for (const p of props) {
      for (const m of months) rows.push({ property: propertyRef(p), ...periodFinance(db, new Set([p.id]), m, today) });
    }
    return { from, to, rows, totals: months.map((m) => periodFinance(db, ids, m, today)), note: 'Theo kỳ hóa đơn: phải thu sau điều chỉnh, đã phân bổ (kể cả bù trừ cọc), còn nợ. Báo chuyển khoản chờ xác minh không được tính.' };
  }, { perm: 'reports.read' });

  r.get('/api/v1/reports/cash', (ctx) => {
    const { db } = ctx;
    const { ids } = scope(ctx);
    const from = ctx.query.from || `${ctx.today.slice(0, 7)}-01`;
    const to = ctx.query.to || ctx.today;
    const { receipts, reversals } = cashRows(db, ids, from, to, ctx);
    const days = {};
    const add = (date, field, amount) => {
      days[date] ||= { date, receipts: 0, toInvoices: 0, toDeposit: 0, unapplied: 0, corrections: 0, refunds: 0, net: 0 };
      days[date][field] += amount;
    };
    for (const p of receipts) {
      const d = instantToIsoDate(p.receivedAt);
      const pb = paymentBalance(db, p);
      const depositIn = db.depositEntries.filter((e) => e.paymentId === p.id && e.kind === 'receipt').reduce((s, e) => s + e.amount, 0);
      add(d, 'receipts', p.amount);
      add(d, 'toInvoices', pb.directInvoiceAmount);
      add(d, 'toDeposit', depositIn);
      add(d, 'unapplied', pb.unappliedAmount);
      add(d, 'net', p.amount);
    }
    for (const x of reversals) {
      const d = instantToIsoDate(x.occurredAt);
      add(d, x.kind === 'refund' ? 'refunds' : 'corrections', x.amount);
      add(d, 'net', -x.amount);
    }
    const rows = Object.values(days).sort((a, b) => compareIso(a.date, b.date));
    const totals = rows.reduce((acc, row) => {
      Object.keys(acc).forEach((k) => { acc[k] += row[k]; });
      return acc;
    }, { receipts: 0, toInvoices: 0, toDeposit: 0, unapplied: 0, corrections: 0, refunds: 0, net: 0 });
    return {
      from, to, rows, totals,
      transactions: [...receipts.map((p) => ({ kind: 'receipt', code: p.code, at: p.receivedAt, amount: p.amount, methodCode: p.methodCode, tenant: find(db.tenants, p.tenantId).fullName })),
        ...reversals.map((x) => ({ kind: x.kind, code: find(db.payments, x.paymentId).code, at: x.occurredAt, amount: -x.amount, methodCode: x.methodCode, tenant: find(db.tenants, find(db.payments, x.paymentId).tenantId).fullName }))]
        .sort((a, b) => compareIso(a.at, b.at)),
      note: 'Theo ngày giao dịch thực tế. Tiền nhận vào cọc tách riêng khỏi tiền vào hóa đơn; bù trừ cọc không phải tiền mặt mới nên không xuất hiện ở đây.',
    };
  }, { perm: 'reports.read' });

  r.get('/api/v1/reports/occupancy', (ctx) => {
    const { db, today } = ctx;
    const { ids, props } = scope(ctx);
    const from = ctx.query.from || addMonths(monthStart(today), -5).slice(0, 7);
    const to = ctx.query.to || today.slice(0, 7);
    const months = monthsBetween(`${from}-01`, `${to}-01`).map((m) => m.slice(0, 7));
    return {
      from, to,
      overall: months.map((m) => occupancyForMonth(db, ids, m, today)),
      byProperty: props.map((p) => ({ property: propertyRef(p), months: months.map((m) => occupancyForMonth(db, new Set([p.id]), m, today)) })),
      note: 'Lấp đầy lịch sử tính từ ngày nhận/trả thực tế của từng đợt thuê giao với tháng, không dùng trạng thái phòng hiện tại cho tháng cũ. Phòng ngừng khai thác hiện tại không tính vào mẫu số.',
    };
  }, { perm: 'reports.read' });

  r.get('/api/v1/reports/contracts', (ctx) => {
    const { db, today } = ctx;
    const { ids } = scope(ctx);
    const days = Number(ctx.query.days || 60);
    const all = db.contracts.filter((k) => ids.has(tenancyContext(db, k.tenancyId).property.id)).map((k) => contractSummary(db, k, today));
    return {
      days,
      expiring: all.filter((k) => k.status === 'active' && k.daysLeft != null && k.daysLeft <= days).sort((a, b) => a.daysLeft - b.daysLeft),
      expiredStillOccupied: all.filter((k) => k.stillOccupiedAfterExpiry),
    };
  }, { perm: 'reports.read' });

  r.get('/api/v1/reports/tenant-movement', (ctx) => {
    const { db, today } = ctx;
    const { ids } = scope(ctx);
    const from = ctx.query.from || addMonths(monthStart(today), -5).slice(0, 7);
    const to = ctx.query.to || today.slice(0, 7);
    const months = monthsBetween(`${from}-01`, `${to}-01`).map((m) => m.slice(0, 7));
    const tenancies = db.tenancies.filter(inScopeTenancy(db, ids));
    const transfers = db.roomTransfers.filter((x) => inScopeTenancy(db, ids)(find(db.tenancies, x.newTenancyId)));
    return {
      months: months.map((m) => ({
        month: m, label: monthLabel(`${m}-01`),
        moveIns: tenancies.filter((t) => t.actualMoveIn?.startsWith(m) && !transfers.some((x) => x.newTenancyId === t.id)).length,
        moveOuts: tenancies.filter((t) => t.actualMoveOut?.startsWith(m) && !transfers.some((x) => x.oldTenancyId === t.id)).length,
        transfers: transfers.filter((x) => x.transferOn.startsWith(m)).length,
      })),
    };
  }, { perm: 'reports.read' });

  r.get('/api/v1/reports/tickets', (ctx) => {
    const { db } = ctx;
    const { ids } = scope(ctx);
    const from = ctx.query.from || addMonths(monthStart(ctx.today), -2);
    const to = ctx.query.to || ctx.today;
    const tickets = db.tickets.filter((t) => ids.has(find(db.rooms, t.roomId).propertyId)).filter((t) => instantToIsoDate(t.createdAt) >= from && instantToIsoDate(t.createdAt) <= to);
    const resolved = tickets.filter((t) => t.resolvedAt);
    const hours = resolved.map((t) => (new Date(t.resolvedAt) - new Date(t.createdAt)) / 3600000);
    const group = (key) => Object.entries(tickets.reduce((acc, t) => {
      const k = key(t);
      acc[k] = (acc[k] || 0) + 1;
      return acc;
    }, {})).map(([k, v]) => ({ key: k, count: v }));
    return {
      from, to, total: tickets.length,
      byStatus: group((t) => t.status), byPriority: group((t) => t.priority), byCategory: group((t) => find(db.ticketCategories, t.categoryId)?.name || 'Khác'),
      averageResolutionHours: hours.length ? Math.round((hours.reduce((s, h) => s + h, 0) / hours.length) * 10) / 10 : null,
      slaMetRate: resolved.length ? Math.round((resolved.filter((t) => !t.dueAt || t.resolvedAt <= t.dueAt).length / resolved.length) * 1000) / 10 : null,
      openOverdue: tickets.filter((t) => isTicketOverdue(t, ctx.now)).length,
      note: 'SLA tính liên tục (24/7) theo cấu hình mặc định; tính theo giờ làm việc cần backend dùng lịch làm việc/ngày nghỉ.',
    };
  }, { perm: 'reports.read' });

  r.get('/api/v1/reports/deposits', (ctx) => {
    const { db } = ctx;
    const { ids } = scope(ctx);
    const from = ctx.query.from || `${ctx.today.slice(0, 7)}-01`;
    const to = ctx.query.to || ctx.today;
    const tenancies = db.tenancies.filter(inScopeTenancy(db, ids));
    const entries = db.depositEntries.filter((e) => tenancies.some((t) => t.id === e.tenancyId));
    const inRange = entries.filter((e) => instantToIsoDate(e.occurredAt) >= from && instantToIsoDate(e.occurredAt) <= to);
    const sum = (list, kind) => list.filter((e) => e.kind === kind).reduce((s, e) => s + e.amount, 0);
    const current = tenancies.filter((t) => ['active', 'planned'].includes(t.status));
    const required = current.reduce((s, t) => {
      const k = db.contracts.find((x) => x.tenancyId === t.id);
      const cs = k ? contractStatus(db, k, ctx.today) : null;
      return s + (cs?.currentVersion?.requiredDeposit || 0);
    }, 0);
    return {
      from, to,
      heldNow: current.reduce((s, t) => s + depositHeld(db, t.id), 0),
      heldEnded: tenancies.filter((t) => t.status === 'ended').reduce((s, t) => s + depositHeld(db, t.id), 0),
      requiredForCurrent: required,
      movements: { received: sum(inRange, 'receipt'), refunded: sum(inRange, 'refund'), offset: sum(inRange, 'offset'), transferredIn: sum(inRange, 'transfer_in'), transferredOut: sum(inRange, 'transfer_out'), reversals: inRange.filter((e) => e.kind === 'reversal').reduce((s, e) => s + depositSigned(db, e), 0) },
      note: 'Sổ cọc trình bày riêng với doanh thu. Mức cọc yêu cầu trên hợp đồng khác số cọc thực thu.',
    };
  }, { perm: 'reports.read' });

  r.get('/api/v1/reports/profit', (ctx) => {
    const { db } = ctx;
    const { ids } = scope(ctx);
    const from = ctx.query.from || `${ctx.today.slice(0, 7)}-01`;
    const to = ctx.query.to || ctx.today;
    const { receipts, reversals } = cashRows(db, ids, from, to, ctx);
    const invoiceCash = receipts.reduce((s, p) => s + paymentBalance(db, p).directInvoiceAmount, 0);
    const expenses = db.expenses.filter((e) => ids.has(e.propertyId) && e.incurredOn >= from && e.incurredOn <= to);
    const net = expenses.reduce((s, e) => s + (e.reversalOfId ? -e.amount : e.amount), 0);
    const byCategory = Object.values(expenses.reduce((acc, e) => {
      const c = find(db.expenseCategories, e.categoryId);
      acc[c.id] ||= { category: c.name, amount: 0 };
      acc[c.id].amount += e.reversalOfId ? -e.amount : e.amount;
      return acc;
    }, {}));
    return {
      from, to, method: 'cash_basis_simulated',
      income: { invoiceCash, correctionsAndRefunds: reversals.filter((x) => x.kind === 'correction').reduce((s, x) => s + x.amount, 0) },
      expenses: { total: net, byCategory },
      result: invoiceCash - net,
      note: 'Mô phỏng phân hệ mở rộng: thu = tiền thực nhận vào hóa đơn trong khoảng (không gồm cọc), chi = sổ chi phí đã ghi. Cách ghi nhận doanh thu/phân bổ chi phí cần chủ trọ chốt trước khi dùng thật.',
    };
  }, { perm: 'reports.read' });

  void allocationSigned;
  void daysInMonth;
  void invoiceTotal;
  void listResponse;
  void parseIsoDate;
  void vnDateTimeToInstant;
}
