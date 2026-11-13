using System.Text.Json.Nodes;
using Npgsql;
using SmartRent.Api.Common;
using SmartRent.Api.Features.Payments;
using static SmartRent.Api.Common.BusinessData;

namespace SmartRent.Api.Features.ApiPay;

// Repository dùng cùng pool PostgreSQL và sổ payments của hệ thống. Không chứa API key.
public sealed class ApiPayStore(NpgsqlDataSource db, ApiPayOptions options)
{
    private static Task<JsonObject> Invoice(NpgsqlConnection c, NpgsqlTransaction? t, Guid invoice, Guid user, CancellationToken ct) => Row(c, t, """
        select jsonb_build_object('id',i.id,'code',i.code,'status',i.status,'kind',i.kind,
          'contractId',i.contract_id,'adjustment',i.adjusts_invoice_id is not null,'amount',b.outstanding_amount,'paymentStatus',b.payment_status)::text
        from invoices i join contracts k on k.id=i.contract_id join v_invoice_balances b on b.id=i.id
        where i.id=@id and k.user_id=@user and i.status<>'draft'
        """, ct, "id", invoice, "user", user);

    public async Task<JsonObject> StateAsync(Guid invoice, Guid user, CancellationToken ct)
    {
        await using var c = await db.OpenConnectionAsync(ct);
        var inv = await Invoice(c, null, invoice, user, ct);
        var state = new JsonObject
        {
            ["available"] = options.Ready,
            ["paymentStatus"] = inv.Text("paymentStatus"),
            ["outstandingAmount"] = inv.Number("amount"),
            ["request"] = null,
            ["review"] = false,
            ["creating"] = false
        };
        if (!options.Ready)
            return state;
        state["review"] = await NeedsReview(c, null, invoice, ct);
        state["pendingManual"] = await PendingManual(c, null, invoice, ct);
        state["creating"] = await Scalar(c, null, "select 'yes' from apipay_requests where invoice_id=@id and state='creating' and created_at>now()-interval '1 minute' limit 1", ct, "id", invoice) is not null;
        // Hóa đơn thay đổi số dư/hủy thì không tiếp tục đưa QR cũ cho khách, kể cả khi link bên ngân hàng chưa hết hạn.
        if (inv.Text("status") == "issued" && !inv["adjustment"]!.GetValue<bool>() && inv.Number("amount") > 0
            && !state["review"]!.GetValue<bool>() && !state["pendingManual"]!.GetValue<bool>())
        {
            var json = await Scalar(c, null, """
                select jsonb_build_object('id',id,'publicId',provider_id,'amount',amount,'content',content,
                  'payUrl',pay_url,'qrUrl',qr_url,'bankCode',bank_code,'accountNumber',account_number,
                  'accountName',account_name,'expiresAt',expires_at)::text
                from apipay_requests r where invoice_id=@id and user_id=@user and bank_public_id=@bank
                  and state='ready' and expires_at>now() and amount=@amount
                  and not exists(select 1 from apipay_events e where e.request_id=r.id and e.state='processed')
                order by created_at desc limit 1
                """, ct, "id", invoice, "user", user, "bank", options.BankPublicId, "amount", inv.Number("amount"));
            state["request"] = json is null ? null : JsonNode.Parse(json);
        }
        return state;
    }
    private static async Task<bool> NeedsReview(NpgsqlConnection c, NpgsqlTransaction? t, Guid invoice, CancellationToken ct) =>
        await Scalar(c, t, "select 'yes' from apipay_events e join apipay_requests r on r.id=e.request_id where r.invoice_id=@id and e.state='review' limit 1", ct, "id", invoice) is not null;
    private static async Task<bool> PendingManual(NpgsqlConnection c, NpgsqlTransaction? t, Guid invoice, CancellationToken ct) =>
        await Scalar(c, t, "select 'yes' from payments where intended_invoice_id=@id and status='pending' limit 1", ct, "id", invoice) is not null;

    // Khóa theo hóa đơn để 2 tab không tạo 2 QR. COMMIT trước HTTP ngoài, không giữ khóa khi chờ ApiPay.
    public async Task<JsonObject?> ReserveAsync(Guid invoice, Guid user, CancellationToken ct)
    {
        await using var c = await db.OpenConnectionAsync(ct);
        await using var t = await c.BeginTransactionAsync(ct);
        await Execute(c, t, "set local lock_timeout='3s'; set local statement_timeout='5s'", ct);
        await Execute(c, t, "select pg_advisory_xact_lock(hashtextextended(@key,0))", ct, "key", "apipay:" + invoice);
        var inv = await Invoice(c, t, invoice, user, ct);
        if (inv.Text("status") != "issued" || inv["adjustment"]!.GetValue<bool>() || inv.Number("amount") <= 0)
            throw new LeaseHttpException(409, "invoice_not_payable", "Hóa đơn không còn khoản cần thanh toán.");
        if (inv.Number("amount") > 300000000)
            throw Invalid("ApiPay hỗ trợ tối đa 300.000.000 đồng cho một yêu cầu. Vui lòng liên hệ chủ trọ.");
        if (await NeedsReview(c, t, invoice, ct) || await PendingManual(c, t, invoice, ct))
            throw new LeaseHttpException(409, "payment_review", "Đã có khoản chuyển đang được đối chiếu. Chưa chuyển thêm tiền.");
        if (await Scalar(c, t, "select 'yes' from apipay_requests r where invoice_id=@id and bank_public_id=@bank and state='ready' and amount=@amount and expires_at>now() and not exists(select 1 from apipay_events e where e.request_id=r.id and e.state='processed') limit 1", ct,
                "id", invoice, "bank", options.BankPublicId, "amount", inv.Number("amount")) is not null)
        {
            await t.CommitAsync(ct);
            return null;
        }
        if (await Scalar(c, t, "select 'yes' from apipay_requests where invoice_id=@id and state in ('creating','unknown','failed') and created_at>now()-interval '1 minute' limit 1", ct, "id", invoice) is not null)
            throw new LeaseHttpException(409, "payment_creating", "Yêu cầu trước đang được xử lý. Đợi một phút rồi kiểm tra lại.");
        var id = Guid.NewGuid();
        var content = "SR" + id.ToString("N").ToUpperInvariant();
        await Execute(c, t, """
            insert into apipay_requests(id,invoice_id,user_id,bank_public_id,amount,content,state)
            values(@id,@invoice,@user,@bank,@amount,@content,'creating')
            """, ct, "id", id, "invoice", invoice, "user", user, "bank", options.BankPublicId, "amount", inv.Number("amount"), "content", content);
        await t.CommitAsync(ct);
        return new JsonObject { ["id"] = id, ["amount"] = inv.Number("amount"), ["content"] = content, ["code"] = inv.Text("code") };
    }
    public async Task SaveCheckoutAsync(Guid id, ApiPayCheckout checkout, CancellationToken ct)
    {
        await using var c = await db.OpenConnectionAsync(ct);
        await Execute(c, null, """
            update apipay_requests set state='ready',provider_id=@provider,pay_url=@pay,qr_url=@qr,
              bank_code=@bank,account_number=@account,account_name=@name,expires_at=@expires,updated_at=now()
            where id=@id and state='creating'
            """, ct, "id", id, "provider", checkout.PublicId, "pay", checkout.PayUrl, "qr", checkout.QrUrl,
            "bank", checkout.BankCode, "account", checkout.AccountNumber, "name", checkout.AccountName, "expires", checkout.ExpiresAt);
    }
    public async Task FailedAsync(Guid id, bool uncertain, CancellationToken ct)
    {
        await using var c = await db.OpenConnectionAsync(ct);
        await Execute(c, null, "update apipay_requests set state=@state,updated_at=now() where id=@id and state='creating'", ct,
            "id", id, "state", uncertain ? "unknown" : "failed");
    }

    // Mã transactionId là khóa duy nhất bền vững; replay khác dữ liệu bị từ chối, replay giống nhau trả 2xx.
    public async Task<bool> AcceptAsync(ApiPayTransfer e, CancellationToken ct)
    {
        await using var c = await db.OpenConnectionAsync(ct);
        await using var t = await c.BeginTransactionAsync(ct);
        await Execute(c, t, "set local lock_timeout='2s'; set local statement_timeout='3s'", ct);
        await Execute(c, t, """
            insert into apipay_events(transaction_id,bank_public_id,amount,content,reference_code,transaction_date,body_hash)
            values(@id,@bank,@amount,@content,@reference,@date,@hash) on conflict(transaction_id) do nothing
            """, ct, "id", e.TransactionId, "bank", e.BankPublicId, "amount", e.Amount, "content", e.Content,
            "reference", e.ReferenceCode, "date", e.TransactionDate, "hash", e.BodyHash);
        var same = await Scalar(c, t, """
            select 'yes' from apipay_events where transaction_id=@id and bank_public_id=@bank and amount=@amount
              and content=@content and reference_code=@reference and transaction_date=@date
            """, ct, "id", e.TransactionId, "bank", e.BankPublicId, "amount", e.Amount, "content", e.Content, "reference", e.ReferenceCode, "date", e.TransactionDate);
        await t.CommitAsync(ct);
        return same is not null;
    }

    // Worker khóa một inbox row. Ghi payment, thông báo và đánh dấu processed cùng COMMIT: crash không thu hai lần.
    public async Task<bool> ProcessOneAsync(CancellationToken ct)
    {
        await using var c = await db.OpenConnectionAsync(ct);
        await using var t = await c.BeginTransactionAsync(ct);
        await Execute(c, t, "set local lock_timeout='2s'; set local statement_timeout='5s'", ct);
        var json = await Scalar(c, t, "select to_jsonb(e)::text from apipay_events e where state='pending' and next_attempt_at<=now() order by received_at for update skip locked limit 1", ct);
        if (json is null)
            return false;
        var e = JsonNode.Parse(json)!.AsObject();
        var txn = e.Text("transaction_id")!;
        var admin = Guid.Empty;
        try
        {
            if (e.Text("bank_public_id") != options.BankPublicId)
            {
                await Finish("ignored", "different_bank", null, null);
                await t.CommitAsync(ct);
                return true;
            }
            var matches = await Rows(c, t, """
            select to_jsonb(r)::text from apipay_requests r where bank_public_id=@bank
              and position(lower(content) in lower(@memo))>0 limit 2
            """, ct, "bank", e.Text("bank_public_id"), "memo", e.Text("content"));
            var r = matches.Count == 1 ? matches[0] : null;
            var adminText = await Scalar(c, t, "select id::text from users where role='admin' and is_active", ct);
            if (adminText is null)
                throw new InvalidOperationException("payment_admin_unavailable");
            admin = Guid.Parse(adminText);
            if (r is null)
            {
                await Review(matches.Count == 0 ? "unknown_content" : "ambiguous_content", null);
            }
            else
            {
                var user = r.Id("user_id");
                var invoice = r.Id("invoice_id");
                // Cùng thứ tự khóa với guard_payment SQL để tránh deadlock với thao tác quản lý.
                await Execute(c, t, "select lock_customer(@user)", ct, "user", user);
                await Execute(c, t, "select id from invoices where id=@id for update", ct, "id", invoice);
                var inv = await Invoice(c, t, invoice, user, ct);
                var existing = await Scalar(c, t, """
                select to_jsonb(p)::text from payments p where kind in ('receipt','deposit_receipt') and method='bank_transfer'
                  and status<>'rejected' and lower(btrim(external_reference))=lower(btrim(@reference)) for update
                """, ct, "reference", e.Text("reference_code"));
                var old = existing is null ? null : JsonNode.Parse(existing)!.AsObject();
                if (old is not null)
                {
                    // Phiếu thu đã được admin xác nhận trước khi webhook đến: liên kết, không ghi thu lần hai.
                    var allocation = old["allocations"]?.AsArray();
                    var linked = await Scalar(c, t, "select 'yes' from apipay_events where payment_id=@id and transaction_id<>@txn", ct, "id", old.Id("id"), "txn", txn) is not null;
                    if (!linked && old.Text("status") == "confirmed" && old.Text("kind") == "receipt" && old.Id("user_id") == user
                        && old.Number("amount") == e.Number("amount") && allocation?.Count == 1
                        && allocation[0].Text("invoiceId") == invoice.ToString() && allocation[0].Number("amount") == e.Number("amount"))
                        await Finish("processed", "already_recorded", r.Id("id"), old.Id("id"));
                    else
                        await Review("bank_reference_in_use", r);
                }
                else if (e.Number("amount") != r.Number("amount"))
                    await Review("amount_mismatch", r);
                else if (inv.Text("status") != "issued" || inv.Number("amount") != e.Number("amount"))
                    await Review("invoice_balance_changed", r);
                else if (DateTimeOffset.Parse(e.Text("transaction_date")!) < DateTimeOffset.Parse(r.Text("created_at")!).AddMinutes(-5))
                    await Review("transaction_before_request", r);
                else
                {
                    await Execute(c, t, "select set_config('smartrent.user_id',@actor,true)", ct, "actor", admin.ToString());
                    var payment = await PaymentLedger.Append(c, t, admin, user, inv.Id("contractId"), invoice, "receipt", e.Number("amount"),
                        "bank_transfer", e.Text("reference_code"), new JsonArray(new JsonObject { ["invoiceId"] = invoice, ["amount"] = e.Number("amount") }),
                        null, null, "Tự động ApiPay; transactionId=" + txn, DateTimeOffset.Parse(e.Text("transaction_date")!), true,
                        "apipay:" + txn, e.Text("body_hash")!, ct);
                    await Finish("processed", null, r.Id("id"), payment.Id("id"));
                    await Notify(user, "Đã thanh toán hóa đơn", "Ngân hàng đã xác nhận khoản thanh toán cho hóa đơn " + inv.Text("code") + ".", "/invoices/" + invoice);
                }
            }
            await t.CommitAsync(ct);
            return true;
        }
        catch
        {
            // Một event lỗi không chặn hàng đợi. Rollback sổ thu rồi đặt backoff bằng transaction riêng.
            using var retry = new CancellationTokenSource(TimeSpan.FromSeconds(3));
            await t.RollbackAsync(retry.Token);
            await Execute(c, null, """
                update apipay_events set attempts=attempts+1,reason='processing_retry',
                  next_attempt_at=now()+least(60,attempts+1)*interval '5 seconds'
                where transaction_id=@id and state='pending'
                """, retry.Token, "id", txn);
            throw;
        }

        Task<int> Finish(string state, string? reason, Guid? request, Guid? payment) => Execute(c, t,
            "update apipay_events set state=@state,reason=@reason,request_id=@request,payment_id=@payment,processed_at=now() where transaction_id=@id", ct,
            "state", state, "reason", reason, "request", request, "payment", payment, "id", txn);
        async Task Review(string reason, JsonObject? request)
        {
            await Finish("review", reason, request?.Id("id"), null);
            await Notify(admin, "Khoản ApiPay cần đối chiếu", "Có khoản chuyển khoản chưa thể tự phân bổ vào hóa đơn. Xem đối soát ApiPay.", "/admin/invoices?apipayReview=1");
        }
        Task<int> Notify(Guid recipient, string title, string body, string url) => Execute(c, t, """
            insert into notifications(recipient_id,event_key,title,body,url) values(@user,@event,@title,@body,@url)
            on conflict(recipient_id,event_key) do nothing
            """, ct, "user", recipient, "event", "apipay:" + txn, "title", title, "body", body, "url", url);
    }
}
