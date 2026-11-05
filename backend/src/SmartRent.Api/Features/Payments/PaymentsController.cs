using Microsoft.AspNetCore.Mvc;

namespace SmartRent.Api.Features.Payments;

// Thu tiền, cọc. Người 4 phụ trách.
// Danh sách API cần viết: backend/HUONG_DAN_THEO_TRANG.md.
[ApiController]
[Route("api/v1/payments")]
public sealed class PaymentsController : ControllerBase
{
    private readonly PaymentsService _paymentsService;
    public PaymentsController(PaymentsService paymentsService)
    {
        _paymentsService = paymentsService;
    }
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] CreatePaymentRequest request, CancellationToken cancellationToken)
    {
        var (success, statusCode, error, result) = await _paymentsService.CreatePaymentAsync(request, cancellationToken);
        if (!success)
        {
            return Problem(statusCode: statusCode, detail: error);
        }
        return Ok(result);
    }
    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id, CancellationToken cancellationToken)
    {
        var result = await _paymentsService.GetPaymentByIdAsync(id, cancellationToken);
        if (result is null)
        {
            return Problem(statusCode: StatusCodes.Status404NotFound, detail: "Không tìm thấy phiếu thu.");
        }
        return Ok(result);
    }
    [HttpPost("{id:guid}/confirm")]
    public async Task<IActionResult> Confirm(Guid id, [FromBody] ConfirmPaymentRequest request, CancellationToken cancellationToken)
    {
        var (success, statusCode, error, result) = await _paymentsService.ConfirmPaymentAsync(id, request, cancellationToken);
        if (!success)
        {
            return Problem(statusCode: statusCode, detail: error);
        }
        return Ok(result);
    }
    [HttpPost("{id:guid}/reject")]
    public async Task<IActionResult> Reject(Guid id, [FromBody] RejectPaymentRequest request, CancellationToken cancellationToken)
    {
        var (success, statusCode, error, result) = await _paymentsService.RejectPaymentAsync(id, request, cancellationToken);
        if (!success)
        {
            return Problem(statusCode: statusCode, detail: error);
        }
        return Ok(result);
    }
}
