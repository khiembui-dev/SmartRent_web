using System.Collections.Concurrent;
using Microsoft.Extensions.Options;

namespace SmartRent.Api.Features.Chatbot;

public sealed record ChatStoredMessage(Guid Id, string Role, string Content, DateTimeOffset CreatedAt,
    IReadOnlyList<string> Sources, IReadOnlyList<ChatAction> Actions, string? Model);

/// <summary>Bản chụp hội thoại trả cho controller; không chia sẻ danh sách đang bị sửa.</summary>
public sealed record ChatConversationSnapshot(Guid Id, Guid OwnerId, ChatAudience Audience, string Title,
    DateTimeOffset CreatedAt, DateTimeOffset UpdatedAt, IReadOnlyList<ChatStoredMessage> Messages);

/// <summary>
/// Lịch sử hội thoại do máy chủ giữ: trình duyệt không gửi lại lịch sử nên không thể chèn câu trả lời giả của trợ lý.
/// Mọi thao tác đều kèm chủ sở hữu và khu; ID hội thoại của người khác được xử lý như không tồn tại.
/// </summary>
public interface IChatConversationStore
{
    ChatConversationSnapshot Create(Guid ownerId, ChatAudience audience, string? title);
    ChatConversationSnapshot? Find(Guid ownerId, ChatAudience audience, Guid id);
    IReadOnlyList<ChatConversationSnapshot> List(Guid ownerId, ChatAudience audience);
    bool Delete(Guid ownerId, ChatAudience audience, Guid id);
    /// <summary>Thêm tin nhắn; trả null nếu hội thoại không còn (hết hạn/đã xóa).</summary>
    ChatConversationSnapshot? Append(Guid ownerId, ChatAudience audience, Guid id, IEnumerable<ChatStoredMessage> messages, string? newTitle = null);
    /// <summary>Chỉ một câu hỏi được xử lý cùng lúc trong một hội thoại.</summary>
    IDisposable? TryLock(Guid ownerId, ChatAudience audience, Guid id);
}

/// <summary>
/// Lưu trong bộ nhớ của tiến trình: đủ cho một máy chủ, mất khi khởi động lại, tự hết hạn khi không dùng.
/// Database 13 bảng được giữ nguyên; triển khai nhiều máy chủ thì thay bằng Redis/bảng riêng qua interface này.
/// </summary>
public sealed class InMemoryChatConversationStore(IOptions<ChatbotOptions> options, TimeProvider clock) : IChatConversationStore
{
    private sealed class Entry
    {
        public required Guid Id { get; init; }
        public required Guid OwnerId { get; init; }
        public required ChatAudience Audience { get; init; }
        public required DateTimeOffset CreatedAt { get; init; }
        public string Title { get; set; } = "";
        public DateTimeOffset UpdatedAt { get; set; }
        public List<ChatStoredMessage> Messages { get; } = [];
        public SemaphoreSlim Gate { get; } = new(1, 1);

        public ChatConversationSnapshot Snapshot()
        {
            lock (Messages)
                return new ChatConversationSnapshot(Id, OwnerId, Audience, Title, CreatedAt, UpdatedAt, Messages.ToList());
        }
    }

    private sealed class Releaser(SemaphoreSlim gate) : IDisposable
    {
        private int _released;
        public void Dispose()
        {
            if (Interlocked.Exchange(ref _released, 1) == 0)
                gate.Release();
        }
    }

    private readonly ConcurrentDictionary<Guid, Entry> _entries = new();

    public ChatConversationSnapshot Create(Guid ownerId, ChatAudience audience, string? title)
    {
        Sweep();
        var now = clock.GetUtcNow();
        var entry = new Entry
        {
            Id = Guid.NewGuid(), OwnerId = ownerId, Audience = audience, CreatedAt = now, UpdatedAt = now,
            Title = CleanTitle(title) ?? "Cuộc trò chuyện mới"
        };
        _entries[entry.Id] = entry;
        // Giữ số hội thoại mỗi người trong giới hạn, bỏ cái cũ nhất.
        var max = Math.Max(1, options.Value.MaxConversationsPerUser);
        foreach (var old in Owned(ownerId, audience).OrderByDescending(e => e.UpdatedAt).Skip(max))
            _entries.TryRemove(old.Id, out _);
        return entry.Snapshot();
    }

    public ChatConversationSnapshot? Find(Guid ownerId, ChatAudience audience, Guid id) => Get(ownerId, audience, id)?.Snapshot();

    public IReadOnlyList<ChatConversationSnapshot> List(Guid ownerId, ChatAudience audience)
    {
        Sweep();
        return Owned(ownerId, audience).OrderByDescending(e => e.UpdatedAt).Select(e => e.Snapshot()).ToList();
    }

    public bool Delete(Guid ownerId, ChatAudience audience, Guid id) =>
        Get(ownerId, audience, id) is not null && _entries.TryRemove(id, out _);

    public ChatConversationSnapshot? Append(Guid ownerId, ChatAudience audience, Guid id, IEnumerable<ChatStoredMessage> messages, string? newTitle = null)
    {
        var entry = Get(ownerId, audience, id);
        if (entry is null)
            return null;
        lock (entry.Messages)
        {
            entry.Messages.AddRange(messages);
            var max = Math.Max(4, options.Value.MaxMessagesPerConversation);
            if (entry.Messages.Count > max)
                entry.Messages.RemoveRange(0, entry.Messages.Count - max);
            if (CleanTitle(newTitle) is { } title)
                entry.Title = title;
            entry.UpdatedAt = clock.GetUtcNow();
        }
        return entry.Snapshot();
    }

    public IDisposable? TryLock(Guid ownerId, ChatAudience audience, Guid id)
    {
        var entry = Get(ownerId, audience, id);
        return entry is not null && entry.Gate.Wait(0) ? new Releaser(entry.Gate) : null;
    }

    private Entry? Get(Guid ownerId, ChatAudience audience, Guid id)
    {
        if (!_entries.TryGetValue(id, out var entry) || entry.OwnerId != ownerId || entry.Audience != audience)
            return null;
        if (Expired(entry))
        {
            _entries.TryRemove(id, out _);
            return null;
        }
        return entry;
    }

    private IEnumerable<Entry> Owned(Guid ownerId, ChatAudience audience) =>
        _entries.Values.Where(e => e.OwnerId == ownerId && e.Audience == audience && !Expired(e));

    private bool Expired(Entry e) =>
        clock.GetUtcNow() - e.UpdatedAt > TimeSpan.FromHours(Math.Max(1, options.Value.ConversationIdleHours));

    private void Sweep()
    {
        foreach (var e in _entries.Values.Where(Expired))
            _entries.TryRemove(e.Id, out _);
    }

    private static string? CleanTitle(string? title)
    {
        var text = AnswerGuard.NormalizeInput(title).Replace('\n', ' ');
        if (text.Length == 0)
            return null;
        return text.Length > 60 ? text[..60].TrimEnd() + "…" : text;
    }
}
