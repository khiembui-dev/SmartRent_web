using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

/// <summary>
/// Ảnh đính kèm ticket hoặc một tin nhắn trong ticket.
/// </summary>
public partial class TicketFile
{
    public Guid Id { get; set; }

    public Guid TicketId { get; set; }

    public Guid? MessageId { get; set; }

    public Guid FileId { get; set; }

    public virtual StoredFile File { get; set; } = null!;

    public virtual TicketMessage? Message { get; set; }

    public virtual Ticket Ticket { get; set; } = null!;
}
