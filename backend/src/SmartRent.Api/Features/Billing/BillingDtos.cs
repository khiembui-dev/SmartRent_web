namespace SmartRent.Api.Features.Billing;

public sealed record PropertyRefDto(
    Guid Id,
    string Name,
    string? Code);

public sealed record RoomRefDto(
    Guid Id,
    string Code,
    Guid PropertyId);

public sealed record UserRefDto(
    Guid Id,
    string FullName);

public sealed record TenantBriefDto(
    Guid Id,
    string FullName,
    string? PhoneNumber);

public sealed record TenancyBriefDto(
    Guid Id,
    string Label,
    TenantBriefDto Tenant);

public sealed record BillingStatsDto(
    int TenancyCount,
    int MissingReadings,
    int Blocked,
    int ReadyToDraft,
    int Drafts,
    int IssuedUnpaid,
    int IssuedPartial,
    int Paid);

public sealed record BillingPeriodListItemDto(
    Guid Id,
    PropertyRefDto Property,
    DateOnly MonthStart,
    string Label,
    string Status,
    DateTimeOffset? LockedAt,
    UserRefDto? LockedBy,
    BillingStatsDto? Stats);

public sealed record CreateBillingPeriodRequest(
    Guid PropertyId,
    DateOnly MonthStart);

public sealed record ReadingPointDto(
    Guid Id,
    decimal Value,
    DateTimeOffset ObservedAt,
    string Kind,
    UserRefDto? RecordedBy = null,
    bool InUse = false);

public sealed record ReadingBlockDto(
    Guid MeterId,
    string SerialNumber,
    string MeterKind,
    ReadingPointDto? Previous,
    ReadingPointDto? Current,
    decimal? Consumption,
    decimal? AverageConsumption,
    bool Anomaly);

public sealed record WorksheetReadingsDto(
    ReadingBlockDto? Electricity,
    ReadingBlockDto? Water);

public sealed record EstimateLineDto(
    string Description,
    decimal Amount,
    bool Metered);

public sealed record UnitPricesDto(
    decimal? Electricity,
    decimal? Water);

public sealed record BillingEstimateDto(
    IReadOnlyList<EstimateLineDto> Lines,
    decimal FixedTotal,
    decimal? Total,
    UnitPricesDto UnitPrices);

public sealed record InvoiceBriefDto(
    Guid Id,
    string Code,
    string Status,
    string PaymentStatus,
    decimal TotalAmount,
    decimal BalanceRemaining);

public sealed record ProblemDto(
    string Code,
    string Message,
    string? Field = null);

public sealed record BillingWorksheetRowDto(
    TenancyBriefDto Tenancy,
    RoomRefDto Room,
    string Group,
    IReadOnlyList<ProblemDto> Problems,
    WorksheetReadingsDto Readings,
    BillingEstimateDto? Estimate,
    InvoiceBriefDto? Invoice,
    bool EndedInPeriod);

public sealed record BillingWorksheetDto(
    BillingPeriodListItemDto Period,
    BillingStatsDto Stats,
    IReadOnlyList<BillingWorksheetRowDto> Rows);

public sealed record RecordMeterReadingItem(
    Guid MeterId,
    decimal ReadingValue,
    DateTimeOffset ObservedAt);

public sealed record RecordMeterReadingsBatchRequest(
    Guid BillingPeriodId,
    IReadOnlyList<RecordMeterReadingItem> Items);

public sealed record RecordMeterReadingResultItem(
    int Index,
    Guid MeterId,
    string Status,
    Guid? ReadingId = null,
    string? Code = null,
    string? Message = null);

public sealed record RecordMeterReadingsBatchResponse(
    IReadOnlyList<RecordMeterReadingResultItem> Results);

public sealed record CorrectMeterReadingRequest(
    decimal ReadingValue,
    string Reason);

public sealed record LockBillingPeriodRequest(
    bool AcknowledgeIncomplete = false,
    string? Reason = null);

public sealed record UnlockBillingPeriodRequest(
    string Reason);