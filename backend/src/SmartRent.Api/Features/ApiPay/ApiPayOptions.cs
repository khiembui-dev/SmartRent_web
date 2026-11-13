namespace SmartRent.Api.Features.ApiPay;

// Chỉ đọc env của tiến trình backend. Không bind từ VITE_*, request hay settings công khai.
public sealed class ApiPayOptions
{
    public bool Enabled { get; init; }
    public string AccessKey { get; init; } = "";
    public string SecretKey { get; init; } = "";
    public string WebhookSecret { get; init; } = "";
    public string WebhookUrl { get; init; } = "";
    public string BankPublicId { get; init; } = "cmwf0n7b20xp301tjzi8z6dpc";
    public bool Ready => Enabled && !string.IsNullOrWhiteSpace(AccessKey) && !string.IsNullOrWhiteSpace(SecretKey)
        && !string.IsNullOrWhiteSpace(WebhookSecret) && Uri.TryCreate(WebhookUrl, UriKind.Absolute, out var uri)
        && uri.Scheme == "https" && uri.AbsolutePath == "/api/v1/apipay/webhook" && uri.UserInfo == "" && uri.Query == "" && uri.Fragment == "";
    public static ApiPayOptions FromEnvironment() => new()
    {
        Enabled = Environment.GetEnvironmentVariable("APIPAY_ENABLED") == "true",
        AccessKey = Environment.GetEnvironmentVariable("APIPAY_ACCESS_KEY") ?? "",
        SecretKey = Environment.GetEnvironmentVariable("APIPAY_SECRET_KEY") ?? "",
        WebhookSecret = Environment.GetEnvironmentVariable("APIPAY_WEBHOOK_SECRET") ?? "",
        WebhookUrl = Environment.GetEnvironmentVariable("APIPAY_WEBHOOK_URL") ?? "",
        BankPublicId = Environment.GetEnvironmentVariable("APIPAY_BANK_PUBLIC_ID") ?? "cmwf0n7b20xp301tjzi8z6dpc",
    };
}
