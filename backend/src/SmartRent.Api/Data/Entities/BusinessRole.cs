using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

/// <summary>
/// Vai trò trong một đơn vị. Mặc định có Chủ trọ, Quản lý, Nhân viên; đơn vị có thể tự tạo thêm.
/// </summary>
public partial class BusinessRole
{
    public Guid Id { get; set; }

    public Guid OrganizationId { get; set; }

    public string Code { get; set; } = null!;

    public string Name { get; set; } = null!;

    public bool IsSystem { get; set; }

    public virtual Organization Organization { get; set; } = null!;

    public virtual ICollection<OrganizationMembership> Memberships { get; set; } = new List<OrganizationMembership>();

    public virtual ICollection<Permission> PermissionCodes { get; set; } = new List<Permission>();
}
