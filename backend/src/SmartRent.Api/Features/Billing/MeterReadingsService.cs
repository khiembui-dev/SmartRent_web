using Microsoft.EntityFrameworkCore;
using SmartRent.Api.Data;
using SmartRent.Api.Data.Entities;

namespace SmartRent.Api.Features.Billing;

public sealed class MeterReadingsService
{
    private readonly SmartRentDbContext _db;

    public MeterReadingsService(SmartRentDbContext db)
    {
        _db = db;
    }

    public async Task<RecordMeterReadingsBatchResponse> RecordBatchAsync(
        RecordMeterReadingsBatchRequest request,
        Guid? actorId,
        CancellationToken cancellationToken = default)
    {
        var period = await _db.BillingPeriods
            .FirstOrDefaultAsync(p => p.Id == request.BillingPeriodId, cancellationToken);

        if (period == null)
        {
            throw new KeyNotFoundException("Không tìm thấy kỳ tính tiền.");
        }

        if (period.Status == "locked")
        {
            throw new InvalidOperationException("Kỳ tính tiền đã bị khóa, không thể ghi thêm chỉ số.");
        }

        var effectiveActorId = actorId ?? (await _db.Users.Select(u => u.Id).FirstOrDefaultAsync(cancellationToken));
        var results = new List<RecordMeterReadingResultItem>();

        var from = period.MonthStart;
        var to = from.AddMonths(1);

        for (int i = 0; i < request.Items.Count; i++)
        {
            var item = request.Items[i];

            if (item.ReadingValue < 0)
            {
                results.Add(new RecordMeterReadingResultItem(i, item.MeterId, "failed", null, "reading_negative", "Chỉ số không được là số âm."));
                continue;
            }

            var meter = await _db.Meters
                .Include(m => m.Room)
                .FirstOrDefaultAsync(m => m.Id == item.MeterId, cancellationToken);

            if (meter == null)
            {
                results.Add(new RecordMeterReadingResultItem(i, item.MeterId, "failed", null, "meter_not_found", "Không tìm thấy công tơ."));
                continue;
            }

            var observedUtc = item.ObservedAt.UtcDateTime;
            if (observedUtc < meter.InstalledAt || (meter.RemovedAt.HasValue && observedUtc > meter.RemovedAt.Value))
            {
                results.Add(new RecordMeterReadingResultItem(i, item.MeterId, "failed", null, "meter_out_of_lifecycle", "Thời điểm ghi chỉ số nằm ngoài vòng đời công tơ."));
                continue;
            }

            var tenancy = await _db.Tenancies
                .FirstOrDefaultAsync(t => t.RoomId == meter.RoomId &&
                                          (t.Status == "active" || t.Status == "ended") &&
                                          t.ActualMoveIn != null &&
                                          t.ActualMoveIn < to &&
                                          (t.ActualMoveOut == null || t.ActualMoveOut > from),
                                     cancellationToken);

            var prevReading = await _db.MeterReadings
                .Where(r => r.MeterId == meter.Id && r.Status == "valid" && r.ObservedAt < observedUtc)
                .OrderByDescending(r => r.ObservedAt)
                .FirstOrDefaultAsync(cancellationToken);

            var nextReading = await _db.MeterReadings
                .Where(r => r.MeterId == meter.Id && r.Status == "valid" && r.ObservedAt > observedUtc)
                .OrderBy(r => r.ObservedAt)
                .FirstOrDefaultAsync(cancellationToken);

            if (prevReading != null && item.ReadingValue < prevReading.ReadingValue)
            {
                results.Add(new RecordMeterReadingResultItem(i, item.MeterId, "failed", null, "reading_decreased", $"Chỉ số mới ({item.ReadingValue}) không được nhỏ hơn chỉ số trước ({prevReading.ReadingValue})."));
                continue;
            }

            if (nextReading != null && item.ReadingValue > nextReading.ReadingValue)
            {
                results.Add(new RecordMeterReadingResultItem(i, item.MeterId, "failed", null, "reading_increased", $"Chỉ số mới ({item.ReadingValue}) không được lớn hơn chỉ số sau đó ({nextReading.ReadingValue})."));
                continue;
            }

            var existingPeriodic = await _db.MeterReadings
                .AnyAsync(r => r.MeterId == meter.Id &&
                               r.BillingPeriodId == period.Id &&
                               r.ReadingKind == "periodic" &&
                               r.Status == "valid",
                          cancellationToken);

            if (existingPeriodic)
            {
                results.Add(new RecordMeterReadingResultItem(i, item.MeterId, "failed", null, "reading_exists", "Công tơ này đã có chỉ số kỳ này. Vui lòng bấm Sửa nếu muốn thay đổi."));
                continue;
            }

            var reading = new MeterReading
            {
                Id = Guid.NewGuid(),
                MeterId = item.MeterId,
                ObservedAt = observedUtc,
                ReadingValue = decimal.Round(item.ReadingValue, 3, MidpointRounding.AwayFromZero),
                BillingPeriodId = period.Id,
                TenancyId = tenancy?.Id,
                ReadingKind = "periodic",
                Status = "valid",
                RecordedBy = effectiveActorId,
                RecordedAt = DateTime.UtcNow
            };

            _db.MeterReadings.Add(reading);

            if (tenancy != null)
            {
                var drafts = await _db.Invoices
                    .Where(inv => inv.TenancyId == tenancy.Id && inv.Status == "draft")
                    .ToListAsync(cancellationToken);

                foreach (var draft in drafts)
                {
                    draft.NeedsRecompute = true;
                }
            }

            try
            {
                await _db.SaveChangesAsync(cancellationToken);
                results.Add(new RecordMeterReadingResultItem(i, item.MeterId, "succeeded", reading.Id));
            }
            catch (Exception ex)
            {
                _db.Entry(reading).State = EntityState.Detached;
                results.Add(new RecordMeterReadingResultItem(i, item.MeterId, "failed", null, "save_failed", ex.Message));
            }
        }

        return new RecordMeterReadingsBatchResponse(results);
    }

    public async Task<bool> CorrectAsync(
        Guid readingId,
        CorrectMeterReadingRequest request,
        Guid? actorId,
        CancellationToken cancellationToken = default)
    {
        if (string.IsNullOrWhiteSpace(request.Reason))
        {
            throw new ArgumentException("Bắt buộc phải nhập lý do khi sửa chỉ số.");
        }

        var oldReading = await _db.MeterReadings
            .Include(r => r.BillingPeriod)
            .FirstOrDefaultAsync(r => r.Id == readingId, cancellationToken);

        if (oldReading == null)
        {
            throw new KeyNotFoundException("Không tìm thấy bản ghi chỉ số.");
        }

        if (oldReading.Status != "valid")
        {
            throw new InvalidOperationException("Chỉ có thể sửa chỉ số đang ở trạng thái hợp lệ.");
        }

        if (oldReading.BillingPeriod != null && oldReading.BillingPeriod.Status == "locked")
        {
            throw new InvalidOperationException("Kỳ tính tiền đã bị khóa, không thể sửa chỉ số.");
        }

        var isUsed = await _db.InvoiceMeterSegments
            .Include(s => s.InvoiceLine)
            .ThenInclude(l => l.Invoice)
            .AnyAsync(s => (s.FromReadingId == readingId || s.ToReadingId == readingId) &&
                           (s.InvoiceLine.Invoice.Status == "issued" || s.InvoiceLine.Invoice.Status == "void"),
                      cancellationToken);

        if (isUsed)
        {
            throw new InvalidOperationException("Chỉ số này đã được tham chiếu bởi hóa đơn đã phát hành, không thể chỉnh sửa trực tiếp.");
        }

        var effectiveActorId = actorId ?? (await _db.Users.Select(u => u.Id).FirstOrDefaultAsync(cancellationToken));

        await using var transaction = await _db.Database.BeginTransactionAsync(cancellationToken);
        try
        {
            oldReading.Status = "void";
            oldReading.VoidReason = request.Reason;
            await _db.SaveChangesAsync(cancellationToken);

            var newReading = new MeterReading
            {
                Id = Guid.NewGuid(),
                MeterId = oldReading.MeterId,
                ObservedAt = oldReading.ObservedAt,
                ReadingValue = decimal.Round(request.ReadingValue, 3, MidpointRounding.AwayFromZero),
                BillingPeriodId = oldReading.BillingPeriodId,
                TenancyId = oldReading.TenancyId,
                HandoverId = oldReading.HandoverId,
                ReadingKind = oldReading.ReadingKind,
                Status = "valid",
                SupersedesId = oldReading.Id,
                RecordedBy = effectiveActorId,
                RecordedAt = DateTime.UtcNow
            };

            _db.MeterReadings.Add(newReading);
            await _db.SaveChangesAsync(cancellationToken);

            if (oldReading.TenancyId.HasValue)
            {
                var drafts = await _db.Invoices
                    .Where(inv => inv.TenancyId == oldReading.TenancyId.Value && inv.Status == "draft")
                    .ToListAsync(cancellationToken);

                foreach (var draft in drafts)
                {
                    draft.NeedsRecompute = true;
                }

                await _db.SaveChangesAsync(cancellationToken);
            }

            await transaction.CommitAsync(cancellationToken);
            return true;
        }
        catch
        {
            await transaction.RollbackAsync(cancellationToken);
            throw;
        }
    }
}