using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

/// <summary>
/// Chống gửi trùng ở tầng API cho thao tác không có cột idempotency_key riêng: đặt lịch, tạo hợp đồng, trả phòng, gửi ticket. Xóa khi quá expires_at.
/// </summary>
public partial class ApiIdempotencyKey
{
    public Guid UserId { get; set; }

    public string Route { get; set; } = null!;

    public Guid IdempotencyKey { get; set; }

    public string RequestHash { get; set; } = null!;

    public short? ResponseStatus { get; set; }

    public string? ResponseBody { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime ExpiresAt { get; set; }

    public virtual User User { get; set; } = null!;
}
