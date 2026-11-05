using Microsoft.AspNetCore.Mvc;

namespace SmartRent.Api.Features.Payments;

// Thu tiền, cọc. Người 4 phụ trách.
// Danh sách API cần viết: backend/HUONG_DAN_THEO_TRANG.md.
[ApiController]
[Route("api/v1/payment-allocations")]
public sealed class PaymentAllocationsController : ControllerBase
{
    private readonly PaymentsService _paymentsService;
    public PaymentAllocationsController(PaymentsService paymentsService)
    {
        _paymentsService = paymentsService;
    }
    [HttpPost("{id:guid}/reverse")]
    public async Task<IActionResult> Reverse(Guid id, [FromBody] ReverseAllocationRequest request, CancellationToken cancellationToken)
    {
        var (success, statusCode, error, result) = await _paymentsService.ReverseAllocationAsync(id, request, cancellationToken);
        if (!success)
        {
            return Problem(statusCode: statusCode, detail: error);
        }
        return Ok(result);
    }
}
