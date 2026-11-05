using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

/// <summary>
/// Tin đăng ở trang Thuê phòng, độc lập với việc có người ở; slug là đường dẫn /rooms/:slug.
/// </summary>
public partial class RoomListing
{
    public Guid Id { get; set; }

    public Guid RoomId { get; set; }

    public string Slug { get; set; } = null!;

    public string Title { get; set; } = null!;

    public string? Description { get; set; }

    public string? VideoUrl { get; set; }

    public string Status { get; set; } = null!;

    public DateTime? PublishedAt { get; set; }

    public DateTime UpdatedAt { get; set; }

    public virtual Room Room { get; set; } = null!;
}
