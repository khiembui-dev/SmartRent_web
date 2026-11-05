using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

/// <summary>
/// Người ở cùng. Họ xem được phòng và điều khoản, không có nghĩa vụ thanh toán và không xem công nợ của người đại diện.
/// </summary>
public partial class TenancyResident
{
    public Guid Id { get; set; }

    public Guid TenancyId { get; set; }

    public Guid TenantId { get; set; }

    public DateOnly JoinedOn { get; set; }

    public DateOnly? LeftOn { get; set; }

    public string? Relationship { get; set; }

    public virtual Tenancy Tenancy { get; set; } = null!;

    public virtual Tenant Tenant { get; set; } = null!;
}
