using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;

namespace SmartRent.Api.Features.Auth;

[ApiController]
[Route("api/v1/auth")]
public sealed class AuthController : ControllerBase
{
    private readonly IAuthService _authService;

    public AuthController(IAuthService _authService)
    {
        this._authService = _authService;
    }

    [HttpPost("login")]
    [AllowAnonymous]
    public async Task<ActionResult<LoginResponse>> Login([FromBody] LoginRequest req, CancellationToken ct)
    {
        var ip = HttpContext.Connection.RemoteIpAddress?.ToString();
        var userAgent = Request.Headers.UserAgent.ToString();

        var result = await _authService.LoginAsync(req, ip, userAgent, ct);

        // Đặt refresh token vào HttpOnly cookie theo chuẩn bảo mật
        Response.Cookies.Append("smartrent_refresh", result.RefreshToken, new CookieOptions
        {
            HttpOnly = true,
            Secure = Request.IsHttps,
            SameSite = SameSiteMode.Strict,
            Path = "/api/v1/auth",
            Expires = result.ExpiresAt
        });

        return Ok(result);
    }

    [HttpPost("register")]
    [AllowAnonymous]
    public async Task<ActionResult<LoginResponse>> Register([FromBody] RegisterRequest req, CancellationToken ct)
    {
        var ip = HttpContext.Connection.RemoteIpAddress?.ToString();
        var userAgent = Request.Headers.UserAgent.ToString();

        var result = await _authService.RegisterAsync(req, ip, userAgent, ct);

        Response.Cookies.Append("smartrent_refresh", result.RefreshToken, new CookieOptions
        {
            HttpOnly = true,
            Secure = Request.IsHttps,
            SameSite = SameSiteMode.Strict,
            Path = "/api/v1/auth",
            Expires = result.ExpiresAt
        });

        return Ok(result);
    }

    [HttpPost("refresh")]
    [AllowAnonymous]
    public async Task<ActionResult<LoginResponse>> Refresh([FromBody] RefreshTokenRequest? req, CancellationToken ct)
    {
        var refreshToken = req?.RefreshToken ?? Request.Cookies["smartrent_refresh"];
        var result = await _authService.RefreshTokenAsync(refreshToken ?? string.Empty, ct);
        return Ok(result);
    }

    [HttpPost("logout")]
    [Authorize]
    public async Task<IActionResult> Logout(CancellationToken ct)
    {
        var refreshToken = Request.Cookies["smartrent_refresh"] ?? AuthSessionService.BearerToken(Request);
        await _authService.LogoutAsync(refreshToken, ct);

        Response.Cookies.Delete("smartrent_refresh", new CookieOptions
        {
            Path = "/api/v1/auth"
        });

        return Ok(new
        {
            message = "Đăng xuất thành công."
        });
    }

    [HttpPost("forgot-password")]
    [AllowAnonymous]
    public async Task<IActionResult> ForgotPassword([FromBody] ForgotPasswordRequest req, CancellationToken ct)
    {
        await _authService.ForgotPasswordAsync(req, ct);
        return Ok(new
        {
            message = "Nếu email tồn tại trên hệ thống, hướng dẫn đặt lại mật khẩu đã được gửi."
        });
    }

    [HttpPost("reset-password")]
    [AllowAnonymous]
    public async Task<IActionResult> ResetPassword([FromBody] ResetPasswordRequest req, CancellationToken ct)
    {
        await _authService.ResetPasswordAsync(req, ct);
        return Ok(new
        {
            message = "Đặt lại mật khẩu thành công. Vui lòng đăng nhập bằng mật khẩu mới."
        });
    }
}
