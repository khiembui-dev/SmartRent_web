using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

/// <summary>
/// Nhật ký tự động: ai, lúc nào, sửa gì, trước sau ra sao, lý do. Cũng ghi các lần xuất CSV. Chứa liên hệ khách nên phải bảo vệ như dữ liệu riêng tư.
/// </summary>
public partial class AuditLog
{
    public long Id { get; set; }

    public Guid? OrganizationId { get; set; }

    public Guid? ActorId { get; set; }

    public string Action { get; set; } = null!;

    public string TableName { get; set; } = null!;

    public string RecordKey { get; set; } = null!;

    public string? OldData { get; set; }

    public string? NewData { get; set; }

    public string? Reason { get; set; }

    public Guid? CorrelationId { get; set; }

    public DateTime OccurredAt { get; set; }

    public virtual User? Actor { get; set; }

    public virtual Organization? Organization { get; set; }
}
