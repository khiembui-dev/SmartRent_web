using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

/// <summary>
/// Sổ thanh toán và cọc; phân bổ vào hóa đơn nằm trong JSONB.
/// </summary>
public partial class Payment
{
    public Guid Id { get; set; }

    public string Code { get; set; } = null!;

    public Guid UserId { get; set; }

    public Guid? ContractId { get; set; }

    public Guid? IntendedInvoiceId { get; set; }

    public string Kind { get; set; } = null!;

    public Guid? ReversesId { get; set; }

    public string Status { get; set; } = null!;

    public decimal Amount { get; set; }

    public string? Method { get; set; }

    public string? ExternalReference { get; set; }

    public string Allocations { get; set; } = null!;

    public string ProofFileIds { get; set; } = null!;

    public Guid? SubmittedBy { get; set; }

    public Guid? ConfirmedBy { get; set; }

    public DateTime? ConfirmedAt { get; set; }

    public string? Reason { get; set; }

    public string? Notes { get; set; }

    public DateTime ReceivedAt { get; set; }

    public string? IdempotencyKey { get; set; }

    public string? RequestHash { get; set; }

    public DateTime CreatedAt { get; set; }

    public virtual User? ConfirmedByNavigation { get; set; }

    public virtual Contract? Contract { get; set; }

    public virtual Invoice? IntendedInvoice { get; set; }

    public virtual ICollection<Payment> InverseReverses { get; set; } = new List<Payment>();

    public virtual Payment? Reverses { get; set; }

    public virtual User? SubmittedByNavigation { get; set; }

    public virtual User User { get; set; } = null!;
}
