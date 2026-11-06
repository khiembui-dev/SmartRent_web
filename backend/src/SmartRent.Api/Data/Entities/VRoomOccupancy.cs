using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

public partial class VRoomOccupancy
{
    public Guid? Id { get; set; }

    public Guid? PropertyId { get; set; }

    public string? Code { get; set; }

    public string? Name { get; set; }

    public string? FloorLabel { get; set; }

    public decimal? AreaM2 { get; set; }

    public short? Capacity { get; set; }

    public string? RoomTypeCode { get; set; }

    public string? RoomTypeName { get; set; }

    public string? Description { get; set; }

    public string? RulesText { get; set; }

    public decimal? RequiredDeposit { get; set; }

    public string? OperatingStatus { get; set; }

    public string? StatusReason { get; set; }

    public string? ListingSlug { get; set; }

    public string? ListingTitle { get; set; }

    public string? ListingDescription { get; set; }

    public string? ListingStatus { get; set; }

    public string? VideoUrl { get; set; }

    public DateTime? PublishedAt { get; set; }

    public string? Amenities { get; set; }

    public string? Images { get; set; }

    public string? Rates { get; set; }

    public string? StatusHistory { get; set; }

    public DateTime? CreatedAt { get; set; }

    public DateTime? UpdatedAt { get; set; }

    public string? OccupancyStatus { get; set; }
}
