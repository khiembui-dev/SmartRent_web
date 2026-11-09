using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Npgsql;
using SmartRent.Api.Common;
namespace SmartRent.Api.Features.Payments;

[ApiController, Route("api/v1/payment-allocations")]
public sealed class PaymentAllocationsController(NpgsqlDataSource db) : BusinessController(db)
{
    [HttpPost("{id:guid}/reverse")] public Task<IActionResult> Reverse(Guid id, JsonElement body, CancellationToken ct) => Run(true, async (c, t, a) => await PaymentsController.ReverseReceipt(c, t, a, id, body.String("reason"), ct), ct);
}
