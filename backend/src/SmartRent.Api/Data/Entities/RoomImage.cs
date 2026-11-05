using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

/// <summary>
/// Ảnh phòng, thứ tự và ảnh bìa; mỗi phòng tối đa một ảnh bìa.
/// </summary>
public partial class RoomImage
{
    public Guid Id { get; set; }

    public Guid RoomId { get; set; }

    public Guid FileId { get; set; }

    public int SortOrder { get; set; }

    public bool IsCover { get; set; }

    public string? Caption { get; set; }

    public virtual StoredFile File { get; set; } = null!;

    public virtual Room Room { get; set; } = null!;
}
