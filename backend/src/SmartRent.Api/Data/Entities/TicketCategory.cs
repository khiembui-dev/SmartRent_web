using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

/// <summary>
/// Loại sự cố khách chọn khi gửi yêu cầu hỗ trợ.
/// </summary>
public partial class TicketCategory
{
    public Guid Id { get; set; }

    public Guid OrganizationId { get; set; }

    public string Code { get; set; } = null!;

    public string Name { get; set; } = null!;

    public virtual Organization Organization { get; set; } = null!;

    public virtual ICollection<Ticket> Tickets { get; set; } = new List<Ticket>();
}
