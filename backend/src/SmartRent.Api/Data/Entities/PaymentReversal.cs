using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

/// <summary>
/// Đảo khoản thu nhập sai hoặc hoàn tiền; giữ nguyên khoản thu gốc, không xóa dấu vết.
/// </summary>
public partial class PaymentReversal
{
    public Guid Id { get; set; }

    public Guid PaymentId { get; set; }

    public decimal Amount { get; set; }

    public string Kind { get; set; } = null!;

    public DateTime OccurredAt { get; set; }

    public string MethodCode { get; set; } = null!;

    public Guid? EvidenceFileId { get; set; }

    public string? ExternalReference { get; set; }

    public string Reason { get; set; } = null!;

    public Guid ConfirmedBy { get; set; }

    public Guid IdempotencyKey { get; set; }

    public DateTime CreatedAt { get; set; }

    public virtual User ConfirmedByNavigation { get; set; } = null!;

    public virtual ICollection<DepositEntry> DepositEntries { get; set; } = new List<DepositEntry>();

    public virtual StoredFile? EvidenceFile { get; set; }

    public virtual PaymentMethod MethodCodeNavigation { get; set; } = null!;

    public virtual Payment Payment { get; set; } = null!;
}
