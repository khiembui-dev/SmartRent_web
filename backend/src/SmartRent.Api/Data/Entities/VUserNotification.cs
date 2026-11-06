using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

public partial class VUserNotification
{
    public Guid? Id { get; set; }

    public Guid? RecipientId { get; set; }

    public string? EventKey { get; set; }

    public string? Title { get; set; }

    public string? Body { get; set; }

    public string? Url { get; set; }

    public DateTime? CreatedAt { get; set; }

    public DateTime? ReadAt { get; set; }
}
