using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

/// <summary>
/// Cách thanh toán: tiền mặt, chuyển khoản, khác.
/// </summary>
public partial class PaymentMethod
{
    public string Code { get; set; } = null!;

    public string Name { get; set; } = null!;

    public bool IsActive { get; set; }

    public virtual ICollection<PaymentReversal> PaymentReversals { get; set; } = new List<PaymentReversal>();

    public virtual ICollection<Payment> Payments { get; set; } = new List<Payment>();
}
