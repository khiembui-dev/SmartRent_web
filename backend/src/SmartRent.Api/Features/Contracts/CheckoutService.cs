using System.Text.Json.Nodes;
using Npgsql;
using SmartRent.Api.Common;
using SmartRent.Api.Features.Billing;
using SmartRent.Api.Features.Payments;
using static SmartRent.Api.Common.BusinessData;
namespace SmartRent.Api.Features.Contracts;

internal static class CheckoutService
{
    // Preview không ghi hóa đơn; checkout sử dụng lại cùng dữ liệu tính, trong transaction khóa hợp đồng.
    public static async Task<JsonObject> Calculate(NpgsqlConnection c, NpgsqlTransaction t, Guid id, JsonObject body, CancellationToken ct)
    {
        var contract = await BillingEngine.Contract(c, t, id, ct);
        if (contract.Text("status") != "active")
            throw Invalid("Hợp đồng không còn hoạt động.");
        var day = DateOnly.Parse(body.Text("moveOutOn")!);
        var move = DateOnly.Parse(contract.Text("move_in_on")!);
        if (day <= move || day > Today)
            throw Invalid("Ngày trả phải sau ngày vào ở và không ở tương lai.");
        var previous = await Scalar(c, t, "select max(service_to)::text from invoices where contract_id=@id and status='issued' and kind in ('periodic','final') and not metered_only", ct, "id", id);
        var from = previous is null ? move : DateOnly.Parse(previous);
        var meteredOnly = from >= day;
        if (meteredOnly)
            from = day.AddDays(-1);
        var inv = new JsonObject { ["contract_id"] = id, ["service_from"] = from.ToString("yyyy-MM-dd"), ["service_to"] = day.ToString("yyyy-MM-dd"), ["metered_only"] = meteredOnly };
        var version = BillingEngine.Version(contract, from);
        var readings = body["readings"];
        foreach (var kind in new[] { "electricity", "water" })
        {
            if (!version["rates"]!.AsArray().Any(x => x.Text("category") == kind && x.Text("method") == "metered"))
                continue;
            var first = await BillingEngine.Previous(c, t, contract, kind, day, null, ct) ?? throw Invalid("Thiếu chỉ số đầu " + kind);
            if (readings?[kind] is null)
                throw Invalid("Cần số cuối " + kind);
            var value = readings[kind]!.GetValue<decimal>();
            var at = new DateTimeOffset(day.ToDateTime(new TimeOnly(18, 0)), TimeSpan.FromHours(7)).ToUniversalTime();
            if (at > DateTimeOffset.UtcNow)
                at = DateTimeOffset.UtcNow;
            inv[kind + "_start"] = Copy(first["value"]);
            inv[kind + "_from_at"] = first.Text("observedAt");
            inv[kind + "_end"] = value;
            inv[kind + "_to_at"] = at.ToString("O");
        }
        var lines = await BillingEngine.Lines(c, t, contract, inv, true, ct);
        var total = lines.Sum(x => x.Number("amount"));
        var debts = await Rows(c, t, "select jsonb_build_object('id',i.id,'outstandingAmount',b.outstanding_amount)::text from v_invoice_balances b join invoices i on i.id=b.id where i.contract_id=@id and b.outstanding_amount>0 order by i.due_on,i.id", ct, "id", id);
        var held = decimal.Parse(await Scalar(c, t, "select held::text from v_deposit_balances where contract_id=@id", ct, "id", id) ?? "0", System.Globalization.CultureInfo.InvariantCulture);
        return new JsonObject { ["depositHeld"] = held, ["outstandingInvoices"] = Array(debts), ["outstandingTotal"] = debts.Sum(x => x.Number("outstandingAmount")), ["finalInvoice"] = new JsonObject { ["totalAmount"] = total, ["lines"] = lines }, ["invoiceData"] = inv, ["contractData"] = contract };
    }
    public static async Task<object> Commit(NpgsqlConnection c, NpgsqlTransaction t, Guid actor, Guid id, JsonObject body, CancellationToken ct)
    {
        await Execute(c, t, "select id from contracts where id=@id for update", ct, "id", id);
        var preview = await Calculate(c, t, id, body, ct);
        var inv = preview["invoiceData"]!;
        var contract = preview["contractData"]!;
        var invoice = Guid.NewGuid();
        var day = DateOnly.Parse(body.Text("moveOutOn")!);
        await Execute(c, t, """
            insert into invoices(id,code,contract_id,kind,status,service_from,service_to,lines,metered_only,
              electricity_start,electricity_end,electricity_from_at,electricity_to_at,water_start,water_end,water_from_at,water_to_at,
              issued_on,due_on,issued_by,issued_at,customer_snapshot)
            values(@invoice,next_code('HD'),@contract,'final','issued',@from,@to,@lines::jsonb,@metered,
              @es,@ee,@ef::timestamptz,@et::timestamptz,@ws,@we,@wf::timestamptz,@wt::timestamptz,@today,@today,@actor,now(),'{}')
            """, ct, "invoice", invoice, "contract", id, "from", DateOnly.Parse(inv.Text("service_from")!), "to", day, "lines", preview["finalInvoice"]!["lines"]!.ToJsonString(), "metered", inv["metered_only"]!.GetValue<bool>(),
            "es", inv["electricity_start"]?.GetValue<decimal>(), "ee", inv["electricity_end"]?.GetValue<decimal>(), "ef", inv.Text("electricity_from_at"), "et", inv.Text("electricity_to_at"),
            "ws", inv["water_start"]?.GetValue<decimal>(), "we", inv["water_end"]?.GetValue<decimal>(), "wf", inv.Text("water_from_at"), "wt", inv.Text("water_to_at"), "today", Today, "actor", actor);
        var debts = preview["outstandingInvoices"]!.DeepClone().AsArray();
        debts.Add(new JsonObject { ["id"] = invoice, ["outstandingAmount"] = preview["finalInvoice"]!.Number("totalAmount") });
        var remaining = preview.Number("depositHeld");
        var alloc = new JsonArray();
        decimal debt = 0;
        foreach (var d in debts)
        {
            var due = d.Number("outstandingAmount");
            var take = Math.Min(remaining, due);
            if (take > 0)
                alloc.Add(new JsonObject { ["invoiceId"] = d.Id("id"), ["amount"] = take });
            remaining -= take;
            debt += due - take;
        }
        if (debt > 0 && string.IsNullOrWhiteSpace(body.Text("remainingDebtReason")))
            throw Invalid("Cần lý do kết thúc khi còn nợ.");
        var user = contract.Id("user_id");
        var offset = preview.Number("depositHeld") - remaining;
        if (offset > 0)
            await PaymentLedger.Append(c, t, actor, user, id, null, "deposit_offset", offset, null, null, alloc, null, "Bù trừ cọc khi trả phòng", null, DateTimeOffset.UtcNow, true, null, "checkout-offset:" + id, ct);
        if (remaining > 0)
            await PaymentLedger.Append(c, t, actor, user, id, null, "deposit_refund", remaining, body["refund"].Text("methodCode") ?? "cash", body["refund"].Text("externalReference"), new(), null, "Hoàn cọc khi trả phòng", null, DateTimeOffset.UtcNow, true, null, "checkout-refund:" + id, ct);
        var final = new JsonObject();
        foreach (var kind in new[] { "electricity", "water" })
        if (inv[kind + "_end"] is not null)
            final[kind] = new JsonObject { ["value"] = Copy(inv[kind + "_end"]), ["observedAt"] = inv.Text(kind + "_to_at") };
        await Execute(c, t, """
            update contracts set status='ended',move_out_on=@out,ended_reason=@reason,remaining_debt_reason=@debtReason,
             final_readings=@final::jsonb,checkout_handover=@handover::jsonb,
             occupants=(select coalesce(jsonb_agg(case when x->>'leftOn' is null then x||jsonb_build_object('leftOn',@out::date) else x end),'[]') from jsonb_array_elements(occupants)x),
             checkout_summary=checkout_summary||jsonb_build_object('finalInvoiceId',@invoice::text,'offset',@offset,'refund',@refund,'remainingDebt',@debt,'checkoutHash',@hash)
            where id=@id
            """, ct, "id", id, "out", day, "reason", body.Text("terminationReason") ?? "Trả phòng", "debtReason", body.Text("remainingDebtReason"), "final", final.ToJsonString(), "handover", body["handover"]?.ToJsonString() ?? "{}", "invoice", invoice.ToString(), "offset", offset, "refund", remaining, "debt", debt, "hash", PaymentLedger.Hash(body));
        var status = body.Text("roomStatusAfter") ?? "available";
        if (status is not ("available" or "maintenance"))
            throw Invalid("Trạng thái phòng sau trả không hợp lệ.");
        await Execute(c, t, "update rooms set operating_status=@status,status_reason='Sau trả phòng' where id=@id", ct, "id", contract["room"]!.Id("id"), "status", status);
        return new
        {
            contractId = id,
            finalInvoiceId = invoice,
            depositRefund = remaining,
            remainingDebt = debt
        };
    }
}
