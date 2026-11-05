using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

/// <summary>
/// Sổ cọc chỉ ghi thêm: nhận, hoàn, bù trừ vào hóa đơn, đảo. Mỗi dòng giữ khoản thu gốc nên đối chiếu được từng đồng.
/// </summary>
public partial class DepositEntry
{
    public Guid Id { get; set; }

    public Guid TenancyId { get; set; }

    public Guid PaymentId { get; set; }

    public string Kind { get; set; } = null!;

    public decimal Amount { get; set; }

    public Guid? RelatedEntryId { get; set; }

    public Guid? PaymentReversalId { get; set; }

    public Guid? SettlementId { get; set; }

    public DateTime OccurredAt { get; set; }

    public string Reason { get; set; } = null!;

    public Guid ConfirmedBy { get; set; }

    public Guid IdempotencyKey { get; set; }

    public DateTime CreatedAt { get; set; }

    public virtual User ConfirmedByNavigation { get; set; } = null!;

    public virtual ICollection<DepositEntry> InverseRelatedEntry { get; set; } = new List<DepositEntry>();

    public virtual Payment Payment { get; set; } = null!;

    public virtual ICollection<PaymentAllocation> PaymentAllocations { get; set; } = new List<PaymentAllocation>();

    public virtual PaymentReversal? PaymentReversal { get; set; }

    public virtual DepositEntry? RelatedEntry { get; set; }

    public virtual CheckoutSettlement? Settlement { get; set; }

    public virtual Tenancy Tenancy { get; set; } = null!;
}
