using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

public partial class VPublicRoom
{
    public Guid? ListingId { get; set; }

    public string? Slug { get; set; }

    public string? Title { get; set; }

    public string? ListingDescription { get; set; }

    public string? VideoUrl { get; set; }

    public DateTime? PublishedAt { get; set; }

    public Guid? RoomId { get; set; }

    public string? RoomCode { get; set; }

    public string? RoomName { get; set; }

    public Guid? RoomTypeId { get; set; }

    public string? FloorLabel { get; set; }

    public decimal? AreaM2 { get; set; }

    public short? Capacity { get; set; }

    public decimal? RequiredDeposit { get; set; }

    public string? Description { get; set; }

    public string? RulesText { get; set; }

    public Guid? PropertyId { get; set; }

    public Guid? OrganizationId { get; set; }

    public string? PropertyName { get; set; }

    public string? AddressLine { get; set; }

    public string? Locality { get; set; }

    public string? Province { get; set; }

    public decimal? Latitude { get; set; }

    public decimal? Longitude { get; set; }

    public decimal? Rent { get; set; }
}
