using System.Net;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using SmartRent.Api.Features.ApiPay;

namespace SmartRent.Api.Tests.ApiPay;

public class ApiPayTests
{
    public static ApiPayOptions Options => new() { Enabled = true, AccessKey = "unit-access", SecretKey = "unit-secret",
        WebhookSecret = "unit-webhook-secret", WebhookUrl = "https://example.invalid/api/v1/apipay/webhook" };
    private const string Memo = "SR00112233445566778899AABBCCDDEEFF";
    private sealed class Handler(Func<HttpRequestMessage, Task<HttpResponseMessage>> callback) : HttpMessageHandler
    { protected override Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken ct) => callback(request); }

    [Fact]
    public async Task CreateUsesServerAmountBase64BearerAndDocumentedEnvelope()
    {
        var handler = new Handler(async request =>
        {
            Assert.Equal(HttpMethod.Post, request.Method);
            Assert.Equal("https://app.apipay.vn/v1/client/payment-requests", request.RequestUri!.ToString());
            Assert.Equal("Bearer", request.Headers.Authorization!.Scheme);
            Assert.Equal(Convert.ToBase64String(Encoding.UTF8.GetBytes("unit-access:unit-secret")), request.Headers.Authorization.Parameter);
            using var body = JsonDocument.Parse(await request.Content!.ReadAsStringAsync());
            var b = body.RootElement;
            Assert.Equal("100000", b.GetProperty("amount").GetString()); Assert.Equal(Memo, b.GetProperty("content").GetString());
            Assert.Equal("cmwf0n7b20xp301tjzi8z6dpc", b.GetProperty("bankPublicId").GetString());
            Assert.False(b.TryGetProperty("redirectUrl", out _));
            return new(HttpStatusCode.Created) { Content = new StringContent(JsonSerializer.Serialize(new { statusCode = 201,
                data = new { publicId = "APIPAY123", payUrl = "https://pay.apipay.vn/APIPAY123", qrUrl = "https://app.apipay.vn/v1/payment-requests/APIPAY123/qr-image",
                    amount = "100000", content = Memo, bankCode = "MB", accountNumber = "0123", accountName = "TEST", expiresAt = DateTimeOffset.UtcNow.AddMinutes(30) } })) };
        });
        var result = await new ApiPayClient(new HttpClient(handler), Options).CreateAsync(100000, Memo, "Invoice", default);
        Assert.Equal("APIPAY123", result.PublicId); Assert.Equal(Memo, result.Content);
    }

    [Theory]
    [InlineData(401, false)] [InlineData(429, false)] [InlineData(500, true)]
    public async Task ApiErrorsNeverExposeProviderMessageOrCredentials(int status, bool uncertain)
    {
        var client = new ApiPayClient(new HttpClient(new Handler(_ => Task.FromResult(new HttpResponseMessage((HttpStatusCode)status)
        { Content = new StringContent("{\"message\":\"unit-access unit-secret sensitive bank data\"}") }))), Options);
        var error = await Assert.ThrowsAsync<ApiPayException>(() => client.CreateAsync(100000, Memo, "Invoice", default));
        Assert.Equal(uncertain, error.Uncertain); Assert.Equal("provider_rejected", error.Code);
        Assert.DoesNotContain("unit-", error.ToString()); Assert.DoesNotContain("sensitive bank", error.ToString()); Assert.Null(error.InnerException);
    }
    [Fact]
    public async Task NonJsonOrNetworkFailureIsSafeAndNotAutomaticallyRetried()
    {
        var calls = 0;
        var client = new ApiPayClient(new HttpClient(new Handler(_ => { calls++; throw new HttpRequestException("unit-secret"); })), Options);
        var error = await Assert.ThrowsAsync<ApiPayException>(() => client.CreateAsync(100000, Memo, "Invoice", default));
        Assert.True(error.Uncertain); Assert.Equal(1, calls); Assert.DoesNotContain("unit-secret", error.ToString());
        client = new ApiPayClient(new HttpClient(new Handler(_ => Task.FromResult(new HttpResponseMessage(HttpStatusCode.BadGateway) { Content = new StringContent("<html>unit-secret</html>") }))), Options);
        error = await Assert.ThrowsAsync<ApiPayException>(() => client.CreateAsync(100000, Memo, "Invoice", default));
        Assert.DoesNotContain("unit-secret", error.ToString());
    }
    [Theory] [InlineData(0)] [InlineData(300000001)] [InlineData(1.5)]
    public async Task InvalidAmountsNeverReachProvider(decimal amount)
    {
        var calls = 0;
        var client = new ApiPayClient(new HttpClient(new Handler(_ => { calls++; throw new Exception(); })), Options);
        await Assert.ThrowsAsync<ApiPayException>(() => client.CreateAsync(amount, Memo, "Invoice", default)); Assert.Equal(0, calls);
    }
    [Fact]
    public void SignatureUsesOriginalBytesAndRejectsWrongLengthKeyAndWhitespaceChanges()
    {
        var raw = Encoding.UTF8.GetBytes("{ \"event\":\"transaction.in\" }");
        var signature = Sign(raw);
        Assert.True(ApiPayWebhook.Verify(raw, signature, Options.WebhookSecret));
        Assert.True(ApiPayWebhook.Verify(raw, signature.ToLowerInvariant(), Options.WebhookSecret));
        Assert.False(ApiPayWebhook.Verify(raw, signature, "wrong"));
        Assert.False(ApiPayWebhook.Verify(Encoding.UTF8.GetBytes("{\"event\":\"transaction.in\"}"), signature, Options.WebhookSecret));
        foreach (var bad in new[] { null, "", "00", new string('G', 64), "sha256=" + signature }) Assert.False(ApiPayWebhook.Verify(raw, bad, Options.WebhookSecret));
    }
    [Theory]
    [InlineData("url")] [InlineData("amount")] [InlineData("memo")] [InlineData("sandbox")]
    public async Task UnsafeOrMismatchedProviderResponsesAreNotSentToCustomer(string change)
    {
        var client = new ApiPayClient(new HttpClient(new Handler(_ => Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK) {
            Content = new StringContent(JsonSerializer.Serialize(new { data = new {
                publicId = change == "sandbox" ? "test_pr_123" : "APIPAY123",
                payUrl = change == "url" ? "https://pay.apipay.vn.attacker.invalid/" : "https://pay.apipay.vn/APIPAY123",
                qrUrl = "https://app.apipay.vn/v1/payment-requests/APIPAY123/qr-image",
                amount = change == "amount" ? null : "100000", content = change == "memo" ? "OTHER" : Memo,
                bankCode = "MB", accountNumber = "0123", accountName = "TEST", expiresAt = DateTimeOffset.UtcNow.AddMinutes(30)
            } }))
        }))), Options);
        var error = await Assert.ThrowsAsync<ApiPayException>(() => client.CreateAsync(100000, Memo, "Invoice", default));
        Assert.True(error.Uncertain);
    }
    public static string Sign(byte[] raw) => Convert.ToHexString(HMACSHA256.HashData(Encoding.UTF8.GetBytes(Options.WebhookSecret), raw));
    [Fact]
    public async Task InvalidSignatureIsRejectedBeforeParsingAndHttpIsRejected()
    {
        var api = new ApiPayWebhookController(Options, null!) { ControllerContext = new() { HttpContext = new DefaultHttpContext() } };
        api.Request.Scheme = "https"; api.Request.Body = new MemoryStream(Encoding.UTF8.GetBytes("not json"));
        Assert.IsType<UnauthorizedObjectResult>(await api.Receive(default));
        api.Request.Scheme = "http";
        Assert.IsType<BadRequestObjectResult>(await api.Receive(default));
    }
    [Theory] [InlineData("sandbox")] [InlineData("liveTest")]
    public async Task SignedTestEventsNeverTouchDatabase(string flag)
    {
        var raw = Encoding.UTF8.GetBytes("{\"event\":\"transaction.in\",\"" + flag + "\":true,\"data\":{}}");
        var api = new ApiPayWebhookController(Options, null!) { ControllerContext = new() { HttpContext = new DefaultHttpContext() } };
        api.Request.Scheme = "https"; api.Request.Body = new MemoryStream(raw); api.Request.Headers["ApiPay-Signature"] = Sign(raw);
        Assert.IsType<OkObjectResult>(await api.Receive(default));
    }
}
