using System.Security.Claims;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using SmartRent.Api.Common;
using SmartRent.Api.Features.ApiPay;

namespace SmartRent.Api.Tests.ApiPay;

// Chỉ chạy trên DB tạm do run_apipay.py tạo. Không ghi payment thử vào DB local của người dùng.
public class ApiPayIntegrationTests
{
    public sealed class ApiPayDatabaseFactAttribute : FactAttribute
    { public ApiPayDatabaseFactAttribute() { if (string.IsNullOrEmpty(Environment.GetEnvironmentVariable("SMARTRENT_APIPAY_TEST_CONNECTION"))) Skip = "Run python backend/tests/run_apipay.py"; } }
    private static NpgsqlDataSource Db()
    {
        var b = new NpgsqlConnectionStringBuilder(Environment.GetEnvironmentVariable("SMARTRENT_APIPAY_TEST_CONNECTION")) { SearchPath = "smartrent,public" };
        Assert.StartsWith("smartrent_audit_", b.Database); return NpgsqlDataSource.Create(b.ConnectionString);
    }
    private static async Task<string> Sql(NpgsqlDataSource db, string sql, params object[] args)
    {
        await using var cmd = db.CreateCommand(sql); foreach (var x in args) cmd.Parameters.AddWithValue(x);
        return Convert.ToString(await cmd.ExecuteScalarAsync()) ?? "";
    }
    private static async Task<(Guid Invoice, Guid User)> Invoice(NpgsqlDataSource db)
    {
        var user = Guid.Parse(await Sql(db, "select user_id from contracts where code='HDTH-001'"));
        var id = Guid.NewGuid();
        await Sql(db, """
            insert into invoices(id,code,contract_id,kind,status,service_from,service_to,lines,issued_on,due_on,issued_at,issued_by)
            select $1,'API-'||$1::text,c.id,'opening_balance','issued',current_date,current_date+1,
              '[{"id":"apipay","code":"RENT","category":"rent","description":"ApiPay test","unit":"month","quantity":1,"unitPrice":100000}]'::jsonb,
              current_date,current_date+7,now(),(select id from users where role='admin') from contracts c where code='HDTH-001'
            """, id);
        return (id, user);
    }
    private sealed class FakeClient : IApiPayClient
    {
        public int Calls;
        public Task<ApiPayCheckout> CreateAsync(decimal amount, string content, string title, CancellationToken ct)
        { Calls++; return Task.FromResult(new ApiPayCheckout("API"+content,"https://pay.apipay.vn/"+content,"https://app.apipay.vn/v1/payment-requests/"+content+"/qr-image",content,"MB","0123","TEST",DateTimeOffset.UtcNow.AddMinutes(30))); }
    }
    private sealed class UncertainClient : IApiPayClient
    {
        public Task<ApiPayCheckout> CreateAsync(decimal amount, string content, string title, CancellationToken ct) =>
            throw new ApiPayException("provider_unavailable", "Chưa nhận phản hồi.", true);
    }
    private static PortalApiPayController Portal(ApiPayStore store, IApiPayClient client, Guid user) => new(ApiPayTests.Options,store,client)
    { ControllerContext = new() { HttpContext = new DefaultHttpContext { User = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier,user.ToString()),new Claim(ClaimTypes.Role,"user")],"test")) } } };
    private static JsonObject Body(IActionResult result) => Assert.IsType<JsonObject>(Assert.IsType<OkObjectResult>(result).Value);
    private static ApiPayTransfer Transfer(string memo, decimal amount = 100000) => new(Guid.NewGuid().ToString(), ApiPayTests.Options.BankPublicId, amount, "MB " + memo.ToLowerInvariant() + " CT", "FT"+Guid.NewGuid().ToString("N"), DateTimeOffset.UtcNow, "hash");
    private static async Task Drain(ApiPayStore store) { for (var n=0;n<30 && await store.ProcessOneAsync(default);n++) { } }

    [ApiPayDatabaseFact]
    public async Task CreateIsReusableOwnerScopedAndSignedWebhookPaysExactlyOnce()
    {
        await using var db = Db(); var f = await Invoice(db); var store = new ApiPayStore(db, ApiPayTests.Options); var client = new FakeClient();
        var portal = Portal(store, client, f.User);
        var first = Body(await portal.Create(f.Invoice, default)); var request = first["request"]!;
        Assert.Equal(100000, request["amount"]!.GetValue<decimal>());
        var again = Body(await portal.Create(f.Invoice, default)); Assert.Equal(request["id"]!.ToString(), again["request"]!["id"]!.ToString()); Assert.Equal(1,client.Calls);
        var forbidden = Assert.IsType<ObjectResult>(await Portal(store,client,Guid.NewGuid()).Create(f.Invoice,default)); Assert.Equal(404,forbidden.StatusCode);
        var e = Transfer(request["content"]!.GetValue<string>());
        var raw = Encoding.UTF8.GetBytes(JsonSerializer.Serialize(new { @event="transaction.in", data=new {transactionId=e.TransactionId,bankAccountPublicId=e.BankPublicId,amount="100000",content=e.Content,referenceCode=e.ReferenceCode,transactionDate=e.TransactionDate,type="IN"} }));
        async Task<IActionResult> Receive() {
            var api = new ApiPayWebhookController(ApiPayTests.Options,store) { ControllerContext = new() { HttpContext = new DefaultHttpContext() } };
            api.Request.Scheme="https"; api.Request.Body=new MemoryStream(raw); api.Request.Headers["ApiPay-Signature"]=ApiPayTests.Sign(raw); return await api.Receive(default);
        }
        Assert.IsType<OkObjectResult>(await Receive()); Assert.IsType<OkObjectResult>(await Receive());
        // Tạo store mới mô phỏng restart sau ACK: event vẫn còn trong SQL và có thể xử lý.
        var restarted = new ApiPayStore(db,ApiPayTests.Options);
        await Task.WhenAll(restarted.ProcessOneAsync(default),store.ProcessOneAsync(default)); await Drain(store);
        Assert.Equal("paid",await Sql(db,"select payment_status from v_invoice_balances where id=$1",f.Invoice));
        Assert.Equal("0",await Sql(db,"select outstanding_amount::text from v_invoice_balances where id=$1",f.Invoice));
        Assert.Equal("1",await Sql(db,"select count(*)::text from payments where external_reference=$1",e.ReferenceCode));
        Assert.IsType<OkObjectResult>(await Receive()); await Drain(store);
        Assert.Equal("1",await Sql(db,"select count(*)::text from payments where external_reference=$1",e.ReferenceCode));
        Assert.False(await store.AcceptAsync(e with { Amount=1 },default));
        Assert.Equal(409,Assert.IsType<ObjectResult>(await portal.Create(f.Invoice,default)).StatusCode);
    }

    [ApiPayDatabaseFact]
    public async Task WrongAmountBankUnknownMemoAndSecondTransferNeverOverpay()
    {
        await using var db=Db(); var store=new ApiPayStore(db,ApiPayTests.Options);
        foreach(var mode in new[]{"less","more","bank","memo","duplicate-payment"}) {
            var f=await Invoice(db); var state=Body(await Portal(store,new FakeClient(),f.User).Create(f.Invoice,default));
            var memo=state["request"]!["content"]!.GetValue<string>();
            var e=Transfer(mode=="memo"?"UNKNOWN":memo,mode=="less"?50000:mode=="more"?100001:100000);
            if(mode=="bank") e=e with {BankPublicId="other-bank"};
            Assert.True(await store.AcceptAsync(e,default)); await Drain(store);
            if(mode=="duplicate-payment") {
                var second=Transfer(memo); Assert.True(await store.AcceptAsync(second,default)); await Drain(store);
                Assert.Equal("review",await Sql(db,"select state from apipay_events where transaction_id=$1",second.TransactionId));
                Assert.Equal("1",await Sql(db,"select count(*)::text from payments where intended_invoice_id=$1 and status='confirmed'",f.Invoice));
            } else {
                Assert.Equal("100000",await Sql(db,"select outstanding_amount::text from v_invoice_balances where id=$1",f.Invoice));
                Assert.Equal(mode=="bank"?"ignored":"review",await Sql(db,"select state from apipay_events where transaction_id=$1",e.TransactionId));
            }
        }
    }

    [ApiPayDatabaseFact]
    public async Task ConcurrentReservationCreatesOneRequestAndBalanceChangeGoesToReview()
    {
        await using var db=Db(); var f=await Invoice(db); var store=new ApiPayStore(db,ApiPayTests.Options);
        async Task<bool> Reserve() { try { return await store.ReserveAsync(f.Invoice,f.User,default) is not null; } catch(LeaseHttpException e) { Assert.Equal(409,e.Status); return false; } }
        var results=await Task.WhenAll(Reserve(),Reserve()); Assert.Single(results,x=>x);
        var memo=await Sql(db,"select content from apipay_requests where invoice_id=$1",f.Invoice);
        await Sql(db,"""
            insert into payments(code,user_id,contract_id,intended_invoice_id,amount,method,status,confirmed_at,confirmed_by,allocations)
            select 'APITEST-'||$1::text,c.user_id,c.id,i.id,1000,'cash','confirmed',now(),(select id from users where role='admin'),
              jsonb_build_array(jsonb_build_object('invoiceId',i.id,'amount',1000)) from invoices i join contracts c on c.id=i.contract_id where i.id=$1
            """,f.Invoice);
        var e=Transfer(memo); await store.AcceptAsync(e,default); await Drain(store);
        Assert.Equal("review",await Sql(db,"select state from apipay_events where transaction_id=$1",e.TransactionId));
        Assert.Equal("99000",await Sql(db,"select outstanding_amount::text from v_invoice_balances where id=$1",f.Invoice));
    }

    [ApiPayDatabaseFact]
    public async Task UncertainCreationStillMatchesLateWebhookWithoutPostingAgain()
    {
        await using var db = Db(); var f = await Invoice(db); var store = new ApiPayStore(db, ApiPayTests.Options);
        var result = Assert.IsType<ObjectResult>(await Portal(store, new UncertainClient(), f.User).Create(f.Invoice, default));
        Assert.Equal(502, result.StatusCode);
        Assert.Equal("unknown", await Sql(db,"select state from apipay_requests where invoice_id=$1",f.Invoice));
        var again = Assert.IsType<ObjectResult>(await Portal(store,new FakeClient(),f.User).Create(f.Invoice,default));
        Assert.Equal(409,again.StatusCode);
        var memo = await Sql(db,"select content from apipay_requests where invoice_id=$1",f.Invoice);
        await store.AcceptAsync(Transfer(memo),default); await Drain(store);
        Assert.Equal("paid",await Sql(db,"select payment_status from v_invoice_balances where id=$1",f.Invoice));
    }

    [ApiPayDatabaseFact]
    public async Task AdminCanReconcileOnePaymentOrIgnoreUnrelatedMoneyWithAuditReason()
    {
        await using var db = Db(); var f = await Invoice(db); var store = new ApiPayStore(db,ApiPayTests.Options);
        var e = Transfer("UNRELATED"); await store.AcceptAsync(e,default); await Drain(store);
        var actor = Guid.Parse(await Sql(db,"select id from users where role='admin'"));
        using var services = new ServiceCollection().AddLogging().BuildServiceProvider();
        AdminApiPayController Controller(string role) => new(db) { ControllerContext = new() {
            HttpContext = new DefaultHttpContext { RequestServices = services, User = new ClaimsPrincipal(new ClaimsIdentity([
                new Claim(ClaimTypes.NameIdentifier,actor.ToString()), new Claim(ClaimTypes.Role,role)],"test")) } } };
        var api=Controller("admin");
        var body=JsonSerializer.SerializeToElement(new { reason="Khoản cá nhân ngoài hóa đơn" });
        Assert.Equal(403,Assert.IsType<ObjectResult>(await Controller("user").Ignore(e.TransactionId,body,default)).StatusCode);
        Assert.IsType<OkObjectResult>(await api.Ignore(e.TransactionId,body,default));
        Assert.StartsWith("admin_ignored:"+actor,await Sql(db,"select reason from apipay_events where transaction_id=$1",e.TransactionId));
        var known=Body(await Portal(store,new FakeClient(),f.User).Create(f.Invoice,default));
        e=Transfer(known["request"]!["content"]!.GetValue<string>(),50000);
        await store.AcceptAsync(e,default); await Drain(store);
        Assert.True((await store.StateAsync(f.Invoice,f.User,default))["review"]!.GetValue<bool>());
        var payment=Guid.NewGuid();
        await Sql(db,"""
            insert into payments(id,code,user_id,contract_id,intended_invoice_id,amount,method,external_reference,status,confirmed_at,confirmed_by,allocations)
            select $1,'APIMANUAL-'||$1::text,c.user_id,c.id,i.id,50000,'bank_transfer',$3,'confirmed',now(),(select id from users where role='admin'),
              jsonb_build_array(jsonb_build_object('invoiceId',i.id,'amount',50000)) from invoices i join contracts c on c.id=i.contract_id where i.id=$2
            """,payment,f.Invoice,e.ReferenceCode);
        Assert.Equal(422,Assert.IsType<ObjectResult>(await api.Reconcile(e.TransactionId,JsonSerializer.SerializeToElement(new{paymentId=Guid.NewGuid()}),default)).StatusCode);
        var link=JsonSerializer.SerializeToElement(new{paymentId=payment});
        Assert.IsType<OkObjectResult>(await api.Reconcile(e.TransactionId,link,default));
        Assert.IsType<OkObjectResult>(await api.Reconcile(e.TransactionId,link,default));
        Assert.False((await store.StateAsync(f.Invoice,f.User,default))["review"]!.GetValue<bool>());
        Assert.Equal("50000",await Sql(db,"select outstanding_amount::text from v_invoice_balances where id=$1",f.Invoice));
        // Khác transactionId nhưng cùng reference đã gắn phiếu thu: review, không dùng lại một payment cho hai event.
        var duplicate=e with { TransactionId=Guid.NewGuid().ToString() };
        await store.AcceptAsync(duplicate,default); await Drain(store);
        Assert.Equal("review",await Sql(db,"select state from apipay_events where transaction_id=$1",duplicate.TransactionId));
        Assert.Equal(422,Assert.IsType<ObjectResult>(await api.Reconcile(duplicate.TransactionId,link,default)).StatusCode);
    }
}
