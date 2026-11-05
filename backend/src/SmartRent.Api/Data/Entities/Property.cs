using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

/// <summary>
/// Cơ sở (nhà trọ). Địa chỉ nhập tay; invoice_day và due_after_days là mặc định khi lập hóa đơn. Giá điện nước, phí nằm ở charge_rates.
/// </summary>
public partial class Property
{
    public Guid Id { get; set; }

    public Guid OrganizationId { get; set; }

    public string Code { get; set; } = null!;

    public string Name { get; set; } = null!;

    public string AddressLine { get; set; } = null!;

    public string Locality { get; set; } = null!;

    public string Province { get; set; } = null!;

    public decimal? Latitude { get; set; }

    public decimal? Longitude { get; set; }

    public string? Description { get; set; }

    public string? ContactName { get; set; }

    public string? Phone { get; set; }

    public string? Email { get; set; }

    public short InvoiceDay { get; set; }

    public short DueAfterDays { get; set; }

    public short ContractWarningDays { get; set; }

    public string ProrationPolicy { get; set; } = null!;

    public bool IsActive { get; set; }

    public DateTime CreatedAt { get; set; }

    public virtual ICollection<BillingPeriod> BillingPeriods { get; set; } = new List<BillingPeriod>();

    public virtual ICollection<ChargeRate> ChargeRates { get; set; } = new List<ChargeRate>();

    public virtual Organization Organization { get; set; } = null!;

    public virtual ICollection<Payment> Payments { get; set; } = new List<Payment>();

    public virtual ICollection<Room> Rooms { get; set; } = new List<Room>();

    public virtual ICollection<OrganizationMembership> Memberships { get; set; } = new List<OrganizationMembership>();
}
