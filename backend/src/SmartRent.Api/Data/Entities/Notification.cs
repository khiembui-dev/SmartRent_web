using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

/// <summary>
/// Thông báo và trạng thái đọc theo tài khoản.
/// </summary>
public partial class Notification
{
    public Guid Id { get; set; }

    public Guid RecipientId { get; set; }

    public string EventKey { get; set; } = null!;

    public string Title { get; set; } = null!;

    public string Body { get; set; } = null!;

    public string? Url { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? ReadAt { get; set; }

    public virtual User Recipient { get; set; } = null!;
}
