using Microsoft.AspNetCore.Mvc;
using Npgsql;
using SmartRent.Api.Common;
namespace SmartRent.Api.Features.Viewings;

[ApiController, Route("api/v1/portal/inquiries")]
public sealed class PortalInquiriesController(NpgsqlDataSource db) : LeasingController(db)
{
    [HttpGet]
    public async Task<IActionResult> List(CancellationToken ct)
    {
        try
        {
            var (c, t, actor) = await BeginAsync(false, ct);
            await using (c)
            await using (t)
            {
                var rows = await JsonRowsAsync(c, t, $"select {ViewingSql.InquiryJson("b", true)} || jsonb_build_object('slug',r.listing_slug,'scheduledAt',(select x->>'startsAt' from jsonb_array_elements(b.appointments) x where x->>'status'='scheduled' limit 1),'status',case when b.status='scheduled' then 'viewing' else b.status end) from bookings b join rooms r on r.id=b.room_id where b.kind='viewing' and b.user_id=@user order by b.created_at desc", ct, P("user", actor));
                await t.RollbackAsync(ct);
                return Ok(rows);
            }
        }
        catch (LeaseHttpException e) { return LeaseProblem(e); }
        catch (PostgresException e) { return DatabaseProblem(e); }
    }
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] InquiryInput input, CancellationToken ct)
    {
        try
        {
            var (c, t, actor) = await BeginAsync(false, ct);
            await using (c)
            await using (t)
            {
                await ScalarStringAsync(c, t, "select expire_holds()", ct);
                var roomId = input.RoomId;
                if (roomId is null && input.Slug is not null)
                {
                    var found = await ScalarStringAsync(c, t, "select id::text from v_public_rooms where listing_slug=@slug", ct, P("slug", input.Slug));
                    if (Guid.TryParse(found, out var rid))
                        roomId = rid;
                }
                if (roomId is null)
                    throw new LeaseHttpException(422, "room_required", "Cần phòng đang đăng tin.");
                if (await ScalarStringAsync(c, t, "select id::text from v_room_occupancy where id=@id and occupancy_status='available'", ct, P("id", roomId)) is null)
                    throw new LeaseHttpException(409, "room_unavailable", "Phòng không còn trống.");
                if (input.PreferredViewingAt is DateTimeOffset preferred && preferred <= DateTimeOffset.UtcNow)
                    throw new LeaseHttpException(422, "invalid_preferred_time", "Chọn thời gian xem trong tương lai.");
                var existing = await ScalarStringAsync(c, t, $"select {ViewingSql.InquiryJson("b", true)} from bookings b where b.user_id=@user and b.room_id=@room and b.kind='viewing' and b.status in ('new','accepted','consulting','scheduled') order by b.created_at desc limit 1", ct, P("user", actor), P("room", roomId));
                if (existing is not null)
                {
                    await t.RollbackAsync(ct);
                    return Content(existing, "application/json");
                }
                var profile = await ScalarStringAsync(c, t, "select display_name from users where id=@id", ct, P("id", actor));
                var row = await ScalarStringAsync(c, t, $"""insert into bookings(code,user_id,room_id,kind,status,contact_name,phone,email,occupants,preferred_viewing_at,desired_on,message) select next_code('INQ'),u.id,@room,'viewing','new',coalesce(nullif(@name,''),u.display_name),coalesce(nullif(@phone,''),u.phone),coalesce(nullif(@email,''),u.email),@occupants,@preferred,@desired,@message from users u where u.id=@user returning {ViewingSql.InquiryJson("bookings", true)}""", ct, P("user", actor), P("room", roomId), P("name", input.ContactName ?? ""), P("phone", input.Phone ?? ""), P("email", input.Email ?? ""), P("occupants", Math.Clamp(input.Occupants ?? 1, (short)1, (short)20)), P("preferred", input.PreferredViewingAt), P("desired", input.DesiredOn), P("message", input.Message));
                await CommitAsync(t, ct);
                return Content(row!, "application/json");
            }
        }
        catch (LeaseHttpException e) { return LeaseProblem(e); }
        catch (PostgresException e) { return DatabaseProblem(e); }
    }
}
public sealed record InquiryInput(Guid? RoomId, string? Slug, string? ContactName, string? Phone, string? Email, short? Occupants, DateTimeOffset? PreferredViewingAt, DateOnly? DesiredOn, string? Message);
