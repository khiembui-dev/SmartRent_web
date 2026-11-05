using System;
using System.Security.Claims;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;

namespace SmartRent.Api.Features.Invoices;

// Hóa đơn, phần khách thuê. Người 4 phụ trách.
// Danh sách API cần viết: backend/HUONG_DAN_THEO_TRANG.md.
[ApiController]
[Route("api/v1/portal/invoices")]
public sealed class PortalInvoicesController : ControllerBase
{
    private readonly PortalInvoicesService _portalInvoicesService;
    public PortalInvoicesController(PortalInvoicesService portalInvoicesService)
    {
        _portalInvoicesService = portalInvoicesService;
    }
    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] PortalInvoiceListQuery query,
        CancellationToken cancellationToken)
    {
        Guid? currentUserId = null;
        var sub = User.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        if (Guid.TryParse(sub, out var parsed))
        {
            currentUserId = parsed;
        }
        var result = await _portalInvoicesService.ListAsync(currentUserId, query, cancellationToken);
        return Ok(result);
    }
}
