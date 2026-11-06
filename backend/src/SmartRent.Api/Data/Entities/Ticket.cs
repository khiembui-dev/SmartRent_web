using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

/// <summary>
/// Sự cố cùng loại, tệp, hội thoại và tiến độ trong một bảng.
/// </summary>
public partial class Ticket
{
    public Guid Id { get; set; }

    public string Code { get; set; } = null!;

    public Guid RoomId { get; set; }

    public Guid? ContractId { get; set; }

    public string CategoryCode { get; set; } = null!;

    public Guid ReportedBy { get; set; }

    public Guid? AssignedTo { get; set; }

    public string Title { get; set; } = null!;

    public string Description { get; set; } = null!;

    public string Priority { get; set; } = null!;

    public string Status { get; set; } = null!;

    public DateTime DueAt { get; set; }

    public string? WaitingReason { get; set; }

    public string? ResolutionNotes { get; set; }

    public DateTime? ResolvedAt { get; set; }

    public DateTime? ClosedAt { get; set; }

    public string AttachmentFileIds { get; set; } = null!;

    public string Messages { get; set; } = null!;

    public string History { get; set; } = null!;

    public DateTime CreatedAt { get; set; }

    public DateTime UpdatedAt { get; set; }

    public virtual User? AssignedToNavigation { get; set; }

    public virtual Contract? Contract { get; set; }

    public virtual User ReportedByNavigation { get; set; } = null!;

    public virtual Room Room { get; set; } = null!;
}
