using System.Text.Json;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Npgsql;
using SmartRent.Api.Common;

namespace SmartRent.Api.Features.Tenants;

/// <summary>Hồ sơ khách là users.role='user'; không tạo bảng tenants riêng.</summary>
[ApiController]
[Route("api/v1/tenants")]
public sealed class TenantsController(NpgsqlDataSource db, SmartRent.Api.Features.Auth.AccountEmail emailDelivery) : LeasingController(db)
{
    private static readonly PasswordHasher<object> Passwords = new();
    [HttpGet]
    public async Task<IActionResult> List([FromQuery] string? q, [FromQuery] int page = 1, [FromQuery] int pageSize = 30, CancellationToken ct = default)
    {
        try
        {
            var (c, t, _) = await BeginAsync(true, ct);
            await using (c)
            await using (t)
            {
                var property = Request.Query["propertyId"].ToString();
                var residence = Request.Query["residenceStatus"].ToString();
                var portal = Request.Query["portal"].ToString();
                // Lọc trên toàn bộ SQL trước khi phân trang; không chỉ lọc 20 khách đầu ở trình duyệt.
                var eligibleOnly = Request.Query["availableForContract"] == "true";
                var rows = await SmartRent.Api.Common.BusinessData.Rows(c, t, $"""
                    select {TenantJson("u")} from users u where u.role='user'
                    and (not @eligible or (u.is_active and not exists (
                      select 1 from contracts c where c.status in ('active','planned')
                      and (c.user_id=u.id or exists(select 1 from jsonb_array_elements(c.occupants) x
                        where x->>'userId'=u.id::text and x->>'leftOn' is null)))))
                    order by u.created_at desc,u.id
                    """, ct, "eligible", eligibleOnly);
                if (property != "")
                {
                    var members = await SmartRent.Api.Common.BusinessData.Rows(c, t, "select jsonb_build_object('id',c.user_id,'occupants',c.occupants)::text from contracts c join rooms r on r.id=c.room_id where r.property_id::text=@p and c.status in ('active','planned')", ct, "p", property);
                    rows = rows.Where(r => members.Any(m => m["id"]!.ToString() == r["id"]!.ToString() || m["occupants"]!.AsArray().Any(x => x?["userId"]?.ToString() == r["id"]!.ToString() && x?["leftOn"] is null))).ToList();
                }
                // Tìm trên giá trị thật, không trên JSON đã escape Unicode (\uXXXX).
                // Nhờ vậy tên có dấu hoặc không dấu đều tìm được, kể cả ngoài trang đầu.
                var query = SearchText.Fold(q?.Trim());
                rows = rows.Where(r => (query.Length == 0 || new[] { "code", "fullName", "phone", "email" }.Any(key => SearchText.Fold(r[key]?.ToString()).Contains(query))) && (residence == "" || r["residenceStatus"]!.ToString() == residence) && (portal == "" || r["hasPortalAccount"]!.GetValue<bool>() == (portal == "yes"))
                    && (Request.Query["debt"] != "outstanding" || r["outstandingAmount"]!.GetValue<decimal>() > 0) && (Request.Query["profileRequests"] != "pending" || r["hasPendingProfileRequest"]!.GetValue<bool>())).ToList();
                await t.RollbackAsync(ct);
                return Ok(SmartRent.Api.Common.BusinessData.Page(rows, page, pageSize));
            }
        }
        catch (LeaseHttpException e) { return LeaseProblem(e); }
        catch (PostgresException e) { return DatabaseProblem(e); }
    }
    [HttpGet("{tenantId:guid}")]
    public async Task<IActionResult> Get(Guid tenantId, CancellationToken ct)
    {
        try
        {
            var (c, t, _) = await BeginAsync(true, ct);
            await using (c)
            await using (t)
            {
                var json = await ScalarStringAsync(c, t, $"select {TenantJson("u", true)} from users u where u.id=@id and u.role='user'", ct, P("id", tenantId));
                await t.RollbackAsync(ct);
                return json is null ? NotFound() : Content(json, "application/json");
            }
        }
        catch (LeaseHttpException e) { return LeaseProblem(e); }
        catch (PostgresException e) { return DatabaseProblem(e); }
    }
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] TenantInput input, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(input.FullName))
            return BadRequest(new
            {
                code = "full_name_required",
                message = "Cần nhập họ tên."
            });
        try
        {
            var (c, t, _) = await BeginAsync(true, ct);
            await using (c)
            await using (t)
            {
                var duplicate = await ScalarStringAsync(c, t, "select id::text from users where role='user' and ((@phone<>'' and phone=@phone) or (@email<>'' and lower(btrim(email))=lower(@email))) limit 1", ct, P("phone", input.Phone?.Trim() ?? ""), P("email", input.Email?.Trim() ?? ""));
                if (duplicate is not null && !input.ConfirmDuplicate)
                    throw new LeaseHttpException(409, "possible_duplicate_tenant", "Số điện thoại hoặc email đã có hồ sơ khách.");
                var json = await ScalarStringAsync(c, t, $"""insert into users(code,display_name,email,phone,date_of_birth,address_line,locality,province,emergency_contact_name,emergency_contact_phone,notes,identity_documents) values(next_code('TEN'),@name,nullif(@email,''),nullif(@phone,''),@dob,nullif(@address,''),nullif(@locality,''),nullif(@province,''),nullif(@emergencyName,''),nullif(@emergencyPhone,''),nullif(@notes,''),'[]') returning {TenantJson("users")}""", ct, P("name", input.FullName.Trim()), P("email", input.Email?.Trim() ?? ""), P("phone", input.Phone?.Trim() ?? ""), P("dob", input.DateOfBirth), P("address", input.AddressLine?.Trim() ?? ""), P("locality", input.Locality?.Trim() ?? ""), P("province", input.Province?.Trim() ?? ""), P("emergencyName", input.EmergencyContactName?.Trim() ?? ""), P("emergencyPhone", input.EmergencyContactPhone?.Trim() ?? ""), P("notes", input.Notes?.Trim() ?? ""));
                await CommitAsync(t, ct);
                return Created($"api/v1/tenants/{JsonDocument.Parse(json!).RootElement.GetProperty("id").GetString()}", JsonDocument.Parse(json!).RootElement);
            }
        }
        catch (LeaseHttpException e) { return LeaseProblem(e); }
        catch (PostgresException e) { return DatabaseProblem(e); }
    }
    [HttpPut("{tenantId:guid}")]
    public async Task<IActionResult> Update(Guid tenantId, [FromBody] TenantInput input, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(input.FullName))
            return BadRequest(new
            {
                code = "full_name_required",
                message = "Cần nhập họ tên."
            });
        try
        {
            var (c, t, _) = await BeginAsync(true, ct);
            await using (c)
            await using (t)
            {
                var json = await ScalarStringAsync(c, t, $"""update users set display_name=@name,email=nullif(@email,''),phone=nullif(@phone,''),date_of_birth=@dob,address_line=nullif(@address,''),locality=nullif(@locality,''),province=nullif(@province,''),emergency_contact_name=nullif(@emergencyName,''),emergency_contact_phone=nullif(@emergencyPhone,''),notes=nullif(@notes,'') where id=@id and role='user' returning {TenantJson("users")}""", ct, P("id", tenantId), P("name", input.FullName.Trim()), P("email", input.Email?.Trim() ?? ""), P("phone", input.Phone?.Trim() ?? ""), P("dob", input.DateOfBirth), P("address", input.AddressLine?.Trim() ?? ""), P("locality", input.Locality?.Trim() ?? ""), P("province", input.Province?.Trim() ?? ""), P("emergencyName", input.EmergencyContactName?.Trim() ?? ""), P("emergencyPhone", input.EmergencyContactPhone?.Trim() ?? ""), P("notes", input.Notes?.Trim() ?? ""));
                if (json is null)
                {
                    await t.RollbackAsync(ct);
                    return NotFound();
                }
                await CommitAsync(t, ct);
                return Content(json, "application/json");
            }
        }
        catch (LeaseHttpException e) { return LeaseProblem(e); }
        catch (PostgresException e) { return DatabaseProblem(e); }
    }
    [HttpPost("{tenantId:guid}/password")]
    public async Task<IActionResult> SetPassword(Guid tenantId, [FromBody] PasswordInput input, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(input.NewPassword) || input.NewPassword.Length < 8)
            return BadRequest(new
            {
                code = "weak_password",
                message = "Mật khẩu cần ít nhất 8 ký tự."
            });
        try
        {
            var (c, t, _) = await BeginAsync(true, ct);
            await using (c)
            await using (t)
            {
                var hash = Passwords.HashPassword(new object(), input.NewPassword);
                var json = await ScalarStringAsync(c, t, $"update users set password_hash=@hash,login_enabled=(email is not null) where id=@id and role='user' returning {TenantJson("users")}", ct, P("id", tenantId), P("hash", hash));
                if (json is null)
                {
                    await t.RollbackAsync(ct);
                    return NotFound();
                }
                await CommitAsync(t, ct);
                return Content(json, "application/json");
            }
        }
        catch (LeaseHttpException e) { return LeaseProblem(e); }
        catch (PostgresException e) { return DatabaseProblem(e); }
    }
    [HttpPost("{tenantId:guid}/portal-invitation")]
    public async Task<IActionResult> Invite(Guid tenantId, CancellationToken ct)
    {
        try
        {
            var (c, t, _) = await BeginAsync(true, ct);
            await using (c)
            await using (t)
            {
                var email = await ScalarStringAsync(c, t, "select email from users where id=@id and role='user' and is_active", ct, P("id", tenantId));
                if (string.IsNullOrWhiteSpace(email))
                    throw new LeaseHttpException(422, "email_required", "Khách cần có email trước khi mời.");
                var token = Convert.ToHexString(System.Security.Cryptography.RandomNumberGenerator.GetBytes(32)).ToLowerInvariant();
                await ScalarStringAsync(c, t, "insert into auth_tokens(user_id,kind,token_hash,expires_at) values(@id,'password_reset',@hash,now()+interval '1 day') returning id::text", ct, P("id", tenantId), P("hash", TokenAuthenticationHandler.TokenHash(token)));
                await CommitAsync(t, ct);
                await emailDelivery.SendReset(email, token, false, ct);
                return Ok(new
                {
                    toEmail = email,
                    delivery = "email",
                    expiresInDays = 1
                });
            }
        }
        catch (LeaseHttpException e) { return LeaseProblem(e); }
        catch (PostgresException e) { return DatabaseProblem(e); }
    }
    [HttpGet("duplicates")] public Task<IActionResult> Duplicates([FromQuery] string? phone, [FromQuery] string? email, CancellationToken ct) => List(phone ?? email, 1, 20, ct);
    // Read projection matches the existing frontend without introducing a tenants table.
    internal static string TenantJson(string u, bool detail = false) => $"""
        jsonb_build_object('id',{u}.id,'tenantId',{u}.id,'code',{u}.code,'fullName',{u}.display_name,
          'phone',{u}.phone,'email',{u}.email,'isActive',{u}.is_active,'loginEnabled',{u}.login_enabled,
          'hasPortalAccount',{u}.login_enabled,'dateOfBirth',{u}.date_of_birth,
          'account',case when {u}.login_enabled then jsonb_build_object('email',{u}.email,'isActive',{u}.is_active,'lastLoginAt',{u}.last_login_at) else null end,
          'address',jsonb_build_object('line',{u}.address_line,'locality',{u}.locality,'province',{u}.province),
          'emergencyContactName',{u}.emergency_contact_name,'emergencyContactPhone',{u}.emergency_contact_phone,
          'notes',{u}.notes,'identityDocuments',{u}.identity_documents,'createdAt',{u}.created_at,
          'residenceStatus',case when exists(select 1 from contracts c where (c.user_id={u}.id or exists(select 1 from jsonb_array_elements(c.occupants) x where x->>'userId'={u}.id::text and x->>'leftOn' is null)) and c.status='active') then 'active'
            when exists(select 1 from contracts c where (c.user_id={u}.id or exists(select 1 from jsonb_array_elements(c.occupants) x where x->>'userId'={u}.id::text and x->>'leftOn' is null)) and c.status='planned') then 'planned'
            when exists(select 1 from contracts c where (c.user_id={u}.id or exists(select 1 from jsonb_array_elements(c.occupants) x where x->>'userId'={u}.id::text and x->>'leftOn' is null)) and c.status='ended') then 'former' else 'none' end,
          'currentTenancy',(select jsonb_build_object('id',c.id,'role',case when c.user_id={u}.id then 'representative' else 'resident' end,'status',c.status,
            'room',jsonb_build_object('id',r.id,'code',r.code,'propertyName',p.name))
            from contracts c join rooms r on r.id=c.room_id join properties p on p.id=r.property_id
            where (c.user_id={u}.id or exists(select 1 from jsonb_array_elements(c.occupants) x where x->>'userId'={u}.id::text and x->>'leftOn' is null)) and c.status in ('active','planned') order by c.starts_on desc limit 1),
          'outstandingAmount',coalesce((select sum(b.outstanding_amount) from v_invoice_balances b join invoices i on i.id=b.id join contracts c on c.id=i.contract_id where c.user_id={u}.id),0),
          'overdueAmount',coalesce((select sum(b.outstanding_amount) from v_invoice_balances b join invoices i on i.id=b.id join contracts c on c.id=i.contract_id where c.user_id={u}.id and b.is_overdue),0),
          'depositHeldTotal',coalesce((select sum(d.held) from v_deposit_balances d join contracts c on c.id=d.contract_id where c.user_id={u}.id),0),
          'hasPendingProfileRequest',exists(select 1 from bookings b where b.user_id={u}.id and b.kind='profile_change' and b.status='pending'))
        {(detail ? $"""
        || jsonb_build_object(
          'tenancies',coalesce((select jsonb_agg(jsonb_build_object('id',c.id,'status',c.status,'room',jsonb_build_object('id',r.id,'code',r.code,'propertyName',p.name)))
            from contracts c join rooms r on r.id=c.room_id join properties p on p.id=r.property_id where (c.user_id={u}.id or exists(select 1 from jsonb_array_elements(c.occupants) x where x->>'userId'={u}.id::text and x->>'leftOn' is null))),'[]'),
          'changeRequests',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'status',b.status,'changes',b.changes,'createdAt',b.created_at)) from bookings b where b.user_id={u}.id and b.kind='profile_change'),'[]'),
          'profileChangeRequests',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'status',b.status,'changes',b.changes,'reason',b.message,'createdAt',b.created_at))
            from bookings b where b.user_id={u}.id and b.kind='profile_change'),'[]'),
          'tickets',coalesce((select jsonb_agg(jsonb_build_object('id',t.id,'title',t.title,'code',t.code,'status',t.status)) from tickets t where t.reported_by={u}.id),'[]'),
          'invoices',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'code',i.code,'status',i.status,'dueOn',i.due_on,
            'totalAmount',i.total_amount,'outstandingAmount',b.outstanding_amount,'isOverdue',b.is_overdue,'paymentStatus',b.payment_status,
            'room',jsonb_build_object('id',r.id,'code',r.code))) from invoices i join v_invoice_balances b on b.id=i.id
            join contracts c on c.id=i.contract_id join rooms r on r.id=c.room_id where c.user_id={u}.id),'[]'))
        """ : "")}
        """;

}
public sealed record TenantInput(string? FullName, string? Phone, string? Email, DateOnly? DateOfBirth, string? AddressLine, string? Locality, string? Province, string? EmergencyContactName, string? EmergencyContactPhone, string? Notes, bool ConfirmDuplicate = false);
public sealed record PasswordInput(string? NewPassword);
