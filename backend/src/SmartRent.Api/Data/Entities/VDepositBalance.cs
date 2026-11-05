using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

public partial class VDepositBalance
{
    public Guid? TenancyId { get; set; }

    public decimal? HeldAmount { get; set; }
}
