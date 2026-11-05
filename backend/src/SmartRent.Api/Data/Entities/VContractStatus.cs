using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

public partial class VContractStatus
{
    public Guid? ContractId { get; set; }

    public string? Code { get; set; }

    public Guid? TenancyId { get; set; }

    public Guid? PredecessorContractId { get; set; }

    public string? Status { get; set; }

    public DateOnly? EndsOn { get; set; }

    public DateOnly? DisplayEndOn { get; set; }

    public int? DaysLeft { get; set; }

    public bool? Expiring { get; set; }

    public bool? StillOccupiedAfterExpiry { get; set; }

    public long? VersionCount { get; set; }

    public bool? HasDraftVersion { get; set; }
}
