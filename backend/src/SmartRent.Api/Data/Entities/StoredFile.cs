using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

/// <summary>
/// Thông tin tệp; nội dung tệp nằm ở kho lưu trữ. Tệp private chỉ tải qua đường dẫn có hạn sau khi kiểm tra quyền.
/// </summary>
public partial class StoredFile
{
    public Guid Id { get; set; }

    public Guid? OrganizationId { get; set; }

    public string StorageKey { get; set; } = null!;

    public string OriginalName { get; set; } = null!;

    public string ContentType { get; set; } = null!;

    public long ByteSize { get; set; }

    public string? Sha256 { get; set; }

    public string Purpose { get; set; } = null!;

    public string Visibility { get; set; } = null!;

    public string ScanStatus { get; set; } = null!;

    public Guid? UploadedBy { get; set; }

    public DateTime CreatedAt { get; set; }

    public virtual ICollection<ContractAttachment> ContractAttachments { get; set; } = new List<ContractAttachment>();

    public virtual ICollection<ContractFile> ContractFiles { get; set; } = new List<ContractFile>();

    public virtual Organization? Organization { get; set; }

    public virtual ICollection<PaymentReversal> PaymentReversals { get; set; } = new List<PaymentReversal>();

    public virtual ICollection<RoomImage> RoomImages { get; set; } = new List<RoomImage>();

    public virtual ICollection<TenantIdentityDocument> TenantIdentityDocumentBackFiles { get; set; } = new List<TenantIdentityDocument>();

    public virtual ICollection<TenantIdentityDocument> TenantIdentityDocumentFrontFiles { get; set; } = new List<TenantIdentityDocument>();

    public virtual ICollection<TicketFile> TicketFiles { get; set; } = new List<TicketFile>();

    public virtual User? UploadedByNavigation { get; set; }

    public virtual ICollection<User> Users { get; set; } = new List<User>();

    public virtual ICollection<Handover> Handovers { get; set; } = new List<Handover>();

    public virtual ICollection<Payment> Payments { get; set; } = new List<Payment>();
}
