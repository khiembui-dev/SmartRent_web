using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

public partial class VUserBooking
{
    public Guid? Id { get; set; }

    public string? Code { get; set; }

    public Guid? UserId { get; set; }

    public Guid? RoomId { get; set; }

    public Guid? ContractId { get; set; }

    public string? Kind { get; set; }

    public string? Status { get; set; }

    public string? ContactName { get; set; }

    public string? Phone { get; set; }

    public string? Email { get; set; }

    public short? Occupants { get; set; }

    public DateTime? PreferredViewingAt { get; set; }

    public DateOnly? DesiredOn { get; set; }

    public string? Message { get; set; }

    public string? Changes { get; set; }

    public string? Appointments { get; set; }

    public string? HoldStatus { get; set; }

    public DateOnly? HoldFrom { get; set; }

    public DateOnly? HoldTo { get; set; }

    public DateTime? HoldExpiresAt { get; set; }

    public string? HoldReason { get; set; }

    public Guid? ReviewedBy { get; set; }

    public DateTime? ReviewedAt { get; set; }

    public string? DecisionNotes { get; set; }

    public string? History { get; set; }

    public DateTime? CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }
}
