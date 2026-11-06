using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Npgsql;
using SmartRent.Api.Common;

namespace SmartRent.Api.Features.Catalog;

[ApiController]
[Route("api/v1/portal/catalog")]
public sealed class PortalCatalogController(NpgsqlDataSource db) : LeasingController(db)
{
    [HttpGet]
    public async Task<IActionResult> Get(CancellationToken ct)
    {
        try
        {
            await using var connection = await Db.OpenConnectionAsync(ct);

            // 1. Đọc cấu hình ngân hàng từ bảng settings
            await using var cmd = new NpgsqlCommand(
                "select bank_name, bank_account_number, bank_account_name from settings where id=1", connection);
            await using var reader = await cmd.ExecuteReaderAsync(ct);

            string bankName = "Vietcombank";
            string accountNumber = "1234567890";
            string accountName = "CHỦ TRỌ SMARTRENT";

            if (await reader.ReadAsync(ct))
            {
                if (!reader.IsDBNull(0) && !string.IsNullOrWhiteSpace(reader.GetString(0)))
                    bankName = reader.GetString(0);
                if (!reader.IsDBNull(1) && !string.IsNullOrWhiteSpace(reader.GetString(1)))
                    accountNumber = reader.GetString(1);
                if (!reader.IsDBNull(2) && !string.IsNullOrWhiteSpace(reader.GetString(2)))
                    accountName = reader.GetString(2);
            }

            var maskedNumber = accountNumber.Length >= 4
                ? $"•••• {accountNumber[^4..]}"
                : accountNumber;

            // 2. Danh sách tài khoản ngân hàng nhận tiền
            var bankAccounts = new[]
            {
                new
                {
                    id = "default",
                    bankBin = "970436", // Vietcombank BIN mặc định cho VietQR
                    bankName = bankName,
                    accountNumber = accountNumber,
                    accountNumberMasked = maskedNumber,
                    accountName = accountName,
                    isDefault = true
                }
            };

            // 3. Danh mục loại sự cố (hỗ trợ trang tạo ticket của khách)
            var ticketCategories = new[]
            {
                new { id = "ELECTRICITY", name = "Điện" },
                new { id = "WATER", name = "Nước" },
                new { id = "INTERNET", name = "Mạng / Internet" },
                new { id = "OTHER", name = "Khác" }
            };

            return Ok(new
            {
                bankAccounts,
                ticketCategories
            });
        }
        catch (LeaseHttpException e) { return LeaseProblem(e); }
        catch (PostgresException e) { return DatabaseProblem(e); }
    }
}