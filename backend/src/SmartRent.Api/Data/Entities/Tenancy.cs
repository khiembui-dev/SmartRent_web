using System;
using System.Collections.Generic;
using NpgsqlTypes;

namespace SmartRent.Api.Data.Entities;

/// <summary>
/// Một đợt ở của khách đại diện trong một phòng, là lịch sử thuê của phòng. onboarding_mode = import là khách đang ở được nhập từ form phòng hoặc từ dữ liệu cũ, chưa có hợp đồng.
/// </summary>
public partial class Tenancy
{
    public Guid Id { get; set; }

    public Guid RoomId { get; set; }

    public Guid RepresentativeTenantId { get; set; }

    public Guid? InquiryId { get; set; }

    public string Status { get; set; } = null!;

    public DateOnly PlannedMoveIn { get; set; }

    public DateOnly? ActualMoveIn { get; set; }

    public DateOnly? ActualMoveOut { get; set; }

    /// <summary>
    /// Khoảng ở [ngày vào, ngày trả), tính tự động. Đang ở thì chưa có cận trên.
    /// </summary>
    public NpgsqlRange<DateOnly>? Stay { get; set; }

    public string OnboardingMode { get; set; } = null!;

    public string? EndReason { get; set; }

    public Guid? EndedBy { get; set; }

    public Guid? CreatedBy { get; set; }

    public DateTime CreatedAt { get; set; }

    public virtual ICollection<ChargeInstance> ChargeInstances { get; set; } = new List<ChargeInstance>();

    public virtual CheckoutSettlement? CheckoutSettlement { get; set; }

    public virtual ICollection<Contract> Contracts { get; set; } = new List<Contract>();

    public virtual User? CreatedByNavigation { get; set; }

    public virtual ICollection<DepositEntry> DepositEntries { get; set; } = new List<DepositEntry>();

    public virtual User? EndedByNavigation { get; set; }

    public virtual ICollection<Handover> Handovers { get; set; } = new List<Handover>();

    public virtual RentalInquiry? Inquiry { get; set; }

    public virtual ICollection<Invoice> Invoices { get; set; } = new List<Invoice>();

    public virtual ICollection<MeterReading> MeterReadings { get; set; } = new List<MeterReading>();

    public virtual Tenant RepresentativeTenant { get; set; } = null!;

    public virtual Room Room { get; set; } = null!;

    public virtual ICollection<TenancyRequest> TenancyRequests { get; set; } = new List<TenancyRequest>();

    public virtual ICollection<TenancyResident> TenancyResidents { get; set; } = new List<TenancyResident>();

    public virtual ICollection<Ticket> Tickets { get; set; } = new List<Ticket>();
}
