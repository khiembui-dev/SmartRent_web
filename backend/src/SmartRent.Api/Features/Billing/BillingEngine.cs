using System.Text.Json.Nodes;
using Npgsql;
using SmartRent.Api.Common;
using static SmartRent.Api.Common.BusinessData;

namespace SmartRent.Api.Features.Billing;

// Một bộ tính cho worksheet, hóa đơn tháng và quyết toán. Giá và chỉ số đều lấy SQL.
internal static class BillingEngine
{
    public static async Task<JsonObject> Contract(NpgsqlConnection c, NpgsqlTransaction? t, Guid id, CancellationToken ct) =>
        await Row(c, t, "select to_jsonb(c)||jsonb_build_object('room',to_jsonb(r),'property',to_jsonb(p)) from contracts c join rooms r on r.id=c.room_id join properties p on p.id=r.property_id where c.id=@id", ct, "id", id);
    public static JsonNode Version(JsonObject contract, DateOnly day) => contract["versions"]!.AsArray()
        .Where(v => v.Text("signedAt") is not null && DateOnly.Parse(v.Text("effectiveFrom")!) <= day)
        .OrderBy(v => v.Number("versionNo")).LastOrDefault() ?? throw new LeaseHttpException(422, "signed_contract_required", "Cần hợp đồng đã ký trước khi tính tiền.");
    public static async Task<JsonObject?> Previous(NpgsqlConnection c, NpgsqlTransaction? t, JsonObject contract, string kind, DateOnly serviceFrom, Guid? except, CancellationToken ct)
    {
        // kind chỉ nhận điện/nước từ code server, không nhận tên cột tùy ý từ HTTP.
        if (kind is not ("electricity" or "water"))
            throw Invalid("Loại chỉ số không hợp lệ.");
        var json = await Scalar(c, t, $"select jsonb_build_object('value',{kind}_end,'observedAt',{kind}_to_at)::text from invoices where contract_id=@id and id<>coalesce(@except::uuid,'00000000-0000-0000-0000-000000000000') and status='issued' and adjusts_invoice_id is null and {kind}_end is not null and service_from<@day order by {kind}_to_at desc limit 1", ct, "id", contract.Id("id"), "except", except, "day", serviceFrom);
        return json is null ? contract["initial_readings"]?[kind]?.DeepClone().AsObject() : JsonNode.Parse(json)!.AsObject();
    }
    public static async Task<JsonObject> Draft(NpgsqlConnection c, NpgsqlTransaction t, Guid contractId, Guid periodId, CancellationToken ct)
    {
        var contract = await Contract(c, t, contractId, ct);
        var period = await Row(c, t, "select to_jsonb(b)::text from billing_periods b where id=@id for update", ct, "id", periodId);
        if (period.Text("status") != "open")
            throw new LeaseHttpException(409, "period_locked", "Kỳ tính tiền đã khóa.");
        if (contract["room"]!.Id("property_id") != period.Id("property_id"))
            throw Invalid("Hợp đồng không thuộc cơ sở của kỳ.");
        var existing = await Scalar(c, t, "select to_jsonb(i)::text from invoices i where contract_id=@id and period_id=@period and kind='periodic' and status<>'void' for update", ct, "id", contractId, "period", periodId);
        if (existing is not null)
            return JsonNode.Parse(existing)!.AsObject();
        var month = DateOnly.Parse(period.Text("month_start")!);
        var start = DateOnly.Parse(contract.Text("starts_on")!);
        var from = month > start ? month : start;
        var to = month.AddMonths(1);
        if (contract.Text("move_out_on") is string move && DateOnly.Parse(move) < to)
            to = DateOnly.Parse(move);
        if (from >= to)
            throw Invalid("Phòng không có thời gian thuê trong kỳ này.");
        var version = Version(contract, from);
        var rates = version["rates"]!.AsArray();
        var e = rates.Any(r => r.Text("category") == "electricity" && r.Text("method") == "metered") ? await Previous(c, t, contract, "electricity", from, null, ct) : null;
        var w = rates.Any(r => r.Text("category") == "water" && r.Text("method") == "metered") ? await Previous(c, t, contract, "water", from, null, ct) : null;
        var id = Guid.NewGuid();
        await Execute(c, t, """
            insert into invoices(id,contract_id,period_id,service_from,service_to,electricity_start,electricity_from_at,water_start,water_from_at)
            values(@id,@contract,@period,@from,@to,@es,@eat::timestamptz,@ws,@wat::timestamptz)
            """, ct, "id", id, "contract", contractId, "period", periodId, "from", from, "to", to, "es", e?["value"]?.GetValue<decimal>(), "eat", e.Text("observedAt"), "ws", w?["value"]?.GetValue<decimal>(), "wat", w.Text("observedAt"));
        return await Row(c, t, "select to_jsonb(i)::text from invoices i where id=@id", ct, "id", id);
    }
    public static async Task<JsonArray> Lines(NpgsqlConnection c, NpgsqlTransaction? t, JsonObject contract, JsonObject inv, bool requireReadings, CancellationToken ct, bool allowEmptyFinal = false)
    {
        var from = DateOnly.Parse(inv.Text("service_from")!);
        var to = DateOnly.Parse(inv.Text("service_to")!);
        var lines = new JsonArray();
        var versions = contract["versions"]!.AsArray().Where(v => v.Text("signedAt") is not null).OrderBy(v => v.Number("versionNo")).ToArray();
        if (versions.Length == 0)
            throw new LeaseHttpException(422, "signed_contract_required", "Hợp đồng chưa có bản đã ký.");
        foreach (var v in versions)
        {
            var vs = DateOnly.Parse(v.Text("effectiveFrom")!);
            var ve = DateOnly.Parse(v.Text("endsOn")!);
            // Bản cuối tiếp tục giữ giá khi khách còn ở sau hạn; không tự cho giá 0.
            if (v == versions.Last() && contract.Text("status") == "active" && ve < to)
                ve = to;
            var begin = vs > from ? vs : from;
            var end = ve < to ? ve : to;
            if (begin >= end)
                continue;
            foreach (var rate in v!["rates"]!.AsArray())
            {
                var rs = DateOnly.Parse(rate.Text("effectiveFrom")!);
                var re = rate.Text("effectiveTo") is string until ? DateOnly.Parse(until) : end;
                var a = rs > begin ? rs : begin;
                var b = re < end ? re : end;
                if (a >= b)
                    continue;
                var category = rate.Text("category")!;
                var code = rate.Text("code")!;
                var method = rate.Text("method")!;
                var once = rate.Text("cycle") == "once";
                if (once && await Scalar(c, t, "select i.id::text from invoices i cross join lateral jsonb_array_elements(i.lines) x where i.contract_id=@contract and i.status='issued' and x->>'code'=@code and coalesce((x->>'oneTime')::boolean,false) limit 1", ct, "contract", contract.Id("id"), "code", code) is not null)
                    continue;
                // Cắt khoản cố định theo từng tháng để quyết toán nhiều tháng không dùng sai mẫu số.
                var spans = new List<(DateOnly From, DateOnly To)>();
                if (method == "metered" || once)
                    spans.Add((a, b));
                else
                for (var cursor = a; cursor < b;)
                {
                    var next = new DateOnly(cursor.Year, cursor.Month, 1).AddMonths(1);
                    if (next > b)
                        next = b;
                    spans.Add((cursor, next));
                    cursor = next;
                }
                foreach (var span in spans)
                {
                    decimal quantity = 1;
                    var numerator = 1;
                    var denominator = 1;
                    if (method == "metered")
                    {
                        if (category is not ("electricity" or "water"))
                            throw Invalid("Khoản đo chỉ số phải là điện hoặc nước.");
                        if (inv[category + "_end"] is null || inv[category + "_start"] is null)
                        {
                            if (requireReadings)
                                throw new LeaseHttpException(422, "missing_readings", "Cần nhập đủ chỉ số đầu và cuối của " + rate.Text("name"));
                            continue;
                        }
                        var prior = lines.FirstOrDefault(x => x.Text("category") == category);
                        if (prior is not null)
                        {
                            if (prior.Number("unitPrice") == rate.Number("unitPrice"))
                                continue;
                            throw Invalid("Giá điện/nước thay đổi trong kỳ; cần chốt chỉ số riêng tại ngày đổi giá.");
                        }
                        quantity = inv.Number(category + "_end") - inv.Number(category + "_start");
                        if (quantity < 0)
                            throw Invalid("Chỉ số cuối phải lớn hơn hoặc bằng số đầu.");
                    }
                    else
                    {
                        if (inv["metered_only"]?.GetValue<bool>() == true)
                            continue;
                        if (method == "per_quantity")
                            quantity = rate.Number("quantity", 1);
                        if (method == "per_person")
                            quantity = 1 + contract["occupants"]!.AsArray().Count(x => DateOnly.Parse(x.Text("joinedOn")!) <= span.From && (x.Text("leftOn") is null || DateOnly.Parse(x.Text("leftOn")!) > span.From));
                        if (!once && v.Text("prorationPolicy") != "full_month" && rate.Text("proration") != "full_month")
                        {
                            numerator = span.To.DayNumber - span.From.DayNumber;
                            denominator = DateTime.DaysInMonth(span.From.Year, span.From.Month);
                            if (method == "per_person")
                            {
                                quantity = 1;
                                foreach (var occupant in contract["occupants"]!.AsArray())
                                {
                                    var join = DateOnly.Parse(occupant.Text("joinedOn")!);
                                    var left = occupant.Text("leftOn") is string date ? DateOnly.Parse(date) : span.To;
                                    var lo = join > span.From ? join : span.From;
                                    var hi = left < span.To ? left : span.To;
                                    if (hi > lo)
                                        numerator += hi.DayNumber - lo.DayNumber;
                                }
                            }
                        }
                    }
                    if (once && lines.Any(x => x.Text("code") == code && x?["oneTime"]?.GetValue<bool>() == true))
                        continue;
                    var price = rate.Number("unitPrice");
                    lines.Add(new JsonObject
                    {
                        ["id"] = Guid.NewGuid(),
                        ["code"] = code,
                        ["category"] = category,
                        ["description"] = rate.Text("name"),
                        ["unit"] = rate.Text("unit"),
                        ["quantity"] = quantity,
                        ["unitPrice"] = price,
                        ["sign"] = 1,
                        ["numerator"] = numerator,
                        ["denominator"] = denominator,
                        ["oneTime"] = once,
                        ["sourceScope"] = "contract",
                        ["sourceRateId"] = rate.Text("id"),
                        ["amount"] = decimal.Round(quantity * price * numerator / denominator, 0, MidpointRounding.AwayFromZero)
                    });
                }
            }
        }
        if (lines.Count == 0 && requireReadings && !allowEmptyFinal)
            throw Invalid("Chưa có khoản thu hợp lệ cho kỳ này.");
        return lines;
    }
    public static async Task<JsonObject> Recompute(NpgsqlConnection c, NpgsqlTransaction t, Guid id, bool issue, Guid actor, CancellationToken ct)
    {
        var inv = await Row(c, t, "select to_jsonb(i)::text from invoices i where id=@id for update", ct, "id", id);
        if (inv.Text("status") != "draft")
            return inv;
        var contract = await Contract(c, t, inv.Id("contract_id"), ct);
        var lines = await Lines(c, t, contract, inv, issue, ct);
        await Execute(c, t, "update invoices set lines=@lines::jsonb where id=@id", ct, "id", id, "lines", lines.ToJsonString());
        if (issue)
        {
            var v = Version(contract, DateOnly.Parse(inv.Text("service_from")!));
            var due = Today.AddDays((int)v.Number("dueAfterDays", 5));
            await Execute(c, t, """
                update invoices set status='issued',code=next_code('HD'),issued_by=@actor,issued_at=now(),issued_on=@today,due_on=@due,
                  customer_snapshot=(select jsonb_build_object('name',u.display_name,'email',u.email) from users u where id=@user) where id=@id
                """, ct, "id", id, "actor", actor, "today", Today, "due", due, "user", contract.Id("user_id"));
            await Execute(c, t, "insert into notifications(recipient_id,event_key,title,body,url) select @user,'invoice:'||id::text,'Hóa đơn mới','Hóa đơn '||code||' đã phát hành.','/invoices/'||id::text from invoices where id=@id", ct, "id", id, "user", contract.Id("user_id"));
        }
        return await Row(c, t, "select to_jsonb(i)::text from invoices i where id=@id", ct, "id", id);
    }
}
