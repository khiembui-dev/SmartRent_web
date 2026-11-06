namespace SmartRent.Api.Features.Tickets;

// Các request giữ tên mà frontend hiện gửi. TenancyId là contracts.id;
// CategoryId nhận code cố định như WATER, không phải khóa của một bảng danh mục.
public sealed record CreateTicketRequest(Guid TenancyId, string CategoryId, string Title,
    string Description, string Priority = "normal", Guid[]? FileIds = null, Guid? RoomId = null);
public sealed record TicketMessageRequest(string Body, bool IsInternal = false);
public sealed record TicketTransitionRequest(string Action, string? Reason = null,
    string? ResolutionNotes = null, string? ExpectedStatus = null);
public sealed record TicketAssignRequest(Guid UserId, string? Note = null, string? ExpectedStatus = null);
public sealed record TicketReopenRequest(string Reason);

// Query được truyền bằng tham số SQL. Sort luôn được đổi qua whitelist trong repository.
public sealed class TicketListQuery
{
    public string? Status { get; set; }
    public string? Q { get; set; }
    public bool? Overdue { get; set; }
    public string? Priority { get; set; }
    public Guid? PropertyId { get; set; }
    public Guid? RoomId { get; set; }
    public string? Sort { get; set; }
    public int Page { get; set; } = 1;
    public int PageSize { get; set; } = 20;
}

// Lỗi nghiệp vụ có mã HTTP và tên ô form để frontend gắn thông báo đúng vị trí.
public sealed class TicketException(int status, string code, string detail, string? field = null)
    : Exception(detail)
{
    public int Status { get; } = status;
    public string Code { get; } = code;
    public string? Field { get; } = field;
}

public static class TicketRules
{
    public static readonly string[] OpenStatuses = ["new", "accepted", "in_progress", "waiting"];
    public static readonly string[] Statuses = [.. OpenStatuses, "resolved", "closed"];
    public static readonly string[] Priorities = ["low", "normal", "high", "urgent"];
    public static readonly string[] Categories = ["ELECTRICITY", "WATER", "INTERNET", "OTHER"];

    // SLA tính liên tục theo giờ UTC. Mở lại ticket sử dụng cùng quy tắc này để đặt hạn mới.
    public static DateTime DueAt(string priority, DateTime now) => now.AddHours(priority switch
    {
        "low" => 120, "normal" => 48, "high" => 24, "urgent" => 4,
        _ => throw Invalid("priority", "Mức ưu tiên không hợp lệ.")
    });

    // Chỉ cho phép đúng những chuyển trạng thái mà các nút admin hỗ trợ.
    public static string NextStatus(string current, string action) => (current, action) switch
    {
        ("new", "accept") => "accepted",
        ("new" or "accepted", "start") => "in_progress",
        ("accepted" or "in_progress", "wait") => "waiting",
        ("waiting", "resume") => "in_progress",
        ("accepted" or "in_progress" or "waiting", "resolve") => "resolved",
        ("resolved", "close") => "closed",
        ("resolved" or "closed", "reopen") => "accepted",
        _ => throw new TicketException(409, "invalid_transition", "Trạng thái đã thay đổi hoặc hành động không hợp lệ. Tải lại ticket.")
    };

    // Trim, giới hạn độ dài ở backend; không dựa vào maxlength của HTML.
    public static string Text(string? value, string field, int max)
    {
        var text = value?.Trim() ?? "";
        if (text.Length == 0 || text.Length > max)
            throw Invalid(field, $"Nội dung cần từ 1 đến {max} ký tự.");
        return text;
    }

    public static TicketException Invalid(string field, string detail) =>
        new(422, "validation_failed", detail, field);
}
