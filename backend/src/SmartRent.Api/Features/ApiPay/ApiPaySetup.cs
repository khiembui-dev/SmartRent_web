using System.Net;
using Microsoft.AspNetCore.HttpOverrides;

namespace SmartRent.Api.Features.ApiPay;

public static class ApiPaySetup
{
    public static void AddApiPay(IServiceCollection services)
    {
        services.AddSingleton(ApiPayOptions.FromEnvironment());
        services.AddSingleton<ApiPayStore>();
        services.AddHttpClient<IApiPayClient, ApiPayClient>(http => http.Timeout = TimeSpan.FromSeconds(15))
            .ConfigurePrimaryHttpMessageHandler(() => new HttpClientHandler { AllowAutoRedirect = false })
            .RemoveAllLoggers(); // Không log outbound request/response của API có credentials.
        services.AddHostedService<ApiPayWorker>();
        services.Configure<ForwardedHeadersOptions>(o =>
        {
            o.ForwardedHeaders = ForwardedHeaders.XForwardedProto;
            o.ForwardLimit = 1;
            o.KnownIPNetworks.Clear(); o.KnownProxies.Clear();
            // Chỉ tin proxy do chủ server khai báo; không tin X-Forwarded-Proto từ client bất kỳ.
            foreach (var address in (Environment.GetEnvironmentVariable("APIPAY_TRUSTED_PROXIES") ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
                o.KnownProxies.Add(IPAddress.Parse(address));
        });
    }
    public static void UseApiPayProxy(WebApplication app)
    {
        if (!string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("APIPAY_TRUSTED_PROXIES"))) app.UseForwardedHeaders();
        var listener = Environment.GetEnvironmentVariable("APIPAY_WEBHOOK_LISTENER_PORT");
        if (!string.IsNullOrEmpty(listener))
        {
            if (!int.TryParse(listener, out var port) || port is < 1024 or > 65535)
                throw new InvalidOperationException("APIPAY_WEBHOOK_LISTENER_PORT must be a port between 1024 and 65535.");
            // Cổng dành riêng cho tunnel chỉ nhận webhook. Không công khai trang admin, API dữ liệu hay health dev.
            app.Use(async (context, next) =>
            {
                if (context.Connection.LocalPort == port &&
                    (!HttpMethods.IsPost(context.Request.Method) || context.Request.Path != "/api/v1/apipay/webhook" || context.Request.QueryString.HasValue))
                {
                    context.Response.StatusCode = StatusCodes.Status404NotFound;
                    return;
                }
                await next(context);
            });
        }
    }
}

// Inbox đã COMMIT sống qua restart. Worker chạy ngay trong API, không cần Redis hay job server riêng.
public sealed class ApiPayWorker(ApiPayOptions options, ApiPayStore store, ILogger<ApiPayWorker> logger) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        if (!options.Ready) return;
        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var deadline = CancellationTokenSource.CreateLinkedTokenSource(stoppingToken);
                deadline.CancelAfter(TimeSpan.FromSeconds(8));
                if (await store.ProcessOneAsync(deadline.Token)) continue;
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested) { break; }
            catch (Exception)
            {
                // Chỉ log mã cố định; không ghi exception/raw body chứa thông tin giao dịch.
                logger.LogWarning("ApiPay inbox processing deferred; transaction remains pending.");
            }
            try { await Task.Delay(TimeSpan.FromSeconds(3), stoppingToken); }
            catch (OperationCanceledException) { break; }
        }
    }
}
