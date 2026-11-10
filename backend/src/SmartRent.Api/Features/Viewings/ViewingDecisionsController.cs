using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Mvc;
using Npgsql;
using SmartRent.Api.Common;
using static SmartRent.Api.Common.BusinessData;

namespace SmartRent.Api.Features.Viewings;

public sealed record ViewingDecision(string Action, string? ProposalId = null, DateTimeOffset? StartsAt = null,
    DateTimeOffset? EndsAt = null, string? Reason = null);

[ApiController, Route("api/v1")]
public sealed class ViewingDecisionsController(NpgsqlDataSource db) : LeasingController(db)
{
    [HttpPost("inquiries/{id:guid}/decision")]
    [HttpPost("portal/inquiries/{id:guid}/decision")]
    public async Task<IActionResult> Decide(Guid id, [FromBody] ViewingDecision input, CancellationToken ct)
    {
        try
        {
            var admin = !Request.Path.StartsWithSegments("/api/v1/portal");
            var (c, t, actor) = await BeginAsync(admin, ct);
            await using (c)
            await using (t)
            {
                await ViewingWorkflow.Apply(c, t, id, actor, admin, input, ct);
                var result = await ScalarStringAsync(c, t, $"select {ViewingSql.InquiryJson("b", true)} from bookings b where b.id=@id", ct, P("id", id));
                await CommitAsync(t, ct);
                return Content(result!, "application/json");
            }
        }
        catch (LeaseHttpException e) { return LeaseProblem(e); }
        catch (PostgresException e) when (e.SqlState is "40001" or "40P01")
        { return Conflict(new { code = "viewing_changed", detail = "Lịch vừa thay đổi. Tải lại trước khi xử lý." }); }
        catch (PostgresException e) { return DatabaseProblem(e); }
    }
}

internal static class ViewingWorkflow
{
    public static async Task Apply(NpgsqlConnection c, NpgsqlTransaction t, Guid id, Guid actor, bool admin, ViewingDecision input, CancellationToken ct)
    {
        // Ownership is checked in the locking query, before reading proposal details.
        var b = await Row(c, t, "select to_jsonb(b)::text from bookings b where id=@id and kind='viewing' and (@admin or user_id=@actor) for update", ct,
            "id", id, "admin", admin, "actor", actor);
        if (b.Text("status") is "converted" or "rejected" or "cancelled" or "completed" or "no_show")
            throw new LeaseHttpException(409, "viewing_closed", "Yêu cầu đã kết thúc.");
        var changes = b["changes"]!.AsObject();
        var proposal = changes["viewingProposal"];
        var appointments = b["appointments"]!.AsArray();
        var scheduled = appointments.FirstOrDefault(x => x.Text("status") == "scheduled");
        var role = admin ? "admin" : "user";
        var now = DateTimeOffset.UtcNow;
        var status = b.Text("status")!;
        var reason = input.Reason?.Trim();
        var eventId = Guid.NewGuid().ToString();
        DateTimeOffset? start = null, end = null;

        if (input.Action is not ("accept" or "propose" or "reject" or "cancel"))
            throw Invalid("Thao tác không hợp lệ.");
        if (input.Action is "propose" or "reject" or "cancel" && string.IsNullOrWhiteSpace(reason))
            throw Invalid("Cần ghi lý do để bên còn lại biết.");
        if (reason?.Length > 1000) throw Invalid("Lý do tối đa 1000 ký tự.");
        if (input.Action == "reject" && (!admin || scheduled is not null))
            throw new LeaseHttpException(409, "invalid_decision", "Chỉ quản lý từ chối yêu cầu chưa chốt. Lịch đã chốt cần hủy có lý do.");

        if (input.Action is "accept" or "propose")
        {
            if (input.ProposalId != proposal.Text("id"))
                throw new LeaseHttpException(409, "proposal_changed", "Đề xuất đã thay đổi. Tải lại để xem giờ mới nhất.");
            var room = await Row(c, t, "select to_jsonb(r)::text from rooms r where id=@id for update", ct, "id", b.Id("room_id"));
            var available = await Scalar(c, t, "select id::text from v_room_occupancy where id=@id and occupancy_status='available'", ct, "id", b.Id("room_id"));
            var active = await Scalar(c, t, "select id::text from properties where id=@id and is_active", ct, "id", room.Id("property_id"));
            if (available is null || active is null || room.Text("listing_status") != "published")
                throw new LeaseHttpException(409, "room_unavailable", "Phòng hiện không còn nhận lịch xem.");
            ViewingRules.ValidateOccupants((short)b.Number("occupants"), (int)room.Number("capacity"));
            if (input.Action == "accept")
            {
                if (proposal is null && (!admin || scheduled is not null))
                    throw new LeaseHttpException(409, "no_proposal", "Không có đề xuất đang chờ bạn xác nhận.");
                if (proposal is not null && proposal.Text("byRole") == role)
                    throw new LeaseHttpException(409, "other_party_required", "Cần bên còn lại đồng ý giờ bạn đề xuất.");
                start = DateTimeOffset.Parse(proposal?.Text("startsAt") ?? b.Text("preferred_viewing_at") ?? throw Invalid("Khách cần chọn lại ngày giờ xem."));
                end = proposal is null ? start.Value.AddMinutes(30) : DateTimeOffset.Parse(proposal.Text("endsAt")!);
                ViewingRules.ValidateTime(start, now, end);
                foreach (var old in appointments.Where(x => x.Text("status") == "scheduled")) old!["status"] = "cancelled";
                var host = admin ? actor.ToString() : await Scalar(c, t, "select id::text from users where role='admin' and is_active", ct);
                if (host is null) throw Invalid("Chưa có quản lý nhận lịch.");
                appointments.Add(new JsonObject { ["id"] = Guid.NewGuid().ToString(), ["startsAt"] = start.Value.ToString("O"),
                    ["endsAt"] = end.Value.ToString("O"), ["hostId"] = host, ["status"] = "scheduled", ["resultNotes"] = null });
                changes.Remove("viewingProposal");
                status = "scheduled";
            }
            else
            {
                start = input.StartsAt;
                end = input.EndsAt ?? start?.AddMinutes(30);
                ViewingRules.ValidateTime(start, now, end);
                changes["viewingProposal"] = new JsonObject { ["id"] = eventId, ["byRole"] = role, ["byId"] = actor.ToString(),
                    ["startsAt"] = start!.Value.ToString("O"), ["endsAt"] = end!.Value.ToString("O"), ["reason"] = reason, ["createdAt"] = now.ToString("O") };
                // An existing confirmed appointment remains effective during negotiation.
                if (scheduled is null) status = "consulting";
            }
        }
        else
        {
            foreach (var old in appointments.Where(x => x.Text("status") == "scheduled")) old!["status"] = "cancelled";
            changes.Remove("viewingProposal");
            status = input.Action == "reject" ? "rejected" : "cancelled";
        }

        var history = changes["viewingHistory"] as JsonArray ?? new JsonArray();
        if (changes["viewingHistory"] is null) changes["viewingHistory"] = history;
        history.Add(new JsonObject { ["id"] = eventId, ["action"] = input.Action, ["byRole"] = role, ["actorId"] = actor.ToString(),
            ["at"] = now.ToString("O"), ["reason"] = reason, ["startsAt"] = start?.ToString("O"), ["endsAt"] = end?.ToString("O"),
            ["previousStartsAt"] = scheduled?.Text("startsAt") ?? proposal?.Text("startsAt") ?? b.Text("preferred_viewing_at") });
        await Execute(c, t, "update bookings set status=@status,changes=@changes::jsonb,appointments=@appointments::jsonb,decision_notes=@reason where id=@id", ct,
            "status", status, "changes", changes.ToJsonString(), "appointments", appointments.ToJsonString(), "reason", reason, "id", id);
        var notificationBody = input.Action switch {
            "accept" => "Hai bên đã xác nhận lịch xem phòng.", "propose" => "Có đề xuất giờ xem mới. Mở yêu cầu để đồng ý hoặc đề xuất giờ khác.",
            "reject" => "Quản lý từ chối yêu cầu: " + reason, _ => "Lịch xem đã hủy: " + reason };
        if (admin)
            await Notify(c, t, b.Id("user_id"), id, eventId, notificationBody, "/rooms", ct);
        else
        {
            var owner = await Scalar(c, t, "select id::text from users where role='admin' and is_active", ct);
            if (owner is not null) await Notify(c, t, Guid.Parse(owner), id, eventId, notificationBody, "/admin/viewings?inquiry=" + id, ct);
        }
    }

    private static Task<int> Notify(NpgsqlConnection c, NpgsqlTransaction t, Guid recipient, Guid inquiry, string eventId, string body, string url, CancellationToken ct) =>
        Execute(c, t, "insert into notifications(recipient_id,event_key,title,body,url) values(@recipient,@event,'Lịch xem phòng',@body,@url)", ct,
            "recipient", recipient, "event", $"viewing:{inquiry}:{eventId}", "body", body, "url", url);
}
