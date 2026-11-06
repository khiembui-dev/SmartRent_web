using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SmartRent.Api.Common.Auth;
using SmartRent.Api.Common.Errors;

namespace SmartRent.Api.Features.Auth;

[ApiController]
[Route("api/v1/me")]
[Authorize]
public sealed class MeController : ControllerBase
{
    private readonly IAuthService _authService;
    private readonly ICurrentUser _currentUser;

    public MeController(IAuthService authService, ICurrentUser currentUser)
    {
        _authService = authService;
        _currentUser = currentUser;
    }

    [HttpGet]
    public async Task<ActionResult<MeResponse>> GetMe(CancellationToken ct)
    {
        if (!_currentUser.Id.HasValue)
        {
            throw new UnauthorizedException("Phiên làm việc không hợp lệ.");
        }

        var result = await _authService.GetMeAsync(_currentUser.Id.Value, ct);
        return Ok(result);
    }

    [HttpPut("profile")]
    public async Task<ActionResult<MeResponse>> UpdateProfile([FromBody] UpdateProfileRequest req, CancellationToken ct)
    {
        if (!_currentUser.Id.HasValue)
        {
            throw new UnauthorizedException("Phiên làm việc không hợp lệ.");
        }

        await _authService.UpdateProfileAsync(_currentUser.Id.Value, req, ct);
        var me = await _authService.GetMeAsync(_currentUser.Id.Value, ct);
        return Ok(me);
    }

    [HttpPost("change-password")]
    public async Task<IActionResult> ChangePassword([FromBody] ChangePasswordRequest req, CancellationToken ct)
    {
        if (!_currentUser.Id.HasValue)
        {
            throw new UnauthorizedException("Phiên làm việc không hợp lệ.");
        }

        await _authService.ChangePasswordAsync(_currentUser.Id.Value, req, ct);
        return Ok(new { message = "Đổi mật khẩu thành công." });
    }

    [HttpGet("sessions")]
    public async Task<ActionResult<List<SessionDto>>> GetSessions(CancellationToken ct)
    {
        if (!_currentUser.Id.HasValue)
        {
            throw new UnauthorizedException("Phiên làm việc không hợp lệ.");
        }

        var sessions = await _authService.GetSessionsAsync(_currentUser.Id.Value, ct);
        return Ok(sessions);
    }

    [HttpDelete("sessions/{id:guid}")]
    public async Task<IActionResult> RevokeSession(Guid id, CancellationToken ct)
    {
        if (!_currentUser.Id.HasValue)
        {
            throw new UnauthorizedException("Phiên làm việc không hợp lệ.");
        }

        await _authService.RevokeSessionAsync(_currentUser.Id.Value, id, ct);
        return Ok(new { message = "Đã thu hồi phiên đăng nhập." });
    }
}
