using Microsoft.AspNetCore.Mvc;
using Npgsql;
using SmartRent.Api.Common;
namespace SmartRent.Api.Features.Tenants;

[ApiController, Route("api/v1/portal")]
public sealed class PortalProfileController(NpgsqlDataSource db) : LeasingController(db)
{
    [HttpGet("profile")]
    public async Task<IActionResult> Profile(CancellationToken ct)
    {
        try
        {
            var (c, t, actor) = await BeginAsync(false, ct);
            await using (c)
            await using (t)
            {
                var json = await ScalarStringAsync(c, t, $"select jsonb_build_object('profiles',jsonb_build_array({TenantsController.TenantJson("u", true)}),'changeRequests',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'status',b.status,'changes',b.changes,'createdAt',b.created_at) order by b.created_at desc) from bookings b where b.user_id=u.id and b.kind='profile_change'),'[]')) from users u where u.id=@id and u.role='user'", ct, P("id", actor));
                await t.RollbackAsync(ct);
                return json is null ? NotFound() : Content(json, "application/json");
            }
        }
        catch (LeaseHttpException e) { return LeaseProblem(e); }
        catch (PostgresException e) { return DatabaseProblem(e); }
    }
    // Chấp nhận đúng cấu trúc form changes.phone/email; snapshot from/to lấy từ SQL.
    [HttpPost("profile-change-requests")]
    public async Task<IActionResult> CreateRequest([FromBody] System.Text.Json.JsonElement body, CancellationToken ct)
    {
        try
        {
            var (c, t, actor) = await BeginAsync(false, ct);
            await using (c)
            await using (t)
            {
                var profile = await SmartRent.Api.Common.BusinessData.Row(c, t, "select to_jsonb(u)::text from users u where id=@id", ct, "id", actor);
                var changes = new System.Text.Json.Nodes.JsonObject();
                if (body.TryGetProperty("changes", out var input))
                foreach (var prop in input.EnumerateObject())
                {
                    if (prop.Name is not ("phone" or "email"))
                        throw SmartRent.Api.Common.BusinessData.Invalid("Chỉ được đề nghị sửa email hoặc điện thoại.");
                    var value = prop.Value.ValueKind == System.Text.Json.JsonValueKind.Object ? prop.Value.GetProperty("to").GetString() : prop.Value.GetString();
                    var old = profile[prop.Name]?.GetValue<string>();
                    if (value == old)
                        continue;
                    if (prop.Name == "email" && !System.Net.Mail.MailAddress.TryCreate(value, out _))
                        throw SmartRent.Api.Common.BusinessData.Invalid("Email không hợp lệ.");
                    changes[prop.Name] = new System.Text.Json.Nodes.JsonObject { ["from"] = old, ["to"] = value };
                }
                if (changes.Count == 0)
                    throw SmartRent.Api.Common.BusinessData.Invalid("Chưa có thông tin thay đổi.");
                var json = await ScalarStringAsync(c, t, "insert into bookings(code,user_id,kind,status,changes,message) values(next_code('PCR'),@user,'profile_change','pending',@changes::jsonb,@reason) returning jsonb_build_object('id',id,'status',status,'changes',changes,'createdAt',created_at)::text", ct, P("user", actor), P("changes", changes.ToJsonString()), P("reason", body.String("reason")));
                await CommitAsync(t, ct);
                return Content(json!, "application/json");
            }
        }
        catch (LeaseHttpException e) { return LeaseProblem(e); }
        catch (PostgresException e) { return DatabaseProblem(e); }
    }
    [HttpPost("profile-change-requests/{id:guid}/cancel")]
    public async Task<IActionResult> Cancel(Guid id, CancellationToken ct)
    {
        try
        {
            var (c, t, actor) = await BeginAsync(false, ct);
            await using (c)
            await using (t)
            {
                var changed = await ScalarStringAsync(c, t, "update bookings set status='cancelled' where id=@id and user_id=@user and kind='profile_change' and status='pending' returning id::text", ct, P("id", id), P("user", actor));
                if (changed is null)
                {
                    await t.RollbackAsync(ct);
                    return NotFound();
                }
                await CommitAsync(t, ct);
                return NoContent();
            }
        }
        catch (LeaseHttpException e) { return LeaseProblem(e); }
        catch (PostgresException e) { return DatabaseProblem(e); }
    }
}
public sealed record ProfileChangeInput(Dictionary<string, ProfileValue>? Changes, string? Reason, string? TenantId); public sealed record ProfileValue(string? From, string? To);
