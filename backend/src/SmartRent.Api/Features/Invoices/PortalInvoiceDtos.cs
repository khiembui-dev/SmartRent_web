using System;
using System.Collections.Generic;
using SmartRent.Api.Features.Billing;
namespace SmartRent.Api.Features.Invoices;

// 1. Query tham số lọc danh sách hóa đơn portal
public sealed record PortalInvoiceListQuery(
    int Page = 1,
    int PageSize = 12,
    string? Sort = "-serviceFrom",
    string? Q = null,
    string? Status = null,
    string? PaymentStatus = null,
    bool? HasPending = null);

// 2. Response danh sách hóa đơn portal có phân trang
public sealed record PortalInvoiceListResponse(
    IReadOnlyList<InvoiceListItemDto> Items,
    int TotalItems,
    int Page,
    int PageSize,
    int TotalPages);

// 3. DTO cho thẻ tổng quan (Banner đỏ và các thông số đầu trang)
public sealed record PortalOverviewDto(
    string FullName,
    IReadOnlyList<PortalTenancyListItemDto> Tenancies,
    bool HasRepresentativeRole,
    IReadOnlyList<InvoiceListItemDto> OpenInvoices,
    decimal OutstandingTotal,
    decimal OverdueTotal,
    IReadOnlyList<PortalPendingPaymentDto> PendingPayments,
    IReadOnlyList<PortalTicketListItemDto> OpenTickets,
    int PendingRequests,
    int UnreadNotifications);

// 4. Các DTO phụ trợ
public sealed record PortalTenancyListItemDto(
    Guid Id,
    string Role,
    string Status,
    RoomRefDto Room,
    PropertyRefDto Property,
    TenantBriefDto Representative,
    DateOnly? PlannedMoveIn,
    DateOnly? ActualMoveIn,
    DateOnly? ActualMoveOut,
    DateOnly? JoinedOn,
    DateOnly? LeftOn,
    decimal Rent,
    decimal? RequiredDeposit,
    decimal DepositHeld,
    bool FinanceVisible);

public sealed record PortalPendingPaymentDto(
    Guid Id,
    string Code,
    decimal Amount,
    DateTime ReceivedAt,
    string MethodCode,
    string Status,
    string? ExternalReference,
    string? Notes);

public sealed record PortalTicketListItemDto(
    Guid Id,
    string Code,
    string Title,
    string Status,
    string Priority,
    DateTime CreatedAt);