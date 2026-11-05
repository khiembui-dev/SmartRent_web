using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

/// <summary>
/// Quyết toán khi trả phòng. Khách còn nợ phải có lý do; nợ vẫn được giữ sau khi đóng đợt thuê.
/// </summary>
public partial class CheckoutSettlement
{
    public Guid Id { get; set; }

    public Guid TenancyId { get; set; }

    public Guid? CheckoutHandoverId { get; set; }

    public string Status { get; set; } = null!;

    public bool AllowRemainingDebt { get; set; }

    public string? RemainingDebtReason { get; set; }

    public Guid? ConfirmedBy { get; set; }

    public DateTime? ConfirmedAt { get; set; }

    public string? Notes { get; set; }

    public virtual Handover? CheckoutHandover { get; set; }

    public virtual User? ConfirmedByNavigation { get; set; }

    public virtual ICollection<DepositEntry> DepositEntries { get; set; } = new List<DepositEntry>();

    public virtual Tenancy Tenancy { get; set; } = null!;
}
