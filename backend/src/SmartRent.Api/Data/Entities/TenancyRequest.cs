using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

/// <summary>
/// Đề nghị gia hạn hoặc trả phòng khách gửi từ trang Hợp đồng; gửi chưa làm thay đổi hợp đồng.
/// </summary>
public partial class TenancyRequest
{
    public Guid Id { get; set; }

    public Guid TenancyId { get; set; }

    public string RequestType { get; set; } = null!;

    public DateOnly DesiredOn { get; set; }

    public string? Message { get; set; }

    public string Status { get; set; } = null!;

    public Guid RequestedBy { get; set; }

    public Guid? ReviewedBy { get; set; }

    public string? DecisionNotes { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime? ReviewedAt { get; set; }

    public virtual User RequestedByNavigation { get; set; } = null!;

    public virtual User? ReviewedByNavigation { get; set; }

    public virtual Tenancy Tenancy { get; set; } = null!;
}
