using SmartRent.Api.Features.Billing;

namespace SmartRent.Api.Features.Invoices;

public sealed record BillingPeriodRefDto(
    Guid Id,
    DateOnly MonthStart,
    string Label);

public sealed record InvoiceListQuery(
    int Page = 1,
    int PageSize = 20,
    string? Sort = "-serviceFrom",
    string? Q = null,
    Guid? PropertyId = null,
    string? PeriodMonth = null,
    string? PaymentStatus = null,
    bool? Outstanding = null,
    bool? Overdue = null,
    bool? HasPending = null,
    string? Status = null,
    string? Kind = null,
    Guid? PeriodId = null,
    Guid? TenancyId = null,
    Guid? TenantId = null,
    Guid? RoomId = null,
    DateOnly? DueFrom = null,
    DateOnly? DueTo = null,
    DateOnly? IssuedFrom = null,
    DateOnly? IssuedTo = null,
    bool? Stale = null);

public sealed record InvoiceListSummaryDto(
    int Count,
    decimal ReceivableAmount,
    decimal PaidAmount,
    decimal OutstandingAmount,
    decimal OverdueAmount,
    int OverdueCount,
    decimal PendingAmount);

public sealed record InvoiceListItemDto(
    Guid Id,
    string Code,
    string Kind,
    string Status,
    Guid TenancyId,
    RoomRefDto Room,
    PropertyRefDto Property,
    TenantBriefDto Representative,
    BillingPeriodRefDto? Period,
    DateOnly ServiceFrom,
    DateOnly ServiceTo,
    DateOnly? IssuedOn,
    DateOnly? DueOn,
    decimal TotalAmount,
    decimal OriginalAmount,
    decimal AdjustmentAmount,
    decimal ReceivableAmount,
    decimal PaidAmount,
    decimal OutstandingAmount,
    string PaymentStatus,
    bool IsOverdue,
    int DaysOverdue,
    Guid? OriginalInvoiceId,
    IReadOnlyList<ProblemDto> Problems,
    bool Stale,
    DateTime CreatedAt,
    DateTime? VoidedAt,
    string? VoidReason,
    int PendingPaymentCount,
    decimal PendingPaymentAmount);

public sealed record InvoiceListResponse(
    IReadOnlyList<InvoiceListItemDto> Items,
    int TotalItems,
    int Page,
    int PageSize,
    int TotalPages,
    InvoiceListSummaryDto Summary);

public sealed record InvoiceUserRefDto(
    Guid Id,
    string DisplayName);

public sealed record InvoiceRoomRefDto(
    Guid Id,
    string Code,
    string? Name,
    Guid PropertyId,
    string? PropertyName,
    string? PropertyCode);

public sealed record InvoicePeriodDetailDto(
    Guid Id,
    DateOnly MonthStart,
    string Status,
    string? Label);

public sealed record ChargeTypeBriefDto(
    Guid Id,
    string Code,
    string Name,
    string Category,
    string? UnitLabel);

public sealed record InvoiceLineDto(
    Guid Id,
    int LineNo,
    ChargeTypeBriefDto? ChargeType,
    string Description,
    string Unit,
    decimal Quantity,
    decimal UnitPrice,
    int Sign,
    int ProrationNumerator,
    int ProrationDenominator,
    decimal Amount,
    string SourceScope,
    Guid? SourceRateId,
    bool IsOneTime,
    bool IsManual);

public sealed record InvoiceMeterSegmentDto(
    Guid LineId,
    Guid MeterId,
    Guid? StartReadingId,
    Guid? EndReadingId,
    decimal StartValue,
    decimal EndValue,
    string MeterKind,
    string SerialNumber,
    decimal? Quantity = null);

public sealed record InvoiceAllocationPaymentDto(
    Guid Id,
    string Code,
    string MethodCode,
    DateTime ReceivedAt);

public sealed record InvoiceAllocationDto(
    Guid Id,
    string Kind,
    decimal Amount,
    string Source,
    Guid? ReversesId,
    decimal ReversedAmount,
    InvoiceAllocationPaymentDto? Payment,
    DateTime AllocatedAt,
    InvoiceUserRefDto? AllocatedBy,
    string? Reason);

public sealed record InvoicePendingPaymentDto(
    Guid Id,
    string Code,
    decimal Amount,
    DateTime ReceivedAt);

public sealed record InvoiceDeliveryDto(
    Guid Id,
    string Status,
    string ToEmail,
    DateTime CreatedAt,
    bool Simulated);

public sealed record InvoiceDetailDto(
    Guid Id,
    string? Code,
    string Kind,
    string Status,
    Guid TenancyId,
    InvoiceRoomRefDto Room,
    PropertyRefDto Property,
    TenantBriefDto Representative,
    InvoicePeriodDetailDto? Period,
    DateOnly ServiceFrom,
    DateOnly ServiceTo,
    DateOnly? IssuedOn,
    DateOnly? DueOn,
    decimal TotalAmount,
    decimal OriginalAmount,
    decimal AdjustmentAmount,
    decimal ReceivableAmount,
    decimal PaidAmount,
    decimal OutstandingAmount,
    string PaymentStatus,
    bool IsOverdue,
    int DaysOverdue,
    Guid? OriginalInvoiceId,
    IReadOnlyList<ProblemDto> Problems,
    bool Stale,
    DateTime CreatedAt,
    DateTime? VoidedAt,
    string? VoidReason,
    string? Notes,
    DateTime? IssuedAt,
    InvoiceUserRefDto? IssuedBy,
    InvoiceUserRefDto? VoidedBy,
    InvoiceUserRefDto? CreatedBy,
    IReadOnlyList<InvoiceLineDto> Lines,
    IReadOnlyList<InvoiceMeterSegmentDto> MeterSegments,
    IReadOnlyList<InvoiceAllocationDto> Allocations,
    IReadOnlyList<InvoiceListItemDto> Adjustments,
    InvoiceListItemDto? Original,
    IReadOnlyList<InvoicePendingPaymentDto> PendingPayments,
    IReadOnlyList<InvoiceDeliveryDto> Deliveries);
public sealed record VoidInvoiceRequest(string? Reason);
