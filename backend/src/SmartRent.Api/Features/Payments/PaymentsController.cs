using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Mvc;
using Npgsql;
using SmartRent.Api.Common;
using static SmartRent.Api.Common.BusinessData;
namespace SmartRent.Api.Features.Payments;

[ApiController, Route("api/v1/payments")]
public sealed class PaymentsController(NpgsqlDataSource db) : BusinessController(db)
{
    [HttpGet] public Task<IActionResult> List(int page = 1, int pageSize = 30, CancellationToken ct = default) => Run(true, async (c, t, a) => Page((await Rows(c, t, "select to_jsonb(p)::text from payments p order by created_at desc", ct)).Select(PaymentLedger.Dto).ToList(), page, pageSize), ct);
    [HttpGet("{id:guid}")] public Task<IActionResult> Get(Guid id, CancellationToken ct) => Run(true, async (c, t, a) => PaymentLedger.Dto(await Row(c, t, "select to_jsonb(p)::text from payments p where id=@id", ct, "id", id)), ct);
    [HttpPost]
    public Task<IActionResult> Create(JsonElement body, CancellationToken ct) => Run(true, async (c, t, a) =>
    {
        var b = Object(body);
        var allocations = b["allocations"]?.DeepClone().AsArray() ?? new JsonArray();
        if (allocations.Count == 0 && b["invoiceId"] is not null)
            allocations.Add(new JsonObject { ["invoiceId"] = b.Text("invoiceId"), ["amount"] = b.Number("amount") });
        if (allocations.Count != 1 || allocations[0].Number("amount") != b.Number("amount"))
            throw Invalid("Chọn một hóa đơn, số phân bổ bằng số tiền thu.");
        var invoice = allocations[0].Id("invoiceId");
        var target = await Row(c, t, "select jsonb_build_object('user',ct.user_id,'contract',ct.id)::text from invoices i join contracts ct on ct.id=i.contract_id where i.id=@id and i.status='issued'", ct, "id", invoice);
        var row = await PaymentLedger.Append(c, t, a, target.Id("user"), target.Id("contract"), invoice, "receipt", b.Number("amount"), b.Text("methodCode") ?? b.Text("method") ?? "cash", b.Text("externalReference"), allocations, null, null, b.Text("notes"), DateTimeOffset.Parse(b.Text("receivedAt") ?? DateTimeOffset.UtcNow.ToString("O")), true, Request.Headers["Idempotency-Key"], PaymentLedger.Hash(b), ct);
        return PaymentLedger.Dto(row);
    }, ct);
    [HttpPost("{id:guid}/confirm")]
    public Task<IActionResult> Confirm(Guid id, JsonElement body, CancellationToken ct) => Run(true, async (c, t, a) =>
    {
        var p = await Row(c, t, "select to_jsonb(p)::text from payments p where id=@id for update", ct, "id", id);
        if (p.Text("status") == "confirmed")
            return PaymentLedger.Dto(p);
        if (p.Text("status") != "pending")
            throw new LeaseHttpException(409, "payment_not_pending", "Khoản thu không còn chờ xác minh.");
        var b = Object(body);
        var allocations = new JsonArray((b["allocations"] ?? p["allocations"]!).AsArray().Where(x => x.Number("amount") > 0).Select(x => x!.DeepClone()).ToArray());
        if (allocations.AsArray().Sum(x => x.Number("amount")) > p.Number("amount"))
            throw Invalid("Phân bổ vượt số tiền nhận.");
        await Execute(c, t, "update payments set status='confirmed',confirmed_by=@a,confirmed_at=now(),allocations=@alloc::jsonb where id=@id", ct, "id", id, "a", a, "alloc", allocations.ToJsonString());
        return PaymentLedger.Dto(await Row(c, t, "select to_jsonb(p)::text from payments p where id=@id", ct, "id", id));
    }, ct);
    [HttpPost("{id:guid}/reject")]
    public Task<IActionResult> Reject(Guid id, JsonElement body, CancellationToken ct) => Run(true, async (c, t, a) =>
    {
        var reason = body.String("reason");
        if (string.IsNullOrWhiteSpace(reason))
            throw Invalid("Cần lý do từ chối.");
        if (await Execute(c, t, "update payments set status='rejected',reason=@reason where id=@id and status='pending'", ct, "id", id, "reason", reason) == 0)
            throw new LeaseHttpException(409, "payment_not_pending", "Khoản thu không còn chờ xác minh.");
        return new
        {
            id,
            status = "rejected"
        };
    }, ct);
    [HttpPost("{id:guid}/reversals")] public Task<IActionResult> Reverse(Guid id, JsonElement body, CancellationToken ct) => Run(true, async (c, t, a) => await ReverseReceipt(c, t, a, id, body.String("reason"), ct), ct);
    internal static async Task<object> ReverseReceipt(NpgsqlConnection c, NpgsqlTransaction t, Guid actor, Guid id, string? reason, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(reason))
            throw Invalid("Cần lý do hoàn tác.");
        var p = await Row(c, t, "select to_jsonb(p)::text from payments p where id=@id for update", ct, "id", id);
        if (p.Text("status") != "confirmed" || p.Text("kind") != "receipt")
            throw Invalid("Chỉ hoàn tác phiếu thu đã xác nhận.");
        if (await Scalar(c, t, "select id::text from payments where reverses_id=@id", ct, "id", id) is not null)
            throw new LeaseHttpException(409, "already_reversed", "Phiếu thu đã hoàn tác.");
        var row = await PaymentLedger.Append(c, t, actor, p.Id("user_id"), p.Id("contract_id"), null, "receipt_reversal", p.Number("amount"), p.Text("method"), p.Text("external_reference"), p["allocations"]!.DeepClone().AsArray(), null, reason, null, DateTimeOffset.UtcNow, true, null, "reverse:" + id, ct, id);
        return PaymentLedger.Dto(row);
    }
}
