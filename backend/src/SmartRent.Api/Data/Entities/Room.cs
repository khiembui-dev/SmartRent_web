using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

/// <summary>
/// Phòng cùng tin đăng, tiện ích, ảnh, giá riêng và lịch sử trạng thái.
/// </summary>
public partial class Room
{
    public Guid Id { get; set; }

    public Guid PropertyId { get; set; }

    public string Code { get; set; } = null!;

    public string Name { get; set; } = null!;

    public string? FloorLabel { get; set; }

    public decimal AreaM2 { get; set; }

    public short Capacity { get; set; }

    public string RoomTypeCode { get; set; } = null!;

    public string RoomTypeName { get; set; } = null!;

    public string? Description { get; set; }

    public string? RulesText { get; set; }

    public decimal RequiredDeposit { get; set; }

    public string OperatingStatus { get; set; } = null!;

    public string? StatusReason { get; set; }

    public string? ListingSlug { get; set; }

    public string? ListingTitle { get; set; }

    public string? ListingDescription { get; set; }

    public string ListingStatus { get; set; } = null!;

    public string? VideoUrl { get; set; }

    public DateTime? PublishedAt { get; set; }

    public string Amenities { get; set; } = null!;

    public string Images { get; set; } = null!;

    public string Rates { get; set; } = null!;

    public string StatusHistory { get; set; } = null!;

    public DateTime CreatedAt { get; set; }

    public DateTime UpdatedAt { get; set; }

    public virtual ICollection<Booking> Bookings { get; set; } = new List<Booking>();

    public virtual ICollection<Contract> Contracts { get; set; } = new List<Contract>();

    public virtual Property Property { get; set; } = null!;

    public virtual ICollection<Ticket> Tickets { get; set; } = new List<Ticket>();
}
