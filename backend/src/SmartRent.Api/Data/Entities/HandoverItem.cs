using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

/// <summary>
/// Tài sản ghi trong biên bản bàn giao, là nội dung của biên bản nên không phụ thuộc danh mục nào.
/// </summary>
public partial class HandoverItem
{
    public Guid Id { get; set; }

    public Guid HandoverId { get; set; }

    public string Name { get; set; } = null!;

    public decimal Quantity { get; set; }

    public string? ConditionNotes { get; set; }

    public virtual Handover Handover { get; set; } = null!;
}
