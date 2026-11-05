using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

public partial class VTenantStatus
{
    public Guid? TenantId { get; set; }

    public Guid? OrganizationId { get; set; }

    public string? ResidenceStatus { get; set; }

    public bool? HasPortalAccount { get; set; }
}
