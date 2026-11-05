using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

/// <summary>
/// Tiền thực nhận hoặc khách báo đã chuyển. Báo chuyển khoản là pending, chưa tính đã thu; chỉ confirmed mới phân bổ được.
/// </summary>
public partial class Payment
{
    public Guid Id { get; set; }

    public string Code { get; set; } = null!;

    public Guid TenantId { get; set; }

    public Guid? PropertyId { get; set; }

    public decimal Amount { get; set; }

    public DateTime ReceivedAt { get; set; }

    public string MethodCode { get; set; } = null!;

    public Guid? BankAccountId { get; set; }

    public string? ExternalReference { get; set; }

    public string Status { get; set; } = null!;

    public Guid? ConfirmedBy { get; set; }

    public DateTime? ConfirmedAt { get; set; }

    public string? RejectionReason { get; set; }

    public Guid? ReportedBy { get; set; }

    public string? Notes { get; set; }

    public Guid IdempotencyKey { get; set; }

    public DateTime CreatedAt { get; set; }

    public virtual BankAccount? BankAccount { get; set; }

    public virtual User? ConfirmedByNavigation { get; set; }

    public virtual ICollection<DepositEntry> DepositEntries { get; set; } = new List<DepositEntry>();

    public virtual PaymentMethod MethodCodeNavigation { get; set; } = null!;

    public virtual ICollection<PaymentAllocation> PaymentAllocations { get; set; } = new List<PaymentAllocation>();

    public virtual ICollection<PaymentReversal> PaymentReversals { get; set; } = new List<PaymentReversal>();

    public virtual Property? Property { get; set; }

    public virtual User? ReportedByNavigation { get; set; }

    public virtual Tenant Tenant { get; set; } = null!;

    public virtual ICollection<StoredFile> Files { get; set; } = new List<StoredFile>();

    public virtual ICollection<Invoice> Invoices { get; set; } = new List<Invoice>();
}
