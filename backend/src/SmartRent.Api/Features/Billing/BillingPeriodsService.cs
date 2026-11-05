using Microsoft.EntityFrameworkCore;
using Npgsql;
using SmartRent.Api.Data;
using SmartRent.Api.Data.Entities;

namespace SmartRent.Api.Features.Billing;

public sealed record BillingPeriodListResponse(IReadOnlyList<BillingPeriodListItemDto> Items);

public sealed class BillingPeriodsService
{
    private readonly SmartRentDbContext _db;

    public BillingPeriodsService(SmartRentDbContext db)
    {
        _db = db;
    }

    public async Task<BillingPeriodListResponse> ListAsync(
        Guid propertyId,
        int pageSize = 60,
        CancellationToken cancellationToken = default)
    {
        var periods = await _db.BillingPeriods
            .Include(p => p.Property)
            .Include(p => p.LockedByNavigation)
            .Where(p => p.PropertyId == propertyId)
            .OrderByDescending(p => p.MonthStart)
            .Take(pageSize)
            .ToListAsync(cancellationToken);

        var items = new List<BillingPeriodListItemDto>();

        foreach (var period in periods)
        {
            var stats = await ComputePeriodStatsAsync(period, cancellationToken);

            items.Add(new BillingPeriodListItemDto(
                period.Id,
                new PropertyRefDto(period.Property.Id, period.Property.Name, period.Property.Code),
                period.MonthStart,
                $"Tháng {period.MonthStart.Month}/{period.MonthStart.Year}",
                period.Status,
                period.LockedAt,
                period.LockedByNavigation != null
                    ? new UserRefDto(period.LockedByNavigation.Id, period.LockedByNavigation.DisplayName)
                    : null,
                stats
            ));
        }

        return new BillingPeriodListResponse(items);
    }

    public async Task<BillingPeriodListItemDto> CreateAsync(
        CreateBillingPeriodRequest request,
        CancellationToken cancellationToken = default)
    {
        if (request.MonthStart.Day != 1)
        {
            throw new InvalidOperationException("Ngày bắt đầu kỳ tính tiền phải là ngày mùng 1 đầu tháng.");
        }

        var property = await _db.Properties
            .FirstOrDefaultAsync(p => p.Id == request.PropertyId, cancellationToken);

        if (property == null)
        {
            throw new KeyNotFoundException("Không tìm thấy cơ sở chỉ định.");
        }

        var exists = await _db.BillingPeriods
            .AnyAsync(p => p.PropertyId == request.PropertyId && p.MonthStart == request.MonthStart, cancellationToken);

        if (exists)
        {
            throw new InvalidOperationException("Kỳ tính tiền của tháng này đã tồn tại.");
        }

        var period = new BillingPeriod
        {
            Id = Guid.NewGuid(),
            PropertyId = request.PropertyId,
            MonthStart = request.MonthStart,
            Status = "open",
            LockedAt = null,
            LockedBy = null
        };

        _db.BillingPeriods.Add(period);

        try
        {
            await _db.SaveChangesAsync(cancellationToken);
        }
        catch (DbUpdateException ex) when (ex.InnerException is PostgresException pg && pg.SqlState == "23505")
        {
            throw new InvalidOperationException("Kỳ tính tiền của tháng này đã được mở bởi một thao tác khác.");
        }

        var stats = await ComputePeriodStatsAsync(period, cancellationToken);

        return new BillingPeriodListItemDto(
            period.Id,
            new PropertyRefDto(property.Id, property.Name, property.Code),
            period.MonthStart,
            $"Tháng {period.MonthStart.Month}/{period.MonthStart.Year}",
            period.Status,
            null,
            null,
            stats
        );
    }

    private async Task<BillingStatsDto> ComputePeriodStatsAsync(
        BillingPeriod period,
        CancellationToken cancellationToken)
    {
        var from = period.MonthStart;
        var to = from.AddMonths(1);

        var tenancies = await _db.Tenancies
            .Include(t => t.Room)
            .Where(t => t.Room.PropertyId == period.PropertyId &&
                        (t.Status == "active" || t.Status == "ended") &&
                        t.ActualMoveIn != null &&
                        t.ActualMoveIn < to &&
                        (t.ActualMoveOut == null || t.ActualMoveOut > from))
            .ToListAsync(cancellationToken);

        var tenancyCount = tenancies.Count;
        if (tenancyCount == 0)
        {
            return new BillingStatsDto(0, 0, 0, 0, 0, 0, 0, 0);
        }

        var tenancyIds = tenancies.Select(t => t.Id).ToList();

        var invoices = await _db.Invoices
            .Where(i => tenancyIds.Contains(i.TenancyId) &&
                        i.Status != "void" &&
                        (i.BillingPeriodId == period.Id ||
                         (i.BillingPeriodId == null && i.ServiceFrom < to && i.ServiceTo > from)))
            .ToListAsync(cancellationToken);

        var readings = await _db.MeterReadings
            .Include(r => r.Meter)
            .Where(r => r.BillingPeriodId == period.Id && r.Status == "valid")
            .ToListAsync(cancellationToken);

        int missingReadings = 0;
        int readyToDraft = 0;
        int drafts = 0;
        int issuedUnpaid = 0;
        int issuedPartial = 0;
        int paid = 0;
        int blocked = 0;

        foreach (var tenancy in tenancies)
        {
            var inv = invoices.FirstOrDefault(i => i.TenancyId == tenancy.Id && i.Status == "issued")
                      ?? invoices.FirstOrDefault(i => i.TenancyId == tenancy.Id);

            if (inv != null && inv.Status == "issued")
            {
                issuedUnpaid++;
            }
            else if (inv != null && inv.Status == "draft")
            {
                drafts++;
            }
            else
            {
                var hasElec = readings.Any(r => r.TenancyId == tenancy.Id && r.Meter.MeterKind == "electricity");
                var hasWater = readings.Any(r => r.TenancyId == tenancy.Id && r.Meter.MeterKind == "water");

                if (!hasElec || !hasWater)
                {
                    missingReadings++;
                }
                else
                {
                    readyToDraft++;
                }
            }
        }

        return new BillingStatsDto(
            tenancyCount,
            missingReadings,
            blocked,
            readyToDraft,
            drafts,
            issuedUnpaid,
            issuedPartial,
            paid
        );
    }
    public async Task<BillingPeriodListItemDto> LockAsync(
    Guid periodId,
    LockBillingPeriodRequest request,
    Guid? actorId,
    CancellationToken cancellationToken = default)
    {
        var period = await _db.BillingPeriods
            .Include(p => p.Property)
            .FirstOrDefaultAsync(p => p.Id == periodId, cancellationToken);

        if (period == null)
        {
            throw new KeyNotFoundException("Không tìm thấy kỳ tính tiền.");
        }

        if (period.Status == "locked")
        {
            throw new InvalidOperationException("Kỳ tính tiền đã ở trạng thái khóa.");
        }

        var stats = await ComputePeriodStatsAsync(period, cancellationToken);
        if ((stats.MissingReadings > 0 || stats.ReadyToDraft > 0) && !request.AcknowledgeIncomplete)
        {
            throw new InvalidOperationException("Kỳ tính tiền chưa hoàn tất (vẫn còn phòng thiếu số hoặc chưa tạo hóa đơn). Vui lòng xác nhận trước khi khóa.");
        }

        var effectiveActorId = actorId ?? (await _db.Users.Select(u => u.Id).FirstOrDefaultAsync(cancellationToken));
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == effectiveActorId, cancellationToken);

        var reason = string.IsNullOrWhiteSpace(request.Reason)
            ? "Khóa tháng theo xác nhận của người quản lý."
            : request.Reason;

        await using var tx = await _db.Database.BeginTransactionAsync(cancellationToken);
        try
        {
            period.Status = "locked";
            period.LockedAt = DateTime.UtcNow;
            period.LockedBy = effectiveActorId;

            var periodEvent = new BillingPeriodEvent
            {
                Id = Guid.NewGuid(),
                BillingPeriodId = period.Id,
                Action = "lock",
                Reason = reason,
                ActorId = effectiveActorId,
                CreatedAt = DateTime.UtcNow
            };

            _db.BillingPeriodEvents.Add(periodEvent);

            await _db.SaveChangesAsync(cancellationToken);
            await tx.CommitAsync(cancellationToken);

            return new BillingPeriodListItemDto(
                period.Id,
                new PropertyRefDto(period.Property.Id, period.Property.Name, period.Property.Code),
                period.MonthStart,
                $"Tháng {period.MonthStart.Month}/{period.MonthStart.Year}",
                period.Status,
                period.LockedAt,
                new UserRefDto(effectiveActorId, user?.DisplayName ?? "Quản lý"),
                stats
            );
        }
        catch
        {
            await tx.RollbackAsync(cancellationToken);
            throw;
        }
    }

    public async Task<BillingPeriodListItemDto> UnlockAsync(
        Guid periodId,
        UnlockBillingPeriodRequest request,
        Guid? actorId,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(request.Reason))
        {
            throw new ArgumentException("Bắt buộc phải nhập lý do khi mở khóa tháng.");
        }

        var period = await _db.BillingPeriods
            .Include(p => p.Property)
            .FirstOrDefaultAsync(p => p.Id == periodId, cancellationToken);

        if (period == null)
        {
            throw new KeyNotFoundException("Không tìm thấy kỳ tính tiền.");
        }

        if (period.Status != "locked")
        {
            throw new InvalidOperationException("Kỳ tính tiền hiện không bị khóa.");
        }

        var effectiveActorId = actorId ?? (await _db.Users.Select(u => u.Id).FirstOrDefaultAsync(cancellationToken));

        await using var tx = await _db.Database.BeginTransactionAsync(cancellationToken);
        try
        {
            await _db.Database.ExecuteSqlInterpolatedAsync(
                $"SELECT set_config('smartrent.reason', {request.Reason}, true)",
                cancellationToken);

            period.Status = "open";
            period.LockedAt = null;
            period.LockedBy = null;

            var periodEvent = new BillingPeriodEvent
            {
                Id = Guid.NewGuid(),
                BillingPeriodId = period.Id,
                Action = "unlock",
                Reason = request.Reason,
                ActorId = effectiveActorId,
                CreatedAt = DateTime.UtcNow
            };

            _db.BillingPeriodEvents.Add(periodEvent);

            await _db.SaveChangesAsync(cancellationToken);
            await tx.CommitAsync(cancellationToken);

            var stats = await ComputePeriodStatsAsync(period, cancellationToken);

            return new BillingPeriodListItemDto(
                period.Id,
                new PropertyRefDto(period.Property.Id, period.Property.Name, period.Property.Code),
                period.MonthStart,
                $"Tháng {period.MonthStart.Month}/{period.MonthStart.Year}",
                period.Status,
                null,
                null,
                stats
            );
        }
        catch
        {
            await tx.RollbackAsync(cancellationToken);
            throw;
        }
    }
}