using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

/// <summary>
/// Yêu cầu hỗ trợ theo phòng, dùng chung giữa trang Hỗ trợ của khách và Ticket của admin.
/// </summary>
public partial class Ticket
{
    public Guid Id { get; set; }

    public string Code { get; set; } = null!;

    public Guid RoomId { get; set; }

    public Guid? TenancyId { get; set; }

    public Guid CategoryId { get; set; }

    public string Title { get; set; } = null!;

    public string Description { get; set; } = null!;

    public string Priority { get; set; } = null!;

    public string Status { get; set; } = null!;

    public Guid ReportedBy { get; set; }

    public Guid? AssignedTo { get; set; }

    public Guid? SlaPolicyId { get; set; }

    public DateTime? DueAt { get; set; }

    public DateTime? ResolvedAt { get; set; }

    public DateTime? ClosedAt { get; set; }

    public string? ResolutionNotes { get; set; }

    public DateTime CreatedAt { get; set; }

    public virtual User? AssignedToNavigation { get; set; }

    public virtual TicketCategory Category { get; set; } = null!;

    public virtual User ReportedByNavigation { get; set; } = null!;

    public virtual Room Room { get; set; } = null!;

    public virtual SlaPolicy? SlaPolicy { get; set; }

    public virtual Tenancy? Tenancy { get; set; }

    public virtual ICollection<TicketEvent> TicketEvents { get; set; } = new List<TicketEvent>();

    public virtual ICollection<TicketFile> TicketFiles { get; set; } = new List<TicketFile>();

    public virtual ICollection<TicketMessage> TicketMessages { get; set; } = new List<TicketMessage>();
}
