using Microsoft.AspNetCore.Mvc;
using Npgsql;
using SmartRent.Api.Common;
using SmartRent.Api.Features.Tenants;
namespace SmartRent.Api.Features.Viewings;

[ApiController, Route("api/v1/inquiries")]
public sealed class InquiriesController(NpgsqlDataSource db) : LeasingController(db)
{
    [HttpGet] public async Task<IActionResult> List([FromQuery] string? status, [FromQuery] string? propertyId, [FromQuery] int page = 1, [FromQuery] int pageSize = 50, CancellationToken ct = default) { try { var (c, t, _) = await BeginAsync(true, ct); await using (c) await using (t) { page = Math.Max(1, page); pageSize = Math.Clamp(pageSize, 1, 200); var rows = await JsonRowsAsync(c, t, $"select {ViewingSql.InquiryJson("b")} from bookings b join rooms r on r.id=b.room_id where b.kind='viewing' and (@status='' or (@status='open' and b.status not in ('converted','rejected','cancelled')) or b.status=@status) and (@property='' or r.property_id::text=@property) order by b.created_at desc offset @skip limit @take", ct, P("status", status ?? ""), P("property", propertyId ?? ""), P("skip", (page - 1) * pageSize), P("take", pageSize)); await t.RollbackAsync(ct); return Ok(new { items = rows, page, pageSize }); } } catch (LeaseHttpException e) { return LeaseProblem(e); } catch (PostgresException e) { return DatabaseProblem(e); } }
    [HttpGet("{id:guid}")] public async Task<IActionResult> Get(Guid id, CancellationToken ct) { try { var (c, t, _) = await BeginAsync(true, ct); await using (c) await using (t) { var json = await ScalarStringAsync(c, t, $"select {ViewingSql.InquiryJson("b", true)} from bookings b join rooms r on r.id=b.room_id where b.id=@id and b.kind='viewing'", ct, P("id", id)); await t.RollbackAsync(ct); return json is null ? NotFound() : Content(json, "application/json"); } } catch (LeaseHttpException e) { return LeaseProblem(e); } catch (PostgresException e) { return DatabaseProblem(e); } }
    [HttpPost("{id:guid}/viewings")] public async Task<IActionResult> Schedule(Guid id, [FromBody] ScheduleInput input, CancellationToken ct) { if (input.StartsAt >= input.EndsAt) return BadRequest(new { code = "invalid_time", message = "Thời điểm kết thúc phải sau bắt đầu." }); try { var (c, t, actor) = await BeginAsync(true, ct); await using (c) await using (t) { var appointment = Guid.NewGuid(); var sql = "update bookings set status='scheduled',appointments=(select coalesce(jsonb_agg(case when x->>'status'='scheduled' then jsonb_set(x,'{status}','\"cancelled\"') else x end),'[]') from jsonb_array_elements(appointments) x)||jsonb_build_array(jsonb_build_object('id',@appointment,'startsAt',@start,'endsAt',@end,'hostId',@host,'status','scheduled','resultNotes',null)) where id=@id and kind='viewing' and status not in ('converted','rejected','cancelled') returning " + ViewingSql.InquiryJson("bookings", true); var row = await ScalarStringAsync(c, t, sql, ct, P("id", id), P("appointment", appointment.ToString()), P("start", input.StartsAt), P("end", input.EndsAt), P("host", actor.ToString())); if (row is null) { await t.RollbackAsync(ct); return NotFound(); } await CommitAsync(t, ct); return Content(row, "application/json"); } } catch (LeaseHttpException e) { return LeaseProblem(e); } catch (PostgresException e) { return DatabaseProblem(e); } }
    [HttpPost("{id:guid}/transitions")] public async Task<IActionResult> Transition(Guid id, [FromBody] TransitionInput input, CancellationToken ct) { var target = input.Action switch { "reject" => "rejected", "convert" => "converted", "cancel" => "cancelled", _ => null }; if (target is null) return BadRequest(new { code = "invalid_action", message = "Thao tác không hợp lệ." }); try { var (c, t, actor) = await BeginAsync(true, ct); await using (c) await using (t) { var row = await ScalarStringAsync(c, t, $"update bookings set status=@status,reviewed_by=@actor,reviewed_at=now(),decision_notes=@notes where id=@id and kind='viewing' and status not in ('converted','rejected','cancelled') returning {ViewingSql.InquiryJson("bookings", true)}", ct, P("id", id), P("status", target), P("actor", actor), P("notes", input.Reason ?? "")); if (row is null) { await t.RollbackAsync(ct); return NotFound(); } await CommitAsync(t, ct); return Content(row, "application/json"); } } catch (LeaseHttpException e) { return LeaseProblem(e); } catch (PostgresException e) { return DatabaseProblem(e); } }
    [HttpPost("{id:guid}/tenant")] public async Task<IActionResult> LinkTenant(Guid id, CancellationToken ct) { try { var (c, t, _) = await BeginAsync(true, ct); await using (c) await using (t) { var json = await ScalarStringAsync(c, t, $"select {TenantsController.TenantJson("u")} from bookings b join users u on u.id=b.user_id where b.id=@id and b.kind='viewing'", ct, P("id", id)); await t.RollbackAsync(ct); return json is null ? NotFound() : Ok(new { tenant = System.Text.Json.JsonDocument.Parse(json).RootElement }); } } catch (LeaseHttpException e) { return LeaseProblem(e); } catch (PostgresException e) { return DatabaseProblem(e); } }
}
public sealed record ScheduleInput(DateTimeOffset StartsAt, DateTimeOffset EndsAt); public sealed record TransitionInput(string? Action, string? Reason);

// One booking stores the request, appointments and room hold together.
internal static class ViewingSql
{
    public static string InquiryJson(string b, bool detail = false) => $"""
        jsonb_build_object('id',{b}.id,'code',{b}.code,'tenantId',{b}.user_id,
          'status',{b}.status,'contactName',{b}.contact_name,'phone',{b}.phone,'email',{b}.email,
          'occupants',{b}.occupants,'preferredViewingAt',{b}.preferred_viewing_at,
          'desiredOn',{b}.desired_on,'desiredMoveIn',{b}.desired_on,'message',{b}.message,
          'room',(select jsonb_build_object('id',r.id,'code',r.code,'name',r.name,
            'propertyId',r.property_id,'propertyName',p.name) from rooms r join properties p on p.id=r.property_id where r.id={b}.room_id),
          'nextViewing',(select x from jsonb_array_elements({b}.appointments) x where x->>'status'='scheduled' order by x->>'startsAt' limit 1),
          'appointments',{b}.appointments,'holdStatus',{b}.hold_status,'createdAt',{b}.created_at,
          'history',{b}.history)
        """;
}
