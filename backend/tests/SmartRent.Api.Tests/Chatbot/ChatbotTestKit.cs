using System.Text.Json.Nodes;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging.Abstractions;
using Microsoft.Extensions.Options;
using SmartRent.Api.Features.Chatbot;

namespace SmartRent.Api.Tests.Chatbot;

/// <summary>
/// Mô hình AI giả trả lời theo kịch bản. Dùng để kiểm tra lớp bảo vệ của máy chủ trong trường hợp xấu nhất:
/// mô hình đã bị prompt injection và cố gọi công cụ sai phạm vi, giả ID, bịa số liệu.
/// </summary>
internal sealed class ScriptedLlm : ILlmClient
{
    private readonly Queue<Func<LlmRequest, LlmResponse>> _steps = new();
    public List<LlmRequest> Requests { get; } = [];

    public ScriptedLlm Call(string tool, string arguments = "{}") => Calls((tool, arguments));

    public ScriptedLlm Calls(params (string Tool, string Arguments)[] calls)
    {
        _steps.Enqueue(_ => new LlmResponse(null,
            calls.Select(c => new LlmToolCall("call_" + Guid.NewGuid().ToString("N")[..8], c.Tool, c.Arguments)).ToList(), "tool_calls", "test-model"));
        return this;
    }

    public ScriptedLlm Answer(string text)
    {
        _steps.Enqueue(_ => new LlmResponse(text, [], "stop", "test-model"));
        return this;
    }

    public ScriptedLlm Repeat(int times, Action<ScriptedLlm> step)
    {
        for (var i = 0; i < times; i++)
            step(this);
        return this;
    }

    public Task<LlmResponse> CompleteAsync(LlmRequest request, CancellationToken ct)
    {
        // Orchestrator sửa tiếp danh sách tin nhắn sau mỗi vòng; lưu bản sao để kiểm tra đúng thời điểm.
        Requests.Add(request with { Messages = request.Messages.ToList() });
        return Task.FromResult(_steps.Count > 0 ? _steps.Dequeue()(request) : new LlmResponse("Xong.", [], "stop", "test-model"));
    }

    /// <summary>Kết quả công cụ (JSON envelope) mà mô hình nhận được, theo thứ tự gọi.</summary>
    public List<JsonObject> ToolOutputs() =>
        Requests.LastOrDefault()?.Messages.Where(m => m.Role == "tool").Select(m => JsonNode.Parse(m.Content!)!.AsObject()).ToList() ?? [];

    public IEnumerable<string> AllMessageText() =>
        Requests.SelectMany(r => r.Messages).Select(m => m.Content ?? "")
            .Concat(Requests.SelectMany(r => r.Messages).SelectMany(m => m.ToolCalls ?? []).Select(c => c.Arguments));
}

/// <summary>Trả lần lượt các actor cho từng lần xác thực lại; phần tử null mô phỏng phiên bị thu hồi.</summary>
internal sealed class SequenceActors(params ChatActor?[] sequence) : IChatActorResolver
{
    public int Calls { get; private set; }

    public Task<ChatActor?> ResolveAsync(string? bearerToken, CancellationToken ct)
    {
        var actor = sequence.Length == 0 ? null : sequence[Math.Min(Calls, sequence.Length - 1)];
        Calls++;
        return Task.FromResult(actor is not null && actor.Token == bearerToken ? actor : null);
    }
}

/// <summary>Công cụ giả ghi lại actor và tham số nhận được.</summary>
internal sealed class RecordingTool(string name, ChatAudience audience, ToolSchema schema, Func<ToolArguments, JsonNode?> data) : IChatTool
{
    public List<(ChatActor Actor, ToolArguments Args)> Invocations { get; } = [];
    public string Name { get; } = name;
    public string Description => "Công cụ thử " + Name;
    public string SourceLabel => "Nguồn " + Name;
    public ChatAudience Audience { get; } = audience;
    public ToolSchema Schema { get; } = schema;

    public Task<ChatToolResult> ExecuteAsync(ChatToolContext context, ToolArguments args, CancellationToken ct)
    {
        Invocations.Add((context.Actor, args));
        return Task.FromResult(ChatToolResult.Success(data(args), [context.Action("Mở " + Name, context.Audience == ChatAudience.Admin ? "/admin" : "/invoices")]));
    }
}

internal static class ChatbotTestKit
{
    public const string ApiKey = "sk-test-0123456789abcdef-SECRET-KEY";
    public const string Token = "session-token-0123456789-abcdef";
    public static readonly Guid CustomerId = Guid.Parse("11111111-1111-1111-1111-111111111111");
    public static readonly Guid OtherCustomerId = Guid.Parse("22222222-2222-2222-2222-222222222222");
    public static readonly Guid AdminId = Guid.Parse("33333333-3333-3333-3333-333333333333");

    public static ChatActor Customer(string token = Token) => new(CustomerId, "user", "Khách A", "a@example.com", token);
    public static ChatActor Admin(string token = Token) => new(AdminId, "admin", "Chủ trọ", "admin@example.com", token);

    public static ChatbotOptions Options() => new()
    {
        BaseUrl = "https://ai.example.test/v1",
        ApiKey = ApiKey,
        Model = "test-model",
        MaxToolRounds = 5,
        MaxToolCallsPerTurn = 6
    };

    public static ChatOrchestrator Orchestrator(ILlmClient llm, IChatActorResolver actors, IEnumerable<IChatTool> tools,
        ChatbotOptions? options = null, IServiceProvider? services = null) =>
        new(llm, new ChatToolRegistry(tools), actors, services ?? new ServiceCollection().BuildServiceProvider(),
            Microsoft.Extensions.Options.Options.Create(options ?? Options()), TimeProvider.System, NullLogger<ChatOrchestrator>.Instance);

    public static ChatTurnRequest Turn(ChatAudience audience, string text, Guid? owner = null, string token = Token) =>
        new(audience, token, owner ?? (audience == ChatAudience.Admin ? AdminId : CustomerId), "Người dùng", [], text);

    public static RecordingTool InvoiceTool(decimal outstanding = 3_250_000) =>
        new("get_my_invoice_detail", ChatAudience.Customer,
            new ToolSchema().Text("invoiceCode", "Mã hóa đơn", 40, ToolPatterns.Code()).Uuid("invoiceId", "ID"),
            a => new JsonObject
            {
                ["code"] = a.Text("invoiceCode") ?? "HD-00000012",
                ["outstandingAmount"] = outstanding,
                ["dueOn"] = "2026-11-20"
            });

    public static RecordingTool AdminInvoicesTool() =>
        new("list_invoices", ChatAudience.Admin, new ToolSchema().Integer("limit", "Số dòng", 1, 30),
            _ => new JsonObject { ["invoices"] = new JsonArray(new JsonObject { ["tenant"] = "Khách B", ["outstandingAmount"] = 9_999_000 }) });
}

/// <summary>Đồng hồ điều khiển được cho kiểm tra hết hạn hội thoại.</summary>
internal sealed class TestClock(DateTimeOffset start) : TimeProvider
{
    public DateTimeOffset Now { get; set; } = start;
    public override DateTimeOffset GetUtcNow() => Now;
}
