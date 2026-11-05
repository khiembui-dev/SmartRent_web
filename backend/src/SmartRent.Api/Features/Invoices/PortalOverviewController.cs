using System;
using System.Security.Claims;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;

namespace SmartRent.Api.Features.Invoices;

// Hóa đơn, phần khách thuê. Người 4 phụ trách.
// Danh sách API cần viết: backend/HUONG_DAN_THEO_TRANG.md.
[ApiController]
[Route("api/v1/portal/overview")]
public sealed class PortalOverviewController : ControllerBase
{
    private readonly PortalOverviewService _portalOverviewService;
    public PortalOverviewController(PortalOverviewService portalOverviewService)
    {
        _portalOverviewService = portalOverviewService;
    }
    [HttpGet]
    public async Task<IActionResult> Get(CancellationToken cancellationToken)
    {
        Guid? currentUserId = null;
        var sub = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (Guid.TryParse(sub, out var parsed))
        {
            currentUserId = parsed;
        }
        var result = await _portalOverviewService.GetOverviewAsync(currentUserId, cancellationToken);
        return Ok(result);
    }
}
