using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

/// <summary>
/// Phát sinh đang được dòng hóa đơn nào sử dụng. Hóa đơn hủy thì nhả ra, khóa chính chặn thu trùng.
/// </summary>
public partial class InvoiceChargeClaim
{
    public Guid ChargeInstanceId { get; set; }

    public Guid InvoiceLineId { get; set; }

    public virtual ChargeInstance ChargeInstance { get; set; } = null!;

    public virtual InvoiceLine InvoiceLine { get; set; } = null!;
}
