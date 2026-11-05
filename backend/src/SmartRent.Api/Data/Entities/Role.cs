using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

/// <summary>
/// Vai trò toàn hệ thống của Identity, hiện chỉ có SystemAdmin. Không dùng để cấp quyền trong đơn vị.
/// </summary>
public partial class Role
{
    public Guid Id { get; set; }

    public string? Name { get; set; }

    public string? NormalizedName { get; set; }

    public string? ConcurrencyStamp { get; set; }

    public virtual ICollection<RoleClaim> RoleClaims { get; set; } = new List<RoleClaim>();

    public virtual ICollection<User> Users { get; set; } = new List<User>();
}
