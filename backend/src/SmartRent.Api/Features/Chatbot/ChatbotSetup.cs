using System.Threading.RateLimiting;
using Microsoft.Extensions.DependencyInjection.Extensions;
using Microsoft.Extensions.Options;

namespace SmartRent.Api.Features.Chatbot;

public static class ChatbotSetup
{
    /// <summary>Đăng ký trợ lý AI. Không cấu hình khóa thì API trả 503 "chưa kết nối", phần còn lại của web không bị ảnh hưởng.</summary>
    public static IServiceCollection AddChatbot(this IServiceCollection services, IConfiguration configuration)
    {
        services.AddOptions<ChatbotOptions>().Bind(configuration.GetSection(ChatbotOptions.Section));
        services.TryAddSingleton(TimeProvider.System);
        // Thời gian chờ do client tự quản lý theo cấu hình; tắt timeout mặc định 100 giây của HttpClient.
        services.AddHttpClient<ILlmClient, OpenAiCompatibleLlmClient>(client => client.Timeout = Timeout.InfiniteTimeSpan);
        services.AddSingleton(_ => ChatToolRegistry.CreateDefault());
        services.AddSingleton<IChatConversationStore, InMemoryChatConversationStore>();
        services.AddSingleton<ChatRateLimiter>();
        services.AddScoped<IChatActorResolver, SessionChatActorResolver>();
        services.AddScoped<ExistingApi>();
        services.AddScoped<ChatOrchestrator>();
        services.AddScoped<ChatConversationApi>();
        return services;
    }
}

/// <summary>Giới hạn số câu hỏi theo tài khoản (mỗi phút và mỗi ngày) để tránh lạm dụng chi phí API AI.</summary>
public sealed class ChatRateLimiter : IDisposable
{
    private readonly PartitionedRateLimiter<Guid> _limiter;

    public ChatRateLimiter(IOptions<ChatbotOptions> options)
    {
        var o = options.Value;
        _limiter = PartitionedRateLimiter.CreateChained(
            PartitionedRateLimiter.Create<Guid, Guid>(id => RateLimitPartition.GetSlidingWindowLimiter(id, _ => new SlidingWindowRateLimiterOptions
            {
                PermitLimit = Math.Max(1, o.MessagesPerMinute),
                Window = TimeSpan.FromMinutes(1),
                SegmentsPerWindow = 6,
                QueueLimit = 0,
                AutoReplenishment = true
            })),
            PartitionedRateLimiter.Create<Guid, Guid>(id => RateLimitPartition.GetFixedWindowLimiter(id, _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = Math.Max(1, o.MessagesPerDay),
                Window = TimeSpan.FromDays(1),
                QueueLimit = 0,
                AutoReplenishment = true
            })));
    }

    public bool TryAcquire(Guid userId, out TimeSpan? retryAfter)
    {
        using var lease = _limiter.AttemptAcquire(userId);
        retryAfter = !lease.IsAcquired && lease.TryGetMetadata(MetadataName.RetryAfter, out var retry) ? retry : null;
        return lease.IsAcquired;
    }

    public void Dispose() => _limiter.Dispose();
}
