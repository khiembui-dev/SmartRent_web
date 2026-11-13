using System.Globalization;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace SmartRent.Api.Features.Chatbot;

/// <summary>
/// Các giá trị được phép xuất hiện trong câu trả lời của một lượt hỏi: số và ngày có trong kết quả công cụ
/// của lượt đó, trong câu hỏi của người dùng và ngày hôm nay.
/// </summary>
public sealed class GroundingEvidence
{
    private static readonly TimeSpan VietnamOffset = TimeSpan.FromHours(7);
    private readonly HashSet<decimal> _numbers = [];
    private readonly HashSet<DateOnly> _dates = [];
    private readonly HashSet<(int Year, int Month)> _months = [];

    public void AddDate(DateOnly day)
    {
        _dates.Add(day);
        _months.Add((day.Year, day.Month));
        _numbers.Add(day.Year);
    }

    public void AddJson(JsonNode? node)
    {
        switch (node)
        {
            case JsonObject obj:
                foreach (var (_, child) in obj)
                    AddJson(child);
                break;
            case JsonArray array:
                foreach (var child in array)
                    AddJson(child);
                break;
            case JsonValue value when value.GetValueKind() == JsonValueKind.Number:
                if (decimal.TryParse(value.ToJsonString(), NumberStyles.Float, CultureInfo.InvariantCulture, out var number))
                    _numbers.Add(number);
                break;
            case JsonValue value when value.TryGetValue<string>(out var text):
                AddText(text);
                break;
        }
    }

    /// <summary>Lấy số, ngày ISO, ngày dd/MM/yyyy và tháng MM/yyyy có trong một chuỗi.</summary>
    public void AddText(string? text)
    {
        if (string.IsNullOrEmpty(text))
            return;
        foreach (Match m in AnswerGuard.IsoInstant().Matches(text))
        {
            if (!DateOnly.TryParseExact(m.Groups["date"].Value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var day))
                continue;
            AddDate(day);
            // Mốc thời gian UTC có thể sang ngày khác theo giờ Việt Nam.
            if (m.Groups["time"].Success && DateTimeOffset.TryParse(m.Value, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var instant))
                AddDate(DateOnly.FromDateTime(instant.ToOffset(VietnamOffset).DateTime));
        }
        foreach (Match m in AnswerGuard.VietnameseDate().Matches(text))
            if (AnswerGuard.TryDate(m, out var day))
                AddDate(day);
        foreach (Match m in AnswerGuard.MonthYear().Matches(text))
            _months.Add((int.Parse(m.Groups["y"].Value, CultureInfo.InvariantCulture), int.Parse(m.Groups["m"].Value, CultureInfo.InvariantCulture)));
        foreach (Match m in AnswerGuard.NumberToken().Matches(text))
            foreach (var candidate in AnswerGuard.Candidates(m.Groups["n"].Value))
                _numbers.Add(candidate * AnswerGuard.Multiplier(m.Groups["u"].Value));
        foreach (Match m in AnswerGuard.DigitRun().Matches(text))
            if (decimal.TryParse(m.Value, NumberStyles.Float, CultureInfo.InvariantCulture, out var run))
                _numbers.Add(run);
    }

    public bool HasNumber(decimal value) => _numbers.Contains(value);
    public bool HasDate(DateOnly day) => _dates.Contains(day);
    public bool HasMonth(int year, int month) => _months.Contains((year, month)) || _dates.Any(d => d.Year == year && d.Month == month);
}

/// <summary>
/// Kiểm tra đầu ra và đầu vào của trợ lý. Đây là lớp phòng thủ thêm; quyền truy cập vẫn do API quyết định.
/// </summary>
public static partial class AnswerGuard
{
    /// <summary>
    /// Các số tiền/tỷ lệ/số lớn và ngày trong câu trả lời không có trong dữ liệu của lượt hỏi.
    /// Số nhỏ không kèm đơn vị (số phòng, số ngày, số lượng) không bị kiểm tra.
    /// </summary>
    public static IReadOnlyList<string> UngroundedValues(string answer, GroundingEvidence evidence)
    {
        var problems = new List<string>();
        var text = answer;

        foreach (Match m in VietnameseDate().Matches(text))
            if (TryDate(m, out var day) && !evidence.HasDate(day))
                problems.Add(m.Value);
        text = VietnameseDate().Replace(text, " ");

        foreach (Match m in IsoInstant().Matches(text))
            if (DateOnly.TryParseExact(m.Groups["date"].Value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out var day) && !evidence.HasDate(day))
                problems.Add(m.Value);
        text = IsoInstant().Replace(text, " ");

        foreach (Match m in MonthYear().Matches(text))
        {
            var month = int.Parse(m.Groups["m"].Value, CultureInfo.InvariantCulture);
            var year = int.Parse(m.Groups["y"].Value, CultureInfo.InvariantCulture);
            if (month is >= 1 and <= 12 && !evidence.HasMonth(year, month))
                problems.Add(m.Value);
        }
        text = MonthYear().Replace(text, " ");
        text = ClockTime().Replace(text, " ");

        foreach (Match m in NumberToken().Matches(text))
        {
            var unit = m.Groups["u"].Value;
            var multiplier = Multiplier(unit);
            var candidates = Candidates(m.Groups["n"].Value).ToList();
            if (candidates.Count == 0)
                continue;
            var mustCheck = unit.Length > 0 || candidates.Any(c => c >= 1000);
            if (mustCheck && !candidates.Any(c => evidence.HasNumber(c * multiplier)))
                problems.Add(m.Value.Trim());
        }
        return problems;
    }

    /// <summary>Câu trả lời lặp lại chỉ dẫn hệ thống (mã canary hoặc nhiều đoạn 8 từ trùng khớp).</summary>
    public static bool LeaksInstructions(string answer, string systemPrompt)
    {
        if (answer.Contains(ChatPrompts.Canary, StringComparison.OrdinalIgnoreCase)
            || answer.Contains("SR-POLICY", StringComparison.OrdinalIgnoreCase))
            return true;
        var promptWords = Words(systemPrompt);
        var answerText = " " + string.Join(' ', Words(answer)) + " ";
        var hits = 0;
        for (var i = 0; i + 8 <= promptWords.Count; i += 4)
        {
            var shingle = " " + string.Join(' ', promptWords.Skip(i).Take(8)) + " ";
            if (answerText.Contains(shingle, StringComparison.Ordinal) && ++hits >= 2)
                return true;
        }
        return false;
    }

    /// <summary>Ẩn khóa API nếu vì lý do nào đó xuất hiện trong câu trả lời.</summary>
    public static string RedactSecrets(string answer, string? apiKey)
    {
        if (!string.IsNullOrEmpty(apiKey) && apiKey.Length >= 8)
            answer = answer.Replace(apiKey, "[đã ẩn]", StringComparison.Ordinal);
        return SecretLike().Replace(answer, "[đã ẩn]");
    }

    /// <summary>Dấu hiệu cố đổi quy tắc, giả danh hoặc dò dữ liệu ngoài phạm vi. Chỉ để ghi log và nhắc mô hình.</summary>
    public static IReadOnlyList<string> InjectionSignals(string text, ChatAudience audience)
    {
        var plain = Fold(text);
        var signals = new List<string>();
        void Check(string name, Regex pattern)
        {
            if (pattern.IsMatch(plain))
                signals.Add(name);
        }
        Check("override_rules", OverrideRules());
        Check("prompt_probe", PromptProbe());
        Check("identity_parameter", IdentityParameter());
        Check("sql", SqlLike());
        Check("secret_probe", SecretProbe());
        if (audience == ChatAudience.Customer)
        {
            Check("claims_admin", ClaimsAdmin());
            Check("other_people", OtherPeople());
        }
        return signals;
    }

    /// <summary>Chuẩn hóa tin nhắn người dùng: bỏ ký tự điều khiển/vô hình, gộp dòng trống.</summary>
    public static string NormalizeInput(string? text)
    {
        var value = (text ?? "").Normalize(NormalizationForm.FormC);
        value = InvisibleChars().Replace(value, "");
        value = ManyNewlines().Replace(value, "\n\n");
        return value.Trim();
    }

    // ------------------------------------------------------------------ số và ngày

    internal static bool TryDate(Match m, out DateOnly day)
    {
        day = default;
        var d = int.Parse(m.Groups["d"].Value, CultureInfo.InvariantCulture);
        var mo = int.Parse(m.Groups["m"].Value, CultureInfo.InvariantCulture);
        var y = int.Parse(m.Groups["y"].Value, CultureInfo.InvariantCulture);
        if (mo is < 1 or > 12 || d < 1 || d > DateTime.DaysInMonth(y, mo))
            return false;
        day = new DateOnly(y, mo, d);
        return true;
    }

    /// <summary>"1.500" có thể là một nghìn năm trăm (kiểu Việt) hoặc 1,5 (kiểu Anh); trả cả hai để không báo nhầm.</summary>
    internal static IEnumerable<decimal> Candidates(string token)
    {
        var results = new HashSet<decimal>();
        void Add(string s)
        {
            if (decimal.TryParse(s, NumberStyles.AllowDecimalPoint, CultureInfo.InvariantCulture, out var v))
                results.Add(v);
        }
        var hasDot = token.Contains('.');
        var hasComma = token.Contains(',');
        if (hasDot && hasComma)
        {
            var decimalSep = token.LastIndexOf('.') > token.LastIndexOf(',') ? '.' : ',';
            var thousandSep = decimalSep == '.' ? ',' : '.';
            Add(token.Replace(thousandSep.ToString(), "").Replace(decimalSep, '.'));
        }
        else if (hasDot || hasComma)
        {
            var sep = hasDot ? '.' : ',';
            var groups = token.Split(sep);
            if (groups.Skip(1).All(g => g.Length == 3))
                Add(string.Concat(groups));
            if (groups.Length == 2)
                Add(groups[0] + "." + groups[1]);
        }
        else
            Add(token);
        return results;
    }

    internal static decimal Multiplier(string unit) => unit.ToLowerInvariant() switch
    {
        "k" or "nghìn" or "ngàn" => 1_000m,
        "tr" or "triệu" => 1_000_000m,
        "tỷ" => 1_000_000_000m,
        _ => 1m
    };

    private static List<string> Words(string text) =>
        NonWord().Split(text.ToLowerInvariant()).Where(w => w.Length > 0).ToList();

    /// <summary>Bỏ dấu tiếng Việt và viết thường để so khớp mẫu.</summary>
    internal static string Fold(string text)
    {
        var decomposed = text.ToLowerInvariant().Replace('đ', 'd').Normalize(NormalizationForm.FormD);
        var sb = new StringBuilder(decomposed.Length);
        foreach (var ch in decomposed)
            if (CharUnicodeInfo.GetUnicodeCategory(ch) != UnicodeCategory.NonSpacingMark)
                sb.Append(ch);
        return Spaces().Replace(sb.ToString(), " ");
    }

    [GeneratedRegex(@"(?<![\p{N}/])(?<d>\d{1,2})/(?<m>\d{1,2})/(?<y>\d{4})(?![\p{N}/])")]
    internal static partial Regex VietnameseDate();

    [GeneratedRegex(@"(?<![\p{N}])(?<date>\d{4}-\d{2}-\d{2})(?<time>T[0-9:.]+(?:Z|[+-]\d{2}:?\d{2})?)?")]
    internal static partial Regex IsoInstant();

    [GeneratedRegex(@"(?<![\p{N}/])(?<m>\d{1,2})/(?<y>\d{4})(?![\p{N}/])")]
    internal static partial Regex MonthYear();

    [GeneratedRegex(@"(?<![\p{N}:])\d{1,2}:\d{2}(?::\d{2})?(?![\p{N}:])")]
    private static partial Regex ClockTime();

    [GeneratedRegex(@"(?<![\p{L}\p{N}_\-.,])(?<n>\d{1,3}(?:[.,]\d{3})+(?:[.,]\d+)?|\d+(?:[.,]\d+)?)(?![\p{N}])(?:\s*(?<u>%|₫|đồng|đ|vnđ|vnd|nghìn|ngàn|triệu|tr|tỷ|k)(?![\p{L}]))?", RegexOptions.IgnoreCase)]
    internal static partial Regex NumberToken();

    [GeneratedRegex(@"\d+(?:\.\d+)?")]
    internal static partial Regex DigitRun();

    [GeneratedRegex(@"\bsk-[A-Za-z0-9_-]{16,}")]
    private static partial Regex SecretLike();

    [GeneratedRegex(@"[^\p{L}\p{N}]+")]
    private static partial Regex NonWord();

    [GeneratedRegex(@"\s+")]
    private static partial Regex Spaces();

    [GeneratedRegex(@"[\p{Cc}\p{Cf}-[\n\t]]")]
    private static partial Regex InvisibleChars();

    [GeneratedRegex(@"\n{3,}")]
    private static partial Regex ManyNewlines();

    [GeneratedRegex(@"ignore (all |the |any )?(previous|above|prior|earlier)? ?(instruction|rule|prompt)|bo qua (tat ca |moi |cac |nhung )?(quy tac|huong dan|chi dan|lenh|rule|gioi han)|disregard (all |the )?(rules|instructions)|forget (all |your )?(rules|instructions)|developer mode|che do (nha phat trien|developer|debug|admin|god)|jailbreak|\bdan mode\b|khong con (bi )?gioi han")]
    private static partial Regex OverrideRules();

    [GeneratedRegex(@"system prompt|prompt he thong|chi dan he thong|huong dan he thong|your (instructions|rules|prompt)|in (ra )?(toan bo )?(quy tac|chi dan|prompt)|repeat (the )?(text|words) above")]
    private static partial Regex PromptProbe();

    [GeneratedRegex(@"\b(user|tenant|admin|customer|khach)[ _-]?id\b|\buser_id\b|\brole\s*[=:]\s*admin")]
    private static partial Regex IdentityParameter();

    [GeneratedRegex(@"\bselect\b.+\bfrom\b|\bdrop\s+table\b|\bunion\s+select\b|\binsert\s+into\b|\bdelete\s+from\b|;\s*--")]
    private static partial Regex SqlLike();

    [GeneratedRegex(@"api[ _-]?key|khoa api|access token|bearer|mat khau (cua )?(he thong|admin|database)|connection string")]
    private static partial Regex SecretProbe();

    [GeneratedRegex(@"\b(toi|minh|tao|em|anh|chi) (la|chinh la|dang la|lam) (admin|quan tri|chu tro|quan ly)\b|quyen (admin|quan tri)")]
    private static partial Regex ClaimsAdmin();

    [GeneratedRegex(@"(khach|nguoi|phong|tai khoan) (thue )?khac|cua (nguoi|khach) khac|tat ca (cac )?(khach|nguoi thue|hoa don)|danh sach khach")]
    private static partial Regex OtherPeople();
}
