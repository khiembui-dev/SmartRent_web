using System;
using System.Collections.Generic;
using System.Net;

namespace SmartRent.Api.Data.Entities;

/// <summary>
/// Phiên đăng nhập, refresh token chỉ lưu băm. Trang tài khoản liệt kê và thu hồi phiên từ bảng này.
/// </summary>
public partial class UserSession
{
    public Guid Id { get; set; }

    public Guid UserId { get; set; }

    public string RefreshTokenHash { get; set; } = null!;

    public DateTime CreatedAt { get; set; }

    public DateTime? LastSeenAt { get; set; }

    public DateTime ExpiresAt { get; set; }

    public DateTime? RevokedAt { get; set; }

    public Guid? ReplacedById { get; set; }

    public IPAddress? IpAddress { get; set; }

    public string? UserAgent { get; set; }

    public virtual ICollection<UserSession> InverseReplacedBy { get; set; } = new List<UserSession>();

    public virtual UserSession? ReplacedBy { get; set; }

    public virtual User User { get; set; } = null!;
}
