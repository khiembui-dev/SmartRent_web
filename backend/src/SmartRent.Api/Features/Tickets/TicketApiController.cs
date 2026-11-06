using Microsoft.AspNetCore.Mvc;
using SmartRent.Api.Features.Auth;

namespace SmartRent.Api.Features.Tickets;

// Dùng chung cho hai khu: xác thực token thật và chuyển lỗi nghiệp vụ thành JSON.
// Các controller kế thừa chỉ cần khai báo route và gọi repository.
public abstract class TicketApiController(AuthSessionService sessions) : ControllerBase
{
    protected AuthSessionService Sessions { get; } = sessions;
    protected async Task<IActionResult> RunAsync(string? role,
        Func<AuthUser, Task<object?>> action, CancellationToken ct)
    {
        var actor = await Sessions.FindUserAsync(AuthSessionService.BearerToken(Request), ct);
        if (actor is null) return Unauthorized();
        if (role is not null && actor.Role != role) return StatusCode(403);
        try { return Ok(await action(actor)); }
        catch (TicketException error)
        {
            return StatusCode(error.Status, new
            {
                code = error.Code, detail = error.Message,
                errors = error.Field is null ? null :
                    new Dictionary<string, string[]> { [error.Field] = [error.Message] }
            });
        }
    }
}
