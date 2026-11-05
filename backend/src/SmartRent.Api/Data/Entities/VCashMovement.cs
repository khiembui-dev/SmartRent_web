using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

public partial class VCashMovement
{
    public Guid? TransactionId { get; set; }

    public Guid? TenantId { get; set; }

    public DateTime? OccurredAt { get; set; }

    public string? MethodCode { get; set; }

    public decimal? SignedAmount { get; set; }

    public string? Kind { get; set; }
}
