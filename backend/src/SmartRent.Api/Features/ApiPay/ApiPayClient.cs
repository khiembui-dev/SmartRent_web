using System.Globalization;
using System.Net.Http.Headers;
using System.Net.Http.Json;
using System.Text;
using System.Text.Json;

namespace SmartRent.Api.Features.ApiPay;

public sealed record ApiPayCheckout(string PublicId, string PayUrl, string QrUrl, string Content,
    string BankCode, string AccountNumber, string AccountName, DateTimeOffset ExpiresAt);
public interface IApiPayClient
{
    Task<ApiPayCheckout> CreateAsync(decimal amount, string content, string title, CancellationToken ct);
}
// Lỗi cố định: không mang response thô/inner exception chứa header, key hoặc dữ liệu ngân hàng.
public sealed class ApiPayException(string code, string message, bool uncertain = false) : Exception(message)
{
    public string Code { get; } = code;
    public bool Uncertain { get; } = uncertain;
}

public sealed class ApiPayClient(HttpClient http, ApiPayOptions options) : IApiPayClient
{
    public async Task<ApiPayCheckout> CreateAsync(decimal amount, string content, string title, CancellationToken ct)
    {
        if (!options.Ready) throw new ApiPayException("payment_unavailable", "Thanh toán tự động chưa được cấu hình.");
        if (amount < 1 || amount > 300000000 || decimal.Truncate(amount) != amount)
            throw new ApiPayException("invalid_amount", "Số tiền phải là số nguyên từ 1 đến 300.000.000 đồng.");
        // Không gửi redirectUrl: trạng thái cuối chỉ đọc từ ledger sau webhook, không tin query trên trình duyệt.
        using var request = new HttpRequestMessage(HttpMethod.Post, "https://app.apipay.vn/v1/client/payment-requests");
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer",
            Convert.ToBase64String(Encoding.UTF8.GetBytes(options.AccessKey + ":" + options.SecretKey)));
        request.Content = JsonContent.Create(new { bankPublicId = options.BankPublicId,
            amount = amount.ToString(CultureInfo.InvariantCulture), content, title,
            expiresAt = DateTimeOffset.UtcNow.AddMinutes(30).ToString("O") });
        try
        {
            using var response = await http.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, ct);
            // Giới hạn body và không log message từ dịch vụ ngoài (message có thể chứa dữ liệu nhạy cảm).
            await response.Content.LoadIntoBufferAsync(65536, ct);
            using var json = JsonDocument.Parse(await response.Content.ReadAsByteArrayAsync(ct));
            if (!response.IsSuccessStatusCode)
            {
                _ = json.RootElement.TryGetProperty("message", out _); // Đọc envelope lỗi nhưng ánh xạ thông báo an toàn.
                throw new ApiPayException("provider_rejected", (int)response.StatusCode is 401 or 403
                    ? "Dịch vụ thanh toán chưa xác thực được. Vui lòng liên hệ chủ trọ."
                    : "Dịch vụ thanh toán chưa tạo được mã QR. Vui lòng thử lại sau.", (int)response.StatusCode >= 500);
            }
            var d = json.RootElement.GetProperty("data");
            string Read(string name) => d.GetProperty(name).GetString() ?? throw new JsonException();
            var publicId = Read("publicId");
            var pay = Read("payUrl"); var qr = Read("qrUrl"); var memo = Read("content");
            // ASCII memo của ta không bị ApiPay chuẩn hóa; nếu response khác thì không đưa QR cho khách.
            if (memo != content || !decimal.TryParse(d.GetProperty("amount").ToString(), NumberStyles.None,
                    CultureInfo.InvariantCulture, out var returned) || returned != amount ||
                publicId.Length is < 1 or > 200 || publicId.StartsWith("test_", StringComparison.OrdinalIgnoreCase) ||
                !SafeUrl(pay, "pay.apipay.vn") || !SafeUrl(qr, "app.apipay.vn")) throw new JsonException();
            var expires = DateTimeOffset.Parse(Read("expiresAt"), CultureInfo.InvariantCulture);
            if (expires <= DateTimeOffset.UtcNow) throw new JsonException();
            return new(publicId, pay, qr, memo, Read("bankCode"), Read("accountNumber"), Read("accountName"), expires);
        }
        catch (ApiPayException) { throw; }
        catch (Exception e) when (e is HttpRequestException or OperationCanceledException or JsonException or
                                       KeyNotFoundException or FormatException or InvalidOperationException)
        {
            // Timeout có thể xảy ra SAU khi ApiPay tạo yêu cầu. Không tự retry POST trong HttpClient.
            throw new ApiPayException("provider_unavailable", "Chưa nhận được phản hồi thanh toán hợp lệ. Hãy đợi một phút rồi thử lại.", true);
        }
    }
    private static bool SafeUrl(string value, string host) => Uri.TryCreate(value, UriKind.Absolute, out var uri)
        && uri.Scheme == "https" && uri.Host == host && uri.IsDefaultPort && uri.UserInfo == "";
}
