using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

/// <summary>
/// Kỳ tháng theo cơ sở và trạng thái khóa, kể cả tháng chưa có hóa đơn.
/// </summary>
public partial class BillingPeriod
{
    public Guid Id { get; set; }

    public Guid PropertyId { get; set; }

    public DateOnly MonthStart { get; set; }

    public string Status { get; set; } = null!;

    public DateTime? LockedAt { get; set; }

    public Guid? LockedBy { get; set; }

    public string? UnlockReason { get; set; }

    public string History { get; set; } = null!;

    public DateTime CreatedAt { get; set; }

    public virtual ICollection<Invoice> Invoices { get; set; } = new List<Invoice>();

    public virtual User? LockedByNavigation { get; set; }

    public virtual Property Property { get; set; } = null!;
}
