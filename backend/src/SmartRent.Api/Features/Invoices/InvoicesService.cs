using Microsoft.EntityFrameworkCore;
using SmartRent.Api.Data;
using SmartRent.Api.Features.Billing;

namespace SmartRent.Api.Features.Invoices;

public sealed class InvoicesService
{
    private readonly SmartRentDbContext _db;

    public InvoicesService(SmartRentDbContext db)
    {
        _db = db;
    }

    public async Task<InvoiceListResponse> ListAsync(
        InvoiceListQuery query,
        CancellationToken cancellationToken = default)
    {
        var rawQuery = from i in _db.Invoices.AsNoTracking()
                       join b in _db.VInvoiceBalances.AsNoTracking() on i.Id equals b.InvoiceId into balances
                       from b in balances.DefaultIfEmpty()
                       select new
                       {
                           Invoice = i,
                           Balance = b
                       };

        if (query.PropertyId.HasValue)
        {
            rawQuery = rawQuery.Where(x => x.Invoice.Tenancy.Room.PropertyId == query.PropertyId.Value);
        }

        if (!string.IsNullOrWhiteSpace(query.Status))
        {
            rawQuery = rawQuery.Where(x => x.Invoice.Status == query.Status);
        }

        if (!string.IsNullOrWhiteSpace(query.Kind))
        {
            if (query.Kind == "adjustment")
            {
                rawQuery = rawQuery.Where(x => x.Invoice.Kind == "debit_adjustment" || x.Invoice.Kind == "credit_adjustment");
            }
            else
            {
                rawQuery = rawQuery.Where(x => x.Invoice.Kind == query.Kind);
            }
        }

        if (!string.IsNullOrWhiteSpace(query.PaymentStatus))
        {
            rawQuery = rawQuery.Where(x => x.Invoice.Status == "issued" && x.Balance.PaymentStatus == query.PaymentStatus);
        }

        if (query.Outstanding == true)
        {
            rawQuery = rawQuery.Where(x => x.Invoice.Status == "issued" && (x.Balance.OutstandingAmount ?? 0) > 0);
        }

        if (query.Overdue == true)
        {
            rawQuery = rawQuery.Where(x => x.Invoice.Status == "issued" && (x.Balance.IsOverdue ?? false));
        }

        if (query.HasPending == true)
        {
            rawQuery = rawQuery.Where(x => x.Invoice.Payments.Any(p => p.Status == "pending"));
        }

        if (!string.IsNullOrWhiteSpace(query.PeriodMonth))
        {
            var ym = query.PeriodMonth.Trim();
            if (DateOnly.TryParseExact(ym + "-01", "yyyy-MM-dd", out var startOfMonth))
            {
                var nextMonth = startOfMonth.AddMonths(1);
                rawQuery = rawQuery.Where(x =>
                    (x.Invoice.BillingPeriod != null && x.Invoice.BillingPeriod.MonthStart == startOfMonth) ||
                    (x.Invoice.BillingPeriod == null && x.Invoice.ServiceFrom >= startOfMonth && x.Invoice.ServiceFrom < nextMonth));
            }
        }

        if (query.PeriodId.HasValue)
        {
            rawQuery = rawQuery.Where(x => x.Invoice.BillingPeriodId == query.PeriodId.Value);
        }

        if (query.TenancyId.HasValue)
        {
            rawQuery = rawQuery.Where(x => x.Invoice.TenancyId == query.TenancyId.Value);
        }

        if (query.TenantId.HasValue)
        {
            rawQuery = rawQuery.Where(x => x.Invoice.Tenancy.RepresentativeTenantId == query.TenantId.Value);
        }

        if (query.RoomId.HasValue)
        {
            rawQuery = rawQuery.Where(x => x.Invoice.Tenancy.RoomId == query.RoomId.Value);
        }

        if (query.DueFrom.HasValue)
        {
            rawQuery = rawQuery.Where(x => x.Invoice.DueOn >= query.DueFrom.Value);
        }

        if (query.DueTo.HasValue)
        {
            rawQuery = rawQuery.Where(x => x.Invoice.DueOn <= query.DueTo.Value);
        }

        if (query.IssuedFrom.HasValue)
        {
            rawQuery = rawQuery.Where(x => x.Invoice.IssuedOn >= query.IssuedFrom.Value);
        }

        if (query.IssuedTo.HasValue)
        {
            rawQuery = rawQuery.Where(x => x.Invoice.IssuedOn <= query.IssuedTo.Value);
        }

        if (!string.IsNullOrWhiteSpace(query.Q))
        {
            var kw = query.Q.Trim().ToLower();
            rawQuery = rawQuery.Where(x => (x.Invoice.Code != null && x.Invoice.Code.ToLower().Contains(kw)) ||
                                           x.Invoice.Tenancy.Room.Code.ToLower().Contains(kw) ||
                                           x.Invoice.Tenancy.RepresentativeTenant.FullName.ToLower().Contains(kw) ||
                                           x.Invoice.Tenancy.RepresentativeTenant.Code.ToLower().Contains(kw));
        }

        var allFilteredList = await rawQuery
            .Select(x => new
            {
                x.Invoice.Id,
                x.Invoice.Status,
                x.Invoice.Kind,
                Receivable = x.Balance.ReceivableAmount ?? 0,
                Paid = x.Balance.PaidAmount ?? 0,
                Outstanding = x.Balance.OutstandingAmount ?? 0,
                IsOverdue = x.Balance.IsOverdue ?? false,
                PendingAmount = x.Invoice.Payments.Where(p => p.Status == "pending").Sum(p => (decimal?)p.Amount) ?? 0
            })
            .ToListAsync(cancellationToken);

        var effectiveForSummary = allFilteredList
            .Where(x => x.Status == "issued" && x.Kind != "debit_adjustment" && x.Kind != "credit_adjustment")
            .ToList();

        var summary = new InvoiceListSummaryDto(
            effectiveForSummary.Count,
            effectiveForSummary.Sum(x => x.Receivable),
            effectiveForSummary.Sum(x => x.Paid),
            effectiveForSummary.Sum(x => x.Outstanding),
            effectiveForSummary.Where(x => x.IsOverdue).Sum(x => x.Outstanding),
            effectiveForSummary.Count(x => x.IsOverdue),
            allFilteredList.Sum(x => x.PendingAmount)
        );

        var totalItems = allFilteredList.Count;
        var page = query.Page <= 0 ? 1 : query.Page;
        var pageSize = query.PageSize <= 0 ? 20 : (query.PageSize > 200 ? 200 : query.PageSize);
        var totalPages = (int)Math.Ceiling(totalItems / (double)pageSize);

        var sort = query.Sort ?? "-serviceFrom";
        var isDesc = sort.StartsWith('-');
        var sortField = isDesc ? sort[1..] : sort;

        rawQuery = sortField switch
        {
            "code" => isDesc ? rawQuery.OrderByDescending(x => x.Invoice.Code).ThenBy(x => x.Invoice.Id) : rawQuery.OrderBy(x => x.Invoice.Code).ThenBy(x => x.Invoice.Id),
            "issuedOn" => isDesc ? rawQuery.OrderByDescending(x => x.Invoice.IssuedOn).ThenBy(x => x.Invoice.Id) : rawQuery.OrderBy(x => x.Invoice.IssuedOn).ThenBy(x => x.Invoice.Id),
            "dueOn" => isDesc ? rawQuery.OrderByDescending(x => x.Invoice.DueOn).ThenBy(x => x.Invoice.Id) : rawQuery.OrderBy(x => x.Invoice.DueOn).ThenBy(x => x.Invoice.Id),
            "totalAmount" => isDesc ? rawQuery.OrderByDescending(x => x.Balance.ReceivableAmount).ThenBy(x => x.Invoice.Id) : rawQuery.OrderBy(x => x.Balance.ReceivableAmount).ThenBy(x => x.Invoice.Id),
            "outstandingAmount" => isDesc ? rawQuery.OrderByDescending(x => x.Balance.OutstandingAmount).ThenBy(x => x.Invoice.Id) : rawQuery.OrderBy(x => x.Balance.OutstandingAmount).ThenBy(x => x.Invoice.Id),
            "room.code" => isDesc ? rawQuery.OrderByDescending(x => x.Invoice.Tenancy.Room.Code).ThenBy(x => x.Invoice.Id) : rawQuery.OrderBy(x => x.Invoice.Tenancy.Room.Code).ThenBy(x => x.Invoice.Id),
            "representative.fullName" => isDesc ? rawQuery.OrderByDescending(x => x.Invoice.Tenancy.RepresentativeTenant.FullName).ThenBy(x => x.Invoice.Id) : rawQuery.OrderBy(x => x.Invoice.Tenancy.RepresentativeTenant.FullName).ThenBy(x => x.Invoice.Id),
            _ => isDesc ? rawQuery.OrderByDescending(x => x.Invoice.ServiceFrom).ThenBy(x => x.Invoice.Id) : rawQuery.OrderBy(x => x.Invoice.ServiceFrom).ThenBy(x => x.Invoice.Id)
        };

        var projectedRows = await rawQuery
            .Select(x => new
            {
                x.Invoice.Id,
                Code = x.Invoice.Code ?? string.Empty,
                x.Invoice.Kind,
                x.Invoice.Status,
                x.Invoice.TenancyId,
                RoomId = x.Invoice.Tenancy.Room.Id,
                RoomCode = x.Invoice.Tenancy.Room.Code,
                PropertyId = x.Invoice.Tenancy.Room.PropertyId,
                PropertyName = x.Invoice.Tenancy.Room.Property.Name,
                PropertyCode = x.Invoice.Tenancy.Room.Property.Code,
                TenantId = x.Invoice.Tenancy.RepresentativeTenant.Id,
                TenantFullName = x.Invoice.Tenancy.RepresentativeTenant.FullName,
                TenantPhone = x.Invoice.Tenancy.RepresentativeTenant.Phone,
                BillingPeriodId = x.Invoice.BillingPeriodId,
                BillingPeriodMonthStart = x.Invoice.BillingPeriod != null ? x.Invoice.BillingPeriod.MonthStart : (DateOnly?)null,
                x.Invoice.ServiceFrom,
                x.Invoice.ServiceTo,
                x.Invoice.IssuedOn,
                x.Invoice.DueOn,
                x.Invoice.OriginalInvoiceId,
                x.Invoice.NeedsRecompute,
                x.Invoice.CreatedAt,
                x.Invoice.VoidedAt,
                x.Invoice.VoidReason,
                OriginalAmount = x.Balance.OriginalAmount ?? 0,
                AdjustmentAmount = x.Balance.AdjustmentAmount ?? 0,
                ReceivableAmount = x.Balance.ReceivableAmount ?? 0,
                PaidAmount = x.Balance.PaidAmount ?? 0,
                OutstandingAmount = x.Balance.OutstandingAmount ?? 0,
                PaymentStatus = x.Balance.PaymentStatus ?? "unpaid",
                IsOverdue = x.Balance.IsOverdue ?? false,
                PendingCount = x.Invoice.Payments.Count(p => p.Status == "pending"),
                PendingAmount = x.Invoice.Payments.Where(p => p.Status == "pending").Sum(p => (decimal?)p.Amount) ?? 0
            })
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .ToListAsync(cancellationToken);

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var items = new List<InvoiceListItemDto>();

        foreach (var row in projectedRows)
        {
            var isOverdue = row.IsOverdue;
            int daysOverdue = 0;
            if (isOverdue && row.DueOn.HasValue && today > row.DueOn.Value)
            {
                daysOverdue = today.DayNumber - row.DueOn.Value.DayNumber;
            }

            var periodRef = row.BillingPeriodId.HasValue && row.BillingPeriodMonthStart.HasValue
                ? new BillingPeriodRefDto(
                    row.BillingPeriodId.Value,
                    row.BillingPeriodMonthStart.Value,
                    $"Tháng {row.BillingPeriodMonthStart.Value.Month}/{row.BillingPeriodMonthStart.Value.Year}")
                : null;

            items.Add(new InvoiceListItemDto(
                row.Id,
                row.Code,
                row.Kind,
                row.Status,
                row.TenancyId,
                new RoomRefDto(row.RoomId, row.RoomCode, row.PropertyId),
                new PropertyRefDto(row.PropertyId, row.PropertyName, row.PropertyCode),
                new TenantBriefDto(row.TenantId, row.TenantFullName, row.TenantPhone),
                periodRef,
                row.ServiceFrom,
                row.ServiceTo,
                row.IssuedOn,
                row.DueOn,
                row.ReceivableAmount,
                row.OriginalAmount,
                row.AdjustmentAmount,
                row.ReceivableAmount,
                row.PaidAmount,
                row.OutstandingAmount,
                row.PaymentStatus,
                isOverdue,
                daysOverdue,
                row.OriginalInvoiceId,
                new List<ProblemDto>(),
                row.NeedsRecompute,
                row.CreatedAt,
                row.VoidedAt,
                row.VoidReason,
                row.PendingCount,
                row.PendingAmount
            ));
        }

        return new InvoiceListResponse(
            items,
            totalItems,
            page,
            pageSize,
            totalPages,
            summary
        );
    }

    public async Task<InvoiceDetailDto?> GetAsync(
        Guid invoiceId,
        CancellationToken cancellationToken = default)
    {
        var inv = await _db.Invoices.AsNoTracking()
            .Include(i => i.Tenancy.Room.Property)
            .Include(i => i.Tenancy.RepresentativeTenant)
            .Include(i => i.BillingPeriod)
            .Include(i => i.CreatedByNavigation)
            .Include(i => i.IssuedByNavigation)
            .Include(i => i.VoidedByNavigation)
            .Include(i => i.InvoiceLines)
                .ThenInclude(l => l.ChargeType)
            .Include(i => i.InvoiceLines)
                .ThenInclude(l => l.InvoiceMeterSegments)
                    .ThenInclude(s => s.FromReading)
                        .ThenInclude(r => r.Meter)
            .Include(i => i.InvoiceLines)
                .ThenInclude(l => l.InvoiceMeterSegments)
                    .ThenInclude(s => s.ToReading)
            .Include(i => i.PaymentAllocations)
                .ThenInclude(a => a.Payment)
            .Include(i => i.PaymentAllocations)
                .ThenInclude(a => a.DepositEntry)
                    .ThenInclude(d => d!.Payment)
            .Include(i => i.PaymentAllocations)
                .ThenInclude(a => a.AllocatedByNavigation)
            .Include(i => i.PaymentAllocations)
                .ThenInclude(a => a.InverseReverses)
            .Include(i => i.Payments)
            .FirstOrDefaultAsync(i => i.Id == invoiceId, cancellationToken);

        if (inv == null)
        {
            return null;
        }

        var tenancy = inv.Tenancy;
        var room = tenancy?.Room;
        var property = room?.Property;
        var representative = tenancy?.RepresentativeTenant;

        if (tenancy == null || room == null || property == null || representative == null)
        {
            return null;
        }

        var totalRow = await _db.VInvoiceTotals.AsNoTracking()
            .FirstOrDefaultAsync(t => t.InvoiceId == invoiceId, cancellationToken);

        var balRow = await _db.VInvoiceBalances.AsNoTracking()
            .FirstOrDefaultAsync(b => b.InvoiceId == invoiceId, cancellationToken);

        var totalAmount = totalRow?.Amount ?? balRow?.OriginalAmount ?? 0;
        var originalAmount = balRow?.OriginalAmount ?? totalAmount;
        var adjustmentAmount = balRow?.AdjustmentAmount ?? 0;
        var receivableAmount = balRow?.ReceivableAmount ?? originalAmount;
        var paidAmount = balRow?.PaidAmount ?? 0;
        var outstandingAmount = balRow?.OutstandingAmount ?? (inv.Status == "issued" ? receivableAmount : 0);
        var paymentStatus = balRow?.PaymentStatus ?? (inv.Status == "issued" ? "unpaid" : "unpaid");
        var isOverdue = balRow?.IsOverdue ?? false;

        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var daysOverdue = 0;
        if (isOverdue && inv.DueOn.HasValue && today > inv.DueOn.Value)
        {
            daysOverdue = today.DayNumber - inv.DueOn.Value.DayNumber;
        }

        var roomDto = new InvoiceRoomRefDto(
            room.Id,
            room.Code,
            room.Code,
            room.PropertyId,
            property.Name,
            property.Code);

        var propertyDto = new PropertyRefDto(
            property.Id,
            property.Name,
            property.Code);

        var representativeDto = new TenantBriefDto(
            representative.Id,
            representative.FullName,
            representative.Phone);

        var periodDto = inv.BillingPeriod != null
            ? new InvoicePeriodDetailDto(
                inv.BillingPeriod.Id,
                inv.BillingPeriod.MonthStart,
                inv.BillingPeriod.Status,
                $"Tháng {inv.BillingPeriod.MonthStart.Month}/{inv.BillingPeriod.MonthStart.Year}")
            : null;

        var lines = new List<InvoiceLineDto>();
        var meterSegments = new List<InvoiceMeterSegmentDto>();

        foreach (var l in inv.InvoiceLines.OrderBy(x => x.LineNo))
        {
            var denom = l.ProrationDenominator <= 0 ? 1 : l.ProrationDenominator;
            var num = l.ProrationNumerator <= 0 ? 1 : l.ProrationNumerator;
            var lineAmount = l.Sign * Math.Round(
                l.Quantity * l.UnitPrice * num / (decimal)denom,
                0,
                MidpointRounding.AwayFromZero);

            var chargeTypeDto = l.ChargeType != null
                ? new ChargeTypeBriefDto(
                    l.ChargeType.Id,
                    l.ChargeType.Code,
                    l.ChargeType.Name,
                    l.ChargeType.Category,
                    l.ChargeType.UnitLabel)
                : null;

            lines.Add(new InvoiceLineDto(
                l.Id,
                l.LineNo,
                chargeTypeDto,
                l.DescriptionSnapshot,
                l.UnitSnapshot,
                l.Quantity,
                l.UnitPrice,
                l.Sign,
                l.ProrationNumerator,
                l.ProrationDenominator,
                lineAmount,
                l.SourceScope ?? "manual",
                l.SourceRateId,
                l.ChargeInstanceId.HasValue,
                l.SourceScope == "manual"));

            foreach (var seg in l.InvoiceMeterSegments)
            {
                var meter = seg.FromReading?.Meter;
                var startVal = seg.FromReading?.ReadingValue ?? 0;
                var endVal = seg.ToReading?.ReadingValue ?? 0;
                meterSegments.Add(new InvoiceMeterSegmentDto(
                    l.Id,
                    meter?.Id ?? Guid.Empty,
                    seg.FromReadingId,
                    seg.ToReadingId,
                    startVal,
                    endVal,
                    meter?.MeterKind ?? "meter",
                    meter?.SerialNumber ?? string.Empty,
                    endVal - startVal));
            }
        }

        var allocations = new List<InvoiceAllocationDto>();
        foreach (var a in inv.PaymentAllocations.OrderBy(x => x.AllocatedAt))
        {
            var paymentObj = a.Payment ?? a.DepositEntry?.Payment;
            var pBrief = paymentObj != null
                ? new InvoiceAllocationPaymentDto(paymentObj.Id, paymentObj.Code, paymentObj.MethodCode, paymentObj.ReceivedAt)
                : null;

            var revAmt = a.InverseReverses.Sum(x => x.Amount);
            var allocUser = a.AllocatedByNavigation != null
                ? new InvoiceUserRefDto(a.AllocatedByNavigation.Id, a.AllocatedByNavigation.DisplayName)
                : null;

            allocations.Add(new InvoiceAllocationDto(
                a.Id,
                a.Kind,
                a.Amount,
                a.PaymentId.HasValue ? "payment" : "deposit_offset",
                a.ReversesId,
                revAmt,
                pBrief,
                a.AllocatedAt,
                allocUser,
                a.Reason));
        }

        var pendingPayments = inv.Payments
            .Where(p => p.Status == "pending")
            .OrderBy(p => p.ReceivedAt)
            .Select(p => new InvoicePendingPaymentDto(p.Id, p.Code, p.Amount, p.ReceivedAt))
            .ToList();

        var createdByDto = inv.CreatedByNavigation != null
            ? new InvoiceUserRefDto(inv.CreatedByNavigation.Id, inv.CreatedByNavigation.DisplayName)
            : new InvoiceUserRefDto(inv.CreatedBy, "Hệ thống");

        var issuedByDto = inv.IssuedByNavigation != null
            ? new InvoiceUserRefDto(inv.IssuedByNavigation.Id, inv.IssuedByNavigation.DisplayName)
            : null;

        var voidedByDto = inv.VoidedByNavigation != null
            ? new InvoiceUserRefDto(inv.VoidedByNavigation.Id, inv.VoidedByNavigation.DisplayName)
            : null;

        return new InvoiceDetailDto(
            inv.Id,
            inv.Code,
            inv.Kind,
            inv.Status,
            inv.TenancyId,
            roomDto,
            propertyDto,
            representativeDto,
            periodDto,
            inv.ServiceFrom,
            inv.ServiceTo,
            inv.IssuedOn,
            inv.DueOn,
            totalAmount,
            originalAmount,
            adjustmentAmount,
            receivableAmount,
            paidAmount,
            outstandingAmount,
            paymentStatus,
            isOverdue,
            daysOverdue,
            inv.OriginalInvoiceId,
            new List<ProblemDto>(),
            inv.NeedsRecompute,
            inv.CreatedAt,
            inv.VoidedAt,
            inv.VoidReason,
            inv.Notes,
            inv.IssuedAt,
            issuedByDto,
            voidedByDto,
            createdByDto,
            lines,
            meterSegments,
            allocations,
            new List<InvoiceListItemDto>(),
            null,
            pendingPayments,
            new List<InvoiceDeliveryDto>()
        );
    }

    public async Task<(bool Success, int StatusCode, string? Error, InvoiceDetailDto? Result)> IssueAsync(
        Guid invoiceId,
        CancellationToken cancellationToken = default)
    {
        var inv = await _db.Invoices
            .Include(i => i.Tenancy.Room.Property)
            .Include(i => i.BillingPeriod)
            .FirstOrDefaultAsync(i => i.Id == invoiceId, cancellationToken);

        if (inv == null) return (false, 404, "Không tìm thấy hóa đơn.", null);
        if (inv.Status == "issued") return (true, 200, null, await GetAsync(invoiceId, cancellationToken));
        if (inv.Status != "draft") return (false, 409, "Hóa đơn không ở trạng thái nháp.", null);
        if (inv.BillingPeriod != null && inv.BillingPeriod.Status == "locked")
        {
            return (false, 409, "Kỳ tính tiền đã bị khóa.", null);
        }

        var seq = await GetNextDocumentNoAsync(inv.Tenancy.Room.Property.OrganizationId, "HD", cancellationToken);
        var ym = inv.BillingPeriod != null ? inv.BillingPeriod.MonthStart.ToString("yyMM") : inv.ServiceFrom.ToString("yyMM");
        inv.Code = $"HD-{inv.Tenancy.Room.Property.Code}{ym}-{seq:D3}";
        inv.Status = "issued";
        inv.IssuedOn = DateOnly.FromDateTime(DateTime.UtcNow);
        inv.IssuedAt = DateTime.UtcNow;
        inv.DueOn ??= inv.IssuedOn.Value.AddDays(7);

        await _db.SaveChangesAsync(cancellationToken);
        var detail = await GetAsync(invoiceId, cancellationToken);
        return (true, 200, null, detail);
    }

    public async Task<(bool Success, int StatusCode, string? Error, InvoiceDetailDto? Result)> RecomputeAsync(
        Guid invoiceId,
        CancellationToken cancellationToken = default)
    {
        var inv = await _db.Invoices.FirstOrDefaultAsync(i => i.Id == invoiceId, cancellationToken);
        if (inv == null) return (false, 404, "Không tìm thấy hóa đơn.", null);
        if (inv.Status != "draft") return (false, 409, "Chỉ có thể tính lại hóa đơn nháp.", null);

        inv.NeedsRecompute = false;
        await _db.SaveChangesAsync(cancellationToken);

        var detail = await GetAsync(invoiceId, cancellationToken);
        return (true, 200, null, detail);
    }

    public async Task<(bool Success, int StatusCode, string? Error)> DeleteDraftAsync(
        Guid invoiceId,
        CancellationToken cancellationToken = default)
    {
        var inv = await _db.Invoices
            .Include(i => i.InvoiceLines)
                .ThenInclude(l => l.InvoiceMeterSegments)
            .FirstOrDefaultAsync(i => i.Id == invoiceId, cancellationToken);

        if (inv == null) return (false, 404, "Không tìm thấy hóa đơn.");
        if (inv.Status != "draft") return (false, 409, "Chỉ được phép xóa hóa đơn nháp.");

        _db.Invoices.Remove(inv);
        await _db.SaveChangesAsync(cancellationToken);
        return (true, 204, null);
    }

    public async Task<(bool Success, int StatusCode, string? Error, InvoiceDetailDto? Result)> VoidAsync(
        Guid invoiceId,
        string reason,
        CancellationToken cancellationToken = default)
    {
        var inv = await _db.Invoices
            .Include(i => i.PaymentAllocations)
                .ThenInclude(a => a.InverseReverses)
            .FirstOrDefaultAsync(i => i.Id == invoiceId, cancellationToken);

        if (inv == null) return (false, 404, "Không tìm thấy hóa đơn.", null);
        if (inv.Status != "issued") return (false, 409, "Chỉ được phép hủy hóa đơn đã phát hành.", null);

        var activeAllocations = inv.PaymentAllocations
            .Where(a => a.Kind == "apply" && a.Amount > a.InverseReverses.Sum(r => r.Amount))
            .ToList();

        if (activeAllocations.Count > 0)
        {
            return (false, 409, "Hóa đơn còn khoản thanh toán chưa hoàn tác. Hãy hoàn tác trước khi hủy.", null);
        }

        inv.Status = "void";
        inv.VoidedAt = DateTime.UtcNow;
        inv.VoidReason = string.IsNullOrWhiteSpace(reason) ? "Không có lý do" : reason.Trim();

        await _db.SaveChangesAsync(cancellationToken);
        var detail = await GetAsync(invoiceId, cancellationToken);
        return (true, 200, null, detail);
    }

    private async Task<long> GetNextDocumentNoAsync(Guid organizationId, string series, CancellationToken cancellationToken)
    {
        var connection = _db.Database.GetDbConnection();
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT smartrent.next_document_no(@organizationId, @series)";

        var pOrg = command.CreateParameter();
        pOrg.ParameterName = "@organizationId";
        pOrg.Value = organizationId;
        command.Parameters.Add(pOrg);

        var pSeries = command.CreateParameter();
        pSeries.ParameterName = "@series";
        pSeries.Value = series;
        command.Parameters.Add(pSeries);

        if (connection.State != System.Data.ConnectionState.Open)
        {
            await connection.OpenAsync(cancellationToken);
        }

        var result = await command.ExecuteScalarAsync(cancellationToken);
        return Convert.ToInt64(result);
    }
}