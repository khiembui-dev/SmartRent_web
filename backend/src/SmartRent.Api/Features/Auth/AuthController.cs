using Microsoft.AspNetCore.Mvc;

namespace SmartRent.Api.Features.Auth;

[ApiController]
[Route("api/v1/auth")]
public sealed class AuthController(AuthSessionService sessions) : ControllerBase
{
    public sealed record LoginRequest(string Email, string Password, string Audience);

    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] LoginRequest request,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrEmpty(request.Password) ||
            request.Audience is not ("admin" or "customer"))
            return BadRequest(new { detail = "Thiếu email, mật khẩu hoặc khu đăng nhập không hợp lệ." });

        var session = await sessions.LoginAsync(request.Email, request.Password,
            request.Audience, cancellationToken);
        if (session is null)
            return Unauthorized(new { detail = "Email hoặc mật khẩu chưa đúng, hoặc tài khoản không thuộc khu này." });

        Response.Cookies.Append("smartrent_refresh", session.AccessToken, new CookieOptions
        {
            HttpOnly = true, Secure = Request.IsHttps, SameSite = SameSiteMode.Strict,
            Path = "/api/v1/auth", Expires = session.ExpiresAt
        });
        return Ok(new { accessToken = session.AccessToken, expiresAt = session.ExpiresAt });
    }

    [HttpPost("refresh")]
    public async Task<IActionResult> Refresh(CancellationToken cancellationToken)
    {
        var token = Request.Cookies["smartrent_refresh"];
        var user = await sessions.FindUserAsync(token, cancellationToken);
        var expiresAt = await sessions.SessionExpiryAsync(token, cancellationToken);
        if (user is null || expiresAt is null) return Unauthorized();
        return Ok(new { accessToken = token, expiresAt });
    }

    [HttpPost("logout")]
    public async Task<IActionResult> Logout(CancellationToken cancellationToken)
    {
        await sessions.RevokeAsync(Request.Cookies["smartrent_refresh"] ??
            AuthSessionService.BearerToken(Request), cancellationToken);
        Response.Cookies.Delete("smartrent_refresh", new CookieOptions { Path = "/api/v1/auth" });
        return NoContent();
    }
}
