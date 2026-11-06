using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

/// <summary>
/// Hóa đơn cùng chỉ số điện nước, lịch sử sửa số và toàn bộ dòng tính tiền.
/// </summary>
public partial class Invoice
{
    public Guid Id { get; set; }

    public string? Code { get; set; }

    public Guid ContractId { get; set; }

    public Guid? PeriodId { get; set; }

    public string Kind { get; set; } = null!;

    public Guid? AdjustsInvoiceId { get; set; }

    public bool MeteredOnly { get; set; }

    public string Status { get; set; } = null!;

    public DateOnly ServiceFrom { get; set; }

    public DateOnly ServiceTo { get; set; }

    public decimal? ElectricityStart { get; set; }

    public decimal? ElectricityEnd { get; set; }

    public DateTime? ElectricityFromAt { get; set; }

    public DateTime? ElectricityToAt { get; set; }

    public decimal? WaterStart { get; set; }

    public decimal? WaterEnd { get; set; }

    public DateTime? WaterFromAt { get; set; }

    public DateTime? WaterToAt { get; set; }

    public string ReadingsHistory { get; set; } = null!;

    public string? CorrectionReason { get; set; }

    public string Lines { get; set; } = null!;

    public decimal? TotalAmount { get; set; }

    public string CustomerSnapshot { get; set; } = null!;

    public DateOnly? IssuedOn { get; set; }

    public DateOnly? DueOn { get; set; }

    public Guid? IssuedBy { get; set; }

    public DateTime? IssuedAt { get; set; }

    public DateTime? VoidedAt { get; set; }

    public string? VoidReason { get; set; }

    public string? Notes { get; set; }

    public string? IdempotencyKey { get; set; }

    public string? RequestHash { get; set; }

    public DateTime CreatedAt { get; set; }

    public virtual Invoice? AdjustsInvoice { get; set; }

    public virtual Contract Contract { get; set; } = null!;

    public virtual ICollection<Invoice> InverseAdjustsInvoice { get; set; } = new List<Invoice>();

    public virtual User? IssuedByNavigation { get; set; }

    public virtual ICollection<Payment> Payments { get; set; } = new List<Payment>();

    public virtual BillingPeriod? Period { get; set; }
}
