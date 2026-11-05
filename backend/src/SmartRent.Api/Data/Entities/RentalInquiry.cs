using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

/// <summary>
/// Yêu cầu xem phòng khách đặt ở trang phòng, xử lý ở Lịch xem phòng của admin. Không giữ chỗ, không đổi trạng thái phòng.
/// </summary>
public partial class RentalInquiry
{
    public Guid Id { get; set; }

    public string Code { get; set; } = null!;

    public Guid RoomId { get; set; }

    public Guid? TenantId { get; set; }

    public string Source { get; set; } = null!;

    public string ContactName { get; set; } = null!;

    public string? Phone { get; set; }

    public string? Email { get; set; }

    public DateOnly? DesiredMoveIn { get; set; }

    public DateTime? PreferredViewingAt { get; set; }

    public short Occupants { get; set; }

    public string? Message { get; set; }

    public string Status { get; set; } = null!;

    public Guid? AssignedTo { get; set; }

    public string? ClosedReason { get; set; }

    public DateTime CreatedAt { get; set; }

    public virtual User? AssignedToNavigation { get; set; }

    public virtual Room Room { get; set; } = null!;

    public virtual ICollection<RoomViewing> RoomViewings { get; set; } = new List<RoomViewing>();

    public virtual ICollection<Tenancy> Tenancies { get; set; } = new List<Tenancy>();

    public virtual Tenant? Tenant { get; set; }
}
