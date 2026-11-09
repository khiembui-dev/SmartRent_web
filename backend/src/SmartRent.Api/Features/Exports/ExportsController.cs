using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Npgsql;
using SmartRent.Api.Common;
namespace SmartRent.Api.Features.Exports;

[ApiController, Route("api/v1/exports")]
public sealed class ExportsController(NpgsqlDataSource db) : BusinessController(db)
{
    // CSV được frontend dựng từ toàn bộ trang API theo bộ lọc; không cần bảng/job xuất file.
    [HttpPost]
    public Task<IActionResult> Create(JsonElement body, CancellationToken ct) => Run(true, async (c, t, a) =>
    {
        var kind = body.String("kind");
        if (kind is not ("tenants" or "invoices"))
            throw new LeaseHttpException(422, "invalid_export", "Loại xuất CSV không hợp lệ.");
        await Task.CompletedTask;
        return new
        {
            kind,
            format = "csv",
            status = "ready",
            generatedBy = "client",
            requestedBy = a
        };
    }, ct);
}
