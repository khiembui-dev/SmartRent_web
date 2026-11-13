using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SmartRent.Api.Common;
using static SmartRent.Api.Common.BusinessData;

namespace SmartRent.Api.Features.ApiPay;

[ApiController, Authorize(Roles = "user"), Route("api/v1/portal/apipay")]
public sealed class PortalApiPayController(ApiPayOptions options, ApiPayStore store, IApiPayClient client) : ControllerBase
{
    [HttpGet("invoices/{id:guid}/payment-request")]
    public Task<IActionResult> State(Guid id, CancellationToken ct) => Safe(async user => await store.StateAsync(id, user, ct));

    // Không nhận amount, userId, bankPublicId hay URL từ trình duyệt: nguồn là invoice + cấu hình server.
    [HttpPost("invoices/{id:guid}/payment-request")]
    public Task<IActionResult> Create(Guid id, CancellationToken ct) => Safe(async user =>
    {
        if (!options.Ready) throw new LeaseHttpException(503, "payment_unavailable", "Chủ trọ chưa bật thanh toán tự động. Vui lòng liên hệ chủ trọ.");
        var reserved = await store.ReserveAsync(id, user, ct);
        if (reserved is not null)
        {
            // Client đóng tab không hủy thao tác đã gửi tới ApiPay; vẫn cố lưu kết quả để tab sau tái sử dụng.
            using var deadline = new CancellationTokenSource(TimeSpan.FromSeconds(20));
            try
            {
                var checkout = await client.CreateAsync(reserved.Number("amount"), reserved.Text("content")!, "Thanh toán hóa đơn " + reserved.Text("code"), deadline.Token);
                await store.SaveCheckoutAsync(reserved.Id("id"), checkout, deadline.Token);
            }
            catch (ApiPayException e)
            {
                using var save = new CancellationTokenSource(TimeSpan.FromSeconds(3));
                await store.FailedAsync(reserved.Id("id"), e.Uncertain, save.Token);
                throw;
            }
        }
        return await store.StateAsync(id, user, ct);
    });

    private async Task<IActionResult> Safe(Func<Guid, Task<object>> action)
    {
        Response.Headers.CacheControl = "no-store";
        if (!Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out var user)) return Unauthorized();
        try { return Ok(await action(user)); }
        catch (LeaseHttpException e) { return StatusCode(e.Status, new { code = e.Code, detail = e.Message }); }
        catch (ApiPayException e) { return StatusCode(502, new { code = e.Code, detail = e.Message }); }
        catch (Exception e) when (e is Npgsql.NpgsqlException or TimeoutException or OperationCanceledException)
        { return StatusCode(503, new { code = "payment_retry", detail = "Chưa kết nối được dịch vụ thanh toán. Vui lòng kiểm tra lại sau." }); }
    }
}
