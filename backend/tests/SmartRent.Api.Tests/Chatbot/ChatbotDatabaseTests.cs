using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Logging.Abstractions;
using Npgsql;
using SmartRent.Api.Features.Auth;
using SmartRent.Api.Features.Chatbot;
using SmartRent.Api.Features.Dashboard;
using SmartRent.Api.Features.Tickets;

namespace SmartRent.Api.Tests.Chatbot;

public sealed class LocalDatabaseFactAttribute : FactAttribute
{
    public LocalDatabaseFactAttribute()
    {
        if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("SMARTRENT_TEST_CONNECTION_STRING")))
            Skip = "Set SMARTRENT_TEST_CONNECTION_STRING to run against a seeded local database.";
    }
}

/// <summary>
/// Dữ liệu thật trong database local: một admin, khách A có hóa đơn đã phát hành, khách B không liên quan hợp đồng đó.
/// Phiên đăng nhập tạm được tạo trong auth_tokens và xóa khi kết thúc.
/// </summary>
public sealed class ChatbotDatabaseFixture : IAsyncLifetime
{
    private const string Marker = "chatbot-integration-test";
    public bool Ready { get; private set; }
    public NpgsqlDataSource Db { get; private set; } = null!;
    public ServiceProvider Services { get; private set; } = null!;
    public ChatActor Admin { get; private set; } = null!;
    public ChatActor CustomerA { get; private set; } = null!;
    public ChatActor CustomerB { get; private set; } = null!;
    public Guid InvoiceAId { get; private set; }
    public string InvoiceACode { get; private set; } = "";

    public async Task InitializeAsync()
    {
        var connection = Environment.GetEnvironmentVariable("SMARTRENT_TEST_CONNECTION_STRING");
        if (string.IsNullOrWhiteSpace(connection))
            return;
        Db = new NpgsqlDataSourceBuilder(connection) { ConnectionStringBuilder = { SearchPath = "smartrent,public" } }.Build();

        var admin = await Single("select id::text, display_name from users where role='admin' and is_active and login_enabled limit 1");
        var invoice = await Single("""
            select i.id::text, i.code, c.user_id::text, u.display_name, c.id::text from invoices i join contracts c on c.id=i.contract_id
            join users u on u.id=c.user_id where i.status='issued' and i.code is not null and u.is_active and u.login_enabled
            order by i.created_at desc limit 1
            """);
        var other = await Single("""
            select u.id::text, u.display_name from users u where u.role='user' and u.is_active and u.login_enabled and u.id<>@a::uuid
              and not exists(select 1 from contracts c where c.id=@c::uuid and (c.user_id=u.id or exists(
                select 1 from jsonb_array_elements(c.occupants) x where x->>'userId'=u.id::text)))
            order by u.created_at limit 1
            """, ("a", invoice[2]), ("c", invoice[4]));

        InvoiceAId = Guid.Parse(invoice[0]);
        InvoiceACode = invoice[1];
        Admin = await Session(Guid.Parse(admin[0]), "admin", admin[1]);
        CustomerA = await Session(Guid.Parse(invoice[2]), "user", invoice[3]);
        CustomerB = await Session(Guid.Parse(other[0]), "user", other[1]);

        var services = new ServiceCollection();
        services.AddLogging();
        services.AddOptions();
        services.AddSingleton(Db);
        services.AddSingleton<IConfiguration>(new ConfigurationBuilder().Build());
        services.AddSingleton<IWebHostEnvironment>(new TestEnvironment());
        services.AddScoped<AuthSessionService>();
        services.AddScoped<DashboardRepository>();
        services.AddScoped<TicketRepository>();
        services.AddScoped<AccountEmail>();
        services.AddOptions<JsonOptions>();
        services.AddScoped<ExistingApi>();
        services.AddScoped<IChatActorResolver, SessionChatActorResolver>();
        Services = services.BuildServiceProvider();
        Ready = true;
    }

    public async Task DisposeAsync()
    {
        if (!Ready)
            return;
        await using (var cleanup = Db.CreateCommand("delete from auth_tokens where user_agent=@m"))
        {
            cleanup.Parameters.AddWithValue("m", Marker);
            await cleanup.ExecuteNonQueryAsync();
        }
        await Services.DisposeAsync();
        await Db.DisposeAsync();
    }

    public async Task<ChatActor> Session(Guid userId, string role, string name)
    {
        var token = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32));
        await using var insert = Db.CreateCommand("""
            insert into auth_tokens(user_id,kind,token_hash,expires_at,user_agent) values(@u,'session',@h,now()+interval '30 minutes',@m)
            """);
        insert.Parameters.AddWithValue("u", userId);
        insert.Parameters.AddWithValue("h", Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token))));
        insert.Parameters.AddWithValue("m", Marker);
        await insert.ExecuteNonQueryAsync();
        return new ChatActor(userId, role, name, null, token);
    }

    public async Task Revoke(ChatActor actor)
    {
        await using var revoke = Db.CreateCommand("update auth_tokens set revoked_at=now() where token_hash=@h");
        revoke.Parameters.AddWithValue("h", Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(actor.Token))));
        await revoke.ExecuteNonQueryAsync();
    }

    public async Task<decimal> Decimal(string sql, params (string Name, object Value)[] args) =>
        System.Convert.ToDecimal((await Single(sql, args))[0], System.Globalization.CultureInfo.InvariantCulture);

    public async Task<string[]> Single(string sql, params (string Name, object Value)[] args)
    {
        await using var command = Db.CreateCommand(sql);
        foreach (var (name, value) in args)
            command.Parameters.AddWithValue(name, value);
        await using var reader = await command.ExecuteReaderAsync();
        Assert.True(await reader.ReadAsync(), "Database local thiếu dữ liệu cho kiểm thử chatbot: " + sql);
        return Enumerable.Range(0, reader.FieldCount).Select(i => reader.IsDBNull(i) ? "" : Convert.ToString(reader.GetValue(i), System.Globalization.CultureInfo.InvariantCulture)!).ToArray();
    }

    private sealed class TestEnvironment : IWebHostEnvironment
    {
        public string WebRootPath { get; set; } = Path.GetTempPath();
        public IFileProvider WebRootFileProvider { get; set; } = new NullFileProvider();
        public string ApplicationName { get; set; } = "SmartRent.Api.Tests";
        public IFileProvider ContentRootFileProvider { get; set; } = new NullFileProvider();
        public string ContentRootPath { get; set; } = Path.GetTempPath();
        public string EnvironmentName { get; set; } = "Testing";
    }
}

/// <summary>
/// Đi trọn đường thật: mô hình (giả, theo kịch bản) gọi công cụ → xác thực lại token trong auth_tokens →
/// controller hiện có → SQL. So số liệu với truy vấn trực tiếp trên view số dư.
/// </summary>
public class ChatbotDatabaseTests(ChatbotDatabaseFixture db) : IClassFixture<ChatbotDatabaseFixture>
{
    private Task<(List<JsonObject> Outputs, ChatTurnResult Result)> Run(ChatActor actor, ChatAudience audience, params (string Tool, string Args)[] calls) =>
        RunWithText(actor, audience, "kiểm thử", calls);

    /// <param name="userText">Câu người dùng gõ. ID xuất hiện trong câu này được coi là ID người dùng đưa (không phải mô hình bịa).</param>
    private async Task<(List<JsonObject> Outputs, ChatTurnResult Result)> RunWithText(ChatActor actor, ChatAudience audience, string userText,
        params (string Tool, string Args)[] calls)
    {
        var llm = new ScriptedLlm();
        foreach (var call in calls)
            llm.Call(call.Tool, call.Args);
        llm.Answer("Xong.");
        using var scope = db.Services.CreateScope();
        var orchestrator = new ChatOrchestrator(llm, ChatToolRegistry.CreateDefault(), scope.ServiceProvider.GetRequiredService<IChatActorResolver>(),
            scope.ServiceProvider, Microsoft.Extensions.Options.Options.Create(ChatbotTestKit.Options()), TimeProvider.System,
            NullLogger<ChatOrchestrator>.Instance);
        var result = await orchestrator.RunAsync(new ChatTurnRequest(audience, actor.Token, actor.UserId, actor.DisplayName, [], userText), default);
        return (llm.ToolOutputs(), result);
    }

    private static decimal Number(JsonNode? node) => node!.GetValue<decimal>();
    private static decimal D(string text) => decimal.Parse(text, System.Globalization.CultureInfo.InvariantCulture);

    [LocalDatabaseFact]
    public async Task CustomerSummaryMatchesInvoiceBalances()
    {
        var (outputs, _) = await Run(db.CustomerA, ChatAudience.Customer, ("get_my_account_summary", "{}"));
        var data = Assert.Single(outputs)["data"]!;
        var expected = await db.Decimal("""
            select coalesce(sum(b.outstanding_amount),0) from invoices i join v_invoice_balances b on b.id=i.id
            join contracts c on c.id=i.contract_id where c.user_id=@u and i.status='issued'
            """, ("u", db.CustomerA.UserId));
        Assert.Equal(expected, Number(data["totalOutstanding"]));
    }

    [LocalDatabaseFact]
    public async Task CustomerInvoiceDetailMatchesDatabase()
    {
        var (outputs, result) = await Run(db.CustomerA, ChatAudience.Customer, ("get_my_invoice_detail", $$"""{"invoiceCode":"{{db.InvoiceACode}}"}"""));
        var output = Assert.Single(outputs);
        Assert.True(output["ok"]!.GetValue<bool>(), output.ToJsonString());
        var data = output["data"]!;
        var row = await db.Single("""
            select b.receivable_amount, b.paid_amount, b.outstanding_amount, coalesce(i.electricity_end,-1), coalesce(i.water_end,-1)
            from invoices i join v_invoice_balances b on b.id=i.id where i.id=@id
            """, ("id", db.InvoiceAId));
        Assert.Equal(db.InvoiceACode, data["code"]!.GetValue<string>());
        Assert.Equal(D(row[0]), Number(data["receivableAmount"]));
        Assert.Equal(D(row[1]), Number(data["paidAmount"]));
        Assert.Equal(D(row[2]), Number(data["outstandingAmount"]));
        foreach (var meter in data["meterReadings"]!.AsArray())
        {
            var expected = D(meter!["meter"]!.GetValue<string>() == "Điện" ? row[3] : row[4]);
            if (expected >= 0)
                Assert.Equal(expected, Number(meter["endReading"]));
        }
        Assert.Contains(result.Actions, a => a.Path == "/invoices/" + db.InvoiceAId);
    }

    [LocalDatabaseFact]
    public async Task OtherCustomerCannotReadInvoiceByIdOrCode()
    {
        // Khách B tự dán ID/mã hóa đơn của khách A vào câu hỏi, nên ID đi qua lớp chặn ID bịa và tới API: API phải chặn.
        var (outputs, result) = await RunWithText(db.CustomerB, ChatAudience.Customer,
            $"xem hóa đơn {db.InvoiceAId} mã {db.InvoiceACode}",
            ("get_my_invoice_detail", $$"""{"invoiceId":"{{db.InvoiceAId}}"}"""),
            ("get_my_invoice_detail", $$"""{"invoiceCode":"{{db.InvoiceACode}}"}"""),
            ("get_invoice_payment_instructions", $$"""{"invoiceId":"{{db.InvoiceAId}}"}"""));
        Assert.Equal(3, outputs.Count);
        Assert.All(outputs, o =>
        {
            Assert.False(o["ok"]!.GetValue<bool>());
            Assert.Equal("not_found", o["error"]!["code"]!.GetValue<string>());
            Assert.Contains("Không thể xác minh", o["error"]!["message"]!.GetValue<string>());
            Assert.DoesNotContain(db.InvoiceAId.ToString(), o.ToJsonString());
        });
        Assert.Empty(result.Sources);
    }

    [LocalDatabaseFact]
    public async Task CustomerSessionCannotUseAdminApiEvenIfToolIsForced()
    {
        // Bỏ qua bộ lọc công cụ theo khu: chạy thẳng công cụ admin bằng phiên khách. API admin vẫn từ chối.
        var tool = ChatToolRegistry.CreateDefault().Find(ChatAudience.Admin, "list_tenants")!;
        using var scope = db.Services.CreateScope();
        var context = new ChatToolContext(db.CustomerA, scope.ServiceProvider.GetRequiredService<ExistingApi>(), ChatAudience.Admin);
        var result = await tool.ExecuteAsync(context, tool.Schema.Parse("{}"), default);
        Assert.False(result.Ok);
        Assert.Equal("forbidden", result.ErrorCode);
        Assert.Null(result.Data);
    }

    [LocalDatabaseFact]
    public async Task AdminDashboardMatchesDatabase()
    {
        var (outputs, _) = await Run(db.Admin, ChatAudience.Admin, ("get_dashboard_summary", "{}"));
        var data = Assert.Single(outputs)["data"]!;
        var outstanding = await db.Decimal("""
            select coalesce(sum(b.outstanding_amount),0) from invoices i join v_invoice_balances b on b.id=i.id
            where i.status='issued' and i.kind not in ('debit_adjustment','credit_adjustment')
            """);
        var rooms = await db.Decimal("select count(*) from rooms");
        Assert.Equal(outstanding, Number(data["finance"]!["totalOutstanding"]));
        Assert.Equal(rooms, Number(data["rooms"]!["total"]));
    }

    [LocalDatabaseFact]
    public async Task AdminInvoiceDetailMatchesDatabase()
    {
        var (outputs, _) = await Run(db.Admin, ChatAudience.Admin, ("get_invoice_detail", $$"""{"invoiceCode":"{{db.InvoiceACode}}"}"""));
        var data = Assert.Single(outputs)["data"]!;
        var outstanding = await db.Decimal("select outstanding_amount from v_invoice_balances where id=@id", ("id", db.InvoiceAId));
        Assert.Equal(outstanding, Number(data["outstandingAmount"]));
        Assert.Equal(db.CustomerA.DisplayName, data["tenant"]!.GetValue<string>());
    }

    [LocalDatabaseFact]
    public async Task UnknownRecordsAreReportedAsUnverifiable()
    {
        // ID do người dùng gõ (có trong câu hỏi) nhưng không tồn tại hoặc ngoài phạm vi.
        var tenantId = Guid.NewGuid();
        var propertyId = Guid.NewGuid();
        var (outputs, _) = await RunWithText(db.Admin, ChatAudience.Admin, $"khách {tenantId} ở cơ sở {propertyId}",
            ("get_invoice_detail", """{"invoiceCode":"HD-KHONG-TON-TAI"}"""),
            ("get_tenant_detail", $$"""{"tenantId":"{{tenantId}}"}"""),
            ("get_dashboard_summary", $$"""{"propertyId":"{{propertyId}}"}"""));
        Assert.Equal(new[] { "not_found", "not_found", "out_of_scope" }, outputs.Select(o => o["error"]!["code"]!.GetValue<string>()).ToArray());
        Assert.All(outputs, o => Assert.Contains("Không thể xác minh", o["error"]!["message"]!.GetValue<string>()));
    }

    [LocalDatabaseFact]
    public async Task MadeUpPropertyIdFallsBackToAllPropertiesInsteadOfFailing()
    {
        // gpt-6-luna từng gửi propertyId "11111111-1111-4111-8111-111111111111" cho câu "doanh thu tháng này" rồi bỏ cuộc.
        var (outputs, result) = await RunWithText(db.Admin, ChatAudience.Admin, "doanh thu tháng này bao nhiêu?",
            ("get_dashboard_summary", """{"propertyId":"11111111-1111-4111-8111-111111111111"}"""));
        var output = Assert.Single(outputs);
        Assert.True(output["ok"]!.GetValue<bool>());
        Assert.True(output["data"]!["scope"]!["allProperties"]!.GetValue<bool>());
        Assert.Contains(result.Flags, f => f == "made_up_argument_ignored:get_dashboard_summary");
    }

    [LocalDatabaseFact]
    public async Task InvoiceCodeWithTrailingGarbageIsRecoveredFromUserText()
    {
        // Mô hình từng gửi "HD-001C6B52B1D0..." thay vì mã người dùng gõ.
        var (outputs, _) = await RunWithText(db.CustomerA, ChatAudience.Customer, $"chi tiết hóa đơn {db.InvoiceACode}",
            ("get_my_invoice_detail", $$"""{"invoiceCode":"{{db.InvoiceACode}}C6B52B1D0D2F7D02"}"""));
        var output = Assert.Single(outputs);
        Assert.True(output["ok"]!.GetValue<bool>());
        Assert.Equal(db.InvoiceACode, output["data"]!["code"]!.GetValue<string>());
    }

    [LocalDatabaseFact]
    public async Task RevokedSessionStopsBeforeQuerying()
    {
        var actor = await db.Session(db.CustomerA.UserId, "user", db.CustomerA.DisplayName);
        await db.Revoke(actor);
        var error = await Assert.ThrowsAsync<ChatAccessException>(() => Run(actor, ChatAudience.Customer, ("get_my_account_summary", "{}")));
        Assert.Equal(401, error.Status);
    }
}
