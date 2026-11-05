using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

/// <summary>
/// Quyền hỗ trợ có lý do, có hạn do chủ trọ cấp cho quản trị hệ thống. Hiện ở trang Hỗ trợ và vận hành.
/// </summary>
public partial class SupportAccessGrant
{
    public Guid Id { get; set; }

    public Guid OrganizationId { get; set; }

    public Guid UserId { get; set; }

    public Guid GrantedBy { get; set; }

    public string Reason { get; set; } = null!;

    public DateTime StartsAt { get; set; }

    public DateTime ExpiresAt { get; set; }

    public DateTime? RevokedAt { get; set; }

    public virtual User GrantedByNavigation { get; set; } = null!;

    public virtual Organization Organization { get; set; } = null!;

    public virtual User User { get; set; } = null!;
}
