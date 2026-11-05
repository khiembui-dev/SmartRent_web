using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

public partial class VRoomStatus
{
    public Guid? Id { get; set; }

    public Guid? PropertyId { get; set; }

    public Guid? RoomTypeId { get; set; }

    public string? Code { get; set; }

    public string? Name { get; set; }

    public string? FloorLabel { get; set; }

    public decimal? AreaM2 { get; set; }

    public short? Capacity { get; set; }

    public string? Description { get; set; }

    public string? RulesText { get; set; }

    public decimal? RequiredDeposit { get; set; }

    public string? OperatingStatus { get; set; }

    public DateTime? CreatedAt { get; set; }

    public string? OccupancyStatus { get; set; }

    public Guid? ActiveTenancyId { get; set; }

    public Guid? ActiveTenantId { get; set; }

    public DateOnly? OccupiedSince { get; set; }

    public bool? HasPlannedTenancy { get; set; }
}
