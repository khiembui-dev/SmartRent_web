using Microsoft.AspNetCore.Mvc;
using Npgsql;
using SmartRent.Api.Common;
namespace SmartRent.Api.Features.Contracts;

[ApiController, Route("api/v1/tenancy-requests")]
public sealed class TenancyRequestsController(NpgsqlDataSource db) : LeasingController(db)
{
    [HttpGet] public async Task<IActionResult> List(CancellationToken ct) { try { var (c, t, _) = await BeginAsync(true, ct); await using (c) await using (t) { var rows = await JsonRowsAsync(c, t, "select jsonb_build_object('id',b.id,'tenancyId',b.contract_id,'tenantId',b.user_id,'requestType',b.kind,'status',b.status,'desiredOn',b.desired_on,'message',b.message,'decisionNotes',b.decision_notes,'createdAt',b.created_at) from bookings b where b.kind in ('renewal','checkout','transfer') order by b.created_at desc", ct); await t.RollbackAsync(ct); return Ok(new { items = rows }); } } catch (LeaseHttpException e) { return LeaseProblem(e); } catch (PostgresException e) { return DatabaseProblem(e); } }
    [HttpPost("{id:guid}/approve")] public Task<IActionResult> Approve(Guid id, [FromBody] Decision body, CancellationToken ct) => Update(id, "approved", body, ct); [HttpPost("{id:guid}/reject")] public Task<IActionResult> Reject(Guid id, [FromBody] Decision body, CancellationToken ct) => Update(id, "rejected", body, ct);
    private async Task<IActionResult> Update(Guid id, string status, Decision body, CancellationToken ct) { try { var (c, t, actor) = await BeginAsync(true, ct); await using (c) await using (t) { var x = await ScalarStringAsync(c, t, "update bookings set status=@status,reviewed_by=@actor,reviewed_at=now(),decision_notes=@notes where id=@id and kind in ('renewal','checkout','transfer') and status='pending' returning id::text", ct, P("id", id), P("status", status), P("actor", actor), P("notes", body.DecisionNotes ?? "Đã xử lý")); if (x is null) { await t.RollbackAsync(ct); return NotFound(); } await CommitAsync(t, ct); return Ok(new { id, status }); } } catch (LeaseHttpException e) { return LeaseProblem(e); } catch (PostgresException e) { return DatabaseProblem(e); } }
}
public sealed record Decision(string? DecisionNotes);
