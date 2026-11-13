using System.Globalization;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace SmartRent.Api.Features.Chatbot;

/// <summary>Tham số mô hình gửi lên sai kiểu, thiếu, hoặc có trường không khai báo (ví dụ userId).</summary>
public sealed class ToolArgumentException(string message) : Exception(message);

/// <summary>
/// Một khai báo dùng cho hai việc: JSON Schema gửi cho mô hình và kiểm tra phía máy chủ.
/// Mọi trường không khai báo đều bị từ chối, nên mô hình không thể tự thêm userId, tenantId, role...
/// </summary>
public sealed partial class ToolSchema
{
    private enum Kind { Text, Integer, Boolean, Enum, Uuid, Month }

    private sealed record Param(string Name, Kind Kind, string Description, bool Required,
        int MaxLength = 0, Regex? Pattern = null, long Min = 0, long Max = 0, string[]? Values = null, bool QuotedFromUser = false);

    /// <summary>Từ khóa tìm kiếm dài hơn số từ này là câu hỏi bị chép vào ô tìm kiếm, không phải tên/mã cần tìm.</summary>
    private const int MaxSearchWords = 5;

    private readonly List<Param> _params = [];

    public static ToolSchema Empty => new();

    public IEnumerable<string> Names => _params.Select(p => p.Name);

    public ToolSchema Text(string name, string description, int maxLength, Regex? pattern = null, bool required = false)
    {
        _params.Add(new Param(name, Kind.Text, description, required, maxLength, pattern));
        return this;
    }

    /// <summary>
    /// Từ khóa tìm kiếm tự do (tên khách, mã phòng...). Phải là cụm người dùng thật sự gõ: mô hình nhỏ hay tự điền
    /// từ khóa ("máy lạnh") hoặc chép cả câu hỏi vào đây, làm danh sách rỗng và dẫn tới trả lời sai "không có".
    /// </summary>
    public ToolSchema Search(string name, string description, int maxLength)
    {
        _params.Add(new Param(name, Kind.Text, description + " Chỉ điền khi người dùng nêu tên/mã cụ thể; chép đúng chữ của họ.",
            false, maxLength, QuotedFromUser: true));
        return this;
    }

    public ToolSchema Integer(string name, string description, long min, long max, bool required = false)
    {
        _params.Add(new Param(name, Kind.Integer, description, required, Min: min, Max: max));
        return this;
    }

    public ToolSchema Boolean(string name, string description)
    {
        _params.Add(new Param(name, Kind.Boolean, description, false));
        return this;
    }

    public ToolSchema Enum(string name, string description, params string[] values)
    {
        _params.Add(new Param(name, Kind.Enum, description, false, Values: values));
        return this;
    }

    public ToolSchema RequiredEnum(string name, string description, params string[] values)
    {
        _params.Add(new Param(name, Kind.Enum, description, true, Values: values));
        return this;
    }

    public ToolSchema Uuid(string name, string description, bool required = false)
    {
        _params.Add(new Param(name, Kind.Uuid, description, required));
        return this;
    }

    public ToolSchema Month(string name, string description, bool required = false)
    {
        _params.Add(new Param(name, Kind.Month, description, required));
        return this;
    }

    /// <summary>
    /// JSON Schema theo kiểu "strict" của OpenAI: mọi tham số đều nằm trong required, tham số tùy chọn nhận thêm null.
    /// 9router (Codex) ép strict cho công cụ; nếu khai báo tùy chọn kiểu thường, mô hình buộc phải điền mọi ô và điền
    /// "", 0 hoặc giá trị bịa (UUID, mã phòng, khu vực). Có null thì mô hình gửi null cho ô không dùng.
    /// </summary>
    public JsonObject ToJsonSchema()
    {
        var properties = new JsonObject();
        foreach (var p in _params)
        {
            var schema = new JsonObject { ["description"] = p.Required ? p.Description : p.Description + " null nếu không dùng." };
            var type = "string";
            switch (p.Kind)
            {
                case Kind.Text:
                    schema["maxLength"] = p.MaxLength;
                    break;
                case Kind.Integer:
                    type = "integer";
                    schema["minimum"] = p.Min;
                    schema["maximum"] = p.Max;
                    break;
                case Kind.Boolean:
                    type = "boolean";
                    break;
                case Kind.Enum:
                    var values = p.Values!.Select(v => (JsonNode?)v);
                    schema["enum"] = new JsonArray((p.Required ? values : values.Append(null)).ToArray());
                    break;
                case Kind.Uuid:
                    schema["format"] = "uuid";
                    break;
                case Kind.Month:
                    schema["pattern"] = "^[0-9]{4}-(0[1-9]|1[0-2])$";
                    break;
            }
            schema["type"] = p.Required ? type : new JsonArray(type, "null");
            properties[p.Name] = schema;
        }
        return new JsonObject
        {
            ["type"] = "object",
            ["properties"] = properties,
            ["required"] = new JsonArray(_params.Select(p => (JsonNode)p.Name).ToArray()),
            ["additionalProperties"] = false
        };
    }

    /// <param name="raw">JSON tham số mô hình gửi.</param>
    /// <param name="isKnownId">
    /// Nếu có: UUID phải là ID đã xuất hiện trong dữ liệu thật (kết quả công cụ của lượt này hoặc lời người dùng).
    /// Mô hình nhỏ hay bịa UUID (11111111-..., a123a123-...); ID bịa ở tham số tùy chọn bị bỏ qua và ghi vào
    /// <see cref="ToolArguments.Ignored"/>, ở tham số bắt buộc thì bị từ chối kèm hướng dẫn lấy ID đúng.
    /// Đây chỉ là chống nhầm; quyền truy cập vẫn do API kiểm tra.
    /// </param>
    /// <param name="userText">Nếu có: từ khóa tìm kiếm (<see cref="Search"/>) không nằm trong câu người dùng thì bị bỏ qua.</param>
    public ToolArguments Parse(string? raw, Func<Guid, bool>? isKnownId = null, string? userText = null)
    {
        var values = new Dictionary<string, object>(StringComparer.Ordinal);
        var ignored = new List<string>();
        raw = string.IsNullOrWhiteSpace(raw) ? "{}" : raw;
        if (raw.Length > 4000)
            throw new ToolArgumentException("Tham số quá dài.");
        JsonNode? root;
        try { root = JsonNode.Parse(raw); }
        catch (JsonException) { throw new ToolArgumentException("Tham số không phải JSON hợp lệ."); }
        if (root is null)
            root = new JsonObject();
        if (root is not JsonObject obj)
            throw new ToolArgumentException("Tham số phải là một object JSON.");

        foreach (var (name, node) in obj)
        {
            var p = _params.FirstOrDefault(x => x.Name == name)
                ?? throw new ToolArgumentException($"Tham số '{Clip(name)}' không được phép cho công cụ này.");
            if (node is null)
                continue;
            // Mô hình hay điền giá trị giữ chỗ ("" hoặc UUID toàn số 0) cho tham số tùy chọn: coi như không truyền.
            if (Convert(p, node) is not { } converted)
                continue;
            if (converted is Guid id && isKnownId is not null && !isKnownId(id))
            {
                if (p.Required)
                    throw new ToolArgumentException($"'{p.Name}' không có trong dữ liệu đã tra cứu ở câu hỏi này, không được tự đặt ID. " +
                        "Gọi công cụ danh sách tương ứng để lấy đúng ID, hoặc dùng mã (ví dụ KH-001, HD-001, A101).");
                ignored.Add(p.Name);
                continue;
            }
            if (p.QuotedFromUser && userText is not null && !IsQuoted((string)converted, userText))
            {
                ignored.Add(p.Name);
                continue;
            }
            values[name] = converted;
        }
        foreach (var p in _params.Where(p => p.Required && !values.ContainsKey(p.Name)))
            throw new ToolArgumentException($"Thiếu tham số bắt buộc '{p.Name}'.");
        return new ToolArguments(values, ignored);
    }

    private static object? Convert(Param p, JsonNode node)
    {
        if (node is not JsonValue value)
            throw new ToolArgumentException($"'{p.Name}' phải là giá trị đơn.");
        switch (p.Kind)
        {
            case Kind.Integer:
            {
                long number;
                if (value.TryGetValue<long>(out var l)) number = l;
                else if (value.TryGetValue<double>(out var d) && d == Math.Floor(d) && Math.Abs(d) < 1e15) number = (long)d;
                else if (value.TryGetValue<string>(out var s) && long.TryParse(s.Trim(), NumberStyles.Integer, CultureInfo.InvariantCulture, out var parsed)) number = parsed;
                else throw new ToolArgumentException($"'{p.Name}' phải là số nguyên.");
                // Số 0 ở tham số tùy chọn (giá tối đa, limit...) là giá trị giữ chỗ, không phải bộ lọc "≤ 0 đ".
                if (number == 0 && !p.Required)
                    return null;
                if (number < p.Min || number > p.Max)
                    throw new ToolArgumentException($"'{p.Name}' phải từ {p.Min} đến {p.Max}.");
                return number;
            }
            case Kind.Boolean:
            {
                bool flag;
                if (value.TryGetValue<bool>(out var b)) flag = b;
                else if (value.TryGetValue<string>(out var s) && bool.TryParse(s.Trim(), out var parsed)) flag = parsed;
                else throw new ToolArgumentException($"'{p.Name}' phải là true hoặc false.");
                // Cờ boolean đều có nghĩa "true = chỉ lấy ...". false là giá trị giữ chỗ: không lọc,
                // tránh API hiểu thành "chỉ lấy mục KHÔNG quá hạn" và bỏ sót dữ liệu.
                return flag ? true : null;
            }
        }
        string text;
        if (value.TryGetValue<string>(out var s1)) text = s1;
        // Mô hình đôi khi gửi mã phòng "101" dưới dạng số; chỉ nhận số cho ô văn bản tự do.
        else if (p.Kind == Kind.Text && value.GetValueKind() == JsonValueKind.Number) text = value.ToJsonString();
        else throw new ToolArgumentException($"'{p.Name}' phải là chuỗi.");
        text = ControlChars().Replace(text, " ").Trim();
        if (text.Length == 0 && !p.Required)
            return null;
        switch (p.Kind)
        {
            case Kind.Enum:
                return p.Values!.FirstOrDefault(v => v.Equals(text, StringComparison.OrdinalIgnoreCase))
                    ?? throw new ToolArgumentException($"'{p.Name}' chỉ nhận: {string.Join(", ", p.Values!)}.");
            case Kind.Uuid:
                if (!Guid.TryParse(text, out var id))
                    throw new ToolArgumentException($"'{p.Name}' phải là UUID.");
                if (id != Guid.Empty)
                    return id;
                return p.Required ? throw new ToolArgumentException($"'{p.Name}' không hợp lệ.") : null;
            case Kind.Month:
                return MonthPattern().IsMatch(text) ? text : throw new ToolArgumentException($"'{p.Name}' phải có dạng YYYY-MM.");
            default:
                if (text.Length == 0)
                    throw new ToolArgumentException($"'{p.Name}' không được để trống.");
                if (text.Length > p.MaxLength)
                    throw new ToolArgumentException($"'{p.Name}' tối đa {p.MaxLength} ký tự.");
                if (p.Pattern is not null && !p.Pattern.IsMatch(text))
                    throw new ToolArgumentException($"'{p.Name}' không đúng định dạng ({FormatHint(p.Pattern)}). " +
                        "Gọi lại công cụ với đúng giá trị người dùng nêu, không thêm chữ nào khác.");
                return text;
        }
    }

    private static string Clip(string s) => s.Length > 40 ? s[..40] : s;

    /// <summary>Cụm ngắn (không quá vài từ) có nguyên văn trong câu người dùng, không phân biệt hoa thường và dấu.</summary>
    internal static bool IsQuoted(string value, string userText)
    {
        var folded = AnswerGuard.Fold(value).Trim().Trim('?', '.', '!', ',');
        var words = folded.Split(' ', StringSplitOptions.RemoveEmptyEntries);
        if (words.Length == 0 || words.Length > MaxSearchWords)
            return false;
        // "hợp đồng", "sự cố chưa xử lý"... có trong câu nhưng không phải tên/mã: lọc theo đó chỉ ra danh sách rỗng.
        if (words.All(GenericWords.Contains))
            return false;
        return Regex.IsMatch(AnswerGuard.Fold(userText),
            @"(?<![\p{L}\p{N}])" + Regex.Escape(folded) + @"(?![\p{L}\p{N}])");
    }

    private static readonly HashSet<string> GenericWords = new(StringComparer.Ordinal)
    {
        "hop", "dong", "hoa", "don", "phong", "khach", "thue", "su", "co", "ticket", "yeu", "cau", "ho", "tro", "nao", "sap", "het",
        "han", "chua", "da", "dang", "xu", "ly", "tien", "no", "coc", "thang", "nay", "truoc", "cac", "nhung", "danh", "sach", "tat",
        "ca", "xem", "lich", "toi", "cua", "con", "trong", "bao", "nhieu", "gia", "dien", "nuoc", "so", "chi", "tiet", "qua", "moi",
        "thanh", "toan", "khoan", "thu", "nha", "tro", "khu", "can", "cho", "duyet", "bi", "hong", "loi", "va", "o", "la", "gi",
        "list", "all", "tim", "kiem", "lien", "he", "nguoi", "ten", "ma", "id"
    };

    private static string FormatHint(Regex pattern) =>
        pattern == ToolPatterns.Code() ? "chỉ gồm chữ, số và dấu gạch ngang, ví dụ HD-001 hoặc A101"
        : pattern == ToolPatterns.Slug() ? "chữ thường, số và dấu gạch ngang"
        : pattern == ToolPatterns.Key() ? "chữ, số và dấu gạch dưới"
        : "sai mẫu cho phép";

    [GeneratedRegex(@"\p{Cc}")]
    private static partial Regex ControlChars();

    [GeneratedRegex("^[0-9]{4}-(0[1-9]|1[0-2])$")]
    private static partial Regex MonthPattern();
}

public sealed class ToolArguments(IReadOnlyDictionary<string, object> values, IReadOnlyList<string>? ignored = null)
{
    public static ToolArguments None { get; } = new(new Dictionary<string, object>());

    /// <summary>Tham số ID bị bỏ qua vì không lấy từ dữ liệu thật (mô hình tự đặt).</summary>
    public IReadOnlyList<string> Ignored { get; } = ignored ?? [];

    /// <summary>Dấu vân tay ổn định của tham số đã chuẩn hóa, dùng nhận ra lời gọi lặp lại trong một câu hỏi.</summary>
    public string Fingerprint => string.Join("&", values.OrderBy(kv => kv.Key, StringComparer.Ordinal)
        .Select(kv => kv.Key + "=" + System.Convert.ToString(kv.Value, CultureInfo.InvariantCulture)));

    public bool Has(string name) => values.ContainsKey(name);
    public string? Text(string name) => values.TryGetValue(name, out var v) ? (string)v : null;
    public int? Int(string name) => values.TryGetValue(name, out var v) ? (int)(long)v : null;
    public long? Long(string name) => values.TryGetValue(name, out var v) ? (long)v : null;
    public bool? Bool(string name) => values.TryGetValue(name, out var v) ? (bool)v : null;
    public Guid? Uuid(string name) => values.TryGetValue(name, out var v) ? (Guid)v : null;
}

/// <summary>Mẫu dùng chung cho mã chứng từ, slug, mã phòng: chỉ chữ, số, gạch ngang.</summary>
public static partial class ToolPatterns
{
    [GeneratedRegex("^[A-Za-z0-9-]{2,40}$")]
    public static partial Regex Code();

    [GeneratedRegex("^[a-z0-9]+(?:-[a-z0-9]+)*$")]
    public static partial Regex Slug();

    [GeneratedRegex("^[A-Za-z0-9_]{1,40}$")]
    public static partial Regex Key();
}
