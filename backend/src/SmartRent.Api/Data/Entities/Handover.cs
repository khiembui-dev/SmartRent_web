using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

/// <summary>
/// Biên bản bàn giao lúc nhận và trả phòng. Khách xem lại ở trang Hợp đồng, kèm chỉ số điện nước.
/// </summary>
public partial class Handover
{
    public Guid Id { get; set; }

    public Guid TenancyId { get; set; }

    public string Kind { get; set; } = null!;

    public DateTime OccurredAt { get; set; }

    public string? Notes { get; set; }

    public Guid? LandlordConfirmedBy { get; set; }

    public Guid? TenantConfirmedBy { get; set; }

    public DateTime? ConfirmedAt { get; set; }

    public string? RepresentativeConfirmationText { get; set; }

    public virtual ICollection<CheckoutSettlement> CheckoutSettlements { get; set; } = new List<CheckoutSettlement>();

    public virtual ICollection<HandoverItem> HandoverItems { get; set; } = new List<HandoverItem>();

    public virtual User? LandlordConfirmedByNavigation { get; set; }

    public virtual ICollection<MeterReading> MeterReadings { get; set; } = new List<MeterReading>();

    public virtual Tenancy Tenancy { get; set; } = null!;

    public virtual User? TenantConfirmedByNavigation { get; set; }

    public virtual ICollection<StoredFile> Files { get; set; } = new List<StoredFile>();
}
