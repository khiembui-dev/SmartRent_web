using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

public partial class VDepositBalance
{
    public Guid? ContractId { get; set; }

    public decimal? Held { get; set; }

    public decimal? Received { get; set; }

    public decimal? Refunded { get; set; }

    public decimal? OffsetAmount { get; set; }
}
