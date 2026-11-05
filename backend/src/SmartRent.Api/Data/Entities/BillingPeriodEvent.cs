using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

/// <summary>
/// Lịch sử khóa và mở khóa tháng, bắt buộc có lý do.
/// </summary>
public partial class BillingPeriodEvent
{
    public Guid Id { get; set; }

    public Guid BillingPeriodId { get; set; }

    public string Action { get; set; } = null!;

    public string Reason { get; set; } = null!;

    public Guid ActorId { get; set; }

    public DateTime CreatedAt { get; set; }

    public virtual User Actor { get; set; } = null!;

    public virtual BillingPeriod BillingPeriod { get; set; } = null!;
}
