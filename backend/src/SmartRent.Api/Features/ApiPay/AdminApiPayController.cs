using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Npgsql;
using SmartRent.Api.Common;
using static SmartRent.Api.Common.BusinessData;

namespace SmartRent.Api.Features.ApiPay;

// Đối soát ngoại lệ dùng sổ thu hiện có; không có nút ép hóa đơn thành "paid".
[ApiController, Authorize(Roles = "admin"), Route("api/v1/admin/apipay")]
public sealed class AdminApiPayController(NpgsqlDataSource db) : BusinessController(db)
{
    [HttpGet("events")]
    public Task<IActionResult> Events(int page = 1, CancellationToken ct = default) => Run(true, async (c, t, a) =>
        Page(await Rows(c, t, """
            select jsonb_build_object('transactionId',e.transaction_id,'amount',e.amount,'content',e.content,
              'referenceCode',e.reference_code,'receivedAt',e.received_at,'state',e.state,'reason',e.reason,
              'attempts',e.attempts,'invoiceId',r.invoice_id,'invoiceCode',i.code)::text
            from apipay_events e left join apipay_requests r on r.id=e.request_id left join invoices i on i.id=r.invoice_id
            where e.state in ('review','pending') order by e.received_at desc
            """, ct), page, 25), ct);

    [HttpPost("events/{transactionId}/retry")]
    public Task<IActionResult> Retry(string transactionId, CancellationToken ct) => Run(true, async (c, t, a) =>
    {
        await Row(c, t, "select to_jsonb(e)::text from apipay_events e where transaction_id=@id for update", ct, "id", transactionId);
        await Execute(c, t, "update apipay_events set state='pending',next_attempt_at=now(),processed_at=null where transaction_id=@id and state in ('pending','review')", ct, "id", transactionId);
        return new { accepted = true };
    }, ct);

    // Mã nội dung không khớp: sau khi tạo phiếu thu thủ công, admin liên kết đúng phiếu thu đã xác nhận.
    [HttpPost("events/{transactionId}/reconcile")]
    public Task<IActionResult> Reconcile(string transactionId, JsonElement body, CancellationToken ct) => Run(true, async (c, t, a) =>
    {
        var b = Object(body); var payment = b.Id("paymentId");
        var e = await Row(c, t, "select to_jsonb(e)::text from apipay_events e where transaction_id=@id for update", ct, "id", transactionId);
        if (e.Text("state") == "processed")
        {
            if (e.Text("payment_id") != payment.ToString()) throw new LeaseHttpException(409, "reconciliation_conflict", "Giao dịch đã liên kết với phiếu thu khác.");
            return new { reconciled = true };
        }
        if (e.Text("state") != "review") throw new LeaseHttpException(409, "event_not_review", "Khoản này chưa ở trạng thái cần đối chiếu.");
        var valid = await Scalar(c, t, """
            select id::text from payments p where id=@id and status='confirmed' and kind='receipt' and method='bank_transfer'
              and amount=@amount and lower(btrim(external_reference))=lower(btrim(@reference))
              and not exists(select 1 from apipay_events x where x.payment_id=p.id and x.transaction_id<>@txn)
            """, ct, "id", payment, "amount", e.Number("amount"), "reference", e.Text("reference_code"), "txn", transactionId);
        if (valid is null) throw Invalid("Phiếu thu phải đã xác nhận, cùng số tiền và mã giao dịch ngân hàng.");
        await Execute(c, t, "update apipay_events set state='processed',reason=@reason,payment_id=@payment,processed_at=now() where transaction_id=@id", ct,
            "reason", "admin_reconciled:" + a, "payment", payment, "id", transactionId);
        return new { reconciled = true };
    }, ct);

    // Tài khoản ngân hàng có thể nhận khoản không thuộc website. Admin loại khỏi hàng chờ sau khi kiểm tra.
    [HttpPost("events/{transactionId}/ignore")]
    public Task<IActionResult> Ignore(string transactionId, JsonElement body, CancellationToken ct) => Run(true, async (c, t, a) =>
    {
        var reason = Object(body).Text("reason")?.Trim();
        if (string.IsNullOrWhiteSpace(reason) || reason.Length > 500) throw Invalid("Nhập lý do đối soát tối đa 500 ký tự.");
        var e = await Row(c, t, "select to_jsonb(e)::text from apipay_events e where transaction_id=@id for update", ct, "id", transactionId);
        if (e.Text("state") == "ignored") return new { ignored = true };
        if (e.Text("state") != "review") throw new LeaseHttpException(409, "event_not_review", "Chỉ bỏ qua khoản đang cần đối chiếu.");
        await Execute(c, t, "update apipay_events set state='ignored',reason=@reason,processed_at=now() where transaction_id=@id", ct,
            "reason", "admin_ignored:" + a + ":" + reason, "id", transactionId);
        return new { ignored = true };
    }, ct);
}
