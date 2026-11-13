using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Mvc;
using Npgsql;
using SmartRent.Api.Common;
using SmartRent.Api.Features.Rooms;
using SmartRent.Api.Features.Payments;
using static SmartRent.Api.Common.BusinessData;
namespace SmartRent.Api.Features.Contracts;

[ApiController, Route("api/v1/tenancies")]
public sealed class TenanciesController(NpgsqlDataSource db) : BusinessController(db)
{
    private static async Task<JsonObject> Detail(NpgsqlConnection c, NpgsqlTransaction t, Guid id, CancellationToken ct)
    {
        var result = await ContractsController.Detail(c, t, id, ct);
        result["property"] = new JsonObject { ["id"] = result["room"]!.Id("propertyId"), ["name"] = result["room"].Text("propertyName") };
        result["contracts"] = result["versions"]!.AsArray().Count == 0 ? new JsonArray() : new JsonArray(result.DeepClone());
        return result;
    }
    [HttpGet("{id:guid}")] public Task<IActionResult> Get(Guid id, CancellationToken ct) => Run(true, async (c, t, a) => await Detail(c, t, id, ct), ct);
    [HttpPost("check-in")]
    public Task<IActionResult> Checkin(JsonElement body, CancellationToken ct) => Run(true, async (c, t, a) =>
    {
        var b = Object(body);
        var key = Request.Headers["Idempotency-Key"].ToString();
        var hash = PaymentLedger.Hash(b);
        if (key.Length > 200)
            throw Invalid("Mã yêu cầu quá dài.");
        if (key != "")
        {
            await Execute(c, t, "select pg_advisory_xact_lock(hashtextextended(@key,0))", ct, "key", "checkin:" + key);
            var replay = await Scalar(c, t, "select jsonb_build_object('id',id,'hash',checkout_summary->>'requestHash')::text from contracts where checkout_summary->>'checkinKey'=@key", ct, "key", key);
            if (replay is not null)
            {
                var old = JsonNode.Parse(replay)!;
                if (old.Text("hash") != hash)
                    throw new LeaseHttpException(409, "idempotency_conflict", "Mã đã dùng với nội dung khác.");
                return await Detail(c, t, old.Id("id"), ct);
            }
        }
        var room = b.Id("roomId");
        var tenant = b.Id("tenantId");
        await ContractTenantRules.ValidateAsync(c, t, tenant, ct);
        // Khoá phòng và chuyển cọc ghi nhận thủ công thành nhận phòng trong cùng transaction.
        // Nếu các bước ký/thu cọc thất bại, trạng thái cũ được rollback nguyên vẹn.
        var roomState = await Row(c, t, "select to_jsonb(r)::text from rooms r where id=@id for update", ct, "id", room);
        if (roomState.Text("operating_status") == "reserved")
            await Execute(c, t, "update rooms set operating_status='available',status_reason='Chuyển cọc giữ phòng sang hợp đồng' where id=@id", ct, "id", room);
        if (string.IsNullOrWhiteSpace(b.Text("inquiryId")))
        {
            var heldBooking = await Scalar(c, t, "select id::text from bookings where room_id=@room and user_id=@tenant and hold_status='holding' and hold_expires_at>now() limit 1", ct, "room", room, "tenant", tenant);
            if (heldBooking is not null) b["inquiryId"] = heldBooking;
        }
        var day = DateOnly.Parse(b.Text("moveInOn")!);
        if (day > Today)
            throw Invalid("Ngày vào ở không được ở tương lai.");
        var contract = b["contract"]?.AsObject() ?? throw Invalid("Cần thông tin hợp đồng.");
        var signature = b["signature"]?.AsObject() ?? throw Invalid("Cần bản hợp đồng đã ký.");
        var file = signature.Id("signedFileId");
        await RoomsController.CheckFile(c, t, file, a, "contract_signed", ct);
        var version = BuildVersion(contract, day, a, file, signature.Text("signedAt"));
        var readings = Readings(b["readings"], day, signature.Text("signedAt"));
        var id = Guid.NewGuid();
        await Execute(c, t, """
            insert into contracts(id,code,room_id,user_id,booking_id,starts_on,move_in_on,versions,initial_readings,checkin_handover,checkout_summary)
            values(@id,next_code('CON'),@room,@user,@booking,@day,@day,@v::jsonb,@readings::jsonb,@handover::jsonb,jsonb_build_object('checkinKey',nullif(@key,''),'requestHash',@hash))
            """, ct, "id", id, "room", room, "user", tenant, "booking", b.Text("inquiryId") is string booking ? Guid.Parse(booking) : null, "day", day, "v", new JsonArray(version).ToJsonString(), "readings", readings.ToJsonString(), "handover", b["handover"]?.ToJsonString() ?? "{}", "key", key, "hash", hash);
        if (b["deposit"].Number("amount") > 0)
            await PaymentLedger.Append(c, t, a, tenant, id, null, "deposit_receipt", b["deposit"].Number("amount"), b["deposit"].Text("methodCode") ?? "cash", b["deposit"].Text("externalReference"), new(), null, null, null, DateTimeOffset.UtcNow, true, null, hash, ct);
        return await Detail(c, t, id, ct);
    }, ct);
    private static JsonObject BuildVersion(JsonObject b, DateOnly day, Guid actor, Guid file, string? signedAt) => new() { ["id"] = Guid.NewGuid(), ["versionNo"] = 1, ["effectiveFrom"] = day.ToString("yyyy-MM-dd"), ["endsOn"] = b.Text("endsOn"), ["requiredDeposit"] = b.Number("requiredDeposit"), ["invoiceDay"] = b.Number("invoiceDay", 1), ["dueAfterDays"] = b.Number("dueAfterDays", 5), ["prorationPolicy"] = b.Text("prorationPolicy") ?? "actual_days", ["termsText"] = b.Text("termsText") ?? "", ["rates"] = Rates(b["rates"], day), ["fileIds"] = new JsonArray(JsonValue.Create(file)), ["signedAt"] = signedAt ?? DateTimeOffset.UtcNow.ToString("O"), ["signedBy"] = actor, ["partiesSnapshot"] = new JsonObject() };
    private static JsonObject Readings(JsonNode? input, DateOnly day, string? at)
    {
        var result = new JsonObject();
        foreach (var kind in new[] { "electricity", "water" })
        if (input?[kind] is JsonNode value)
        {
            if (value is JsonObject)
                result[kind] = value.DeepClone();
            else
                result[kind] = new JsonObject { ["value"] = value.DeepClone(), ["observedAt"] = at ?? new DateTimeOffset(day.ToDateTime(new TimeOnly(7, 0)), TimeSpan.FromHours(7)).ToUniversalTime().ToString("O") };
        }
        return result;
    }
    [HttpPost("{id:guid}/contracts")]
    public Task<IActionResult> Import(Guid id, JsonElement body, CancellationToken ct) => Run(true, async (c, t, a) =>
    {
        var raw = await Row(c, t, "select to_jsonb(c)::text from contracts c where id=@id and onboarding_mode='import' for update", ct, "id", id);
        if (raw["versions"]!.AsArray().Any(x => x.Text("signedAt") is not null))
            throw Invalid("Hợp đồng đã có bản ký.");
        var b = Object(body);
        var day = DateOnly.Parse(b.Text("effectiveFrom") ?? raw.Text("starts_on")!);
        await ContractTenantRules.ValidateAsync(c, t, raw.Id("user_id"), ct);
        var file = b["signature"]!.Id("signedFileId");
        await RoomsController.CheckFile(c, t, file, a, "contract_signed", ct);
        var v = BuildVersion(b["contract"]!.AsObject(), day, a, file, b["signature"].Text("signedAt"));
        await Execute(c, t, "update contracts set versions=@v::jsonb,initial_readings=@r::jsonb,onboarding_gaps='[]' where id=@id", ct, "id", id, "v", new JsonArray(v).ToJsonString(), "r", Readings(b["readings"], day, b["signature"].Text("signedAt")).ToJsonString());
        return await Detail(c, t, id, ct);
    }, ct);
    [HttpPost("{id:guid}/cancel-import")]
    public Task<IActionResult> Cancel(Guid id, JsonElement body, CancellationToken ct) => Run(true, async (c, t, a) =>
    {
        if (await Execute(c, t, "update contracts set status='cancelled',ended_reason=@reason where id=@id and onboarding_mode='import' and versions='[]'", ct, "id", id, "reason", body.String("reason")) == 0)
            throw Invalid("Không gỡ khách khi đã có hợp đồng ký.");
        return new
        {
            id
        };
    }, ct);
    [HttpGet("{id:guid}/deposit")] public Task<IActionResult> Deposit(Guid id, CancellationToken ct) => Run(true, async (c, t, a) => await Row(c, t, "select to_jsonb(d)::text from v_deposit_balances d where contract_id=@id", ct, "id", id), ct);
    [HttpPost("{id:guid}/deposit/receipts")]
    public Task<IActionResult> DepositReceipt(Guid id, JsonElement body, CancellationToken ct) => Run(true, async (c, t, a) =>
    {
        var raw = await Row(c, t, "select to_jsonb(c)::text from contracts c where id=@id for update", ct, "id", id);
        var b = Object(body);
        var pay = b["payment"] ?? b;
        return PaymentLedger.Dto(await PaymentLedger.Append(c, t, a, raw.Id("user_id"), id, null, "deposit_receipt", b.Number("amount"), pay.Text("methodCode") ?? "cash", pay.Text("externalReference"), new(), null, null, b.Text("notes"), DateTimeOffset.UtcNow, true, Request.Headers["Idempotency-Key"], PaymentLedger.Hash(b), ct));
    }, ct);
    [HttpPost("{id:guid}/checkout/preview")]
    public Task<IActionResult> Preview(Guid id, JsonElement body, CancellationToken ct) => Run(true, async (c, t, a) =>
    {
        var result = await CheckoutService.Calculate(c, t, id, Object(body), ct);
        result.Remove("invoiceData");
        result.Remove("contractData");
        return result;
    }, ct);
    [HttpPost("{id:guid}/checkout")]
    public Task<IActionResult> Checkout(Guid id, JsonElement body, CancellationToken ct) => Run(true, async (c, t, a) =>
    {
        var previous = await Row(c, t, "select to_jsonb(c)::text from contracts c where id=@id for update", ct, "id", id);
        if (previous.Text("status") == "ended")
        {
            var summary = previous["checkout_summary"]!;
            if (summary.Text("checkoutHash") is string hash && hash != PaymentLedger.Hash(Object(body)))
                throw new LeaseHttpException(409, "idempotency_conflict", "H?p ??ng ?? tr? ph?ng v?i n?i dung kh?c.");
            return new
            {
                contractId = id,
                finalInvoiceId = summary.Text("finalInvoiceId"),
                depositRefund = summary.Number("refund"),
                remainingDebt = summary.Number("remainingDebt")
            };
        }
        return await CheckoutService.Commit(c, t, a, id, Object(body), ct);
    }, ct);
}
