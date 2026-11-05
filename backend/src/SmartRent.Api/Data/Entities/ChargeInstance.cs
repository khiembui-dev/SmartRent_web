using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

/// <summary>
/// Một lần phát sinh của khoản thu trong đợt thuê. Dùng lại đúng dòng này khi lập lại nên phí một lần không thể thu hai lần.
/// </summary>
public partial class ChargeInstance
{
    public Guid Id { get; set; }

    public Guid TenancyId { get; set; }

    public Guid ChargeTypeId { get; set; }

    public Guid? BillingPeriodId { get; set; }

    public string OccurrenceKey { get; set; } = null!;

    public virtual BillingPeriod? BillingPeriod { get; set; }

    public virtual ChargeType ChargeType { get; set; } = null!;

    public virtual InvoiceChargeClaim? InvoiceChargeClaim { get; set; }

    public virtual ICollection<InvoiceLine> InvoiceLines { get; set; } = new List<InvoiceLine>();

    public virtual Tenancy Tenancy { get; set; } = null!;
}
