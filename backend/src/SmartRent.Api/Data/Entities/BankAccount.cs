using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

/// <summary>
/// Tài khoản nhận tiền của đơn vị, hiện ở trang thanh toán hóa đơn của khách.
/// </summary>
public partial class BankAccount
{
    public Guid Id { get; set; }

    public Guid OrganizationId { get; set; }

    public string BankName { get; set; } = null!;

    public string AccountNumber { get; set; } = null!;

    public string AccountHolder { get; set; } = null!;

    public bool IsDefault { get; set; }

    public bool IsActive { get; set; }

    public virtual Organization Organization { get; set; } = null!;

    public virtual ICollection<Payment> Payments { get; set; } = new List<Payment>();
}
