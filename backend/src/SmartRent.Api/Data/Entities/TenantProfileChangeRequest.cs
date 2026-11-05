using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

/// <summary>
/// Khách đề nghị đổi liên hệ ở trang Tài khoản, admin duyệt ở hồ sơ khách. Họ tên và giấy tờ phải đối chiếu trực tiếp nên không có ở đây.
/// </summary>
public partial class TenantProfileChangeRequest
{
    public Guid Id { get; set; }

    public Guid TenantId { get; set; }

    public Guid RequestedBy { get; set; }

    public DateTime RequestedAt { get; set; }

    public string Status { get; set; } = null!;

    public string? ProposedPhone { get; set; }

    public string? ProposedEmail { get; set; }

    public string? ProposedEmergencyContactName { get; set; }

    public string? ProposedEmergencyContactPhone { get; set; }

    public string? Reason { get; set; }

    public string? ReviewNotes { get; set; }

    public Guid? ReviewedBy { get; set; }

    public DateTime? ReviewedAt { get; set; }

    public virtual User RequestedByNavigation { get; set; } = null!;

    public virtual User? ReviewedByNavigation { get; set; }

    public virtual Tenant Tenant { get; set; } = null!;
}
