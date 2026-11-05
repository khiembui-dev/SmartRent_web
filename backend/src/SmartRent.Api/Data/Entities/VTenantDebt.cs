using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

public partial class VTenantDebt
{
    public Guid? TenantId { get; set; }

    public Guid? OrganizationId { get; set; }

    public decimal? OutstandingAmount { get; set; }

    public decimal? OverdueAmount { get; set; }

    public long? OverdueCount { get; set; }
}
