using Microsoft.AspNetCore.Mvc;
using Npgsql;
using SmartRent.Api.Common;
namespace SmartRent.Api.Features.Tenants;

[ApiController, Route("api/v1/profile-change-requests")]
public sealed class ProfileChangeRequestsController(NpgsqlDataSource db) : LeasingController(db)
{
    [HttpGet]
    public async Task<IActionResult> List(CancellationToken ct)
    {
        try
        {
            var (c, t, _) = await BeginAsync(true, ct);
            await using (c)
            await using (t)
            {
                var rows = await JsonRowsAsync(c, t, "select jsonb_build_object('id',b.id,'tenantId',b.user_id,'status',b.status,'changes',b.changes,'reason',b.message,'createdAt',b.created_at,'tenant',jsonb_build_object('fullName',u.display_name,'code',u.code)) from bookings b join users u on u.id=b.user_id where b.kind='profile_change' order by b.created_at desc", ct);
                await t.RollbackAsync(ct);
                return Ok(new
                {
                    items = rows
                });
            }
        }
        catch (LeaseHttpException e) { return LeaseProblem(e); }
        catch (PostgresException e) { return DatabaseProblem(e); }
    }
    [HttpPost("{id:guid}/approve")] public Task<IActionResult> Approve(Guid id, [FromBody] ReviewInput input, CancellationToken ct) => Review(id, true, input, ct); [HttpPost("{id:guid}/reject")] public Task<IActionResult> Reject(Guid id, [FromBody] ReviewInput input, CancellationToken ct) => Review(id, false, input, ct);
    private async Task<IActionResult> Review(Guid id, bool approve, ReviewInput input, CancellationToken ct)
    {
        try
        {
            var (c, t, actor) = await BeginAsync(true, ct);
            await using (c)
            await using (t)
            {
                var changed = await ScalarStringAsync(c, t, "select changes::text from bookings where id=@id and kind='profile_change' and status='pending' for update", ct, P("id", id));
                if (changed is null)
                {
                    await t.RollbackAsync(ct);
                    return NotFound();
                }
                if (approve)
                    await ScalarStringAsync(c, t, "update users set phone=case when @changes::jsonb ? 'phone' then nullif(@changes::jsonb->'phone'->>'to','') else phone end,email=case when @changes::jsonb ? 'email' then nullif(@changes::jsonb->'email'->>'to','') else email end where id=(select user_id from bookings where id=@id)", ct, P("id", id), P("changes", changed));
                var status = approve ? "approved" : "rejected";
                await ScalarStringAsync(c, t, "update bookings set status=@status,reviewed_by=@actor,reviewed_at=now(),decision_notes=@notes where id=@id", ct, P("id", id), P("status", status), P("actor", actor), P("notes", input.ReviewNotes ?? "Đã xử lý"));
                await CommitAsync(t, ct);
                return Ok(new
                {
                    id,
                    status
                });
            }
        }
        catch (LeaseHttpException e) { return LeaseProblem(e); }
        catch (PostgresException e) { return DatabaseProblem(e); }
    }
}
public sealed record ReviewInput(string? ReviewNotes);
