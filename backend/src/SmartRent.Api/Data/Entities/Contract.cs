using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

/// <summary>
/// Một hồ sơ thuê và hợp đồng; chứa gia hạn, bản ký, người ở cùng, bàn giao.
/// </summary>
public partial class Contract
{
    public Guid Id { get; set; }

    public string Code { get; set; } = null!;

    public Guid RoomId { get; set; }

    public Guid UserId { get; set; }

    public Guid? BookingId { get; set; }

    public string Status { get; set; } = null!;

    public string OnboardingMode { get; set; } = null!;

    public DateOnly StartsOn { get; set; }

    public DateOnly? MoveInOn { get; set; }

    public DateOnly? MoveOutOn { get; set; }

    public DateOnly? EndsOn { get; set; }

    public decimal RequiredDeposit { get; set; }

    public string Versions { get; set; } = null!;

    public string Attachments { get; set; } = null!;

    public string Occupants { get; set; } = null!;

    public string InitialReadings { get; set; } = null!;

    public string FinalReadings { get; set; } = null!;

    public string CheckinHandover { get; set; } = null!;

    public string CheckoutHandover { get; set; } = null!;

    public string CheckoutSummary { get; set; } = null!;

    public string OnboardingGaps { get; set; } = null!;

    public string? EndedReason { get; set; }

    public string? RemainingDebtReason { get; set; }

    public DateTime? ArchivedAt { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime UpdatedAt { get; set; }

    public virtual Booking? Booking { get; set; }

    public virtual ICollection<Booking> Bookings { get; set; } = new List<Booking>();

    public virtual Invoice? Invoice { get; set; }

    public virtual ICollection<Payment> Payments { get; set; } = new List<Payment>();

    public virtual Room Room { get; set; } = null!;

    public virtual ICollection<Ticket> Tickets { get; set; } = new List<Ticket>();

    public virtual User User { get; set; } = null!;
}
