using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

/// <summary>
/// Cấu hình thương hiệu, lịch nhắc và ngân hàng mặc định.
/// </summary>
public partial class Setting
{
    public short Id { get; set; }

    public string BusinessName { get; set; } = null!;

    public short MeterReadingDay { get; set; }

    public short InvoiceCreateDay { get; set; }

    public bool ReminderEnabled { get; set; }

    public string? BankName { get; set; }

    public string? BankAccountNumber { get; set; }

    public string? BankAccountName { get; set; }

    public DateTime UpdatedAt { get; set; }

    public Guid? UpdatedBy { get; set; }

    public virtual User? UpdatedByNavigation { get; set; }
}
