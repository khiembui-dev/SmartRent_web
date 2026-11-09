using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Mvc;
using Npgsql;
using SmartRent.Api.Common;
using static SmartRent.Api.Common.BusinessData;
namespace SmartRent.Api.Features.Billing;

[ApiController, Route("api/v1/meter-readings")]
public sealed class MeterReadingsController(NpgsqlDataSource db) : BusinessController(db)
{
    // Chỉ số điện/nước nằm ngay trên hóa đơn nháp; lưu theo nhóm phòng trong một transaction.
    [HttpPost("batch")]
    public Task<IActionResult> Batch(JsonElement body, CancellationToken ct) => Run(true, async (c, t, actor) =>
    {
        var b = Object(body);
        var pid = b.Id("billingPeriodId");
        var results = new List<object>();
        var groups = new Dictionary<Guid, List<(string Kind, decimal Value, string At, Guid Meter)>>();
        foreach (var item in b["items"]?.AsArray() ?? throw Invalid("Cần danh sách chỉ số."))
        {
            var meter = item.Id("meterId");
            var target = await Row(c, t, """
                select jsonb_build_object('id',ct.id,'kind',case when md5(r.id::text||'electricity')::uuid=@meter then 'electricity' else 'water' end)::text
                from contracts ct join rooms r on r.id=ct.room_id join billing_periods bp on bp.property_id=r.property_id
                where bp.id=@period and ct.status in ('active','ended') and ct.starts_on<bp.month_start+interval '1 month'
                  and (ct.move_out_on is null or ct.move_out_on>bp.month_start)
                  and (@meter=md5(r.id::text||'electricity')::uuid or @meter=md5(r.id::text||'water')::uuid)
                """, ct, "period", pid, "meter", meter);
            var id = target.Id("id");
            if (!groups.ContainsKey(id))
                groups[id] = [];
            var value = item.Number("readingValue", -1);
            if (value < 0)
                throw Invalid("Chỉ số phải không âm.");
            var at = DateTimeOffset.Parse(item.Text("observedAt") ?? DateTimeOffset.UtcNow.ToString("O")).ToUniversalTime();
            if (at > DateTimeOffset.UtcNow.AddMinutes(1))
                throw Invalid("Không ghi chỉ số ở tương lai.");
            groups[id].Add((target.Text("kind")!, value, at.ToString("O"), meter));
        }
        foreach (var (id, items) in groups)
        {
            var inv = await BillingEngine.Draft(c, t, id, pid, ct);
            if (inv.Text("status") != "draft")
                throw new LeaseHttpException(409, "invoice_issued", "Hóa đơn đã phát hành; không sửa chỉ số trực tiếp.");
            foreach (var x in items)
            {
                if (inv[x.Kind + "_start"] is null)
                    throw Invalid("Thiếu chỉ số đầu. Bổ sung hồ sơ nhận phòng trước khi ghi số.");
                await Execute(c, t, $"update invoices set {x.Kind}_end=@value,{x.Kind}_to_at=@at::timestamptz,correction_reason=@reason where id=@id", ct, "id", inv.Id("id"), "value", x.Value, "at", x.At, "reason", "Nhập chỉ số kỳ từ bảng tính");
                results.Add(new
                {
                    meterId = x.Meter,
                    status = "succeeded",
                    readingId = inv.Id("id")
                });
            }
            await BillingEngine.Recompute(c, t, inv.Id("id"), false, actor, ct);
        }
        return new
        {
            results
        };
    }, ct);
    [HttpPost("{id:guid}/correct")]
    public Task<IActionResult> Correct(Guid id, JsonElement body, CancellationToken ct) => Run(true, async (c, t, a) =>
    {
        var b = Object(body);
        var kind = b.Text("meterKind");
        if (kind is not ("electricity" or "water"))
            throw Invalid("Cần loại chỉ số điện hoặc nước.");
        var reason = b.Text("reason");
        if (string.IsNullOrWhiteSpace(reason))
            throw Invalid("Cần lý do sửa chỉ số.");
        var inv = await Row(c, t, "select to_jsonb(i)::text from invoices i where id=@id for update", ct, "id", id);
        if (inv.Text("status") != "draft")
            throw new LeaseHttpException(409, "invoice_issued", "Chỉ sửa chỉ số hóa đơn nháp.");
        await Execute(c, t, $"update invoices set {kind}_end=@value,correction_reason=@reason where id=@id", ct, "id", id, "value", b.Number("readingValue", -1), "reason", reason);
        await BillingEngine.Recompute(c, t, id, false, a, ct);
        return new
        {
            id
        };
    }, ct);
}
