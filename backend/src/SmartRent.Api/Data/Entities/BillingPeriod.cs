using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

/// <summary>
/// Tháng tính tiền của một cơ sở ở trang Tính tiền phòng. Khóa tháng chặn sửa chỉ số và hóa đơn của tháng đó.
/// </summary>
public partial class BillingPeriod
{
    public Guid Id { get; set; }

    public Guid PropertyId { get; set; }

    public DateOnly MonthStart { get; set; }

    public string Status { get; set; } = null!;

    public DateTime? LockedAt { get; set; }

    public Guid? LockedBy { get; set; }

    public virtual ICollection<BillingPeriodEvent> BillingPeriodEvents { get; set; } = new List<BillingPeriodEvent>();

    public virtual ICollection<ChargeInstance> ChargeInstances { get; set; } = new List<ChargeInstance>();

    public virtual ICollection<Invoice> Invoices { get; set; } = new List<Invoice>();

    public virtual User? LockedByNavigation { get; set; }

    public virtual ICollection<MeterReading> MeterReadings { get; set; } = new List<MeterReading>();

    public virtual Property Property { get; set; } = null!;
}
