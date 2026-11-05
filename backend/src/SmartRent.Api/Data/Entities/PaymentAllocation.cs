using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

/// <summary>
/// Phân bổ tiền vào hóa đơn, từ một khoản thu hoặc từ bù trừ cọc. Hoàn tác bằng dòng đảo liên kết, không sửa dòng cũ.
/// </summary>
public partial class PaymentAllocation
{
    public Guid Id { get; set; }

    public Guid InvoiceId { get; set; }

    public Guid? PaymentId { get; set; }

    public Guid? DepositEntryId { get; set; }

    public string Kind { get; set; } = null!;

    public decimal Amount { get; set; }

    public Guid? ReversesId { get; set; }

    public Guid AllocatedBy { get; set; }

    public DateTime AllocatedAt { get; set; }

    public string? Reason { get; set; }

    public Guid IdempotencyKey { get; set; }

    public virtual User AllocatedByNavigation { get; set; } = null!;

    public virtual DepositEntry? DepositEntry { get; set; }

    public virtual ICollection<PaymentAllocation> InverseReverses { get; set; } = new List<PaymentAllocation>();

    public virtual Invoice Invoice { get; set; } = null!;

    public virtual Payment? Payment { get; set; }

    public virtual PaymentAllocation? Reverses { get; set; }
}
