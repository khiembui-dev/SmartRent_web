using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

public partial class VUserContract
{
    public Guid? Id { get; set; }

    public string? Code { get; set; }

    public Guid? RoomId { get; set; }

    public Guid? UserId { get; set; }

    public string? Status { get; set; }

    public DateOnly? StartsOn { get; set; }

    public DateOnly? EndsOn { get; set; }

    public DateOnly? MoveInOn { get; set; }

    public DateOnly? MoveOutOn { get; set; }

    public bool? FinanceVisible { get; set; }
}
