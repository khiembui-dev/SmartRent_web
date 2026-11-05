using Microsoft.EntityFrameworkCore;
using SmartRent.Api.Data;
using SmartRent.Api.Data.Entities;
using SmartRent.Api.Features.Invoices;

namespace SmartRent.Api.Features.Billing;

public sealed class BillingWorksheetService
{
    private readonly SmartRentDbContext _db;
    private readonly InvoiceBuilder _invoiceBuilder;

    public BillingWorksheetService(SmartRentDbContext db, InvoiceBuilder invoiceBuilder)
    {
        _db = db;
        _invoiceBuilder = invoiceBuilder;
    }

    public async Task<BillingWorksheetDto> GetAsync(
        Guid periodId, 
        CancellationToken cancellationToken = default)
    {
        var period = await _db.BillingPeriods
            .Include(p => p.Property)
            .Include(p => p.LockedByNavigation)
            .FirstOrDefaultAsync(p => p.Id == periodId, cancellationToken);

        if (period == null)
        {
            throw new KeyNotFoundException("Không tìm thấy kỳ tính tiền.");
        }

        var from = period.MonthStart;
        var to = from.AddMonths(1);

        var tenancies = await _db.Tenancies
            .Include(t => t.Room)
            .Include(t => t.RepresentativeTenant)
            .Where(t => t.Room.PropertyId == period.PropertyId &&
                        (t.Status == "active" || t.Status == "ended") &&
                        t.ActualMoveIn != null &&
                        t.ActualMoveIn < to &&
                        (t.ActualMoveOut == null || t.ActualMoveOut > from))
            .OrderBy(t => t.Room.Code)
            .ToListAsync(cancellationToken);

        var tenancyIds = tenancies.Select(t => t.Id).ToList();
        var roomIds = tenancies.Select(t => t.RoomId).Distinct().ToList();

        var meters = await _db.Meters
            .Where(m => roomIds.Contains(m.RoomId) && 
                        (m.RemovedAt == null || m.RemovedAt > from.ToDateTime(TimeOnly.MinValue, DateTimeKind.Utc)))
            .ToListAsync(cancellationToken);

        var meterIds = meters.Select(m => m.Id).ToList();

        var readings = await _db.MeterReadings
            .Include(r => r.RecordedByNavigation)
            .Where(r => meterIds.Contains(r.MeterId) && r.Status == "valid")
            .OrderBy(r => r.ObservedAt)
            .ToListAsync(cancellationToken);

        var invoices = await _db.Invoices
            .Where(i => tenancyIds.Contains(i.TenancyId) && i.Status != "void" &&
                        (i.BillingPeriodId == period.Id || 
                         (i.BillingPeriodId == null && i.ServiceFrom < to && i.ServiceTo > from)))
            .ToListAsync(cancellationToken);

        var invoiceIds = invoices.Select(i => i.Id).ToList();
        var balances = await _db.VInvoiceBalances
            .Where(b => b.InvoiceId.HasValue && invoiceIds.Contains(b.InvoiceId.Value))
            .ToListAsync(cancellationToken);

        var rows = new List<BillingWorksheetRowDto>();

        foreach (var tenancy in tenancies)
        {
            var elecBlock = BuildReadingBlock(tenancy, "electricity", meters, readings, period);
            var waterBlock = BuildReadingBlock(tenancy, "water", meters, readings, period);

            var preview = await _invoiceBuilder.PreviewAsync(tenancy.Id, from, to, period.Id, cancellationToken);
            var estimate = new BillingEstimateDto(preview.Lines, preview.FixedTotal, preview.Total, preview.UnitPrices);

            var inv = invoices.FirstOrDefault(i => i.TenancyId == tenancy.Id && i.Status == "issued")
                      ?? invoices.FirstOrDefault(i => i.TenancyId == tenancy.Id);

            var balance = inv != null 
                ? balances.FirstOrDefault(b => b.InvoiceId == inv.Id) 
                : null;

            string group;
            InvoiceBriefDto? invoiceBrief = null;

            if (inv != null && inv.Status == "issued")
            {
                var payStatus = balance?.PaymentStatus ?? "unpaid";
                group = payStatus == "paid" ? "paid" : payStatus == "partial" ? "issued_partial" : "issued_unpaid";

                invoiceBrief = new InvoiceBriefDto(
                    inv.Id,
                    inv.Code ?? string.Empty,
                    inv.Status,
                    payStatus,
                    balance?.ReceivableAmount ?? 0,
                    balance?.OutstandingAmount ?? 0
                );
            }
            else if (inv != null && inv.Status == "draft")
            {
                group = "draft";
                invoiceBrief = new InvoiceBriefDto(
                    inv.Id,
                    inv.Code ?? string.Empty,
                    inv.Status,
                    "unpaid",
                    balance?.ReceivableAmount ?? 0,
                    balance?.OutstandingAmount ?? 0
                );
            }
            else
            {
                if (preview.Problems.Any(p => p.Code == "missing_reading" || p.Code == "missing_previous"))
                {
                    group = "missing_readings";
                }
                else if (preview.Problems.Count > 0)
                {
                    group = "blocked";
                }
                else
                {
                    group = "ready";
                }
            }

            rows.Add(new BillingWorksheetRowDto(
                new TenancyBriefDto(
                    tenancy.Id,
                    tenancy.Room.Code,
                    new TenantBriefDto(tenancy.RepresentativeTenant.Id, tenancy.RepresentativeTenant.FullName, tenancy.RepresentativeTenant.Phone)
                ),
                new RoomRefDto(tenancy.Room.Id, tenancy.Room.Code, tenancy.Room.PropertyId),
                group,
                preview.Problems,
                new WorksheetReadingsDto(elecBlock, waterBlock),
                estimate,
                invoiceBrief,
                tenancy.ActualMoveOut.HasValue && tenancy.ActualMoveOut.Value < to
            ));
        }

        var stats = new BillingStatsDto(
            rows.Count,
            rows.Count(r => r.Group == "missing_readings"),
            rows.Count(r => r.Group == "blocked"),
            rows.Count(r => r.Group == "ready"),
            rows.Count(r => r.Group == "draft"),
            rows.Count(r => r.Group == "issued_unpaid"),
            rows.Count(r => r.Group == "issued_partial"),
            rows.Count(r => r.Group == "paid")
        );

        var periodDto = new BillingPeriodListItemDto(
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
        );

        return new BillingWorksheetDto(periodDto, stats, rows);
    }

    private static ReadingBlockDto? BuildReadingBlock(
        Tenancy tenancy,
        string kind,
        List<Meter> meters,
        List<MeterReading> readings,
        BillingPeriod period)
    {
        var meter = meters.FirstOrDefault(m => m.RoomId == tenancy.RoomId && m.MeterKind == kind);
        if (meter == null) return null;

        var meterReadings = readings
            .Where(r => r.MeterId == meter.Id && r.TenancyId == tenancy.Id)
            .OrderBy(r => r.ObservedAt)
            .ToList();

        var current = meterReadings.FirstOrDefault(r => 
            r.BillingPeriodId == period.Id && (r.ReadingKind == "periodic" || r.ReadingKind == "checkout"));

        var before = meterReadings
            .Where(r => current == null || r.ObservedAt < current.ObservedAt)
            .ToList();

        var previous = before.LastOrDefault();

        decimal? consumption = (current != null && previous != null && previous.MeterId == current.MeterId)
            ? current.ReadingValue - previous.ReadingValue
            : null;

        var history = meterReadings
            .Where(r => r.ReadingKind == "periodic" && r.BillingPeriodId != period.Id)
            .ToList();

        decimal? average = null;
        if (history.Count >= 2)
        {
            var deltas = new List<decimal>();
            for (int i = 1; i < history.Count; i++)
            {
                deltas.Add(history[i].ReadingValue - history[i - 1].ReadingValue);
            }
            if (deltas.Count > 0)
            {
                average = Math.Round(deltas.Average(), 1);
            }
        }

        var anomaly = consumption.HasValue && average.HasValue && average.Value > 0 &&
                      (consumption.Value > average.Value * 2 || consumption.Value < average.Value * 0.3m);

        return new ReadingBlockDto(
            meter.Id,
            meter.SerialNumber,
            meter.MeterKind,
            previous != null 
                ? new ReadingPointDto(previous.Id, previous.ReadingValue, previous.ObservedAt, previous.ReadingKind) 
                : null,
            current != null 
                ? new ReadingPointDto(
                    current.Id, 
                    current.ReadingValue, 
                    current.ObservedAt, 
                    current.ReadingKind,
                    current.RecordedByNavigation != null ? new UserRefDto(current.RecordedByNavigation.Id, current.RecordedByNavigation.DisplayName) : null,
                    false) 
                : null,
            consumption,
            average,
            anomaly
        );
    }
}