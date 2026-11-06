using Microsoft.AspNetCore.Mvc;

namespace SmartRent.Api.Features.Auth;

[ApiController]
[Route("api/v1/me")]
public sealed class MeController(AuthSessionService sessions) : ControllerBase
{
    [HttpGet]
    public async Task<IActionResult> Get(CancellationToken cancellationToken)
    {
        var user = await sessions.FindUserAsync(
            AuthSessionService.BearerToken(Request), cancellationToken);
        return user is null ? Unauthorized() : Ok(await sessions.MeAsync(user, cancellationToken));
    }
}
