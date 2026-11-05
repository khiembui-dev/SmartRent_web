using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

/// <summary>
/// Chỉ số đầu và cuối làm căn cứ cho dòng điện, nước; có nhiều đoạn khi thay công tơ giữa tháng.
/// </summary>
public partial class InvoiceMeterSegment
{
    public Guid Id { get; set; }

    public Guid InvoiceLineId { get; set; }

    public Guid FromReadingId { get; set; }

    public Guid ToReadingId { get; set; }

    public virtual MeterReading FromReading { get; set; } = null!;

    public virtual InvoiceLine InvoiceLine { get; set; } = null!;

    public virtual MeterReading ToReading { get; set; } = null!;
}
