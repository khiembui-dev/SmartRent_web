using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

/// <summary>
/// Số giờ xử lý theo mức ưu tiên, tính liên tục 24/7: 4, 12, 48, 96 giờ.
/// </summary>
public partial class SlaPolicy
{
    public Guid Id { get; set; }

    public Guid OrganizationId { get; set; }

    public string Priority { get; set; } = null!;

    public int TargetHours { get; set; }

    public virtual Organization Organization { get; set; } = null!;

    public virtual ICollection<Ticket> Tickets { get; set; } = new List<Ticket>();
}
