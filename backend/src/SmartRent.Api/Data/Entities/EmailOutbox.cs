using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

/// <summary>
/// Hàng đợi email ghi cùng transaction nghiệp vụ, tiến trình nền gửi và thử lại: đặt lại mật khẩu, hóa đơn, nhắc nợ. Lỗi email không làm mất hóa đơn.
/// </summary>
public partial class EmailOutbox
{
    public Guid Id { get; set; }

    public Guid? OrganizationId { get; set; }

    public Guid? RecipientUserId { get; set; }

    public string ToEmail { get; set; } = null!;

    public string TemplateCode { get; set; } = null!;

    public string Subject { get; set; } = null!;

    public string Body { get; set; } = null!;

    public string DedupeKey { get; set; } = null!;

    public string Status { get; set; } = null!;

    public int Attempts { get; set; }

    public DateTime AvailableAt { get; set; }

    public DateTime? LockedUntil { get; set; }

    public DateTime? SentAt { get; set; }

    public string? LastError { get; set; }

    public DateTime CreatedAt { get; set; }

    public virtual Organization? Organization { get; set; }

    public virtual User? RecipientUser { get; set; }
}
