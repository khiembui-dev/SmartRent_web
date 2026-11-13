using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace SmartRent.Api.Features.Chatbot;

/// <summary>
/// Nút mở trang trong ứng dụng. Chỉ máy chủ tạo từ kết quả công cụ; mô hình không tự tạo link,
/// nên không thể chèn URL ngoài để dẫn người dùng đi hoặc lấy dữ liệu qua ảnh/link.
/// </summary>
public sealed partial record ChatAction(string Label, string Path)
{
    public static ChatAction? Create(ChatAudience audience, string label, string path)
    {
        if (!SafePath().IsMatch(path) || path.Contains("//", StringComparison.Ordinal))
            return null;
        var adminPath = path == "/admin" || path.StartsWith("/admin/", StringComparison.Ordinal);
        if (adminPath != (audience == ChatAudience.Admin))
            return null;
        label = label.Trim();
        return label.Length == 0 ? null : new ChatAction(label.Length > 60 ? label[..60] : label, path);
    }

    [GeneratedRegex("^/[A-Za-z0-9/_-]{0,160}$")]
    private static partial Regex SafePath();
}

public sealed record ChatToolResult(bool Ok, JsonNode? Data, string? ErrorCode, string? ErrorMessage, IReadOnlyList<ChatAction> Actions)
{
    public const string Unverifiable = "Không thể xác minh dữ liệu này.";

    public static ChatToolResult Success(JsonNode? data, IEnumerable<ChatAction?>? actions = null) =>
        new(true, data, null, null, (actions ?? []).OfType<ChatAction>().ToList());

    public static ChatToolResult Fail(string code, string message) => new(false, null, code, message, []);

    /// <summary>
    /// Đổi lỗi của API hiện có thành thông báo cho mô hình. Ở khu khách, "không có" và "không có quyền"
    /// trả cùng một câu để không lộ việc hồ sơ của người khác có tồn tại.
    /// </summary>
    public static ChatToolResult FromError(ApiOutcome outcome, ChatAudience audience)
    {
        switch (outcome.Status)
        {
            case 401:
                throw new ChatAccessException(401, "unauthenticated", "Phiên đăng nhập đã hết hạn.");
            case 403 when audience == ChatAudience.Admin:
                return Fail("forbidden", "Tài khoản không có quyền xem dữ liệu này. " + Unverifiable);
            case 403 or 404:
                return Fail("not_found", audience == ChatAudience.Customer
                    ? "Không tìm thấy dữ liệu này trong tài khoản của bạn hoặc bạn không có quyền xem. " + Unverifiable
                    : "Không tìm thấy dữ liệu. " + Unverifiable);
            case >= 400 and < 500:
                return Fail(outcome.Code ?? "rejected", (outcome.Detail ?? "Yêu cầu tra cứu không hợp lệ.") + " " + Unverifiable);
            default:
                return Fail("data_unavailable", "Hệ thống chưa lấy được dữ liệu. " + Unverifiable);
        }
    }
}

/// <summary>Ngữ cảnh của một lần gọi công cụ: người hỏi đã được xác thực lại ngay trước đó.</summary>
public sealed class ChatToolContext(ChatActor actor, ExistingApi? api, ChatAudience audience, Dictionary<string, object>? cache = null,
    string? userText = null)
{
    public ChatActor Actor { get; } = actor;
    public ChatAudience Audience { get; } = audience;
    /// <summary>
    /// Câu hỏi hiện tại của người dùng, chỉ để hiểu ý (tên cơ sở, mã chứng từ người dùng gõ). Không dùng để quyết định quyền.
    /// </summary>
    public string UserText { get; } = userText ?? "";
    public ExistingApi Api => api ?? throw new InvalidOperationException("Thiếu ExistingApi.");
    /// <summary>Bộ nhớ đệm trong một câu hỏi, ví dụ danh sách cơ sở thuộc phạm vi admin.</summary>
    public Dictionary<string, object> Cache { get; } = cache ?? new(StringComparer.Ordinal);

    public Task<ApiOutcome> Get<TController>(
        Func<TController, CancellationToken, Task<Microsoft.AspNetCore.Mvc.IActionResult>> action,
        CancellationToken ct, IReadOnlyDictionary<string, string?>? query = null)
        where TController : Microsoft.AspNetCore.Mvc.ControllerBase =>
        Api.GetAsync(Actor, action, query, ct);

    public ChatAction? Action(string label, string path) => ChatAction.Create(Audience, label, path);
}

public interface IChatTool
{
    string Name { get; }
    string Description { get; }
    /// <summary>Tên nguồn hiển thị dưới câu trả lời, ví dụ "Hóa đơn của tôi".</summary>
    string SourceLabel { get; }
    ChatAudience Audience { get; }
    ToolSchema Schema { get; }
    Task<ChatToolResult> ExecuteAsync(ChatToolContext context, ToolArguments args, CancellationToken ct);
}

public sealed class ChatTool(string name, ChatAudience audience, string sourceLabel, string description, ToolSchema schema,
    Func<ChatToolContext, ToolArguments, CancellationToken, Task<ChatToolResult>> run) : IChatTool
{
    public string Name { get; } = name;
    public string Description { get; } = description;
    public string SourceLabel { get; } = sourceLabel;
    public ChatAudience Audience { get; } = audience;
    public ToolSchema Schema { get; } = schema;

    public Task<ChatToolResult> ExecuteAsync(ChatToolContext context, ToolArguments args, CancellationToken ct) =>
        run(context, args, ct);
}

/// <summary>Danh sách công cụ theo khu. Công cụ không có trong khu của hội thoại thì không tồn tại với mô hình.</summary>
public sealed class ChatToolRegistry
{
    private readonly Dictionary<ChatAudience, IReadOnlyList<IChatTool>> _byAudience;

    public ChatToolRegistry(IEnumerable<IChatTool> tools)
    {
        var list = tools.ToList();
        var duplicate = list.GroupBy(t => t.Name).FirstOrDefault(g => g.Count() > 1);
        if (duplicate is not null)
            throw new InvalidOperationException("Trùng tên công cụ chatbot: " + duplicate.Key);
        _byAudience = Enum.GetValues<ChatAudience>().ToDictionary(a => a,
            a => (IReadOnlyList<IChatTool>)list.Where(t => t.Audience == a).ToList());
    }

    public static ChatToolRegistry CreateDefault() =>
        new(CustomerChatTools.All().Concat(AdminChatTools.All()));

    public IReadOnlyList<IChatTool> For(ChatAudience audience) => _byAudience[audience];

    public IChatTool? Find(ChatAudience audience, string name) =>
        _byAudience[audience].FirstOrDefault(t => t.Name == name);

    public IReadOnlyList<LlmToolDefinition> Definitions(ChatAudience audience) =>
        For(audience).Select(t => new LlmToolDefinition(t.Name, t.Description, t.Schema.ToJsonSchema())).ToList();
}

/// <summary>
/// Tìm hồ sơ theo mã người dùng nói (ưu tiên) hoặc ID từ kết quả trước. Việc tìm theo mã đi qua chính API danh sách
/// của người hỏi, nên chỉ thấy hồ sơ trong phạm vi của họ.
/// </summary>
internal static partial class ChatResolve
{
    public static async Task<(Guid Id, ChatToolResult? Error)> ByCodeOrId(ChatToolContext ctx, string? code, Guid? id,
        Func<string, Task<ApiOutcome>> search, string what)
    {
        if (code is not null)
        {
            // Mã mô hình gửi, rồi mã người dùng thật sự gõ nếu mã kia là nó cộng thêm ký tự rác ("HD-001C6B52...").
            foreach (var candidate in CodeCandidates(code, ctx.UserText))
            {
                var list = await search(candidate);
                if (!list.Ok)
                    return (default, ChatToolResult.FromError(list, ctx.Audience));
                var match = ChatJson.Items(list.Data).FirstOrDefault(x =>
                    string.Equals(ChatJson.S(x, "code"), candidate, StringComparison.OrdinalIgnoreCase));
                if (match is not null && Guid.TryParse(ChatJson.S(match, "id"), out var found))
                    return (found, null);
            }
            if (id is null)
                return (default, ChatToolResult.FromError(new ApiOutcome(404, null, "not_found", null), ctx.Audience));
        }
        if (id is { } given)
            return (given, null);
        return (default, ChatToolResult.Fail("invalid_arguments", $"Cần mã {what} (người dùng nêu hoặc lấy từ công cụ danh sách)."));
    }

    /// <summary>Mã đúng như mô hình gửi, sau đó các mã trong câu người dùng mà mã kia bắt đầu bằng.</summary>
    internal static IEnumerable<string> CodeCandidates(string code, string userText)
    {
        yield return code;
        foreach (var token in CodeToken().Matches(userText).Select(m => m.Value).Distinct(StringComparer.OrdinalIgnoreCase))
            if (token.Length >= 3 && token.Length < code.Length && code.StartsWith(token, StringComparison.OrdinalIgnoreCase))
                yield return token;
    }

    [GeneratedRegex("[A-Za-z]{1,8}(?:-?[0-9]{1,12})+")]
    private static partial Regex CodeToken();
}

/// <summary>Đọc và chọn trường từ JSON của API. Chỉ trường được liệt kê mới gửi cho mô hình.</summary>
internal static class ChatJson
{
    public static JsonNode? At(JsonNode? node, params string[] path)
    {
        foreach (var key in path)
            node = node is JsonObject o && o.TryGetPropertyValue(key, out var next) ? next : null;
        return node;
    }

    public static JsonNode? V(JsonNode? node, params string[] path) => At(node, path)?.DeepClone();

    public static string? S(JsonNode? node, params string[] path) => At(node, path) switch
    {
        JsonValue v when v.TryGetValue<string>(out var s) => s,
        JsonValue v => v.ToJsonString().Trim('"'),
        _ => null
    };

    public static bool B(JsonNode? node, params string[] path) =>
        At(node, path) is JsonValue v && v.TryGetValue<bool>(out var b) && b;

    public static JsonObject Obj(params (string Key, JsonNode? Value)[] fields)
    {
        var result = new JsonObject();
        foreach (var (key, value) in fields)
            if (value is not null)
                result[key] = value;
        return result;
    }

    public static IEnumerable<JsonNode> Items(JsonNode? node, string key = "items") => node switch
    {
        JsonArray array => array.OfType<JsonNode>(),
        JsonObject o when o[key] is JsonArray array => array.OfType<JsonNode>(),
        _ => []
    };

    public static JsonArray Arr(IEnumerable<JsonNode?> items) => new(items.ToArray());

    public static JsonNode? Clip(string? text, int max) =>
        string.IsNullOrWhiteSpace(text) ? null : (JsonNode)(text.Length > max ? text[..max] + "…" : text);

    public static JsonNode? Label(string? code, IReadOnlyDictionary<string, string> labels) =>
        code is null ? null : (JsonNode)(labels.TryGetValue(code, out var label) ? label : code);

    /// <summary>
    /// Bỏ số 0 thừa của cột numeric (chỉ số 100.000 → 100, diện tích 25.00 → 25). Nếu không, mô hình chép "100.000"
    /// và người đọc tiếng Việt hiểu thành một trăm nghìn. Chỉ đổi cách viết, giá trị giữ nguyên.
    /// </summary>
    public static JsonNode? Normalize(JsonNode? node)
    {
        if (node is JsonValue value)
            return NormalizeNumber(value) ?? value;
        NormalizeChildren(node);
        return node;
    }

    private static void NormalizeChildren(JsonNode? node)
    {
        if (node is JsonObject obj)
        {
            foreach (var key in obj.Select(p => p.Key).ToList())
                if (obj[key] is JsonValue v && NormalizeNumber(v) is { } n)
                    obj[key] = n;
                else
                    NormalizeChildren(obj[key]);
        }
        else if (node is JsonArray array)
        {
            for (var i = 0; i < array.Count; i++)
                if (array[i] is JsonValue v && NormalizeNumber(v) is { } n)
                    array[i] = n;
                else
                    NormalizeChildren(array[i]);
        }
    }

    private static JsonValue? NormalizeNumber(JsonValue value) =>
        value.GetValueKind() == System.Text.Json.JsonValueKind.Number
        && decimal.TryParse(value.ToJsonString(), System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out var d)
            ? JsonValue.Create(decimal.Parse(d.ToString("G29", System.Globalization.CultureInfo.InvariantCulture),
                System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture))
            : null;
}

internal static class ChatLabels
{
    public static readonly Dictionary<string, string> PaymentStatus = new()
    {
        ["paid"] = "Đã thanh toán đủ", ["unpaid"] = "Chưa thanh toán", ["partial"] = "Đã thanh toán một phần"
    };
    public static readonly Dictionary<string, string> InvoiceStatus = new()
    {
        ["draft"] = "Nháp, chưa phát hành", ["issued"] = "Đã phát hành", ["void"] = "Đã hủy"
    };
    public static readonly Dictionary<string, string> InvoiceKind = new()
    {
        ["periodic"] = "Hóa đơn tháng", ["final"] = "Hóa đơn trả phòng", ["opening_balance"] = "Công nợ chuyển sang",
        ["debit_adjustment"] = "Điều chỉnh tăng", ["credit_adjustment"] = "Điều chỉnh giảm"
    };
    public static readonly Dictionary<string, string> TicketStatus = new()
    {
        ["new"] = "Mới", ["accepted"] = "Đã tiếp nhận", ["in_progress"] = "Đang xử lý", ["waiting"] = "Đang chờ",
        ["resolved"] = "Đã xử lý xong", ["closed"] = "Đã đóng"
    };
    public static readonly Dictionary<string, string> Priority = new()
    {
        ["low"] = "Thấp", ["normal"] = "Bình thường", ["high"] = "Cao", ["urgent"] = "Khẩn cấp"
    };
    public static readonly Dictionary<string, string> Occupancy = new()
    {
        ["available"] = "Còn trống", ["occupied"] = "Đang cho thuê", ["reserved"] = "Đang giữ chỗ",
        ["on_hold"] = "Đang giữ chỗ", ["maintenance"] = "Đang bảo trì", ["inactive"] = "Ngừng sử dụng"
    };
    public static readonly Dictionary<string, string> ContractStatus = new()
    {
        ["active"] = "Đang hiệu lực", ["expired"] = "Đã hết hạn nhưng khách vẫn ở", ["terminated"] = "Đã kết thúc",
        ["signed"] = "Đã ký, chưa vào ở", ["draft"] = "Chưa có hợp đồng đã ký", ["archived"] = "Đã lưu trữ"
    };
    public static readonly Dictionary<string, string> TenancyStatus = new()
    {
        ["planned"] = "Sắp vào ở", ["active"] = "Đang ở", ["ended"] = "Đã trả phòng", ["cancelled"] = "Đã hủy"
    };
    public static readonly Dictionary<string, string> Residence = new()
    {
        ["active"] = "Đang ở", ["planned"] = "Sắp vào ở", ["former"] = "Đã từng ở", ["none"] = "Chưa thuê"
    };
    public static readonly Dictionary<string, string> TenancyRole = new()
    {
        ["representative"] = "Người đại diện hợp đồng", ["resident"] = "Người ở cùng"
    };
    public static readonly Dictionary<string, string> PaymentKind = new()
    {
        ["receipt"] = "Thanh toán hóa đơn", ["receipt_reversal"] = "Hoàn tác thanh toán", ["deposit_receipt"] = "Thu tiền cọc",
        ["deposit_refund"] = "Hoàn cọc", ["deposit_offset"] = "Cấn trừ tiền cọc", ["deposit_offset_reversal"] = "Hoàn tác cấn trừ cọc"
    };
    public static readonly Dictionary<string, string> PaymentState = new()
    {
        ["pending"] = "Chờ chủ trọ xác minh", ["confirmed"] = "Đã xác nhận", ["rejected"] = "Bị từ chối"
    };
    public static readonly Dictionary<string, string> PaymentMethod = new()
    {
        ["cash"] = "Tiền mặt", ["bank_transfer"] = "Chuyển khoản"
    };
    public static readonly Dictionary<string, string> Booking = new()
    {
        ["new"] = "Mới gửi", ["accepted"] = "Đã tiếp nhận", ["consulting"] = "Đang tư vấn", ["scheduled"] = "Đã hẹn lịch xem",
        ["viewing"] = "Đã hẹn lịch xem", ["completed"] = "Đã xem phòng", ["no_show"] = "Không đến xem", ["pending"] = "Chờ duyệt",
        ["approved"] = "Đã duyệt", ["converted"] = "Đã chuyển thành hợp đồng", ["rejected"] = "Bị từ chối", ["cancelled"] = "Đã hủy"
    };
    public static readonly Dictionary<string, string> Listing = new()
    {
        ["hidden"] = "Đang ẩn", ["draft"] = "Bản nháp", ["published"] = "Đang đăng"
    };
    public static readonly Dictionary<string, string> WorksheetGroup = new()
    {
        ["missing_readings"] = "Thiếu chỉ số điện nước", ["blocked"] = "Chưa tính được (thiếu hợp đồng/chỉ số đầu)",
        ["ready"] = "Đủ chỉ số, chưa tạo hóa đơn", ["draft"] = "Đã có hóa đơn nháp", ["issued_unpaid"] = "Đã phát hành, chưa thanh toán",
        ["issued_partial"] = "Đã phát hành, thanh toán một phần", ["paid"] = "Đã thanh toán đủ"
    };
}
