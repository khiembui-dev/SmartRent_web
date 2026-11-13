using System.Net;
using System.Net.Http.Headers;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.Extensions.Options;

namespace SmartRent.Api.Features.Chatbot;

public sealed record LlmToolCall(string Id, string Name, string Arguments);

/// <summary>Một tin nhắn theo định dạng chat completions: system, user, assistant hoặc tool.</summary>
public sealed record LlmMessage(string Role, string? Content, IReadOnlyList<LlmToolCall>? ToolCalls = null, string? ToolCallId = null)
{
    public static LlmMessage System(string content) => new("system", content);
    public static LlmMessage User(string content) => new("user", content);
    public static LlmMessage Assistant(string? content, IReadOnlyList<LlmToolCall>? calls = null) => new("assistant", content, calls);
    public static LlmMessage Tool(string callId, string content) => new("tool", content, ToolCallId: callId);
}

public sealed record LlmToolDefinition(string Name, string Description, JsonObject Parameters);

public sealed record LlmRequest(IReadOnlyList<LlmMessage> Messages, IReadOnlyList<LlmToolDefinition> Tools, bool AllowTools);

public sealed record LlmResponse(string? Content, IReadOnlyList<LlmToolCall> ToolCalls, string? FinishReason, string? Model);

/// <summary>Lỗi khi gọi dịch vụ AI. Message chỉ dành cho log; người dùng nhận thông báo chung.</summary>
public sealed class LlmException(string code, string message, Exception? inner = null) : Exception(message, inner)
{
    public string Code { get; } = code;
}

public interface ILlmClient
{
    Task<LlmResponse> CompleteAsync(LlmRequest request, CancellationToken ct);
}

/// <summary>
/// Client tối thiểu cho API tương thích OpenAI (9router, OpenAI, Azure OpenAI proxy...).
/// Khóa API chỉ nằm trong header của request ra ngoài; không bao giờ đưa vào prompt hoặc log.
/// </summary>
public sealed class OpenAiCompatibleLlmClient(HttpClient http, IOptions<ChatbotOptions> options,
    ILogger<OpenAiCompatibleLlmClient> logger) : ILlmClient
{
    public async Task<LlmResponse> CompleteAsync(LlmRequest request, CancellationToken ct)
    {
        var o = options.Value;
        if (o.ConfigurationProblem() is { } problem)
            throw new LlmException("ai_not_configured", problem);

        var body = BuildBody(o, request);
        using var message = new HttpRequestMessage(HttpMethod.Post, o.BaseUrl!.TrimEnd('/') + "/chat/completions")
        {
            Content = new StringContent(body.ToJsonString(), Encoding.UTF8, "application/json")
        };
        message.Headers.Authorization = new AuthenticationHeaderValue("Bearer", o.ApiKey);
        message.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));

        using var timeout = CancellationTokenSource.CreateLinkedTokenSource(ct);
        timeout.CancelAfter(TimeSpan.FromSeconds(Math.Clamp(o.TimeoutSeconds, 5, 300)));
        HttpResponseMessage response;
        try
        {
            response = await http.SendAsync(message, HttpCompletionOption.ResponseContentRead, timeout.Token);
        }
        catch (OperationCanceledException e) when (!ct.IsCancellationRequested)
        {
            throw new LlmException("ai_timeout", "Dịch vụ AI không phản hồi trong thời gian cho phép.", e);
        }
        catch (HttpRequestException e)
        {
            throw new LlmException("ai_unavailable", "Không kết nối được dịch vụ AI.", e);
        }

        using (response)
        {
            var text = await response.Content.ReadAsStringAsync(ct);
            if (!response.IsSuccessStatusCode)
            {
                // Nội dung lỗi của nhà cung cấp chỉ ghi log (đã cắt ngắn), không trả cho trình duyệt.
                logger.LogWarning("AI provider returned HTTP {Status}: {Body}", (int)response.StatusCode,
                    text.Length > 500 ? text[..500] : text);
                throw response.StatusCode switch
                {
                    HttpStatusCode.Unauthorized or HttpStatusCode.Forbidden =>
                        new LlmException("ai_auth_failed", "Dịch vụ AI từ chối khóa API."),
                    HttpStatusCode.TooManyRequests =>
                        new LlmException("ai_rate_limited", "Dịch vụ AI đang giới hạn tần suất."),
                    _ => new LlmException("ai_unavailable", $"Dịch vụ AI trả lỗi HTTP {(int)response.StatusCode}.")
                };
            }
            return Parse(text);
        }
    }

    public static JsonObject BuildBody(ChatbotOptions o, LlmRequest request)
    {
        var messages = new JsonArray();
        foreach (var m in request.Messages)
        {
            var item = new JsonObject { ["role"] = m.Role, ["content"] = m.Content };
            if (m.ToolCalls is { Count: > 0 })
                item["tool_calls"] = new JsonArray(m.ToolCalls.Select(c => (JsonNode)new JsonObject
                {
                    ["id"] = c.Id,
                    ["type"] = "function",
                    ["function"] = new JsonObject { ["name"] = c.Name, ["arguments"] = c.Arguments }
                }).ToArray());
            if (m.ToolCallId is not null)
                item["tool_call_id"] = m.ToolCallId;
            messages.Add(item);
        }
        var body = new JsonObject
        {
            ["model"] = o.Model,
            ["messages"] = messages,
            ["stream"] = false,
            ["max_tokens"] = Math.Clamp(o.MaxOutputTokens, 200, 8000)
        };
        if (o.Temperature is { } temperature)
            body["temperature"] = temperature;
        if (request.Tools.Count > 0)
        {
            body["tools"] = new JsonArray(request.Tools.Select(t => (JsonNode)new JsonObject
            {
                ["type"] = "function",
                ["function"] = new JsonObject
                {
                    ["name"] = t.Name,
                    ["description"] = t.Description,
                    ["parameters"] = t.Parameters.DeepClone()
                }
            }).ToArray());
            body["tool_choice"] = request.AllowTools ? "auto" : "none";
        }
        return body;
    }

    public static LlmResponse Parse(string text)
    {
        JsonNode? root;
        try { root = JsonNode.Parse(text); }
        catch (JsonException e) { throw new LlmException("ai_bad_response", "Dịch vụ AI trả dữ liệu không đọc được.", e); }
        if (root?["error"] is JsonNode error)
            throw new LlmException("ai_unavailable", "Dịch vụ AI báo lỗi: " + (error["message"]?.ToString() ?? error.ToJsonString()));
        var choice = root?["choices"]?.AsArray().FirstOrDefault()
            ?? throw new LlmException("ai_bad_response", "Dịch vụ AI không trả lựa chọn nào.");
        var message = choice["message"];
        var calls = new List<LlmToolCall>();
        foreach (var call in message?["tool_calls"]?.AsArray() ?? [])
        {
            var function = call?["function"];
            var name = function?["name"]?.GetValue<string>();
            if (string.IsNullOrWhiteSpace(name))
                continue;
            // Một số nhà cung cấp trả arguments là object thay vì chuỗi JSON.
            var args = function!["arguments"] switch
            {
                JsonValue v when v.TryGetValue<string>(out var s) => s,
                null => "{}",
                var other => other.ToJsonString()
            };
            calls.Add(new LlmToolCall(call!["id"]?.ToString() ?? ("call_" + Guid.NewGuid().ToString("N")), name, args));
        }
        return new LlmResponse(ContentText(message?["content"]), calls, choice["finish_reason"]?.ToString(), root?["model"]?.ToString());
    }

    private static string? ContentText(JsonNode? content) => content switch
    {
        null => null,
        JsonValue v when v.TryGetValue<string>(out var s) => s,
        JsonArray parts => string.Concat(parts.Select(p => p?["text"]?.ToString() ?? "")),
        _ => content.ToString()
    };
}
