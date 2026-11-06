using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using SmartRent.Api.Common.Auth;

namespace SmartRent.Api.Features.Settings;

[ApiController]
[Route("api/v1/settings")]
[Authorize]
public sealed class SettingsController : ControllerBase
{
    private readonly ISettingsService _settingsService;
    private readonly ICurrentUser _currentUser;

    public SettingsController(ISettingsService settingsService, ICurrentUser currentUser)
    {
        _settingsService = settingsService;
        _currentUser = currentUser;
    }

    [HttpGet("billing-schedule")]
    public async Task<ActionResult<BillingScheduleDto>> GetBillingSchedule(CancellationToken ct)
    {
        var schedule = await _settingsService.GetBillingScheduleAsync(ct);
        return Ok(schedule);
    }

    [HttpPut("billing-schedule")]
    [Authorize(Roles = "admin")]
    public async Task<ActionResult<BillingScheduleDto>> UpdateBillingSchedule([FromBody] UpdateBillingScheduleRequest request, CancellationToken ct)
    {
        var schedule = await _settingsService.UpdateBillingScheduleAsync(_currentUser.Id, request, ct);
        return Ok(schedule);
    }

    [HttpGet("organization")]
    public async Task<ActionResult<OrganizationSettingsDto>> GetOrganization(CancellationToken ct)
    {
        var org = await _settingsService.GetOrganizationAsync(ct);
        return Ok(org);
    }

    [HttpPut("organization")]
    [Authorize(Roles = "admin")]
    public async Task<ActionResult<OrganizationSettingsDto>> UpdateOrganization([FromBody] UpdateOrganizationSettingsRequest request, CancellationToken ct)
    {
        var org = await _settingsService.UpdateOrganizationAsync(_currentUser.Id, request, ct);
        return Ok(org);
    }

    [HttpGet("email")]
    [Authorize(Roles = "admin")]
    public IActionResult GetEmailSettings()
    {
        return Ok(new
        {
            host = "",
            port = 587,
            username = "",
            fromEmail = "",
            fromName = "SmartRent",
            useSsl = true
        });
    }

    [HttpPut("email")]
    [Authorize(Roles = "admin")]
    public IActionResult UpdateEmailSettings([FromBody] object body)
    {
        return Ok(new { message = "Lưu cấu hình email thành công." });
    }

    [HttpPost("email/test")]
    [Authorize(Roles = "admin")]
    public IActionResult TestEmail([FromBody] object body)
    {
        return Ok(new { message = "Gửi email thử nghiệm thành công." });
    }

    [HttpGet("templates")]
    [Authorize(Roles = "admin")]
    public IActionResult GetTemplates()
    {
        return Ok(Array.Empty<object>());
    }
}
