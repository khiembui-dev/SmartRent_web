using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Mvc.Infrastructure;
using Microsoft.Extensions.Options;
using Npgsql;
using SmartRent.Api.Common;
using SmartRent.Api.Common.Errors;
using SmartRent.Api.Features.Tickets;

namespace SmartRent.Api.Features.Chatbot;

/// <summary>Kết quả một lần gọi API hiện có. Data là JSON giống hệt trình duyệt nhận được.</summary>
public sealed record ApiOutcome(int Status, JsonNode? Data, string? Code, string? Detail)
{
    public bool Ok => Status is >= 200 and < 300;
}

/// <summary>
/// Gọi chính các action của controller hiện có, trong cùng process, với HttpContext riêng mang phiên của
/// người đang hỏi. Nhờ vậy công cụ chatbot dùng đúng SQL, view số dư và kiểm tra quyền mà website đang dùng,
/// không có bản sao nghiệp vụ thứ hai. Cách dựng controller giống PortalContractIntegrationTests.
/// </summary>
public sealed class ExistingApi(IServiceProvider services, IOptions<JsonOptions> json, ILogger<ExistingApi> logger)
{
    public async Task<ApiOutcome> GetAsync<TController>(ChatActor actor,
        Func<TController, CancellationToken, Task<IActionResult>> action,
        IReadOnlyDictionary<string, string?>? query, CancellationToken ct)
        where TController : ControllerBase
    {
        var context = new DefaultHttpContext
        {
            RequestServices = services,
            User = actor.ToPrincipal(),
            RequestAborted = ct
        };
        context.Request.Method = HttpMethods.Get;
        // Một số controller (Dashboard, Ticket) tự đọc lại token từ header và kiểm tra trong database.
        context.Request.Headers.Authorization = "Bearer " + actor.Token;
        if (query is not null)
            context.Request.QueryString = QueryString.Create(query.Where(x => !string.IsNullOrEmpty(x.Value))
                .Select(x => new KeyValuePair<string, string?>(x.Key, x.Value)));

        var controller = ActivatorUtilities.CreateInstance<TController>(services);
        controller.ControllerContext = new ControllerContext { HttpContext = context };
        try
        {
            return Convert(await action(controller, ct));
        }
        catch (LeaseHttpException e) { return new ApiOutcome(e.Status, null, e.Code, e.Message); }
        catch (TicketException e) { return new ApiOutcome(e.Status, null, e.Code, e.Message); }
        catch (AppException e) { return new ApiOutcome((int)e.StatusCode, null, e.ErrorCode, e.Message); }
        catch (PostgresException e)
        {
            logger.LogError(e, "Chatbot tool query failed with SQLSTATE {SqlState}", e.SqlState);
            return new ApiOutcome(500, null, "database_error", null);
        }
    }

    private ApiOutcome Convert(IActionResult result)
    {
        switch (result)
        {
            case ContentResult content:
            {
                var status = content.StatusCode ?? 200;
                if (status is < 200 or >= 300)
                    return new ApiOutcome(status, null, "http_" + status, null);
                return new ApiOutcome(status, content.Content is null ? null : JsonNode.Parse(content.Content), null, null);
            }
            case ObjectResult obj:
            {
                var status = obj.StatusCode ?? 200;
                var node = obj.Value is null ? null
                    : JsonSerializer.SerializeToNode(obj.Value, obj.Value.GetType(), json.Value.JsonSerializerOptions);
                if (status is >= 200 and < 300)
                    return new ApiOutcome(status, node, null, null);
                return new ApiOutcome(status, null, node?["code"]?.ToString() ?? "http_" + status,
                    node?["detail"]?.ToString() ?? node?["message"]?.ToString());
            }
            case IStatusCodeActionResult code:
            {
                var status = code.StatusCode ?? 500;
                return new ApiOutcome(status, null, status switch
                {
                    401 => "unauthenticated",
                    403 => "forbidden",
                    404 => "not_found",
                    _ => "http_" + status
                }, null);
            }
            default:
                return new ApiOutcome(500, null, "unsupported_result", null);
        }
    }
}
