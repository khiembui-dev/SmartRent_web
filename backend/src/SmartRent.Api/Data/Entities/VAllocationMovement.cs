using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

public partial class VAllocationMovement
{
    public Guid? Id { get; set; }

    public Guid? InvoiceId { get; set; }

    public Guid? PaymentId { get; set; }

    public Guid? DepositEntryId { get; set; }

    public string? Kind { get; set; }

    public decimal? Amount { get; set; }

    public Guid? ReversesId { get; set; }

    public Guid? AllocatedBy { get; set; }

    public DateTime? AllocatedAt { get; set; }

    public string? Reason { get; set; }

    public Guid? IdempotencyKey { get; set; }

    public decimal? SignedAmount { get; set; }

    public Guid? FundingPaymentId { get; set; }
}
