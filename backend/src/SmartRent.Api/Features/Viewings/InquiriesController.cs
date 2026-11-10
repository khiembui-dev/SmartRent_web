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
    // Direct scheduling would bypass the other party's consent. Use the decision endpoint.
    [HttpPost("{id:guid}/viewings")]
    [Microsoft.AspNetCore.Authorization.Authorize(Roles = "admin")]
    public IActionResult Schedule(Guid id, [FromBody] ScheduleInput input) =>
        Conflict(new { code = "confirmation_required", detail = "Hãy xác nhận giờ khách chọn hoặc đề xuất giờ mới để khách đồng ý." });
    [HttpPost("{id:guid}/transitions")]
    public async Task<IActionResult> Transition(Guid id, [FromBody] TransitionInput input, CancellationToken ct)
    {
        try {
            var (c, t, actor) = await BeginAsync(true, ct);
            await using (c) await using (t) {
                if (input.Action is "cancel" or "reject")
                    await ViewingWorkflow.Apply(c, t, id, actor, true, new ViewingDecision(input.Action, Reason: input.Reason), ct);
                else if (input.Action == "convert") {
                    var row = await ScalarStringAsync(c, t, "update bookings set status='converted' where id=@id and kind='viewing' and status='completed' returning id::text", ct, P("id", id));
                    if (row is null) throw new LeaseHttpException(409,"viewing_not_completed","Cần ghi nhận đã xem trước khi chuyển yêu cầu thành hợp đồng.");
                } else throw new LeaseHttpException(422,"invalid_action","Thao tác không hợp lệ.");
                var json = await ScalarStringAsync(c, t, $"select {ViewingSql.InquiryJson("b", true)} from bookings b where b.id=@id", ct, P("id",id));
                await CommitAsync(t, ct); return Content(json!, "application/json");
            }
        } catch (LeaseHttpException e) { return LeaseProblem(e); }
          catch (PostgresException e) { return DatabaseProblem(e); }
    }
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
          'proposal',{b}.changes->'viewingProposal','negotiationHistory',coalesce({b}.changes->'viewingHistory','[]'::jsonb),
          'decisionNotes',{b}.decision_notes,'slug',(select listing_slug from rooms where id={b}.room_id),
          'scheduledAt',(select a->>'startsAt' from jsonb_array_elements({b}.appointments) a where a->>'status'='scheduled' limit 1),
          'scheduledEndsAt',(select a->>'endsAt' from jsonb_array_elements({b}.appointments) a where a->>'status'='scheduled' limit 1),
          'desiredOn',{b}.desired_on,'desiredMoveIn',{b}.desired_on,'message',{b}.message,
          'room',(select jsonb_build_object('id',r.id,'code',r.code,'name',r.name,
            'propertyId',r.property_id,'propertyName',p.name) from rooms r join properties p on p.id=r.property_id where r.id={b}.room_id),
          'nextViewing',(select x from jsonb_array_elements({b}.appointments) x where x->>'status'='scheduled' order by x->>'startsAt' limit 1),
          'appointments',{b}.appointments,'holdStatus',{b}.hold_status,'createdAt',{b}.created_at,
          'history',{b}.history)
        """;
}
