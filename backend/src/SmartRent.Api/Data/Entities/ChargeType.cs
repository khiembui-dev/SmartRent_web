using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

/// <summary>
/// Danh mục khoản thu: tiền thuê, điện, nước, dịch vụ, rác, internet, phí khác, bồi thường, số dư đầu kỳ.
/// </summary>
public partial class ChargeType
{
    public Guid Id { get; set; }

    public Guid OrganizationId { get; set; }

    public string Code { get; set; } = null!;

    public string Name { get; set; } = null!;

    public string Category { get; set; } = null!;

    public string UnitLabel { get; set; } = null!;

    public bool IsActive { get; set; }

    public virtual ICollection<ChargeInstance> ChargeInstances { get; set; } = new List<ChargeInstance>();

    public virtual ICollection<ChargeRate> ChargeRates { get; set; } = new List<ChargeRate>();

    public virtual ICollection<InvoiceLine> InvoiceLines { get; set; } = new List<InvoiceLine>();

    public virtual Organization Organization { get; set; } = null!;
}
