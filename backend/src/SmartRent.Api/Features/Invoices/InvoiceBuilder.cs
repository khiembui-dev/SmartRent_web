using Microsoft.EntityFrameworkCore;
using SmartRent.Api.Data;
using SmartRent.Api.Data.Entities;
using SmartRent.Api.Features.Billing;

namespace SmartRent.Api.Features.Invoices;

public sealed record EffectiveRateItem(
    Guid ChargeTypeId,
    Guid RateId,
    decimal UnitPrice,
    string CalculationMethod,
    string BillingCycle,
    string ProrationMode,
    string SourceScope);

public sealed record InvoicePreviewResult(
    IReadOnlyList<EstimateLineDto> Lines,
    decimal FixedTotal,
    decimal? Total,
    UnitPricesDto UnitPrices,
    IReadOnlyList<ProblemDto> Problems);

public sealed class InvoiceBuilder
{
    private readonly SmartRentDbContext _db;

    public InvoiceBuilder(SmartRentDbContext db)
    {
        _db = db;
    }

    public static decimal CalculateLineAmount(
        decimal quantity,
        decimal unitPrice,
        int numerator,
        int denominator,
        short sign = 1)
    {
        if (denominator <= 0) return 0;
        return sign * decimal.Round(
            quantity * unitPrice * numerator / denominator,
            0,
            MidpointRounding.AwayFromZero);
    }

    public async Task<InvoicePreviewResult> PreviewAsync(
        Guid tenancyId,
        DateOnly from,
        DateOnly to,
        Guid? periodId,
        CancellationToken cancellationToken = default)
    {
        var tenancy = await _db.Tenancies
            .Include(t => t.Room)
            .FirstOrDefaultAsync(t => t.Id == tenancyId, cancellationToken);

        if (tenancy == null)
        {
            throw new KeyNotFoundException("Không tìm thấy đợt thuê chỉ định.");
        }

        var onDate = tenancy.ActualMoveIn > from ? tenancy.ActualMoveIn.Value : from;
        var rates = await GetEffectiveRatesAsync(tenancyId, onDate, cancellationToken);

        var chargeTypes = await _db.ChargeTypes
            .Where(ct => ct.OrganizationId == tenancy.Room.Property.OrganizationId && ct.IsActive)
            .ToListAsync(cancellationToken);

        var serviceFrom = tenancy.ActualMoveIn.HasValue && tenancy.ActualMoveIn.Value > from
            ? tenancy.ActualMoveIn.Value
            : from;

        var serviceTo = tenancy.ActualMoveOut.HasValue && tenancy.ActualMoveOut.Value < to
            ? tenancy.ActualMoveOut.Value
            : to;

        var totalDaysInPeriod = (to.ToDateTime(TimeOnly.MinValue) - from.ToDateTime(TimeOnly.MinValue)).Days;
        var stayedDays = (serviceTo.ToDateTime(TimeOnly.MinValue) - serviceFrom.ToDateTime(TimeOnly.MinValue)).Days;

        var lines = new List<EstimateLineDto>();
        var problems = new List<ProblemDto>();

        decimal? electricityPrice = null;
        decimal? waterPrice = null;

        var elecRate = rates.FirstOrDefault(r =>
            chargeTypes.Any(ct => ct.Id == r.ChargeTypeId && ct.Category == "electricity"));
        if (elecRate != null) electricityPrice = elecRate.UnitPrice;

        var waterRate = rates.FirstOrDefault(r =>
            chargeTypes.Any(ct => ct.Id == r.ChargeTypeId && ct.Category == "water"));
        if (waterRate != null) waterPrice = waterRate.UnitPrice;

        foreach (var rate in rates)
        {
            var type = chargeTypes.FirstOrDefault(ct => ct.Id == rate.ChargeTypeId);
            if (type == null) continue;

            if (type.Category == "electricity" || type.Category == "water")
            {
                continue;
            }

            int num = 1;
            int den = 1;

            if (stayedDays < totalDaysInPeriod && rate.ProrationMode == "daily_exact")
            {
                num = stayedDays;
                den = totalDaysInPeriod;
            }

            var amount = CalculateLineAmount(1, rate.UnitPrice, num, den, 1);
            lines.Add(new EstimateLineDto(type.Name, amount, false));
        }

        var fixedTotal = lines.Sum(l => l.Amount);

        var meters = await _db.Meters
            .Where(m => m.RoomId == tenancy.RoomId && (m.RemovedAt == null || m.RemovedAt > DateTime.UtcNow))
            .ToListAsync(cancellationToken);

        var readings = periodId.HasValue
            ? await _db.MeterReadings
                .Where(r => r.BillingPeriodId == periodId.Value && r.TenancyId == tenancyId && r.Status == "valid")
                .ToListAsync(cancellationToken)
            : new List<MeterReading>();

        foreach (var meter in meters)
        {
            var isElec = meter.MeterKind == "electricity";
            var typeName = isElec ? "Tiền điện" : "Tiền nước";
            var unitPrice = isElec ? electricityPrice : waterPrice;

            var current = readings.FirstOrDefault(r => r.MeterId == meter.Id);
            if (current == null)
            {
                problems.Add(new ProblemDto("missing_reading", $"Chưa nhập chỉ số {meter.MeterKind} tháng này.", meter.MeterKind));
                continue;
            }

            var previous = await _db.MeterReadings
                .Where(r => r.MeterId == meter.Id && r.Status == "valid" && r.ObservedAt < current.ObservedAt)
                .OrderByDescending(r => r.ObservedAt)
                .FirstOrDefaultAsync(cancellationToken);

            if (previous == null)
            {
                problems.Add(new ProblemDto("missing_previous", $"Thiếu chỉ số {meter.MeterKind} kỳ trước làm căn cứ.", meter.MeterKind));
                continue;
            }

            var consumption = current.ReadingValue - previous.ReadingValue;
            if (consumption < 0)
            {
                problems.Add(new ProblemDto("reading_decreased", $"Chỉ số mới không được nhỏ hơn chỉ số trước.", meter.MeterKind));
                continue;
            }

            if (!unitPrice.HasValue)
            {
                problems.Add(new ProblemDto("missing_rate", $"Chưa cấu hình bảng giá cho {meter.MeterKind}.", meter.MeterKind));
                continue;
            }

            var amount = CalculateLineAmount(consumption, unitPrice.Value, 1, 1, 1);
            lines.Add(new EstimateLineDto($"{typeName} ({consumption} {(isElec ? "kWh" : "m³")})", amount, true));
        }

        decimal? total = problems.Count > 0 ? null : lines.Sum(l => l.Amount);

        return new InvoicePreviewResult(
            lines,
            fixedTotal,
            total,
            new UnitPricesDto(electricityPrice, waterPrice),
            problems
        );
    }

    private async Task<IReadOnlyList<EffectiveRateItem>> GetEffectiveRatesAsync(
        Guid tenancyId,
        DateOnly onDate,
        CancellationToken cancellationToken)
    {
        var result = new List<EffectiveRateItem>();
        var connection = _db.Database.GetDbConnection();

        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT charge_type_id, rate_id, unit_price, calculation_method, billing_cycle, proration_mode, source_scope FROM smartrent.effective_rates(@tenancyId, @onDate)";

        var paramTenancy = command.CreateParameter();
        paramTenancy.ParameterName = "@tenancyId";
        paramTenancy.Value = tenancyId;
        command.Parameters.Add(paramTenancy);

        var paramDate = command.CreateParameter();
        paramDate.ParameterName = "@onDate";
        paramDate.Value = onDate;
        command.Parameters.Add(paramDate);

        if (connection.State != System.Data.ConnectionState.Open)
        {
            await connection.OpenAsync(cancellationToken);
        }

        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        while (await reader.ReadAsync(cancellationToken))
        {
            result.Add(new EffectiveRateItem(
                reader.GetGuid(0),
                reader.GetGuid(1),
                reader.GetDecimal(2),
                reader.GetString(3),
                reader.GetString(4),
                reader.GetString(5),
                reader.GetString(6)
            ));
        }

        return result;
    }
}