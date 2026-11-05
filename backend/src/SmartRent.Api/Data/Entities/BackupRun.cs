using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

/// <summary>
/// Nhật ký sao lưu và thử khôi phục ở trang Hỗ trợ và vận hành. Ghi dòng ở đây không tự tạo bản sao lưu.
/// </summary>
public partial class BackupRun
{
    public Guid Id { get; set; }

    public string Kind { get; set; } = null!;

    public string Status { get; set; } = null!;

    public string Reference { get; set; } = null!;

    public Guid? RequestedBy { get; set; }

    public DateTime StartedAt { get; set; }

    public DateTime? FinishedAt { get; set; }

    public string? ErrorMessage { get; set; }

    public virtual User? RequestedByNavigation { get; set; }
}
