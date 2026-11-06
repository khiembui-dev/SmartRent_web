using System.Text.Json;

namespace SmartRent.Api.Common;

public static class JsonInput
{
    public static string? String(this JsonElement value, string name) => value.TryGetProperty(name, out var p) && p.ValueKind is not JsonValueKind.Null and not JsonValueKind.Undefined ? p.GetString() : null;
    public static Guid? Guid(this JsonElement value, string name) => System.Guid.TryParse(value.String(name), out var id) ? id : null;
    public static DateOnly? Date(this JsonElement value, string name) => DateOnly.TryParse(value.String(name), out var date) ? date : null;
    public static decimal? Decimal(this JsonElement value, string name) => value.TryGetProperty(name, out var p) && p.TryGetDecimal(out var n) ? n : null;
    public static JsonElement ValueOr(this JsonElement value, string name, JsonElement fallback) => value.TryGetProperty(name, out var p) ? p : fallback;
    public static JsonElement EmptyObject => JsonDocument.Parse("{}").RootElement.Clone();
    public static JsonElement EmptyArray => JsonDocument.Parse("[]").RootElement.Clone();
}
