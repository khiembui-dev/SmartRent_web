using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Mvc;
using Npgsql;

namespace SmartRent.Api.Common;

// Helpers dùng chung cho mô hình 13 bảng. Mọi giá trị đầu vào đều truyền qua parameter.
internal static class BusinessData
{
    public static DateOnly Today => DateOnly.FromDateTime(TimeZoneInfo.ConvertTimeBySystemTimeZoneId(DateTime.UtcNow, "SE Asia Standard Time"));
    public static readonly (string Code, string Name, string Category, string Unit, string Method)[] Charges = [
        ("RENT","Tiền phòng","rent","tháng","fixed"),("ELECTRICITY","Tiền điện","electricity","kWh","metered"),
        ("WATER","Tiền nước","water","m³","metered"),("GARBAGE","Rác","service","tháng","fixed"),
        ("SERVICE","Dịch vụ","service","tháng","fixed"),("INTERNET","Internet","service","tháng","fixed"),("PARKING","Giữ xe","service","xe","per_quantity")];
    public static JsonObject Object(JsonElement body) => JsonNode.Parse(body.GetRawText())!.AsObject();
    public static string? Text(this JsonNode? n, string key)
    {
        var value = n?[key];
        if (value is JsonValue scalar && scalar.TryGetValue<Guid>(out var id))
            return id.ToString();
        if (value is JsonValue text && text.TryGetValue<string>(out var s))
            return s;
        return value?.ToString();
    }
    public static decimal Number(this JsonNode? n, string key, decimal fallback = 0) =>
        decimal.TryParse(n?[key]?.ToString(), System.Globalization.NumberStyles.Number, System.Globalization.CultureInfo.InvariantCulture, out var value) ? value : fallback;
    public static Guid Id(this JsonNode? n, string key) => Guid.TryParse(n.Text(key), out var id) ? id : throw Invalid("Cần ID hợp lệ: " + key);
    public static LeaseHttpException Invalid(string message) => new(422, "validation_failed", message);
    public static LeaseHttpException Missing() => new(404, "not_found", "Không tìm thấy dữ liệu.");
    public static JsonNode? Copy(JsonNode? n) => n?.DeepClone();
    public static async Task<NpgsqlCommand> Command(NpgsqlConnection c, NpgsqlTransaction? t, string sql, object?[] args)
    {
        var cmd = new NpgsqlCommand(sql, c, t);
        for (var i = 0; i < args.Length; i += 2)
        {
            var value = args[i + 1];
            cmd.Parameters.AddWithValue((string)args[i]!, value is DateTimeOffset dt ? dt.ToUniversalTime() : value ?? DBNull.Value);
        }
        await Task.CompletedTask;
        return cmd;
    }
    public static async Task<string?> Scalar(NpgsqlConnection c, NpgsqlTransaction? t, string sql, CancellationToken ct, params object?[] args)
    {
        await using var cmd = await Command(c, t, sql, args);
        var value = await cmd.ExecuteScalarAsync(ct);
        return value is null or DBNull ? null : Convert.ToString(value, System.Globalization.CultureInfo.InvariantCulture);
    }
    public static async Task<int> Execute(NpgsqlConnection c, NpgsqlTransaction? t, string sql, CancellationToken ct, params object?[] args)
    {
        await using var cmd = await Command(c, t, sql, args);
        return await cmd.ExecuteNonQueryAsync(ct);
    }
    public static async Task<JsonObject> Row(NpgsqlConnection c, NpgsqlTransaction? t, string sql, CancellationToken ct, params object?[] args)
    {
        var s = await Scalar(c, t, sql, ct, args);
        return s is null ? throw Missing() : JsonNode.Parse(s)!.AsObject();
    }
    public static async Task<List<JsonObject>> Rows(NpgsqlConnection c, NpgsqlTransaction? t, string sql, CancellationToken ct, params object?[] args)
    {
        await using var cmd = await Command(c, t, sql, args);
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        var rows = new List<JsonObject>();
        while (await reader.ReadAsync(ct))
            rows.Add(JsonNode.Parse(reader.GetString(0))!.AsObject());
        return rows;
    }
    public static JsonArray Array(IEnumerable<JsonObject> rows) => new(rows.Select(x => (JsonNode)x).ToArray());
    public static object Page(List<JsonObject> rows, int page, int pageSize)
    {
        page = Math.Max(1, page);
        pageSize = Math.Clamp(pageSize, 1, 200);
        return new
        {
            items = rows.Skip((page - 1) * pageSize).Take(pageSize),
            page,
            pageSize,
            totalItems = rows.Count,
            totalPages = (int)Math.Ceiling(rows.Count / (double)pageSize)
        };
    }
    // Form cũ gửi chargeTypeId; SQL lưu snapshot code/name/unit/method ngay trong JSONB.
    public static JsonArray Rates(JsonNode? input, DateOnly from, JsonArray? previous = null)
    {
        var result = new JsonArray();
        foreach (var n in input?.AsArray() ?? new JsonArray())
        {
            var code = n.Text("code") ?? n.Text("chargeTypeId") ?? n?["chargeType"].Text("code");
            var known = Charges.FirstOrDefault(x => x.Code == code);
            if (known.Code is null)
                throw Invalid("Loại khoản thu không hợp lệ.");
            var price = n.Number("unitPrice");
            if (price < 0 || price != decimal.Truncate(price))
                throw Invalid("Đơn giá phải là số nguyên VND không âm.");
            result.Add(new JsonObject
            {
                ["id"] = n.Text("id") ?? Guid.NewGuid().ToString(),
                ["code"] = code,
                ["name"] = n.Text("name") ?? known.Name,
                ["category"] = known.Category,
                ["unit"] = known.Unit,
                ["method"] = n.Text("method") ?? n.Text("calculationMethod") ?? known.Method,
                ["cycle"] = n.Text("cycle") ?? n.Text("billingCycle") ?? "monthly",
                ["unitPrice"] = price,
                ["effectiveFrom"] = n.Text("effectiveFrom") ?? from.ToString("yyyy-MM-dd"),
                ["effectiveTo"] = n.Text("effectiveTo"),
                ["proration"] = n.Text("proration") ?? n.Text("prorationMode") ?? "actual_days"
            });
        }
        if (previous is null)
            return result;
        var history = previous.DeepClone().AsArray();
        foreach (var rate in result.ToArray())
        {
            var code = rate.Text("code");
            var start = rate.Text("effectiveFrom")!;
            foreach (var old in history.Where(x => x.Text("code") == code && (x.Text("effectiveTo") is null || string.CompareOrdinal(x.Text("effectiveTo"), start) > 0)).ToArray())
            {
                if (string.CompareOrdinal(old.Text("effectiveFrom"), start) >= 0)
                    history.Remove(old);
                else
                    old!["effectiveTo"] = start;
            }
            history.Add(rate!.DeepClone());
        }
        return history;
    }
    public static JsonArray Effective(JsonArray property, JsonArray room, DateOnly date)
    {
        var map = new Dictionary<string, JsonNode>();
        foreach (var (rates, scope) in new[] { (property, "property"), (room, "room") })
            foreach (var n in rates.Where(n => DateOnly.Parse(n.Text("effectiveFrom")!) <= date && (n.Text("effectiveTo") is null || DateOnly.Parse(n.Text("effectiveTo")!) > date)))
            {
                var r = n!.DeepClone();
                r["scope"] = scope;
                r["chargeType"] = new JsonObject { ["id"] = n.Text("code"), ["code"] = n.Text("code"), ["name"] = n.Text("name"), ["category"] = n.Text("category"), ["unitLabel"] = n.Text("unit") };
                r["calculationMethod"] = n.Text("method");
                r["billingCycle"] = n.Text("cycle");
                r["prorationMode"] = n.Text("proration");
                map[n.Text("code")!] = r;
            }
        return new JsonArray(map.Values.ToArray());
    }
}

// Transaction boundary cho controller mới; lỗi nhập liệu trả JSON ngắn, không lộ stack trace.
public abstract class BusinessController(NpgsqlDataSource db) : LeasingController(db)
{
    protected async Task<IActionResult> Run(bool admin, Func<NpgsqlConnection, NpgsqlTransaction, Guid, Task<object?>> action, CancellationToken ct)
    {
        // PostgreSQL có thể yêu cầu chạy lại transaction khi hai thao tác đụng cùng hồ sơ.
        // Callback chỉ ghi SQL; rollback toàn bộ trước khi thử lại, không lặp tác dụng ngoài DB.
        for (var attempt = 0; attempt < 3; attempt++)
        {
            try
            {
                var (c, t, actor) = await BeginAsync(admin, ct);
                await using (c)
                await using (t)
                {
                    var value = await action(c, t, actor);
                    await t.CommitAsync(ct);
                    return Ok(value);
                }
            }
            catch (LeaseHttpException e) { return LeaseProblem(e); }
            catch (PostgresException e) when (e.SqlState is "40001" or "40P01")
            {
                if (attempt == 2)
                    return Conflict(new
                    {
                        code = "concurrent_update",
                        detail = "Dữ liệu vừa thay đổi. Hãy tải lại và thử lại."
                    });
            }
            catch (PostgresException e) { return DatabaseProblem(e); }
            catch (Exception e) when (e is FormatException or JsonException or InvalidOperationException or ArgumentException)
            {
                return UnprocessableEntity(new
                {
                    code = "validation_failed",
                    detail = "Dữ liệu không đúng định dạng hoặc không hợp lệ."
                });
            }
        }
        throw new InvalidOperationException("Transaction retry exhausted.");
    }
}
