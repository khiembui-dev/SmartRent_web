using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

/// <summary>
/// Lịch sử đổi trạng thái, phân công, mở lại của ticket; chỉ ghi thêm.
/// </summary>
public partial class TicketEvent
{
    public Guid Id { get; set; }

    public Guid TicketId { get; set; }

    public string EventType { get; set; } = null!;

    public string? OldStatus { get; set; }

    public string? NewStatus { get; set; }

    public Guid? OldAssigneeId { get; set; }

    public Guid? NewAssigneeId { get; set; }

    public string? Reason { get; set; }

    public Guid ActorId { get; set; }

    public DateTime CreatedAt { get; set; }

    public virtual User Actor { get; set; } = null!;

    public virtual User? NewAssignee { get; set; }

    public virtual User? OldAssignee { get; set; }

    public virtual Ticket Ticket { get; set; } = null!;
}
