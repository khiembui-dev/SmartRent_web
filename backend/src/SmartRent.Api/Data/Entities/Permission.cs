using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

/// <summary>
/// Danh mục quyền nhỏ mà router và API đang kiểm tra, ví dụ invoices.issue, payments.confirm.
/// </summary>
public partial class Permission
{
    public string Code { get; set; } = null!;

    public string Description { get; set; } = null!;

    public virtual ICollection<BusinessRole> Roles { get; set; } = new List<BusinessRole>();
}
