using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

public partial class VInvoiceBalance
{
    public Guid? InvoiceId { get; set; }

    public Guid? TenancyId { get; set; }

    public Guid? BillingPeriodId { get; set; }

    public string? Code { get; set; }

    public string? Kind { get; set; }

    public string? Status { get; set; }

    public DateOnly? IssuedOn { get; set; }

    public DateOnly? DueOn { get; set; }

    public decimal? OriginalAmount { get; set; }

    public decimal? AdjustmentAmount { get; set; }

    public decimal? ReceivableAmount { get; set; }

    public decimal? PaidAmount { get; set; }

    public decimal? OutstandingAmount { get; set; }

    public string? PaymentStatus { get; set; }

    public bool? IsOverdue { get; set; }
}
