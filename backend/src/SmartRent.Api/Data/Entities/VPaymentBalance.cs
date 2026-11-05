using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

public partial class VPaymentBalance
{
    public Guid? PaymentId { get; set; }

    public Guid? TenantId { get; set; }

    public string? Status { get; set; }

    public decimal? Amount { get; set; }

    public decimal? ReversedAmount { get; set; }

    public decimal? InvoiceAllocatedAmount { get; set; }

    public decimal? DepositHeldAmount { get; set; }

    public decimal? UnappliedAmount { get; set; }
}
