using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

/// <summary>
/// Bộ đếm cấp mã hóa đơn, hợp đồng, phiếu thu, ticket, yêu cầu xem phòng; an toàn khi nhiều người cùng thao tác.
/// </summary>
public partial class DocumentCounter
{
    public Guid OrganizationId { get; set; }

    public string Series { get; set; } = null!;

    public long LastValue { get; set; }

    public virtual Organization Organization { get; set; } = null!;
}
