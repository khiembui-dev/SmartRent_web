using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Npgsql;
using SmartRent.Api.Common;
using static SmartRent.Api.Common.BusinessData;
namespace SmartRent.Api.Features.Viewings;

[ApiController, Route("api/v1/reservations")]
public sealed class ReservationsController(NpgsqlDataSource db) : BusinessController(db)
{
    [HttpPost("{id:guid}/cancel")]
    public Task<IActionResult> Cancel(Guid id, JsonElement body, CancellationToken ct) => Run(true, async (c, t, a) =>
    {
        var reason = body.String("reason");
        if (string.IsNullOrWhiteSpace(reason))
            throw Invalid("Cần lý do hủy giữ chỗ.");
        if (await Execute(c, t, "update bookings set hold_status='cancelled',hold_reason=@reason where id=@id and kind='viewing' and hold_status='holding'", ct, "id", id, "reason", reason) == 0)
            throw Missing();
        return new
        {
            id,
            status = "cancelled"
        };
    }, ct);
}
