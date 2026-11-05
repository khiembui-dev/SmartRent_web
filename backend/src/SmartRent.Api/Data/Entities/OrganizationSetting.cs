using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

/// <summary>
/// Lịch nhắc ở Cài đặt: ngày nhập số điện nước và ngày tạo hóa đơn hằng tháng.
/// </summary>
public partial class OrganizationSetting
{
    public Guid OrganizationId { get; set; }

    public string Timezone { get; set; } = null!;

    public short MeterReadingDay { get; set; }

    public short InvoiceCreateDay { get; set; }

    public bool BillingReminderEnabled { get; set; }

    public virtual Organization Organization { get; set; } = null!;
}
