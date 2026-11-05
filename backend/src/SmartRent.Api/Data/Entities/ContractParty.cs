using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

/// <summary>
/// Các bên tại thời điểm ký. Là ảnh chụp lịch sử của chứng từ nên không đổi theo hồ sơ khách.
/// </summary>
public partial class ContractParty
{
    public Guid Id { get; set; }

    public Guid ContractVersionId { get; set; }

    public string PartyRole { get; set; } = null!;

    public string FullNameSnapshot { get; set; } = null!;

    public string AddressSnapshot { get; set; } = null!;

    public string? IdentityMasked { get; set; }

    public string? ContactSnapshot { get; set; }

    public Guid? TenantId { get; set; }

    public virtual ContractVersion ContractVersion { get; set; } = null!;

    public virtual Tenant? Tenant { get; set; }
}
