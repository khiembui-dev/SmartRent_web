using Microsoft.AspNetCore.Mvc;
using SmartRent.Api.Features.Billing;

namespace SmartRent.Api.Features.Billing;

[ApiController]
[Route("api/v1/billing-periods")]
public sealed class BillingPeriodsController : ControllerBase
{
    private readonly BillingPeriodsService _periodsService;
    private readonly BillingWorksheetService _worksheetService;

    public BillingPeriodsController(
        BillingPeriodsService periodsService,
        BillingWorksheetService worksheetService)
    {
        _periodsService = periodsService;
        _worksheetService = worksheetService;
    }

    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] Guid propertyId,
        [FromQuery] int pageSize = 60,
        CancellationToken cancellationToken = default)
    {
        var result = await _periodsService.ListAsync(propertyId, pageSize, cancellationToken);
        return Ok(result);
    }

    [HttpPost]
    public async Task<IActionResult> Create(
        [FromBody] CreateBillingPeriodRequest request,
        CancellationToken cancellationToken = default)
    {
        var result = await _periodsService.CreateAsync(request, cancellationToken);
        return Ok(result);
    }

    [HttpGet("{id:guid}/worksheet")]
    public async Task<IActionResult> GetWorksheet(
        Guid id,
        CancellationToken cancellationToken = default)
    {
        var result = await _worksheetService.GetAsync(id, cancellationToken);
        return Ok(result);
    }

    [HttpPost("{id:guid}/lock")]
    public async Task<IActionResult> Lock(
        Guid id,
        [FromBody] LockBillingPeriodRequest request,
        CancellationToken cancellationToken = default)
    {
        var result = await _periodsService.LockAsync(id, request, null, cancellationToken);
        return Ok(result);
    }

    [HttpPost("{id:guid}/unlock")]
    public async Task<IActionResult> Unlock(
        Guid id,
        [FromBody] UnlockBillingPeriodRequest request,
        CancellationToken cancellationToken = default)
    {
        var result = await _periodsService.UnlockAsync(id, request, null, cancellationToken);
        return Ok(result);
    }
}