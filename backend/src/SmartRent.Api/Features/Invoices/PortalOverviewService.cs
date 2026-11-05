using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using SmartRent.Api.Data;
using SmartRent.Api.Features.Billing;

namespace SmartRent.Api.Features.Invoices;

public sealed class PortalOverviewService
{
    private readonly SmartRentDbContext _db;

    public PortalOverviewService(SmartRentDbContext db)
    {
        _db = db;
    }

    public async Task<PortalOverviewDto> GetOverviewAsync(
        Guid? currentUserId,
        CancellationToken cancellationToken = default)
    {
        var userId = await ResolveUserIdAsync(currentUserId, cancellationToken);

        // 1. Lấy hồ sơ khách thuê của user
        var tenants = await _db.Tenants.AsNoTracking()
            .Where(t => t.UserId == userId)
            .ToListAsync(cancellationToken);

        var fullName = tenants.FirstOrDefault()?.FullName ?? "Khách thuê";
        var tenantIds = tenants.Select(t => t.Id).ToList();

        // 2. Tìm các đợt thuê mà khách làm người đại diện (có nghĩa vụ tài chính)
        var repTenancies = await _db.Tenancies.AsNoTracking()
            .Include(t => t.Room).ThenInclude(r => r.Property)
            .Include(t => t.RepresentativeTenant)
            .Where(t => t.RepresentativeTenant.UserId == userId)
            .ToListAsync(cancellationToken);

        var repTenancyIds = repTenancies.Select(t => t.Id).ToHashSet();

        // 3. Danh sách đợt thuê hiện tại (đại diện hoặc ở cùng) cho PortalTenancyListItemDto
        var activeTenancies = await _db.Tenancies.AsNoTracking()
            .Include(t => t.Room).ThenInclude(r => r.Property)
            .Include(t => t.RepresentativeTenant)
            .Where(t => (t.RepresentativeTenant.UserId == userId || t.TenancyResidents.Any(r => r.Tenant.UserId == userId))
                        && (t.Status == "active" || t.Status == "planned"))
            .ToListAsync(cancellationToken);

        var tenancyDtos = activeTenancies.Select(t =>
        {
            var isRep = t.RepresentativeTenant.UserId == userId;
            return new PortalTenancyListItemDto(
                t.Id,
                isRep ? "representative" : "resident",
                t.Status,
                new RoomRefDto(t.Room.Id, t.Room.Code, t.Room.PropertyId),
                new PropertyRefDto(t.Room.Property.Id, t.Room.Property.Name, t.Room.Property.Code),
                new TenantBriefDto(t.RepresentativeTenant.Id, t.RepresentativeTenant.FullName, t.RepresentativeTenant.Phone),
                t.PlannedMoveIn,
                t.ActualMoveIn,
                t.ActualMoveOut,
                null,
                null,
                0m,
                null,
                0m,
                isRep // Chỉ người đại diện mới xem được tài chính
            );
        }).ToList();

        // 4. Lấy các hóa đơn còn nợ (openInvoices)
        var openInvoicesRaw = await (from i in _db.Invoices.AsNoTracking()
                                     join b in _db.VInvoiceBalances.AsNoTracking() on i.Id equals b.InvoiceId into balances
                                     from b in balances.DefaultIfEmpty()
                                     where repTenancyIds.Contains(i.TenancyId)
                                           && i.Status == "issued"
                                           && i.Kind != "debit_adjustment"
                                           && i.Kind != "credit_adjustment"
                                           && (b.OutstandingAmount ?? 0m) > 0m
                                     select new
                                     {
                                         Invoice = i,
                                         Balance = b
                                     })
                                     .OrderBy(x => x.Invoice.DueOn)
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

        // 5. Tính toán tổng nợ và nợ quá hạn
        var outstandingTotal = openInvoicesRaw.Sum(x => x.OutstandingAmount);
        var overdueTotal = openInvoicesRaw
            .Where(x => x.IsOverdue)
            .Sum(x => x.OutstandingAmount);

        // 6. Chuyển openInvoices sang DTO
        var today = DateOnly.FromDateTime(DateTime.UtcNow);
        var openInvoices = new List<InvoiceListItemDto>();

        foreach (var row in openInvoicesRaw)
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

            openInvoices.Add(new InvoiceListItemDto(
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

        // 7. Lấy các khoản báo chuyển khoản đang chờ duyệt (pendingPayments)
        var pendingPayments = await _db.Payments.AsNoTracking()
            .Where(p => tenantIds.Contains(p.TenantId) && p.Status == "pending")
            .OrderByDescending(p => p.ReceivedAt)
            .Select(p => new PortalPendingPaymentDto(
                p.Id,
                p.Code,
                p.Amount,
                p.ReceivedAt,
                p.MethodCode,
                p.Status,
                p.ExternalReference,
                p.Notes
            ))
            .ToListAsync(cancellationToken);

        // 8. Đếm ticket, yêu cầu và thông báo chưa đọc
        var openTickets = await _db.Tickets.AsNoTracking()
            .Where(t => t.ReportedBy == userId && t.Status != "closed")
            .OrderByDescending(t => t.CreatedAt)
            .Select(t => new PortalTicketListItemDto(
                t.Id,
                t.Code,
                t.Title,
                t.Status,
                t.Priority,
                t.CreatedAt
            ))
            .ToListAsync(cancellationToken);

        var pendingRequests = await _db.TenancyRequests.AsNoTracking()
            .CountAsync(r => repTenancyIds.Contains(r.TenancyId) && r.Status == "pending", cancellationToken);

        var unreadNotifications = await _db.Notifications.AsNoTracking()
            .CountAsync(n => n.RecipientId == userId && n.ReadAt == null, cancellationToken);

        return new PortalOverviewDto(
            fullName,
            tenancyDtos,
            repTenancyIds.Count > 0,
            openInvoices,
            outstandingTotal,
            overdueTotal,
            pendingPayments,
            openTickets,
            pendingRequests,
            unreadNotifications
        );
    }

    private async Task<Guid> ResolveUserIdAsync(Guid? currentUserId, CancellationToken cancellationToken)
    {
        if (currentUserId.HasValue) return currentUserId.Value;

        var demoUser = await _db.Users.FirstOrDefaultAsync(u => u.Email == "an.khachthue@example.com", cancellationToken);
        return demoUser?.Id ?? Guid.Parse("7fd0aeac-546d-4fca-abc2-9f328d524203");
    }
}