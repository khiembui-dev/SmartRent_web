using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

/// <summary>
/// Metadata tệp dùng chung; nội dung nhị phân ở storage.
/// </summary>
public partial class File
{
    public Guid Id { get; set; }

    public Guid? UploadedBy { get; set; }

    public string StorageKey { get; set; } = null!;

    public string FileName { get; set; } = null!;

    public string ContentType { get; set; } = null!;

    public long ByteSize { get; set; }

    public string Visibility { get; set; } = null!;

    public string Purpose { get; set; } = null!;

    public string ScanStatus { get; set; } = null!;

    public string? Sha256 { get; set; }

    public DateTime CreatedAt { get; set; }

    public virtual User? UploadedByNavigation { get; set; }

    public virtual ICollection<User> Users { get; set; } = new List<User>();
}
