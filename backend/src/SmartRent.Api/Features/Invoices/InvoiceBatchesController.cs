using Microsoft.AspNetCore.Mvc;

namespace SmartRent.Api.Features.Invoices;

// Hóa đơn. Người 4 phụ trách.
// Danh sách API cần viết: backend/HUONG_DAN_THEO_TRANG.md.
[ApiController]
[Route("api/v1/invoice-batches")]
public sealed class InvoiceBatchesController : ControllerBase
{
    private readonly InvoiceBatchService _batchService;
    public InvoiceBatchesController(InvoiceBatchService batchService)
    {
        _batchService = batchService;
    }
    [HttpPost]
    public async Task<IActionResult> CreateBatch(
        [FromBody] CreateInvoiceBatchRequest request,
        [FromHeader(Name = "Idempotency-Key")] string? idempotencyKey,
        CancellationToken cancellationToken = default)
    {
        var result = await _batchService.CreateBatchAsync(request, idempotencyKey, null, cancellationToken);
        return Ok(result);
    }
}
