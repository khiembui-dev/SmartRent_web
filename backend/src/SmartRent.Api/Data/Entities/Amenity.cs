using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

/// <summary>
/// Tiện ích của đơn vị. Form phòng thêm được tiện ích mới ngay khi nhập.
/// </summary>
public partial class Amenity
{
    public Guid Id { get; set; }

    public Guid OrganizationId { get; set; }

    public string Code { get; set; } = null!;

    public string Name { get; set; } = null!;

    public string? Icon { get; set; }

    public virtual Organization Organization { get; set; } = null!;

    public virtual ICollection<Room> Rooms { get; set; } = new List<Room>();
}
