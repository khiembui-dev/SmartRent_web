using Microsoft.AspNetCore.Mvc;

namespace SmartRent.Api.Features.Invoices;

// Hóa đơn. Người 4 phụ trách.
// Danh sách API cần viết: backend/HUONG_DAN_THEO_TRANG.md.
[ApiController]
[Route("api/v1/invoices")]
public sealed class InvoicesController : ControllerBase
{
    private readonly InvoicesService _invoicesService;
    public InvoicesController(InvoicesService invoicesService)
    {
        _invoicesService = invoicesService;
    }
    [HttpGet]
    public async Task<IActionResult> List([FromQuery] InvoiceListQuery query, CancellationToken cancellationToken)
    {
        var result = await _invoicesService.ListAsync(query, cancellationToken);
        return Ok(result);
    }

    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id, CancellationToken cancellationToken)
    {
        var result = await _invoicesService.GetAsync(id, cancellationToken);
        if (result is null)
        {
            return Problem(
                statusCode: StatusCodes.Status404NotFound,
                detail: "Không tìm thấy hóa đơn.");
        }
        return Ok(result);
    }
    [HttpPost("{id:guid}/issue")]
    public async Task<IActionResult> Issue(Guid id, CancellationToken cancellationToken)
    {
        var (success, statusCode, error, result) = await _invoicesService.IssueAsync(id, cancellationToken);
        if (!success)
        {
            return Problem(statusCode: statusCode, detail: error);
        }
        return Ok(result);
    }
    [HttpPost("{id:guid}/recompute")]
    public async Task<IActionResult> Recompute(Guid id, CancellationToken cancellationToken)
    {
        var (success, statusCode, error, result) = await _invoicesService.RecomputeAsync(id, cancellationToken);
        if (!success)
        {
            return Problem(statusCode: statusCode, detail: error);
        }
        return Ok(result);
    }
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> DeleteDraft(Guid id, CancellationToken cancellationToken)
    {
        var (success, statusCode, error) = await _invoicesService.DeleteDraftAsync(id, cancellationToken);
        if (!success)
        {
            return Problem(statusCode: statusCode, detail: error);
        }
        return NoContent();
    }
    [HttpPost("{id:guid}/void")]
    public async Task<IActionResult> Void(Guid id, [FromBody] VoidInvoiceRequest request, CancellationToken cancellationToken)
    {
        var (success, statusCode, error, result) = await _invoicesService.VoidAsync(id, request?.Reason ?? string.Empty, cancellationToken);
        if (!success)
        {
            return Problem(statusCode: statusCode, detail: error);
        }
        return Ok(result);
    }
}
