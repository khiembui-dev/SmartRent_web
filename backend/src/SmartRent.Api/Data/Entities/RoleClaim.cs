using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

/// <summary>
/// Claim của vai trò toàn hệ thống, bảng chuẩn của Identity.
/// </summary>
public partial class RoleClaim
{
    public int Id { get; set; }

    public Guid RoleId { get; set; }

    public string? ClaimType { get; set; }

    public string? ClaimValue { get; set; }

    public virtual Role Role { get; set; } = null!;
}
