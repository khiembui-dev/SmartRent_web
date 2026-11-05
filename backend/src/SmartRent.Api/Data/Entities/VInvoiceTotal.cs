using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

public partial class VInvoiceTotal
{
    public Guid? InvoiceId { get; set; }

    public decimal? Amount { get; set; }
}
