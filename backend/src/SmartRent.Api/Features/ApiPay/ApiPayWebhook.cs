using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace SmartRent.Api.Features.ApiPay;

public sealed record ApiPayTransfer(string TransactionId, string BankPublicId, decimal Amount, string Content,
    string ReferenceCode, DateTimeOffset TransactionDate, string BodyHash);

public static class ApiPayWebhook
{
    // HMAC trên đúng byte nhận được, tuyệt đối không deserialize rồi serialize lại trước khi kiểm tra.
    public static bool Verify(ReadOnlySpan<byte> raw, string? signature, string secret)
    {
        if (string.IsNullOrEmpty(secret) || signature?.Length != 64) return false;
        byte[] received;
        try { received = Convert.FromHexString(signature); }
        catch (FormatException) { return false; }
        var expected = HMACSHA256.HashData(Encoding.UTF8.GetBytes(secret), raw);
        return CryptographicOperations.FixedTimeEquals(expected, received);
    }
    public static ApiPayTransfer? Parse(byte[] raw)
    {
        using var doc = JsonDocument.Parse(raw, new JsonDocumentOptions { MaxDepth = 12 });
        var root = doc.RootElement;
        // Test của dashboard không được ghi thu vào hóa đơn thật dù chữ ký hợp lệ.
        if (Flag(root, "sandbox") || Flag(root, "liveTest") || root.GetProperty("event").GetString() != "transaction.in") return null;
        var d = root.GetProperty("data");
        if (Flag(d, "sandbox") || Flag(d, "liveTest")) return null;
        string Read(string key, int max) { var s = d.GetProperty(key).GetString();
            return !string.IsNullOrWhiteSpace(s) && s.Length <= max ? s : throw new JsonException(); }
        if (Read("type", 10) != "IN") throw new JsonException();
        var amount = decimal.Parse(d.GetProperty("amount").ToString(), NumberStyles.None, CultureInfo.InvariantCulture);
        if (amount <= 0 || amount > 9999999999999999m || amount != decimal.Truncate(amount)) throw new JsonException();
        return new(Read("transactionId", 128), Read("bankAccountPublicId", 200), amount, Read("content", 4000),
            Read("referenceCode", 200), DateTimeOffset.Parse(Read("transactionDate", 64), CultureInfo.InvariantCulture).ToUniversalTime(),
            Convert.ToHexString(SHA256.HashData(raw)));
    }
    private static bool Flag(JsonElement e, string name) => e.TryGetProperty(name, out var v) && v.ValueKind == JsonValueKind.True;
}

[ApiController, AllowAnonymous, Route("api/v1/apipay")]
public sealed class ApiPayWebhookController(ApiPayOptions options, ApiPayStore store) : ControllerBase
{
    [HttpPost("webhook"), RequestSizeLimit(65536)]
    public async Task<IActionResult> Receive(CancellationToken ct)
    {
        Response.Headers.CacheControl = "no-store";
        if (!options.Ready) return StatusCode(503, new { code = "payment_unavailable" });
        if (!Request.IsHttps) return BadRequest(new { code = "https_required" });
        // Chừa thời gian cho proxy trả response trước deadline 10 giây của ApiPay.
        using var deadline = CancellationTokenSource.CreateLinkedTokenSource(ct);
        deadline.CancelAfter(TimeSpan.FromSeconds(7));
        try
        {
            using var raw = new MemoryStream();
            var buffer = new byte[8192]; int count;
            while ((count = await Request.Body.ReadAsync(buffer, deadline.Token)) > 0)
            {
                if (raw.Length + count > 65536) return StatusCode(413);
                raw.Write(buffer, 0, count);
            }
            var bytes = raw.ToArray();
            if (!ApiPayWebhook.Verify(bytes, Request.Headers["ApiPay-Signature"].ToString(), options.WebhookSecret))
                return Unauthorized(new { code = "invalid_signature" });
            var transfer = ApiPayWebhook.Parse(bytes);
            if (transfer is null) return Ok(new { received = true, ignored = true });
            // Chỉ ACK sau COMMIT inbox. Worker xử lý ledger độc lập, không gọi API ngân hàng trong webhook.
            if (!await store.AcceptAsync(transfer, deadline.Token)) return Conflict(new { code = "transaction_conflict" });
            return Ok(new { received = true });
        }
        catch (Exception e) when (e is JsonException or FormatException or KeyNotFoundException or InvalidOperationException or OverflowException)
        { return BadRequest(new { code = "invalid_event" }); }
        catch (Exception e) when (e is Npgsql.NpgsqlException or OperationCanceledException or TimeoutException or IOException)
        { return StatusCode(503, new { code = "webhook_retry" }); }
    }
}
