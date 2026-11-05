using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

/// <summary>
/// Bảng giá có hiệu lực theo ngày, thuộc đúng một phạm vi: cơ sở, phòng, hoặc phiên bản hợp đồng. Giá 0 là giá hợp lệ. Đổi giá: đóng effective_to rồi thêm dòng mới, không sửa unit_price.
/// </summary>
public partial class ChargeRate
{
    public Guid Id { get; set; }

    public Guid? PropertyId { get; set; }

    public Guid? RoomId { get; set; }

    public Guid? ContractVersionId { get; set; }

    public Guid? ScopeId { get; set; }

    public Guid ChargeTypeId { get; set; }

    public DateOnly EffectiveFrom { get; set; }

    public DateOnly? EffectiveTo { get; set; }

    public decimal UnitPrice { get; set; }

    public string CalculationMethod { get; set; } = null!;

    public string BillingCycle { get; set; } = null!;

    public string ProrationMode { get; set; } = null!;

    public virtual ChargeType ChargeType { get; set; } = null!;

    public virtual ContractVersion? ContractVersion { get; set; }

    public virtual ICollection<InvoiceLine> InvoiceLines { get; set; } = new List<InvoiceLine>();

    public virtual Property? Property { get; set; }

    public virtual Room? Room { get; set; }
}
