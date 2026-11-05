using Microsoft.AspNetCore.Mvc;

namespace SmartRent.Api.Features.Billing;

// Tính tiền phòng. Người 4 phụ trách.
// Danh sách API cần viết: backend/HUONG_DAN_THEO_TRANG.md.
[ApiController]
[Route("api/v1/meter-readings")]
public sealed class MeterReadingsController : ControllerBase
{
    private readonly MeterReadingsService _meterReadingsService;
    public MeterReadingsController(MeterReadingsService meterReadingsService)
    {
        _meterReadingsService = meterReadingsService;
    }
    [HttpPost("batch")]
    public async Task<IActionResult> RecordBatch(
        [FromBody] RecordMeterReadingsBatchRequest request,
        CancellationToken cancellationToken = default)
    {
        var result = await _meterReadingsService.RecordBatchAsync(request, null, cancellationToken);
        return Ok(result);
    }
    [HttpPost("{id:guid}/correct")]
    public async Task<IActionResult> Correct(
        Guid id,
        [FromBody] CorrectMeterReadingRequest request,
        CancellationToken cancellationToken = default)
    {
        var result = await _meterReadingsService.CorrectAsync(id, request, null, cancellationToken);
        return Ok(new { success = result });
    }
}
