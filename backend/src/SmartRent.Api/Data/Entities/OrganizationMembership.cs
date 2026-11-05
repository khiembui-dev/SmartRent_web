using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

/// <summary>
/// Nhân sự của đơn vị: chủ trọ, quản lý, nhân viên; property_scope quyết định xem mọi cơ sở hay chỉ cơ sở được giao.
/// </summary>
public partial class OrganizationMembership
{
    public Guid Id { get; set; }

    public Guid OrganizationId { get; set; }

    public Guid UserId { get; set; }

    public string Status { get; set; } = null!;

    public string PropertyScope { get; set; } = null!;

    public DateTime JoinedAt { get; set; }

    public virtual Organization Organization { get; set; } = null!;

    public virtual User User { get; set; } = null!;

    public virtual ICollection<Property> Properties { get; set; } = new List<Property>();

    public virtual ICollection<BusinessRole> Roles { get; set; } = new List<BusinessRole>();
}
