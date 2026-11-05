using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

/// <summary>
/// Chỉ số công tơ, không được giảm theo thời gian. Sửa số: hủy bản cũ có lý do rồi ghi bản mới; số đã lên hóa đơn phát hành thì không sửa được.
/// </summary>
public partial class MeterReading
{
    public Guid Id { get; set; }

    public Guid MeterId { get; set; }

    public DateTime ObservedAt { get; set; }

    public decimal ReadingValue { get; set; }

    public Guid? BillingPeriodId { get; set; }

    public Guid? TenancyId { get; set; }

    public Guid? HandoverId { get; set; }

    public string ReadingKind { get; set; } = null!;

    public string Status { get; set; } = null!;

    public Guid? SupersedesId { get; set; }

    public string? VoidReason { get; set; }

    public string? Notes { get; set; }

    public Guid RecordedBy { get; set; }

    public DateTime RecordedAt { get; set; }

    public virtual BillingPeriod? BillingPeriod { get; set; }

    public virtual Handover? Handover { get; set; }

    public virtual MeterReading? InverseSupersedes { get; set; }

    public virtual ICollection<InvoiceMeterSegment> InvoiceMeterSegmentFromReadings { get; set; } = new List<InvoiceMeterSegment>();

    public virtual ICollection<InvoiceMeterSegment> InvoiceMeterSegmentToReadings { get; set; } = new List<InvoiceMeterSegment>();

    public virtual Meter Meter { get; set; } = null!;

    public virtual User RecordedByNavigation { get; set; } = null!;

    public virtual MeterReading? Supersedes { get; set; }

    public virtual Tenancy? Tenancy { get; set; }
}
