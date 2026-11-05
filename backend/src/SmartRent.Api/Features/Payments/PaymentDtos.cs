using System;
using System.Collections.Generic;

namespace SmartRent.Api.Features.Payments;

// 1. Request DTOs
public sealed record CreatePaymentRequest(
	Guid TenantId,
	decimal Amount,
	DateTime ReceivedAt,
	string MethodCode,
	string? ExternalReference,
	string? Notes,
	Guid? PropertyId,
	bool ConfirmNow,
	IReadOnlyList<PaymentAllocationItemRequest>? Allocations
);

public sealed record PaymentAllocationItemRequest(
	Guid InvoiceId,
	decimal Amount
);

public sealed record ConfirmPaymentRequest(
	IReadOnlyList<PaymentAllocationItemRequest>? Allocations,
	string? ExternalReference
);

public sealed record RejectPaymentRequest(
	string Reason
);

public sealed record ReverseAllocationRequest(
	decimal Amount,
	string Reason,
	bool ReversePayment
);

// 2. Reference & Summary DTOs
public sealed record TenantRefDto(
	Guid Id,
	string Code,
	string FullName,
	string Phone
);

public sealed record RoomRefDto(
	Guid Id,
	string Code,
	string Name,
	Guid PropertyId,
	string PropertyCode,
	string PropertyName
);

public sealed record UserRefDto(
	Guid Id,
	string DisplayName
);

public sealed record FileRefDto(
	Guid Id,
	string FileName,
	string ContentType,
	long SizeBytes,
	string ScanStatus,
	string Visibility,
	DateTime CreatedAt
);

public sealed record InvoiceSummaryBriefDto(
	Guid Id,
	string? Code,
	string Kind,
	string Status,
	decimal TotalAmount,
	decimal PaidAmount,
	decimal OutstandingAmount,
	DateOnly? DueOn
);

public sealed record PaymentAllocationItemDto(
	Guid Id,
	string Kind,
	decimal Amount,
	string Source,
	Guid? ReversesId,
	decimal ReversedAmount,
	InvoiceSummaryBriefDto? Invoice,
	DateTime AllocatedAt,
	UserRefDto? AllocatedBy,
	string? Reason
);

public sealed record PaymentReversalDto(
	Guid Id,
	Guid PaymentId,
	decimal Amount,
	string Kind,
	DateTime OccurredAt,
	string MethodCode,
	Guid? EvidenceFileId,
	string? ExternalReference,
	string Reason,
	UserRefDto? ConfirmedBy
);

public sealed record PaymentDepositEntryDto(
	Guid Id,
	Guid TenancyId,
	string Kind,
	decimal Amount,
	decimal SignedAmount,
	Guid? RelatedEntryId,
	DateTime OccurredAt,
	string? Reason
);

public sealed record PaymentTenancyBriefDto(
	Guid Id,
	string Status,
	string? RoomCode
);

// 3. Payment Detail Response DTO
public sealed record PaymentDto(
	Guid Id,
	string Code,
	string Status,
	TenantRefDto Tenant,
	RoomRefDto? Room,
	decimal Amount,
	DateTime ReceivedAt,
	string MethodCode,
	string? ExternalReference,
	string? Notes,
	UserRefDto? ReportedBy,
	UserRefDto? ConfirmedBy,
	DateTime? ConfirmedAt,
	string? RejectionReason,
	bool IsTenantReported,
	decimal ReversedAmount,
	decimal InvoiceAllocatedAmount,
	decimal DirectInvoiceAmount,
	decimal DepositHeldAmount,
	decimal UnappliedAmount,
	DateTime CreatedAt,
	IReadOnlyList<FileRefDto> Files,
	IReadOnlyList<PaymentAllocationItemDto> Allocations,
	IReadOnlyList<PaymentReversalDto> Reversals,
	IReadOnlyList<PaymentDepositEntryDto> DepositEntries,
	IReadOnlyList<InvoiceSummaryBriefDto> IntendedInvoices,
	IReadOnlyList<InvoiceSummaryBriefDto> OpenInvoices,
	IReadOnlyList<PaymentTenancyBriefDto> Tenancies
);