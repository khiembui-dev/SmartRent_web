using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

/// <summary>
/// Claim của tài khoản, bảng chuẩn của Identity.
/// </summary>
public partial class UserClaim
{
    public int Id { get; set; }

    public Guid UserId { get; set; }

    public string? ClaimType { get; set; }

    public string? ClaimValue { get; set; }

    public virtual User User { get; set; } = null!;
}
