using System.Net;
using Microsoft.AspNetCore.Mvc;
using SmartRent.Api.Features.Auth;

namespace SmartRent.Api.Features.Dashboard;

[ApiController]
[Route("api/v1/dashboard")]
public sealed class DashboardController : ControllerBase
{
    // Repository đọc database; environment xác định có đang chạy chế độ phát triển hay không.
    private readonly DashboardRepository _repository;
    private readonly IWebHostEnvironment _environment;
    private readonly AuthSessionService _sessions;

    public DashboardController(
        DashboardRepository repository,
        IWebHostEnvironment environment,
        AuthSessionService sessions)
    {
        _repository = repository;
        _environment = environment;
        _sessions = sessions;
    }

    // Giao diện /admin gọi đúng GET /api/v1/dashboard?month=YYYY-MM&propertyId=UUID.
    // Backend kiểm tra role admin trên mọi request; bộ lọc của frontend không thay thế phân quyền.
    [HttpGet]
    public async Task<IActionResult> GetDashboard(
        [FromQuery] string? month,
        [FromQuery] Guid? propertyId,
        CancellationToken cancellationToken)
    {
        var user = await _sessions.FindUserAsync(
            AuthSessionService.BearerToken(Request), cancellationToken);
        if (user is null) return Unauthorized();
        if (user.Role != "admin") return StatusCode(403);

        var currentMonth = DateOnly.FromDateTime(
            TimeZoneInfo.ConvertTimeFromUtc(DateTime.UtcNow,
                TimeZoneInfo.FindSystemTimeZoneById("Asia/Ho_Chi_Minh")));
        var selected = currentMonth;
        if (month is not null &&
            (!System.Text.RegularExpressions.Regex.IsMatch(month, @"^\d{4}-(0[1-9]|1[0-2])$") ||
             !DateOnly.TryParseExact(month + "-01", "yyyy-MM-dd", out selected)))
            return BadRequest(new { error = "month phải có dạng YYYY-MM." });

        var json = await _repository.GetDashboardAsync(
            new DateOnly(selected.Year, selected.Month, 1), propertyId, cancellationToken);
        return Content(json, "application/json; charset=utf-8");
    }

    // GET /api/v1/dashboard/room-stats-dev?propertyId=<UUID tùy chọn>
    // Đây là endpoint học tập, KHÔNG phải API dashboard hoàn chỉnh hoặc cơ chế phân quyền admin.
    [HttpGet("room-stats-dev")]
    public async Task<ActionResult<RoomStatsDto>> GetRoomStats(
        [FromQuery] Guid? propertyId,
        CancellationToken cancellationToken)
    {
        // Chỉ cho truy cập từ chính máy local khi ASP.NET chạy Development.
        // Khi triển khai API thật cần xác thực và kiểm tra role admin ở backend.
        var address = HttpContext.Connection.RemoteIpAddress;

        if (!_environment.IsDevelopment()
            || address is null
            || !IPAddress.IsLoopback(address))
        {
            return NotFound();
        }

        // Chuyển bộ lọc và tín hiệu hủy đến repository, sau đó trả DTO dưới dạng JSON (HTTP 200).
        var result = await _repository.GetRoomStatsAsync(
            propertyId,
            cancellationToken
        );

        return Ok(result);
    }
}
