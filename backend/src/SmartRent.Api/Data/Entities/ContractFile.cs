using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

/// <summary>
/// Tệp thuộc một phiên bản hợp đồng; bản ký là bắt buộc trước khi xác nhận ký và bị khóa sau đó.
/// </summary>
public partial class ContractFile
{
    public Guid ContractVersionId { get; set; }

    public Guid FileId { get; set; }

    public string FileKind { get; set; } = null!;

    public virtual ContractVersion ContractVersion { get; set; } = null!;

    public virtual StoredFile File { get; set; } = null!;
}
