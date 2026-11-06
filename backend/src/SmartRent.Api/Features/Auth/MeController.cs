using Microsoft.AspNetCore.Mvc;
using Npgsql;
using SmartRent.Api.Common;

namespace SmartRent.Api.Features.Auth;

[ApiController]
[Route("api/v1/me")]
public sealed class MeController(NpgsqlDataSource db) : LeasingController(db)
{
    [HttpGet]
    public async Task<IActionResult> Get(CancellationToken ct)
    {
        if (!TryActor(out var actor, out _)) return Unauthorized(new { code = "unauthenticated", message = "Cần đăng nhập." });
        await using var c = await Db.OpenConnectionAsync(ct); await using var command = new NpgsqlCommand("select jsonb_build_object('user',jsonb_build_object('id',u.id,'role',u.role,'displayName',u.display_name,'email',u.email,'phone',u.phone),'organizations','[]'::jsonb,'tenantProfiles',case when u.role='user' then jsonb_build_array(jsonb_build_object('tenantId',u.id,'fullName',u.display_name,'tenancies',coalesce((select jsonb_agg(jsonb_build_object('tenancyId',x.id,'status',x.status)) from contracts x where x.user_id=u.id),'[]'::jsonb))) else '[]'::jsonb end)::text from users u where u.id=@id", c); command.Parameters.AddWithValue("id", actor); var json = await command.ExecuteScalarAsync(ct) as string; return json is null ? NotFound() : Content(json, "application/json");
    }
}
