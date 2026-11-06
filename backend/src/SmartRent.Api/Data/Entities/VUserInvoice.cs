using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

public partial class VUserInvoice
{
    public Guid? Id { get; set; }

    public string? Code { get; set; }

    public Guid? ContractId { get; set; }

    public Guid? PeriodId { get; set; }

    public string? Kind { get; set; }

    public Guid? AdjustsInvoiceId { get; set; }

    public bool? MeteredOnly { get; set; }

    public string? Status { get; set; }

    public DateOnly? ServiceFrom { get; set; }

    public DateOnly? ServiceTo { get; set; }

    public decimal? ElectricityStart { get; set; }

    public decimal? ElectricityEnd { get; set; }

    public DateTime? ElectricityFromAt { get; set; }

    public DateTime? ElectricityToAt { get; set; }

    public decimal? WaterStart { get; set; }

    public decimal? WaterEnd { get; set; }

    public DateTime? WaterFromAt { get; set; }

    public DateTime? WaterToAt { get; set; }

    public string? ReadingsHistory { get; set; }

    public string? CorrectionReason { get; set; }

    public string? Lines { get; set; }

    public decimal? TotalAmount { get; set; }

    public string? CustomerSnapshot { get; set; }

    public DateOnly? IssuedOn { get; set; }

    public DateOnly? DueOn { get; set; }

    public Guid? IssuedBy { get; set; }

    public DateTime? IssuedAt { get; set; }

    public DateTime? VoidedAt { get; set; }

    public string? VoidReason { get; set; }

    public string? Notes { get; set; }

    public string? IdempotencyKey { get; set; }

    public string? RequestHash { get; set; }

    public DateTime? CreatedAt { get; set; }

    public decimal? ReceivableAmount { get; set; }

    public decimal? PaidAmount { get; set; }

    public decimal? OutstandingAmount { get; set; }

    public string? PaymentStatus { get; set; }

    public bool? IsOverdue { get; set; }
}
