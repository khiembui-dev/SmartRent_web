using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

/// <summary>
/// Từng khoản trên hóa đơn, chụp giá và số lượng tại lúc lập. Đổi bảng giá không làm đổi hóa đơn cũ.
/// </summary>
public partial class InvoiceLine
{
    public Guid Id { get; set; }

    public Guid InvoiceId { get; set; }

    public int LineNo { get; set; }

    public Guid ChargeTypeId { get; set; }

    public Guid? ChargeInstanceId { get; set; }

    public Guid? SourceRateId { get; set; }

    public string? SourceScope { get; set; }

    public string DescriptionSnapshot { get; set; } = null!;

    public string UnitSnapshot { get; set; } = null!;

    public decimal Quantity { get; set; }

    public decimal UnitPrice { get; set; }

    public short Sign { get; set; }

    public int ProrationNumerator { get; set; }

    public int ProrationDenominator { get; set; }

    public virtual ChargeInstance? ChargeInstance { get; set; }

    public virtual ChargeType ChargeType { get; set; } = null!;

    public virtual Invoice Invoice { get; set; } = null!;

    public virtual InvoiceChargeClaim? InvoiceChargeClaim { get; set; }

    public virtual ICollection<InvoiceMeterSegment> InvoiceMeterSegments { get; set; } = new List<InvoiceMeterSegment>();

    public virtual ChargeRate? SourceRate { get; set; }
}
