using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

public partial class VPublicRoom
{
    public Guid? Id { get; set; }

    public Guid? PropertyId { get; set; }

    public string? Code { get; set; }

    public string? Name { get; set; }

    public decimal? AreaM2 { get; set; }

    public short? Capacity { get; set; }

    public string? RoomTypeCode { get; set; }

    public string? RoomTypeName { get; set; }

    public string? ListingSlug { get; set; }

    public string? ListingTitle { get; set; }

    public string? ListingDescription { get; set; }

    public string? VideoUrl { get; set; }

    public string? RulesText { get; set; }

    public decimal? RequiredDeposit { get; set; }

    public string? Amenities { get; set; }

    public string? Rates { get; set; }

    public string? Images { get; set; }
}
