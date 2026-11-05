using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

/// <summary>
/// Đăng nhập qua nhà cung cấp ngoài, bảng chuẩn của Identity.
/// </summary>
public partial class UserLogin
{
    public string LoginProvider { get; set; } = null!;

    public string ProviderKey { get; set; } = null!;

    public string? ProviderDisplayName { get; set; }

    public Guid UserId { get; set; }

    public virtual User User { get; set; } = null!;
}
