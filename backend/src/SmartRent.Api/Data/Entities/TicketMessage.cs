using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

/// <summary>
/// Hội thoại của ticket. Ghi chú nội bộ (is_internal) không bao giờ trả cho khách.
/// </summary>
public partial class TicketMessage
{
    public Guid Id { get; set; }

    public Guid TicketId { get; set; }

    public Guid AuthorId { get; set; }

    public string Body { get; set; } = null!;

    public bool IsInternal { get; set; }

    public DateTime CreatedAt { get; set; }

    public virtual User Author { get; set; } = null!;

    public virtual Ticket Ticket { get; set; } = null!;

    public virtual ICollection<TicketFile> TicketFiles { get; set; } = new List<TicketFile>();
}
