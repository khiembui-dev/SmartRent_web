using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

/// <summary>
/// Loại phòng, dùng để lọc ở trang Thuê phòng. Form admin không hỏi loại nên phòng mới nhận loại STANDARD của đơn vị.
/// </summary>
public partial class RoomType
{
    public Guid Id { get; set; }

    public Guid OrganizationId { get; set; }

    public string Code { get; set; } = null!;

    public string Name { get; set; } = null!;

    public string? Description { get; set; }

    public virtual Organization Organization { get; set; } = null!;

    public virtual ICollection<Room> Rooms { get; set; } = new List<Room>();
}
