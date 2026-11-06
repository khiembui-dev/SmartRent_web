using System;
using System.Collections.Generic;
using System.Net;

namespace SmartRent.Api.Data.Entities;

/// <summary>
/// Phiên đăng nhập, đặt lại mật khẩu và lời mời; chỉ lưu hash token.
/// </summary>
public partial class AuthToken
{
    public Guid Id { get; set; }

    public Guid UserId { get; set; }

    public string Kind { get; set; } = null!;

    public string TokenHash { get; set; } = null!;

    public DateTime CreatedAt { get; set; }

    public DateTime ExpiresAt { get; set; }

    public DateTime? ConsumedAt { get; set; }

    public DateTime? RevokedAt { get; set; }

    public string? UserAgent { get; set; }

    public IPAddress? IpAddress { get; set; }

    public virtual User User { get; set; } = null!;
}
