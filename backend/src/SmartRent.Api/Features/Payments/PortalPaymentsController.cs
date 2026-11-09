using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Mvc;
using Npgsql;
using SmartRent.Api.Common;
using SmartRent.Api.Features.Rooms;
using static SmartRent.Api.Common.BusinessData;
namespace SmartRent.Api.Features.Payments;

[ApiController, Route("api/v1/portal/payments")]
public sealed class PortalPaymentsController(NpgsqlDataSource db) : BusinessController(db)
{
    [HttpGet] public Task<IActionResult> List(int page = 1, int pageSize = 30, CancellationToken ct = default) => Run(false, async (c, t, a) => Page((await Rows(c, t, "select to_jsonb(p)::text from payments p where user_id=@id order by created_at desc", ct, "id", a)).Select(PaymentLedger.Dto).ToList(), page, pageSize), ct);
    // Khách chỉ báo chuyển khoản; khoản chờ xác minh chưa làm giảm công nợ.
    [HttpPost]
    public Task<IActionResult> Report(JsonElement body, CancellationToken ct) => Run(false, async (c, t, a) =>
    {
        var b = Object(body);
        var ids = b["invoiceIds"]?.AsArray();
        if (ids is null || ids.Count != 1)
            throw Invalid("Chọn đúng một hóa đơn.");
        var id = Guid.Parse(ids[0]!.GetValue<string>());
        var target = await Row(c, t, "select jsonb_build_object('contract',ct.id)::text from invoices i join contracts ct on ct.id=i.contract_id where i.id=@id and ct.user_id=@a and i.status='issued'", ct, "id", id, "a", a);
        var at = DateTimeOffset.Parse(b.Text("receivedAt") ?? DateTimeOffset.UtcNow.ToString("O"));
        if (at > DateTimeOffset.UtcNow.AddMinutes(1))
            throw Invalid("Thời gian chuyển khoản không được ở tương lai.");
        var proofs = b["fileIds"]?.DeepClone().AsArray() ?? new JsonArray();
        if (proofs.Count > 4)
            throw Invalid("Tối đa 4 tệp biên lai.");
        foreach (var f in proofs)
            await RoomsController.CheckFile(c, t, Guid.Parse(f!.GetValue<string>()), a, "payment_proof", ct);
        var alloc = new JsonArray(new JsonObject { ["invoiceId"] = id, ["amount"] = b.Number("amount") });
        return PaymentLedger.Dto(await PaymentLedger.Append(c, t, a, a, target.Id("contract"), id, "receipt", b.Number("amount"), "bank_transfer", b.Text("externalReference"), alloc, proofs, null, b.Text("notes"), at, false, Request.Headers["Idempotency-Key"], PaymentLedger.Hash(b), ct));
    }, ct);
}
