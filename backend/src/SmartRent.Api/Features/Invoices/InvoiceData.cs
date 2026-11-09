using System.Text.Json.Nodes;
using Npgsql;
using SmartRent.Api.Common;
using static SmartRent.Api.Common.BusinessData;
namespace SmartRent.Api.Features.Invoices;

// Cùng projection cho hóa đơn admin/khách: chi tiết dòng tiền và lịch sử đảo phải khớp số dư SQL.
internal static class InvoiceData
{
    public static async Task<JsonObject> Get(NpgsqlConnection c, NpgsqlTransaction? t, Guid id, CancellationToken ct)
    {
        var i = await Row(c, t, """
            select jsonb_build_object('id',i.id,'code',i.code,'kind',i.kind,'status',i.status,'tenancyId',ct.id,
              'room',jsonb_build_object('id',r.id,'code',r.code,'propertyId',p.id,'propertyName',p.name),
              'property',jsonb_build_object('id',p.id,'name',p.name),'representative',jsonb_build_object('id',u.id,'fullName',u.display_name,'phone',u.phone),
              'period',case when bp.id is null then null else jsonb_build_object('id',bp.id,'monthStart',bp.month_start) end,
              'serviceFrom',i.service_from,'serviceTo',i.service_to,'issuedOn',i.issued_on,'dueOn',i.due_on,
              'totalAmount',i.total_amount,'receivableAmount',b.receivable_amount,'paidAmount',b.paid_amount,'outstandingAmount',b.outstanding_amount,
              'paymentStatus',b.payment_status,'isOverdue',b.is_overdue,'daysOverdue',case when b.is_overdue then current_date-i.due_on else 0 end,
              'notes',i.notes,'lines',i.lines,'voidReason',i.void_reason,'voidedAt',i.voided_at,'createdAt',i.created_at,
              'history',i.readings_history,'raw',to_jsonb(i))::text
            from invoices i join v_invoice_balances b on b.id=i.id join contracts ct on ct.id=i.contract_id
            join users u on u.id=ct.user_id join rooms r on r.id=ct.room_id join properties p on p.id=r.property_id
            left join billing_periods bp on bp.id=i.period_id where i.id=@id
            """, ct, "id", id);
        var raw = i["raw"]!;
        var segments = new JsonArray();
        var count = 0;
        foreach (var line in i["lines"]!.AsArray())
        {
            line!["lineNo"] = ++count;
            line["sign"] ??= 1;
            line["isOneTime"] = Copy(line["oneTime"]);
            line["prorationNumerator"] = Copy(line["numerator"]);
            line["prorationDenominator"] = Copy(line["denominator"]);
            line["amount"] = decimal.Round(line.Number("quantity") * line.Number("unitPrice") * line.Number("sign", 1) * line.Number("numerator", 1) / line.Number("denominator", 1), 0, MidpointRounding.AwayFromZero);
            if (line.Text("category") is "electricity" or "water")
            {
                var kind = line.Text("category")!;
                segments.Add(new JsonObject { ["lineId"] = line.Text("id"), ["serialNumber"] = kind == "electricity" ? "Điện" : "Nước", ["startValue"] = Copy(raw[kind + "_start"]), ["endValue"] = Copy(raw[kind + "_end"]) });
            }
        }
        i["meterSegments"] = segments;
        i.Remove("raw");
        i["allocations"] = Array(await Rows(c, t, """
            select jsonb_build_object('id',py.id,'kind',case when py.reverses_id is null then 'apply' else 'reverse' end,
              'source',case when py.kind like 'deposit_%' then 'deposit_offset' else 'receipt' end,
              'payment',jsonb_build_object('id',py.id,'code',py.code,'methodCode',py.method),'allocatedAt',py.confirmed_at,
              'amount',(al->>'amount')::numeric,'reversesId',py.reverses_id,
              'reversedAmount',coalesce((select sum((x->>'amount')::numeric) from payments rev cross join lateral jsonb_array_elements(rev.allocations) x where rev.reverses_id=py.id and rev.status='confirmed' and x->>'invoiceId'=@invoice),0))::text
            from payments py cross join lateral jsonb_array_elements(py.allocations) al
            where py.status='confirmed' and al->>'invoiceId'=@invoice order by py.confirmed_at
            """, ct, "invoice", id.ToString()));
        i["pendingPayments"] = Array(await Rows(c, t, "select jsonb_build_object('id',id,'code',code,'amount',amount,'receivedAt',received_at,'methodCode',method,'externalReference',external_reference)::text from payments where status='pending' and intended_invoice_id=@id order by created_at", ct, "id", id));
        return i;
    }
}
