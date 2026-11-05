using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using SmartRent.Api.Data;
using SmartRent.Api.Features.Billing;

namespace SmartRent.Api.Features.Invoices;

public sealed class PortalInvoicesService
{
    private readonly SmartRentDbContext _db;

    public PortalInvoicesService(SmartRentDbContext db)
    {
        _db = db;
    }

    public async Task<PortalInvoiceListResponse> ListAsync(
        Guid? currentUserId,
        PortalInvoiceListQuery query,
        CancellationToken cancellationToken = default)
    {
        var userId = await ResolveUserIdAsync(currentUserId, cancellationToken);

        var rawQuery = from i in _db.Invoices.AsNoTracking()
                       join b in _db.VInvoiceBalances.AsNoTracking() on i.Id equals b.InvoiceId into balances
                       from b in balances.DefaultIfEmpty()
                       where i.Tenancy.RepresentativeTenant.UserId == userId
                             && i.Status != "draft"
                             && i.Kind != "debit_adjustment"
                             && i.Kind != "credit_adjustment"
                       select new
                       {
                           Invoice = i,
                           Balance = b
                       };

        // 1. Áp dụng bộ lọc
        if (query.Status == "open")
        {
            rawQuery = rawQuery.Where(x =>
                x.Invoice.Status == "issued" && (x.Balance.OutstandingAmount ?? 0m) > 0m);
        }
        else if (!string.IsNullOrWhiteSpace(query.Status))
        {
            rawQuery = rawQuery.Where(x => x.Invoice.Status == query.Status);
        }

        if (!string.IsNullOrWhiteSpace(query.PaymentStatus))
        {
            rawQuery = rawQuery.Where(x =>
                x.Invoice.Status == "issued" && x.Balance.PaymentStatus == query.PaymentStatus);
        }

        if (query.HasPending == true)
        {
            rawQuery = rawQuery.Where(x =>
                x.Invoice.Payments.Any(p => p.Status == "pending"));
        }

        if (!string.IsNullOrWhiteSpace(query.Q))
        {
            var q = query.Q.Trim().ToLower();
            rawQuery = rawQuery.Where(x =>
                x.Invoice.Code != null &&
                x.Invoice.Code.ToLower().Contains(q) ||
                x.Invoice.Tenancy.Room.Code.ToLower().Contains(q));
        }

        // 2. Đếm tổng số bản ghi
        var totalItems = await rawQuery.CountAsync(cancellationToken);

        // 3. Sắp xếp
        var sort = string.IsNullOrWhiteSpace(query.Sort) ? "-serviceFrom" : query.Sort.Trim();
        var isDesc = sort.StartsWith('-');
        var sortField = isDesc ? sort[1..] : sort;

        rawQuery = sortField switch
        {
            "dueOn" => isDesc
                ? rawQuery.OrderByDescending(x => x.Invoice.DueOn).ThenByDescending(x => x.Invoice.Id)
                : rawQuery.OrderBy(x => x.Invoice.DueOn).ThenBy(x => x.Invoice.Id),

            "totalAmount" => isDesc
                ? rawQuery.OrderByDescending(x => x.Balance.ReceivableAmount).ThenByDescending(x => x.Invoice.Id)
                : rawQuery.OrderBy(x => x.Balance.ReceivableAmount).ThenBy(x => x.Invoice.Id),

            _ => isDesc
                ? rawQuery.OrderByDescending(x => x.Invoice.ServiceFrom).ThenByDescending(x => x.Invoice.Id)
                : rawQuery.OrderBy(x => x.Invoice.ServiceFrom).ThenBy(x => x.Invoice.Id)
        };

        // 4. Phân trang
        var page = query.Page < 1 ? 1 : query.Page;
        var pageSize = query.PageSize < 1 ? 12 : query.PageSize;
        var totalPages = (int)Math.Ceiling(totalItems / (double)pageSize);

        var projectedRows = await rawQuery
            .Skip((page - 1) * pageSize)
            .Take(pageSize)
            .Select(x => new
            {
                x.Invoice.Id,
                Code = x.Invoice.Code ?? string.Empty,
                x.Invoice.Kind,
                x.Invoice.Status,
                x.Invoice.TenancyId,
                RoomId = x.Invoice.Tenancy.Room.Id,
                RoomCode = x.Invoice.Tenancy.Room.Code,
                PropertyId = x.Invoice.Tenancy.Room.Property.Id,
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
                TotalAmount = x.Balance.ReceivableAmount ?? 0m,
                OriginalAmount = x.Balance.OriginalAmount ?? 0m,
                AdjustmentAmount = x.Balance.AdjustmentAmount ?? 0m,
                ReceivableAmount = x.Balance.ReceivableAmount ?? 0m,
                PaidAmount = x.Balance.PaidAmount ?? 0m,
                OutstandingAmount = x.Balance.OutstandingAmount ?? 0m,
                PaymentStatus = x.Balance.PaymentStatus ?? "unpaid",
                IsOverdue = x.Balance.IsOverdue ?? false,
                x.Invoice.OriginalInvoiceId,
                x.Invoice.CreatedAt,
                x.Invoice.VoidedAt,
                x.Invoice.VoidReason,
                PendingPaymentCount = x.Invoice.Payments.Count(p => p.Status == "pending"),
                PendingPaymentAmount = x.Invoice.Payments.Where(p => p.Status == "pending").Sum(p => (decimal?)p.Amount) ?? 0m
            })
            .ToListAsync(cancellationToken);

        // 5. Chuyển sang DTO
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var items = new List<InvoiceListItemDto>();

        foreach (var row in projectedRows)
        {
            var isOverdue = row.IsOverdue;
            var daysOverdue = 0;
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
                row.TotalAmount,
                row.OriginalAmount,
                row.AdjustmentAmount,
                row.ReceivableAmount,
                row.PaidAmount,
                row.OutstandingAmount,
                row.PaymentStatus,
                isOverdue,
                daysOverdue,
                row.OriginalInvoiceId,
                Array.Empty<ProblemDto>(),
                false,
                row.CreatedAt,
                row.VoidedAt,
                row.VoidReason,
                row.PendingPaymentCount,
                row.PendingPaymentAmount
            ));
        }

        return new PortalInvoiceListResponse(items, totalItems, page, pageSize, totalPages);
    }

    private async Task<Guid> ResolveUserIdAsync(Guid? currentUserId, CancellationToken cancellationToken)
    {
        if (currentUserId.HasValue) return currentUserId.Value;

        var demoUser = await _db.Users.FirstOrDefaultAsync(u => u.Email == "an.khachthue@example.com", cancellationToken);
        return demoUser?.Id ?? Guid.Parse("7fd0aeac-546d-4fca-abc2-9f328d524203");
    }
}