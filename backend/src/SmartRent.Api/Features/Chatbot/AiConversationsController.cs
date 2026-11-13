using System.Globalization;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using SmartRent.Api.Features.Auth;

namespace SmartRent.Api.Features.Chatbot;

public sealed record CreateChatConversationRequest(string? Title);
public sealed record ChatMessageRequest(string? Content);

/// <summary>Trợ lý AI khu quản trị. Giữ hợp đồng /api/v1/ai/conversations đã có trong openapi.yaml.</summary>
[ApiController]
[Route("api/v1/ai/conversations")]
public sealed class AiConversationsController(ChatConversationApi api) : ChatConversationsControllerBase(api)
{
    protected override ChatAudience Audience => ChatAudience.Admin;
}

/// <summary>Trợ lý AI khu khách. Cùng cấu trúc với khu quản trị nhưng chỉ có công cụ dữ liệu của chính khách.</summary>
[ApiController]
[Route("api/v1/portal/ai/conversations")]
public sealed class PortalAiConversationsController(ChatConversationApi api) : ChatConversationsControllerBase(api)
{
    protected override ChatAudience Audience => ChatAudience.Customer;
}

/// <summary>
/// Hành vi chung của hai khu. Mỗi request xác thực phiên với database và đối chiếu role với khu;
/// hội thoại chỉ tìm theo đúng chủ sở hữu, nên ID hội thoại của người khác trả 404.
/// </summary>
[Authorize]
public abstract class ChatConversationsControllerBase(ChatConversationApi api) : ControllerBase
{
    protected abstract ChatAudience Audience { get; }

    [HttpGet]
    public Task<IActionResult> List(CancellationToken ct) => api.ListAsync(this, Audience, ct);

    [HttpPost]
    public Task<IActionResult> Create([FromBody] CreateChatConversationRequest? body, CancellationToken ct) =>
        api.CreateAsync(this, Audience, body?.Title, ct);

    [HttpGet("{id:guid}")]
    public Task<IActionResult> Get(Guid id, CancellationToken ct) => api.GetAsync(this, Audience, id, ct);

    [HttpDelete("{id:guid}")]
    public Task<IActionResult> Delete(Guid id, CancellationToken ct) => api.DeleteAsync(this, Audience, id, ct);

    [HttpPost("{id:guid}/messages")]
    public Task<IActionResult> Send(Guid id, [FromBody] ChatMessageRequest? body, CancellationToken ct) =>
        api.SendAsync(this, Audience, id, body?.Content, ct);
}

public sealed class ChatConversationApi(IChatConversationStore store, ChatOrchestrator orchestrator, IChatActorResolver actors,
    ChatRateLimiter limiter, IOptions<ChatbotOptions> options, TimeProvider clock, ILogger<ChatConversationApi> logger)
{
    public async Task<IActionResult> ListAsync(ControllerBase c, ChatAudience audience, CancellationToken ct)
    {
        var (actor, denied) = await ActorAsync(c, audience, ct);
        if (denied is not null)
            return denied;
        return c.Ok(store.List(actor!.UserId, audience).Select(x => Summary(x, audience)));
    }

    public async Task<IActionResult> CreateAsync(ControllerBase c, ChatAudience audience, string? title, CancellationToken ct)
    {
        var (actor, denied) = await ActorAsync(c, audience, ct);
        if (denied is not null)
            return denied;
        if (NotConfigured(c) is { } unavailable)
            return unavailable;
        return c.Ok(Detail(store.Create(actor!.UserId, audience, title), audience));
    }

    public async Task<IActionResult> GetAsync(ControllerBase c, ChatAudience audience, Guid id, CancellationToken ct)
    {
        var (actor, denied) = await ActorAsync(c, audience, ct);
        if (denied is not null)
            return denied;
        var conversation = store.Find(actor!.UserId, audience, id);
        return conversation is null ? NotFound(c) : c.Ok(Detail(conversation, audience));
    }

    public async Task<IActionResult> DeleteAsync(ControllerBase c, ChatAudience audience, Guid id, CancellationToken ct)
    {
        var (actor, denied) = await ActorAsync(c, audience, ct);
        if (denied is not null)
            return denied;
        return store.Delete(actor!.UserId, audience, id) ? c.NoContent() : NotFound(c);
    }

    public async Task<IActionResult> SendAsync(ControllerBase c, ChatAudience audience, Guid id, string? content, CancellationToken ct)
    {
        var (actor, denied) = await ActorAsync(c, audience, ct);
        if (denied is not null)
            return denied;
        if (NotConfigured(c) is { } unavailable)
            return unavailable;
        var conversation = store.Find(actor!.UserId, audience, id);
        if (conversation is null)
            return NotFound(c);

        var text = AnswerGuard.NormalizeInput(content);
        var max = Math.Clamp(options.Value.MaxInputChars, 50, 8000);
        if (text.Length == 0)
            return Problem(c, 422, "validation_failed", "Hãy nhập câu hỏi.");
        if (text.Length > max)
            return Problem(c, 422, "validation_failed", $"Câu hỏi tối đa {max} ký tự.");

        if (!limiter.TryAcquire(actor.UserId, out var retryAfter))
        {
            if (retryAfter is { } wait)
                c.Response.Headers.RetryAfter = Math.Ceiling(wait.TotalSeconds).ToString(CultureInfo.InvariantCulture);
            return Problem(c, 429, "rate_limited", "Bạn hỏi hơi nhanh. Vui lòng chờ một chút rồi thử lại.");
        }

        using var gate = store.TryLock(actor.UserId, audience, id);
        if (gate is null)
            return Problem(c, 409, "conversation_busy", "Trợ lý đang trả lời câu hỏi trước trong cuộc trò chuyện này.");

        ChatTurnResult result;
        try
        {
            result = await orchestrator.RunAsync(new ChatTurnRequest(audience, actor.Token, actor.UserId, actor.DisplayName,
                conversation.Messages, text), ct);
        }
        catch (ChatAccessException e)
        {
            logger.LogWarning("Chatbot turn stopped for user {UserId}: {Code}", actor.UserId, e.Code);
            return Problem(c, e.Status, e.Code, e.Message);
        }
        catch (LlmException e)
        {
            logger.LogWarning(e, "Chatbot AI provider failure ({Code}) for user {UserId}", e.Code, actor.UserId);
            return e.Code switch
            {
                "ai_not_configured" => Problem(c, 503, "ai_not_configured", "Chưa kết nối dịch vụ trợ lý AI."),
                "ai_timeout" => Problem(c, 504, "ai_timeout", "Trợ lý AI phản hồi quá lâu. Vui lòng thử lại."),
                _ => Problem(c, 503, "ai_unavailable", "Trợ lý AI tạm thời không phản hồi. Vui lòng thử lại sau.")
            };
        }

        var now = clock.GetUtcNow();
        var updated = store.Append(actor.UserId, audience, id,
        [
            new ChatStoredMessage(Guid.NewGuid(), "user", text, now, [], [], null),
            new ChatStoredMessage(Guid.NewGuid(), "assistant", result.Content, now.AddMilliseconds(1), result.Sources, result.Actions, result.Model)
        ], conversation.Messages.Count == 0 ? text : null);
        return updated is null ? NotFound(c) : c.Ok(Detail(updated, audience));
    }

    /// <summary>Danh tính và role lấy lại từ database theo token, không dựa vào claim cũ hay nội dung request.</summary>
    private async Task<(ChatActor? Actor, IActionResult? Denied)> ActorAsync(ControllerBase c, ChatAudience audience, CancellationToken ct)
    {
        var actor = await actors.ResolveAsync(AuthSessionService.BearerToken(c.Request), ct);
        if (actor is null)
            return (null, Problem(c, 401, "unauthenticated", "Cần đăng nhập."));
        if (actor.Audience != audience)
            return (null, audience == ChatAudience.Admin
                ? Problem(c, 403, "admin_required", "Chỉ quản trị viên dùng được trợ lý quản trị.")
                : Problem(c, 403, "customer_required", "Chỉ tài khoản khách dùng được trợ lý khu khách."));
        return (actor, null);
    }

    private IActionResult? NotConfigured(ControllerBase c)
    {
        if (options.Value.ConfigurationProblem() is not { } problem)
            return null;
        logger.LogWarning("Chatbot is not configured: {Problem}", problem);
        return Problem(c, 503, "ai_not_configured", "Chưa kết nối dịch vụ trợ lý AI.");
    }

    private static IActionResult NotFound(ControllerBase c) =>
        Problem(c, 404, "not_found", "Không tìm thấy cuộc trò chuyện. Có thể nó đã hết hạn.");

    private static ObjectResult Problem(ControllerBase c, int status, string code, string detail) =>
        c.StatusCode(status, new { code, detail });

    private static object Summary(ChatConversationSnapshot x, ChatAudience audience) => new
    {
        id = x.Id,
        organizationId = Guid.Empty,
        userId = x.OwnerId,
        title = x.Title,
        createdAt = x.CreatedAt,
        updatedAt = x.UpdatedAt,
        dataScope = new { properties = audience == ChatAudience.Admin ? "all" : "own" }
    };

    private static object Detail(ChatConversationSnapshot x, ChatAudience audience) => new
    {
        id = x.Id,
        organizationId = Guid.Empty,
        userId = x.OwnerId,
        title = x.Title,
        createdAt = x.CreatedAt,
        updatedAt = x.UpdatedAt,
        dataScope = new { properties = audience == ChatAudience.Admin ? "all" : "own" },
        messages = x.Messages.Select(m => new
        {
            id = m.Id,
            conversationId = x.Id,
            role = m.Role,
            content = m.Content,
            createdAt = m.CreatedAt,
            sources = m.Sources,
            actions = m.Actions.Select(a => new { label = a.Label, path = a.Path })
        })
    };
}
