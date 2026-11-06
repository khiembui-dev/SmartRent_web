using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

/// <summary>
/// Cơ sở, danh mục tiện ích và bảng giá mặc định dạng JSONB.
/// </summary>
public partial class Property
{
    public Guid Id { get; set; }

    public string Code { get; set; } = null!;

    public string Name { get; set; } = null!;

    public string AddressLine { get; set; } = null!;

    public string? Locality { get; set; }

    public string Province { get; set; } = null!;

    public string? Description { get; set; }

    public bool IsActive { get; set; }

    public string? InactiveReason { get; set; }

    public short InvoiceDay { get; set; }

    public short DueAfterDays { get; set; }

    public string ProrationPolicy { get; set; } = null!;

    public string AmenityOptions { get; set; } = null!;

    public string Rates { get; set; } = null!;

    public DateTime CreatedAt { get; set; }

    public DateTime UpdatedAt { get; set; }

    public virtual ICollection<BillingPeriod> BillingPeriods { get; set; } = new List<BillingPeriod>();

    public virtual ICollection<Room> Rooms { get; set; } = new List<Room>();
}
