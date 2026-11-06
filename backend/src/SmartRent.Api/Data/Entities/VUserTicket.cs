using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

public partial class VUserTicket
{
    public Guid? Id { get; set; }

    public string? Code { get; set; }

    public Guid? RoomId { get; set; }

    public Guid? ContractId { get; set; }

    public Guid? ReportedBy { get; set; }

    public string? CategoryCode { get; set; }

    public string? Title { get; set; }

    public string? Description { get; set; }

    public string? Priority { get; set; }

    public string? Status { get; set; }

    public DateTime? DueAt { get; set; }

    public string? ResolutionNotes { get; set; }

    public string? AttachmentFileIds { get; set; }

    public string? Messages { get; set; }

    public string? History { get; set; }

    public DateTime? CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }
}
