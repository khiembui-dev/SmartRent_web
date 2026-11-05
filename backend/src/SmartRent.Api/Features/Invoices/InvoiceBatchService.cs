using Microsoft.EntityFrameworkCore;
using SmartRent.Api.Data;
using SmartRent.Api.Data.Entities;
using SmartRent.Api.Features.Billing;

namespace SmartRent.Api.Features.Invoices;

public sealed class InvoiceBatchService
{
    private readonly SmartRentDbContext _db;
    private readonly InvoiceBuilder _invoiceBuilder;

    public InvoiceBatchService(SmartRentDbContext db, InvoiceBuilder invoiceBuilder)
    {
        _db = db;
        _invoiceBuilder = invoiceBuilder;
    }

    public async Task<InvoiceBatchResponse> CreateBatchAsync(
        CreateInvoiceBatchRequest request,
        string? idempotencyKey,
        Guid? actorId,
        CancellationToken cancellationToken = default)
    {
        var period = await _db.BillingPeriods
            .FirstOrDefaultAsync(p => p.Id == request.PeriodId, cancellationToken);

        if (period == null)
        {
            throw new KeyNotFoundException("Không tìm thấy kỳ tính tiền.");
        }

        if (period.Status == "locked")
        {
            throw new InvalidOperationException("Kỳ tính tiền đã bị khóa, không thể tạo hóa đơn.");
        }

        var effectiveActorId = actorId ?? (await _db.Users.Select(u => u.Id).FirstOrDefaultAsync(cancellationToken));
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == effectiveActorId, cancellationToken);
        var userRef = new UserRefDto(effectiveActorId, user?.DisplayName ?? "Hệ thống");

        var tenancyIds = request.TenancyIds.Distinct().ToList();
        var items = new List<InvoiceBatchItemResultDto>();

        int succeeded = 0;
        int failed = 0;
        int skipped = 0;

        var from = period.MonthStart;
        var to = from.AddMonths(1);

        foreach (var tenancyId in tenancyIds)
        {
            var tenancy = await _db.Tenancies
                .Include(t => t.Room)
                .ThenInclude(r => r.Property)
                .FirstOrDefaultAsync(t => t.Id == tenancyId, cancellationToken);

            if (tenancy == null || tenancy.Room.PropertyId != period.PropertyId)
            {
                items.Add(new InvoiceBatchItemResultDto(tenancyId, new RoomRefDto(Guid.Empty, "N/A", Guid.Empty), "failed", "Đợt thuê không tồn tại hoặc không thuộc cơ sở này."));
                failed++;
                continue;
            }

            var roomRef = new RoomRefDto(tenancy.Room.Id, tenancy.Room.Code, tenancy.Room.PropertyId);

            var existingIssued = await _db.Invoices
                .FirstOrDefaultAsync(i => i.TenancyId == tenancyId &&
                                          i.BillingPeriodId == period.Id &&
                                          i.Kind == "periodic" &&
                                          i.Status == "issued",
                                     cancellationToken);

            if (existingIssued != null)
            {
                items.Add(new InvoiceBatchItemResultDto(tenancyId, roomRef, "skipped", "Phòng này đã được phát hành hóa đơn rồi.", existingIssued.Id, existingIssued.Code));
                skipped++;
                continue;
            }

            var preview = await _invoiceBuilder.PreviewAsync(tenancyId, from, to, period.Id, cancellationToken);
            if (preview.Problems.Count > 0)
            {
                items.Add(new InvoiceBatchItemResultDto(tenancyId, roomRef, "failed", preview.Problems[0].Message));
                failed++;
                continue;
            }

            await using var tx = await _db.Database.BeginTransactionAsync(cancellationToken);
            try
            {
                var seq = await GetNextDocumentNoAsync(tenancy.Room.Property.OrganizationId, "HD", cancellationToken);
                var invoiceCode = $"HD-{tenancy.Room.Code}-{period.MonthStart:yyMM}-{seq:D3}";

                var draft = await _db.Invoices
                    .Include(i => i.InvoiceLines)
                    .FirstOrDefaultAsync(i => i.TenancyId == tenancyId && i.BillingPeriodId == period.Id && i.Status == "draft", cancellationToken);

                if (draft != null)
                {
                    _db.Invoices.Remove(draft);
                    await _db.SaveChangesAsync(cancellationToken);
                }

                var invoiceId = Guid.NewGuid();
                var issuedOn = DateOnly.FromDateTime(DateTime.UtcNow);
                var dueOn = issuedOn.AddDays(7);

                var invoice = new Invoice
                {
                    Id = invoiceId,
                    TenancyId = tenancyId,
                    BillingPeriodId = period.Id,
                    Kind = "periodic",
                    Code = invoiceCode,
                    Status = "issued",
                    ServiceFrom = from,
                    ServiceTo = to,
                    IssuedOn = issuedOn,
                    DueOn = dueOn,
                    IssuedAt = DateTime.UtcNow,
                    IssuedBy = effectiveActorId,
                    NeedsRecompute = false,
                    IdempotencyKey = Guid.NewGuid(),
                    CreatedBy = effectiveActorId,
                    CreatedAt = DateTime.UtcNow
                };

                _db.Invoices.Add(invoice);

                var chargeTypes = await _db.ChargeTypes
                    .Where(ct => ct.OrganizationId == tenancy.Room.Property.OrganizationId)
                    .ToListAsync(cancellationToken);

                var meters = await _db.Meters
                    .Where(m => m.RoomId == tenancy.RoomId && (m.RemovedAt == null || m.RemovedAt > DateTime.UtcNow))
                    .ToListAsync(cancellationToken);

                var readings = await _db.MeterReadings
                    .Where(r => r.BillingPeriodId == period.Id && r.TenancyId == tenancyId && r.Status == "valid")
                    .ToListAsync(cancellationToken);

                int lineNo = 1;
                foreach (var lineDto in preview.Lines)
                {
                    var isElec = lineDto.Description.Contains("điện", StringComparison.OrdinalIgnoreCase);
                    var isWater = lineDto.Description.Contains("nước", StringComparison.OrdinalIgnoreCase);

                    var matchedType = chargeTypes.FirstOrDefault(ct =>
                        isElec ? ct.Category == "electricity" :
                        isWater ? ct.Category == "water" :
                        ct.Name == lineDto.Description)
                        ?? chargeTypes.First();

                    var line = new InvoiceLine
                    {
                        Id = Guid.NewGuid(),
                        InvoiceId = invoiceId,
                        LineNo = lineNo++,
                        ChargeTypeId = matchedType.Id,
                        DescriptionSnapshot = lineDto.Description,
                        UnitSnapshot = matchedType.UnitLabel,
                        Quantity = 1,
                        UnitPrice = lineDto.Amount,
                        Sign = 1,
                        ProrationNumerator = 1,
                        ProrationDenominator = 1
                    };

                    _db.InvoiceLines.Add(line);

                    if (isElec || isWater)
                    {
                        var kind = isElec ? "electricity" : "water";
                        var meter = meters.FirstOrDefault(m => m.MeterKind == kind);
                        if (meter != null)
                        {
                            var current = readings.FirstOrDefault(r => r.MeterId == meter.Id);
                            if (current != null)
                            {
                                var prev = await _db.MeterReadings
                                    .Where(r => r.MeterId == meter.Id && r.Status == "valid" && r.ObservedAt < current.ObservedAt)
                                    .OrderByDescending(r => r.ObservedAt)
                                    .FirstOrDefaultAsync(cancellationToken);

                                if (prev != null)
                                {
                                    var segment = new InvoiceMeterSegment
                                    {
                                        Id = Guid.NewGuid(),
                                        InvoiceLineId = line.Id,
                                        FromReadingId = prev.Id,
                                        ToReadingId = current.Id
                                    };
                                    _db.InvoiceMeterSegments.Add(segment);
                                }
                            }
                        }
                    }
                }

                await _db.SaveChangesAsync(cancellationToken);
                await tx.CommitAsync(cancellationToken);

                items.Add(new InvoiceBatchItemResultDto(tenancyId, roomRef, "succeeded", "Phát hành hóa đơn thành công.", invoiceId, invoiceCode, preview.Total));
                succeeded++;
            }
            catch (Exception ex)
            {
                await tx.RollbackAsync(cancellationToken);
                items.Add(new InvoiceBatchItemResultDto(tenancyId, roomRef, "failed", ex.Message));
                failed++;
            }
        }

        var summary = new InvoiceBatchSummaryDto(tenancyIds.Count, succeeded, failed, skipped);
        var finalKey = string.IsNullOrWhiteSpace(idempotencyKey) ? Guid.NewGuid().ToString() : idempotencyKey;

        return new InvoiceBatchResponse(
            Guid.NewGuid(),
            period.Id,
            request.Action,
            userRef,
            DateTimeOffset.UtcNow,
            finalKey,
            summary,
            items
        );
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