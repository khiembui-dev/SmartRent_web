namespace SmartRent.Api.Features.Chatbot;

/// <summary>
/// Cấu hình trợ lý AI. BaseUrl, ApiKey và Model là thông tin riêng của từng máy/môi trường:
/// đặt bằng .NET User Secrets hoặc biến môi trường (Chatbot__ApiKey...), không ghi vào appsettings.json
/// hay .env vì hai file đó nằm trong repo công khai.
/// </summary>
public sealed class ChatbotOptions
{
    public const string Section = "Chatbot";

    /// <summary>Gốc API tương thích OpenAI, ví dụ https://router.example.com/v1 (không gồm /chat/completions).</summary>
    public string? BaseUrl { get; set; }
    public string? ApiKey { get; set; }
    public string? Model { get; set; }

    /// <summary>Cho phép BaseUrl dùng http. Khóa và nội dung hội thoại khi đó đi qua mạng không mã hóa.</summary>
    public bool AllowInsecureHttp { get; set; }

    /// <summary>Thời gian chờ mỗi lần gọi dịch vụ AI.</summary>
    public int TimeoutSeconds { get; set; } = 60;
    /// <summary>Thời gian tối đa cho cả một câu hỏi (nhiều vòng gọi AI và công cụ).</summary>
    public int TurnTimeoutSeconds { get; set; } = 150;
    /// <summary>Số vòng LLM được phép gọi công cụ trong một câu hỏi.</summary>
    public int MaxToolRounds { get; set; } = 5;
    /// <summary>Tổng số lần gọi công cụ trong một câu hỏi.</summary>
    public int MaxToolCallsPerTurn { get; set; } = 12;
    public int MaxInputChars { get; set; } = 2000;
    /// <summary>Số tin nhắn gần nhất (người dùng + trợ lý) gửi kèm làm ngữ cảnh.</summary>
    public int HistoryMessages { get; set; } = 12;
    public int MessagesPerMinute { get; set; } = 8;
    public int MessagesPerDay { get; set; } = 300;
    public int MaxOutputTokens { get; set; } = 1500;
    public double? Temperature { get; set; }
    public int ConversationIdleHours { get; set; } = 12;
    public int MaxConversationsPerUser { get; set; } = 20;
    public int MaxMessagesPerConversation { get; set; } = 60;

    /// <summary>Lý do chưa dùng được; null nghĩa là cấu hình đủ.</summary>
    public string? ConfigurationProblem()
    {
        if (string.IsNullOrWhiteSpace(BaseUrl) || string.IsNullOrWhiteSpace(ApiKey) || string.IsNullOrWhiteSpace(Model))
            return "Thiếu Chatbot:BaseUrl, Chatbot:ApiKey hoặc Chatbot:Model.";
        if (!Uri.TryCreate(BaseUrl, UriKind.Absolute, out var uri) || uri.Scheme is not ("https" or "http"))
            return "Chatbot:BaseUrl không phải URL http(s) hợp lệ.";
        if (uri.Scheme == "http" && !AllowInsecureHttp)
            return "Chatbot:BaseUrl dùng http; đặt Chatbot:AllowInsecureHttp=true nếu chấp nhận gửi khóa và dữ liệu không mã hóa.";
        return null;
    }

    public bool IsConfigured => ConfigurationProblem() is null;
}
