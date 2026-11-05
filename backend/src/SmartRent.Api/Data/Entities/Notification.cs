using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

/// <summary>
/// Thông báo ở chuông trên đầu trang. event_key chống gửi trùng cùng một sự kiện.
/// </summary>
public partial class Notification
{
    public Guid Id { get; set; }

    public Guid? OrganizationId { get; set; }

    public Guid RecipientId { get; set; }

    public string EventKey { get; set; } = null!;

    public string Title { get; set; } = null!;

    public string Body { get; set; } = null!;

    public string? RelativeUrl { get; set; }

    public DateTime? ReadAt { get; set; }

    public DateTime CreatedAt { get; set; }

    public virtual Organization? Organization { get; set; }

    public virtual User Recipient { get; set; } = null!;
}
