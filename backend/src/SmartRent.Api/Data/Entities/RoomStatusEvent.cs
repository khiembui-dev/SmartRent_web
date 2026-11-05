using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

/// <summary>
/// Lịch sử đưa phòng vào bảo trì, ngừng khai thác hoặc khai thác lại, có lý do.
/// </summary>
public partial class RoomStatusEvent
{
    public Guid Id { get; set; }

    public Guid RoomId { get; set; }

    public string? OldStatus { get; set; }

    public string NewStatus { get; set; } = null!;

    public string Reason { get; set; } = null!;

    public Guid? ChangedBy { get; set; }

    public DateTime ChangedAt { get; set; }

    public virtual User? ChangedByNavigation { get; set; }

    public virtual Room Room { get; set; } = null!;
}
