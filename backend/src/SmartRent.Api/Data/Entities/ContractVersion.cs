using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

/// <summary>
/// Phiên bản hợp đồng. Gia hạn tạo phiên bản mới; bản đã ký bị khóa. ends_on là ngày đầu tiên hết hiệu lực, ngày ghi trên hợp đồng là ends_on - 1.
/// </summary>
public partial class ContractVersion
{
    public Guid Id { get; set; }

    public Guid ContractId { get; set; }

    public int VersionNo { get; set; }

    public DateOnly EffectiveFrom { get; set; }

    public DateOnly EndsOn { get; set; }

    public decimal RequiredDeposit { get; set; }

    public short InvoiceDay { get; set; }

    public short DueAfterDays { get; set; }

    public string ProrationPolicy { get; set; } = null!;

    public string TermsText { get; set; } = null!;

    public string? ChangeReason { get; set; }

    public DateTime? SignedAt { get; set; }

    public Guid? ConfirmedBy { get; set; }

    public string? SignatureMethod { get; set; }

    public string? ExternalSignatureReference { get; set; }

    public DateTime CreatedAt { get; set; }

    public virtual ICollection<ChargeRate> ChargeRates { get; set; } = new List<ChargeRate>();

    public virtual User? ConfirmedByNavigation { get; set; }

    public virtual Contract Contract { get; set; } = null!;

    public virtual ICollection<ContractFile> ContractFiles { get; set; } = new List<ContractFile>();

    public virtual ICollection<ContractParty> ContractParties { get; set; } = new List<ContractParty>();
}
