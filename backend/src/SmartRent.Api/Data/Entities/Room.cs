using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

/// <summary>
/// Phòng. operating_status chỉ nói phòng được khai thác hay không; Đã thuê suy từ tenancies qua v_room_status, không lưu ở đây.
/// </summary>
public partial class Room
{
    public Guid Id { get; set; }

    public Guid PropertyId { get; set; }

    public Guid RoomTypeId { get; set; }

    public string Code { get; set; } = null!;

    public string Name { get; set; } = null!;

    public string? FloorLabel { get; set; }

    public decimal AreaM2 { get; set; }

    public short Capacity { get; set; }

    public string? Description { get; set; }

    public string? RulesText { get; set; }

    /// <summary>
    /// Tiền cọc đề xuất khi chào thuê. Cọc đã thỏa thuận ở contract_versions, cọc thực thu ở deposit_entries.
    /// </summary>
    public decimal RequiredDeposit { get; set; }

    public string OperatingStatus { get; set; } = null!;

    public DateTime CreatedAt { get; set; }

    public virtual ICollection<ChargeRate> ChargeRates { get; set; } = new List<ChargeRate>();

    public virtual ICollection<Meter> Meters { get; set; } = new List<Meter>();

    public virtual Property Property { get; set; } = null!;

    public virtual ICollection<RentalInquiry> RentalInquiries { get; set; } = new List<RentalInquiry>();

    public virtual RoomImage? RoomImage { get; set; }

    public virtual RoomListing? RoomListing { get; set; }

    public virtual ICollection<RoomStatusEvent> RoomStatusEvents { get; set; } = new List<RoomStatusEvent>();

    public virtual RoomType RoomType { get; set; } = null!;

    public virtual ICollection<Tenancy> Tenancies { get; set; } = new List<Tenancy>();

    public virtual ICollection<Ticket> Tickets { get; set; } = new List<Ticket>();

    public virtual ICollection<Amenity> Amenities { get; set; } = new List<Amenity>();
}
