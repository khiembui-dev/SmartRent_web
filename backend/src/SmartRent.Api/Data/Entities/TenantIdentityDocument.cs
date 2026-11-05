using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

/// <summary>
/// Giấy tờ tùy thân. Số giấy tờ chỉ lưu dạng mã hóa, fingerprint để tra trùng, number_last4 để hiển thị che số. Ảnh giấy tờ bắt buộc là tệp private.
/// </summary>
public partial class TenantIdentityDocument
{
    public Guid Id { get; set; }

    public Guid TenantId { get; set; }

    public string DocumentType { get; set; } = null!;

    public byte[] NumberCiphertext { get; set; } = null!;

    public string NumberFingerprint { get; set; } = null!;

    public string NumberLast4 { get; set; } = null!;

    public DateOnly? IssuedOn { get; set; }

    public string? IssuingAuthority { get; set; }

    public DateOnly? ExpiresOn { get; set; }

    public Guid? FrontFileId { get; set; }

    public Guid? BackFileId { get; set; }

    public Guid? VerifiedBy { get; set; }

    public DateTime? VerifiedAt { get; set; }

    public virtual StoredFile? BackFile { get; set; }

    public virtual StoredFile? FrontFile { get; set; }

    public virtual Tenant Tenant { get; set; } = null!;

    public virtual User? VerifiedByNavigation { get; set; }
}
