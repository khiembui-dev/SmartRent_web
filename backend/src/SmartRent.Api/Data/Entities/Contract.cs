using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

/// <summary>
/// Hợp đồng có mã riêng, gắn với đợt thuê. Trạng thái hiển thị suy từ v_contract_status, không lưu.
/// </summary>
public partial class Contract
{
    public Guid Id { get; set; }

    public Guid TenancyId { get; set; }

    public string Code { get; set; } = null!;

    public Guid? PredecessorContractId { get; set; }

    public DateOnly? TerminatedOn { get; set; }

    public string? TerminationReason { get; set; }

    public Guid? TerminatedBy { get; set; }

    public DateTime? TerminatedAt { get; set; }

    public DateTime? ArchivedAt { get; set; }

    public Guid CreatedBy { get; set; }

    public DateTime CreatedAt { get; set; }

    public virtual ICollection<ContractAttachment> ContractAttachments { get; set; } = new List<ContractAttachment>();

    public virtual ICollection<ContractVersion> ContractVersions { get; set; } = new List<ContractVersion>();

    public virtual User CreatedByNavigation { get; set; } = null!;

    public virtual ICollection<Contract> InversePredecessorContract { get; set; } = new List<Contract>();

    public virtual Contract? PredecessorContract { get; set; }

    public virtual Tenancy Tenancy { get; set; } = null!;

    public virtual User? TerminatedByNavigation { get; set; }
}
