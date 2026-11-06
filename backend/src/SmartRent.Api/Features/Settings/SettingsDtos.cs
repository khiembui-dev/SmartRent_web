using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;

namespace SmartRent.Api.Features.Settings;

public sealed class BillingScheduleDto
{
    [JsonPropertyName("meterReadingDay")]
    public int MeterReadingDay { get; set; }

    [JsonPropertyName("invoiceCreateDay")]
    public int InvoiceCreateDay { get; set; }

    [JsonPropertyName("reminderEnabled")]
    public bool ReminderEnabled { get; set; }
}

public sealed class UpdateBillingScheduleRequest
{
    [JsonPropertyName("meterReadingDay")]
    public int MeterReadingDay { get; set; }

    [JsonPropertyName("invoiceCreateDay")]
    public int InvoiceCreateDay { get; set; }

    [JsonPropertyName("reminderEnabled")]
    public bool ReminderEnabled { get; set; }
}

public sealed class OrganizationSettingsDto
{
    [JsonPropertyName("id")]
    public Guid Id { get; set; }

    [JsonPropertyName("code")]
    public string Code { get; set; } = "SR";

    [JsonPropertyName("name")]
    public string Name { get; set; } = "SmartRent";

    [JsonPropertyName("legalName")]
    public string? LegalName { get; set; }

    [JsonPropertyName("taxCode")]
    public string? TaxCode { get; set; }

    [JsonPropertyName("phone")]
    public string? Phone { get; set; }

    [JsonPropertyName("email")]
    public string? Email { get; set; }

    [JsonPropertyName("isActive")]
    public bool IsActive { get; set; } = true;

    [JsonPropertyName("createdAt")]
    public DateTime CreatedAt { get; set; }

    [JsonPropertyName("settings")]
    public OrganizationSettingsDetailDto Settings { get; set; } = new();
}

public sealed class OrganizationSettingsDetailDto
{
    [JsonPropertyName("dailyJobTime")]
    public string DailyJobTime { get; set; } = "07:30";

    [JsonPropertyName("retentionDays")]
    public int RetentionDays { get; set; } = 365;

    [JsonPropertyName("contractWarningDays")]
    public int ContractWarningDays { get; set; } = 30;

    [JsonPropertyName("meterReadingDay")]
    public int MeterReadingDay { get; set; } = 25;

    [JsonPropertyName("invoiceCreateDay")]
    public int InvoiceCreateDay { get; set; } = 28;

    [JsonPropertyName("reminderEnabled")]
    public bool ReminderEnabled { get; set; } = true;

    [JsonPropertyName("bankName")]
    public string? BankName { get; set; }

    [JsonPropertyName("bankAccountNumber")]
    public string? BankAccountNumber { get; set; }

    [JsonPropertyName("bankAccountName")]
    public string? BankAccountName { get; set; }
}

public sealed class UpdateOrganizationSettingsRequest
{
    [JsonPropertyName("name")]
    public string Name { get; set; } = "";

    [JsonPropertyName("legalName")]
    public string? LegalName { get; set; }

    [JsonPropertyName("taxCode")]
    public string? TaxCode { get; set; }

    [JsonPropertyName("phone")]
    public string? Phone { get; set; }

    [JsonPropertyName("email")]
    public string? Email { get; set; }

    [JsonPropertyName("settings")]
    public UpdateOrganizationSettingsDetailRequest? Settings { get; set; }
}

public sealed class UpdateOrganizationSettingsDetailRequest
{
    [JsonPropertyName("dailyJobTime")]
    public string? DailyJobTime { get; set; }

    [JsonPropertyName("retentionDays")]
    public int? RetentionDays { get; set; }

    [JsonPropertyName("contractWarningDays")]
    public int? ContractWarningDays { get; set; }

    [JsonPropertyName("bankName")]
    public string? BankName { get; set; }

    [JsonPropertyName("bankAccountNumber")]
    public string? BankAccountNumber { get; set; }

    [JsonPropertyName("bankAccountName")]
    public string? BankAccountName { get; set; }
}
