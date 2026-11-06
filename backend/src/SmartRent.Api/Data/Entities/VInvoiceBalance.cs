using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

public partial class VInvoiceBalance
{
    public Guid? Id { get; set; }

    public Guid? ContractId { get; set; }

    public string? Status { get; set; }

    public decimal? TotalAmount { get; set; }

    public decimal? ReceivableAmount { get; set; }

    public decimal? PaidAmount { get; set; }

    public decimal? OutstandingAmount { get; set; }

    public string? PaymentStatus { get; set; }

    public bool? IsOverdue { get; set; }
}
