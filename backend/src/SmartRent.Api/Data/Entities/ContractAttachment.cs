using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

/// <summary>
/// Tệp bổ sung vào hồ sơ hợp đồng sau khi ký, tách khỏi tệp của phiên bản đã khóa.
/// </summary>
public partial class ContractAttachment
{
    public Guid Id { get; set; }

    public Guid ContractId { get; set; }

    public Guid FileId { get; set; }

    public string? Note { get; set; }

    public Guid AddedBy { get; set; }

    public DateTime AddedAt { get; set; }

    public virtual User AddedByNavigation { get; set; } = null!;

    public virtual Contract Contract { get; set; } = null!;

    public virtual StoredFile File { get; set; } = null!;
}
