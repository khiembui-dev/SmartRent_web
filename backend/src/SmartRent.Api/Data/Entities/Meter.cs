using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

/// <summary>
/// Công tơ điện, nước của phòng; mỗi phòng một công tơ đang dùng cho mỗi loại. Thay công tơ: chốt removed_at rồi thêm công tơ mới.
/// </summary>
public partial class Meter
{
    public Guid Id { get; set; }

    public Guid RoomId { get; set; }

    public string MeterKind { get; set; } = null!;

    public string SerialNumber { get; set; } = null!;

    public DateTime InstalledAt { get; set; }

    public DateTime? RemovedAt { get; set; }

    public virtual ICollection<MeterReading> MeterReadings { get; set; } = new List<MeterReading>();

    public virtual Room Room { get; set; } = null!;
}
