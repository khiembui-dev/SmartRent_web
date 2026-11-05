using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

public partial class VDepositMovement
{
    public Guid? Id { get; set; }

    public Guid? TenancyId { get; set; }

    public Guid? PaymentId { get; set; }

    public string? Kind { get; set; }

    public decimal? Amount { get; set; }

    public Guid? RelatedEntryId { get; set; }

    public Guid? PaymentReversalId { get; set; }

    public Guid? SettlementId { get; set; }

    public DateTime? OccurredAt { get; set; }

    public string? Reason { get; set; }

    public Guid? ConfirmedBy { get; set; }

    public Guid? IdempotencyKey { get; set; }

    public DateTime? CreatedAt { get; set; }

    public decimal? SignedAmount { get; set; }
}
