using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Npgsql;
using SmartRent.Api.Common;
using SmartRent.Api.Features.Billing;
using static SmartRent.Api.Common.BusinessData;
namespace SmartRent.Api.Features.Invoices;

[ApiController, Route("api/v1/invoice-batches")]
public sealed class InvoiceBatchesController(NpgsqlDataSource db) : BusinessController(db)
{
    // Mỗi phòng dùng savepoint: phòng lỗi không làm mất kết quả của phòng khác.
    [HttpPost]
    public Task<IActionResult> Create(JsonElement body, CancellationToken ct) => Run(true, async (c, t, a) =>
    {
        var b = Object(body);
        var pid = b.Id("periodId");
        var action = b.Text("action") ?? "draft";
        if (action is not ("draft" or "issue"))
            throw Invalid("Thao tác không hợp lệ.");
        var results = new List<object>();
        int succeeded = 0, failed = 0, skipped = 0;
        foreach (var item in b["tenancyIds"]?.AsArray() ?? throw Invalid("Cần chọn phòng."))
        {
            var id = Guid.Parse(item!.GetValue<string>());
            await t.SaveAsync("room", ct);
            try
            {
                var inv = await BillingEngine.Draft(c, t, id, pid, ct);
                if (inv.Text("status") == "issued")
                {
                    skipped++;
                    results.Add(new
                    {
                        tenancyId = id,
                        status = "skipped",
                        invoiceId = inv.Id("id")
                    });
                }
                else
                {
                    var saved = await BillingEngine.Recompute(c, t, inv.Id("id"), action == "issue", a, ct);
                    succeeded++;
                    results.Add(new
                    {
                        tenancyId = id,
                        status = "succeeded",
                        invoiceId = saved.Id("id"),
                        invoiceCode = saved.Text("code")
                    });
                }
                await t.ReleaseAsync("room", ct);
            }
            catch (Exception e) when (e is LeaseHttpException or PostgresException)
            {
                await t.RollbackAsync("room", ct);
                failed++;
                results.Add(new
                {
                    tenancyId = id,
                    room = id.ToString(),
                    status = "failed",
                    message = e is LeaseHttpException ? e.Message : "Dữ liệu không thỏa điều kiện tính tiền; kiểm tra kỳ và chỉ số."
                });
            }
        }
        return new
        {
            periodId = pid,
            action,
            summary = new
            {
                total = results.Count,
                succeeded,
                failed,
                skipped
            },
            items = results
        };
    }, ct);
}
