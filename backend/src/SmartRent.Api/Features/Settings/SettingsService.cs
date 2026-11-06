using Microsoft.EntityFrameworkCore;
using SmartRent.Api.Common.Errors;
using SmartRent.Api.Data;
using SmartRent.Api.Data.Entities;

namespace SmartRent.Api.Features.Settings;

public sealed class SettingsService : ISettingsService
{
    private readonly SmartRentDbContext _db;

    public SettingsService(SmartRentDbContext db)
    {
        _db = db;
    }

    public async Task<BillingScheduleDto> GetBillingScheduleAsync(CancellationToken ct = default)
    {
        var setting = await _db.Settings.AsNoTracking().FirstOrDefaultAsync(s => s.Id == 1, ct);
        if (setting == null)
        {
            return new BillingScheduleDto
            {
                MeterReadingDay = 25,
                InvoiceCreateDay = 28,
                ReminderEnabled = true
            };
        }

        return new BillingScheduleDto
        {
            MeterReadingDay = setting.MeterReadingDay,
            InvoiceCreateDay = setting.InvoiceCreateDay,
            ReminderEnabled = setting.ReminderEnabled
        };
    }

    public async Task<BillingScheduleDto> UpdateBillingScheduleAsync(Guid? userId, UpdateBillingScheduleRequest request, CancellationToken ct = default)
    {
        var errors = new Dictionary<string, string[]>();

        if (request.MeterReadingDay < 1 || request.MeterReadingDay > 28)
        {
            errors["meterReadingDay"] = new[] { "Ngày nhập số điện nước phải từ 1 đến 28." };
        }

        if (request.InvoiceCreateDay < 1 || request.InvoiceCreateDay > 28)
        {
            errors["invoiceCreateDay"] = new[] { "Ngày tạo hóa đơn phải từ 1 đến 28." };
        }

        if (request.MeterReadingDay >= 1 && request.MeterReadingDay <= 28 &&
            request.InvoiceCreateDay >= 1 && request.InvoiceCreateDay <= 28 &&
            request.InvoiceCreateDay < request.MeterReadingDay)
        {
            errors["invoiceCreateDay"] = new[] { "Ngày tạo hóa đơn phải từ ngày nhập số trở đi." };
        }

        if (errors.Count > 0)
        {
            throw new ValidationException("Dữ liệu lịch nhắc không hợp lệ.", errors);
        }

        var setting = await _db.Settings.FirstOrDefaultAsync(s => s.Id == 1, ct);
        if (setting == null)
        {
            setting = new Setting
            {
                Id = 1,
                BusinessName = "SmartRent",
                UpdatedAt = DateTime.UtcNow
            };
            _db.Settings.Add(setting);
        }

        setting.MeterReadingDay = (short)request.MeterReadingDay;
        setting.InvoiceCreateDay = (short)request.InvoiceCreateDay;
        setting.ReminderEnabled = request.ReminderEnabled;
        setting.UpdatedAt = DateTime.UtcNow;
        if (userId.HasValue)
        {
            setting.UpdatedBy = userId.Value;
        }

        await _db.SaveChangesAsync(ct);

        return new BillingScheduleDto
        {
            MeterReadingDay = setting.MeterReadingDay,
            InvoiceCreateDay = setting.InvoiceCreateDay,
            ReminderEnabled = setting.ReminderEnabled
        };
    }

    public async Task<OrganizationSettingsDto> GetOrganizationAsync(CancellationToken ct = default)
    {
        var setting = await _db.Settings.AsNoTracking().FirstOrDefaultAsync(s => s.Id == 1, ct);
        var orgId = Guid.Parse("00000000-0000-0000-0000-000000000001");

        return new OrganizationSettingsDto
        {
            Id = orgId,
            Code = "SR",
            Name = setting?.BusinessName ?? "SmartRent",
            LegalName = null,
            TaxCode = null,
            Phone = null,
            Email = null,
            IsActive = true,
            CreatedAt = setting?.UpdatedAt ?? DateTime.UtcNow,
            Settings = new OrganizationSettingsDetailDto
            {
                DailyJobTime = "07:30",
                RetentionDays = 365,
                ContractWarningDays = 30,
                MeterReadingDay = setting?.MeterReadingDay ?? 25,
                InvoiceCreateDay = setting?.InvoiceCreateDay ?? 28,
                ReminderEnabled = setting?.ReminderEnabled ?? true,
                BankName = setting?.BankName,
                BankAccountNumber = setting?.BankAccountNumber,
                BankAccountName = setting?.BankAccountName
            }
        };
    }

    public async Task<OrganizationSettingsDto> UpdateOrganizationAsync(Guid? userId, UpdateOrganizationSettingsRequest request, CancellationToken ct = default)
    {
        var setting = await _db.Settings.FirstOrDefaultAsync(s => s.Id == 1, ct);
        if (setting == null)
        {
            setting = new Setting
            {
                Id = 1,
                BusinessName = "SmartRent",
                MeterReadingDay = 25,
                InvoiceCreateDay = 28,
                ReminderEnabled = true,
                UpdatedAt = DateTime.UtcNow
            };
            _db.Settings.Add(setting);
        }

        if (!string.IsNullOrWhiteSpace(request.Name))
        {
            setting.BusinessName = request.Name.Trim();
        }

        if (request.Settings != null)
        {
            var bName = string.IsNullOrWhiteSpace(request.Settings.BankName) ? null : request.Settings.BankName.Trim();
            var bNumber = string.IsNullOrWhiteSpace(request.Settings.BankAccountNumber) ? null : request.Settings.BankAccountNumber.Trim();
            var bAccName = string.IsNullOrWhiteSpace(request.Settings.BankAccountName) ? null : request.Settings.BankAccountName.Trim();

            int nonNulls = (bName != null ? 1 : 0) + (bNumber != null ? 1 : 0) + (bAccName != null ? 1 : 0);
            if (nonNulls is > 0 and < 3)
            {
                throw new ValidationException("Thông tin ngân hàng phải cung cấp đầy đủ cả 3 mục (Tên ngân hàng, Số tài khoản, Tên chủ tài khoản) hoặc để trống toàn bộ.",
                    new Dictionary<string, string[]>
                    {
                        ["settings.bankAccount"] = new[] { "Cần nhập đủ ngân hàng, số tài khoản và tên chủ tài khoản." }
                    });
            }

            setting.BankName = bName;
            setting.BankAccountNumber = bNumber;
            setting.BankAccountName = bAccName;
        }

        setting.UpdatedAt = DateTime.UtcNow;
        if (userId.HasValue)
        {
            setting.UpdatedBy = userId.Value;
        }

        await _db.SaveChangesAsync(ct);

        return await GetOrganizationAsync(ct);
    }
}
