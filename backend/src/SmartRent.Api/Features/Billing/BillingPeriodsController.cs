using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Mvc;
using Npgsql;
using SmartRent.Api.Common;
using static SmartRent.Api.Common.BusinessData;
namespace SmartRent.Api.Features.Billing;

[ApiController, Route("api/v1/billing-periods")]
public sealed class BillingPeriodsController(NpgsqlDataSource db) : BusinessController(db)
{
    private static async Task<JsonObject> Period(NpgsqlConnection c, NpgsqlTransaction t, Guid id, CancellationToken ct) => await Row(c, t, "select jsonb_build_object('id',b.id,'property',jsonb_build_object('id',p.id,'name',p.name,'code',p.code),'monthStart',b.month_start,'status',b.status,'lockedAt',b.locked_at)::text from billing_periods b join properties p on p.id=b.property_id where b.id=@id", ct, "id", id);
    [HttpGet]
    public Task<IActionResult> List(Guid? propertyId, int page = 1, int pageSize = 60, CancellationToken ct = default) => Run(true, async (c, t, a) =>
    {
        var ids = await Rows(c, t, "select jsonb_build_object('id',id)::text from billing_periods where @p::uuid is null or property_id=@p order by month_start desc", ct, "p", propertyId);
        var result = new List<JsonObject>();
        foreach (var id in ids)
        {
            var p = await Period(c, t, id.Id("id"), ct);
            var sheet = await Sheet(c, t, id.Id("id"), ct);
            p["stats"] = sheet["stats"]!.DeepClone();
            result.Add(p);
        }
        return Page(result, page, pageSize);
    }, ct);
    [HttpGet("{id:guid}")] public Task<IActionResult> Get(Guid id, CancellationToken ct) => Run(true, async (c, t, a) => await Period(c, t, id, ct), ct);
    [HttpPost]
    public Task<IActionResult> Create(JsonElement body, CancellationToken ct) => Run(true, async (c, t, a) =>
    {
        var b = Object(body);
        var day = DateOnly.Parse(b.Text("monthStart")!);
        if (day.Day != 1 || day > new DateOnly(Today.Year, Today.Month, 1))
            throw Invalid("Chọn ngày đầu tháng không ở tương lai.");
        var id = Guid.NewGuid();
        await Execute(c, t, "insert into billing_periods(id,property_id,month_start) values(@id,@p,@day)", ct, "id", id, "p", b.Id("propertyId"), "day", day);
        return await Period(c, t, id, ct);
    }, ct);
    [HttpGet("{id:guid}/worksheet")] public Task<IActionResult> Worksheet(Guid id, CancellationToken ct) => Run(true, async (c, t, a) => await Sheet(c, t, id, ct), ct);
    internal static async Task<JsonObject> Sheet(NpgsqlConnection c, NpgsqlTransaction t, Guid id, CancellationToken ct)
    {
        var period = await Period(c, t, id, ct);
        var month = DateOnly.Parse(period.Text("monthStart")!);
        var ids = await Rows(c, t, "select jsonb_build_object('id',ct.id)::text from contracts ct join rooms r on r.id=ct.room_id where r.property_id=@p and ct.status<>'cancelled' and ct.starts_on<@end and (ct.move_out_on is null or ct.move_out_on>@month) order by r.code", ct, "p", period["property"]!.Id("id"), "end", month.AddMonths(1), "month", month);
        var rows = new JsonArray();
        foreach (var cid in ids)
        {
            var contract = await BillingEngine.Contract(c, t, cid.Id("id"), ct);
            var room = contract["room"]!;
            var json = await Scalar(c, t, "select to_jsonb(i)::text from invoices i where contract_id=@id and period_id=@period and kind='periodic' and status<>'void'", ct, "id", cid.Id("id"), "period", id);
            var from = DateOnly.Parse(contract.Text("starts_on")!) > month ? DateOnly.Parse(contract.Text("starts_on")!) : month;
            var inv = json is null ? new JsonObject { ["service_from"] = from.ToString("yyyy-MM-dd"), ["service_to"] = month.AddMonths(1).ToString("yyyy-MM-dd") } : JsonNode.Parse(json)!.AsObject();
            var readings = new JsonObject();
            var problems = new JsonArray();
            JsonNode? version = null;
            try
            {
                version = BillingEngine.Version(contract, from);
            }
            catch (LeaseHttpException) { problems.Add(new JsonObject { ["code"] = "unsigned_contract", ["message"] = "Cần bổ sung hợp đồng đã ký." }); }
            bool complete = version is not null;
            var prices = new JsonObject();
            foreach (var kind in new[] { "electricity", "water" })
            {
                var rate = version?["rates"]?.AsArray().FirstOrDefault(x => x.Text("category") == kind && x.Text("method") == "metered");
                if (rate is null)
                {
                    readings[kind] = null;
                    continue;
                }
                prices[kind] = rate.Number("unitPrice");
                var previous = await BillingEngine.Previous(c, t, contract, kind, from, json is null ? null : inv.Id("id"), ct);
                if (previous is null)
                {
                    complete = false;
                    problems.Add(new JsonObject { ["code"] = "missing_initial_reading", ["message"] = "Thiếu chỉ số đầu " + kind });
                }
                inv[kind + "_start"] ??= Copy(previous?["value"]);
                inv[kind + "_from_at"] ??= Copy(previous?["observedAt"]);
                var current = inv[kind + "_end"] is null ? null : new JsonObject { ["id"] = inv.Id("id"), ["value"] = Copy(inv[kind + "_end"]), ["observedAt"] = Copy(inv[kind + "_to_at"]), ["inUse"] = inv.Text("status") == "issued", ["kind"] = "periodic" };
                if (current is null)
                    complete = false;
                var meter = await Scalar(c, t, "select md5(@room||@kind)::uuid::text", ct, "room", room.Id("id").ToString(), "kind", kind);
                readings[kind] = new JsonObject { ["meterId"] = meter, ["previous"] = previous, ["current"] = current, ["consumption"] = current is null || inv[kind + "_start"] is null ? null : inv.Number(kind + "_end") - inv.Number(kind + "_start") };
            }
            var lines = version is null ? new JsonArray() : await BillingEngine.Lines(c, t, contract, inv, false, ct);
            var fixedTotal = lines.Where(x => x.Text("category") is not ("electricity" or "water")).Sum(x => x.Number("amount"));
            var status = inv.Text("status");
            var group = status == "issued" ? "issued_unpaid" : problems.Count > 0 ? "blocked" : complete ? (status == "draft" ? "draft" : "ready") : "missing_readings";
            JsonNode? invoice = null;
            if (json is not null)
                invoice = await Row(c, t, "select jsonb_build_object('id',i.id,'code',i.code,'status',i.status,'totalAmount',i.total_amount,'paymentStatus',b.payment_status,'outstandingAmount',b.outstanding_amount,'isOverdue',b.is_overdue)::text from invoices i join v_invoice_balances b on b.id=i.id where i.id=@id", ct, "id", inv.Id("id"));
            if (status == "issued")
                group = invoice.Text("paymentStatus") == "paid" ? "paid" : invoice.Text("paymentStatus") == "partial" ? "issued_partial" : "issued_unpaid";
            var user = await Row(c, t, "select jsonb_build_object('id',id,'fullName',display_name)::text from users where id=@id", ct, "id", contract.Id("user_id"));
            rows.Add(new JsonObject { ["room"] = new JsonObject { ["id"] = room.Id("id"), ["code"] = room.Text("code") }, ["tenancy"] = new JsonObject { ["id"] = cid.Id("id"), ["representative"] = user }, ["group"] = group, ["problems"] = problems, ["readings"] = readings, ["invoice"] = invoice, ["estimate"] = new JsonObject { ["fixedTotal"] = fixedTotal, ["unitPrices"] = prices, ["total"] = lines.Sum(x => x.Number("amount")), ["lines"] = lines } });
        }
        int Count(params string[] groups) => rows.Count(x => groups.Contains(x.Text("group")));
        var stats = new JsonObject { ["tenancyCount"] = rows.Count, ["blocked"] = Count("blocked"), ["missingReadings"] = Count("missing_readings"), ["readyToDraft"] = Count("ready"), ["drafts"] = Count("draft"), ["issuedUnpaid"] = Count("issued_unpaid"), ["issuedPartial"] = Count("issued_partial"), ["paid"] = Count("paid") };
        return new JsonObject { ["period"] = period, ["rows"] = rows, ["stats"] = stats };
    }
    [HttpPost("{id:guid}/lock")] public Task<IActionResult> Lock(Guid id, JsonElement body, CancellationToken ct) => State(id, true, null, ct);
    [HttpPost("{id:guid}/unlock")] public Task<IActionResult> Unlock(Guid id, JsonElement body, CancellationToken ct) => State(id, false, body.String("reason"), ct);
    private Task<IActionResult> State(Guid id, bool locked, string? reason, CancellationToken ct) => Run(true, async (c, t, a) =>
    {
        if (!locked && string.IsNullOrWhiteSpace(reason))
            throw Invalid("Cần lý do mở khóa.");
        if (await Execute(c, t, "update billing_periods set status=@s,locked_at=case when @locked then now() else null end,locked_by=case when @locked then @actor else null end,unlock_reason=@reason where id=@id", ct, "id", id, "s", locked ? "locked" : "open", "locked", locked, "actor", a, "reason", reason) == 0)
            throw Missing();
        return await Period(c, t, id, ct);
    }, ct);
}
