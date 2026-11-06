using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

/// <summary>
/// Yêu cầu, lịch xem, giữ chỗ và đề nghị của khách, phân biệt bằng kind.
/// </summary>
public partial class Booking
{
    public Guid Id { get; set; }

    public string Code { get; set; } = null!;

    public Guid UserId { get; set; }

    public Guid? RoomId { get; set; }

    public Guid? ContractId { get; set; }

    public string Kind { get; set; } = null!;

    public string Status { get; set; } = null!;

    public string? ContactName { get; set; }

    public string? Phone { get; set; }

    public string? Email { get; set; }

    public short? Occupants { get; set; }

    public DateTime? PreferredViewingAt { get; set; }

    public DateOnly? DesiredOn { get; set; }

    public string? Message { get; set; }

    public string Changes { get; set; } = null!;

    public string Appointments { get; set; } = null!;

    public string? HoldStatus { get; set; }

    public DateOnly? HoldFrom { get; set; }

    public DateOnly? HoldTo { get; set; }

    public DateTime? HoldExpiresAt { get; set; }

    public string? HoldReason { get; set; }

    public Guid? ReviewedBy { get; set; }

    public DateTime? ReviewedAt { get; set; }

    public string? DecisionNotes { get; set; }

    public string History { get; set; } = null!;

    public DateTime CreatedAt { get; set; }

    public DateTime UpdatedAt { get; set; }

    public virtual Contract? Contract { get; set; }

    public virtual Contract? ContractNavigation { get; set; }

    public virtual User? ReviewedByNavigation { get; set; }

    public virtual Room? Room { get; set; }

    public virtual User User { get; set; } = null!;
}
