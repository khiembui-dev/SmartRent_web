using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

/// <summary>
/// Lịch hẹn xem phòng admin xếp và kết quả sau khi xem.
/// </summary>
public partial class RoomViewing
{
    public Guid Id { get; set; }

    public Guid InquiryId { get; set; }

    public DateTime StartsAt { get; set; }

    public DateTime EndsAt { get; set; }

    public Guid? HostUserId { get; set; }

    public string Status { get; set; } = null!;

    public string? ResultNotes { get; set; }

    public DateTime CreatedAt { get; set; }

    public virtual User? HostUser { get; set; }

    public virtual RentalInquiry Inquiry { get; set; } = null!;
}
