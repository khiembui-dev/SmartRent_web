namespace SmartRent.Api.Features.Invoices;

using SmartRent.Api.Features.Billing;

public sealed record CreateInvoiceBatchRequest(
    Guid PeriodId,
    string Action,
    IReadOnlyList<Guid> TenancyIds);

public sealed record InvoiceBatchSummaryDto(
    int Total,
    int Succeeded,
    int Failed,
    int Skipped);

public sealed record InvoiceBatchItemResultDto(
    Guid TenancyId,
    RoomRefDto Room,
    string Status,
    string? Message,
    Guid? InvoiceId = null,
    string? InvoiceCode = null,
    decimal? TotalAmount = null);

public sealed record InvoiceBatchResponse(
    Guid Id,
    Guid PeriodId,
    string Action,
    UserRefDto RequestedBy,
    DateTimeOffset RequestedAt,
    string IdempotencyKey,
    InvoiceBatchSummaryDto Summary,
    IReadOnlyList<InvoiceBatchItemResultDto> Items);