using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

/// <summary>
/// Hóa đơn nội bộ: tháng, cuối đợt thuê, phát sinh, thay thế, điều chỉnh tăng giảm, số dư đầu kỳ. Phát hành rồi không sửa, chỉ điều chỉnh hoặc hủy có lý do.
/// </summary>
public partial class Invoice
{
    public Guid Id { get; set; }

    public Guid TenancyId { get; set; }

    public Guid? BillingPeriodId { get; set; }

    public string Kind { get; set; } = null!;

    public Guid? OriginalInvoiceId { get; set; }

    public string? Code { get; set; }

    public string Status { get; set; } = null!;

    public DateOnly ServiceFrom { get; set; }

    public DateOnly ServiceTo { get; set; }

    public DateOnly? IssuedOn { get; set; }

    public DateOnly? DueOn { get; set; }

    public DateTime? IssuedAt { get; set; }

    public Guid? IssuedBy { get; set; }

    public DateTime? VoidedAt { get; set; }

    public Guid? VoidedBy { get; set; }

    public string? VoidReason { get; set; }

    public string? Notes { get; set; }

    /// <summary>
    /// Hóa đơn nháp cần tính lại vì chỉ số hoặc giá vừa đổi.
    /// </summary>
    public bool NeedsRecompute { get; set; }

    public Guid IdempotencyKey { get; set; }

    public Guid CreatedBy { get; set; }

    public DateTime CreatedAt { get; set; }

    public virtual BillingPeriod? BillingPeriod { get; set; }

    public virtual User CreatedByNavigation { get; set; } = null!;

    public virtual Invoice? InverseOriginalInvoice { get; set; }

    public virtual ICollection<InvoiceLine> InvoiceLines { get; set; } = new List<InvoiceLine>();

    public virtual User? IssuedByNavigation { get; set; }

    public virtual Invoice? OriginalInvoice { get; set; }

    public virtual ICollection<PaymentAllocation> PaymentAllocations { get; set; } = new List<PaymentAllocation>();

    public virtual Tenancy Tenancy { get; set; } = null!;

    public virtual User? VoidedByNavigation { get; set; }

    public virtual ICollection<Payment> Payments { get; set; } = new List<Payment>();
}
