using System.Security.Cryptography;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Mvc;
using Npgsql;
using SmartRent.Api.Common;

namespace SmartRent.Api.Features.Auth;

[ApiController]
[Route("api/v1/auth")]
public sealed class AuthController(NpgsqlDataSource db) : LeasingController(db)
{
    private static readonly PasswordHasher<object> Passwords = new();
    private const int SessionHours = 12;

    [HttpPost("login")]
    public async Task<IActionResult> Login([FromBody] LoginInput input, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(input.Email) || string.IsNullOrWhiteSpace(input.Password)) return BadRequest(new { code = "credentials_required", message = "Cần nhập email và mật khẩu." });
        await using var c = await Db.OpenConnectionAsync(ct);
        await using var command = new NpgsqlCommand("select id,role,display_name,email,password_hash,is_active,login_enabled from users where lower(email)=lower(@email)", c);
        command.Parameters.AddWithValue("email", input.Email.Trim()); await using var r = await command.ExecuteReaderAsync(ct);
        if (!await r.ReadAsync(ct) || r.IsDBNull(4) || Passwords.VerifyHashedPassword(new object(), r.GetString(4), input.Password) == PasswordVerificationResult.Failed) return Unauthorized(new { code = "invalid_credentials", message = "Email hoặc mật khẩu chưa đúng." });
        var id = r.GetGuid(0); var role = r.GetString(1); var name = r.GetString(2); var email = r.GetString(3);
        if (!r.GetBoolean(5) || !r.GetBoolean(6)) return StatusCode(403, new { code = "account_unavailable", message = "Tài khoản chưa thể đăng nhập." });
        if (input.Audience == "admin" && role != "admin") return StatusCode(403, new { code = "admin_only", message = "Chỉ quản trị viên được đăng nhập khu quản trị." });
        await r.CloseAsync(); return Ok(await OpenSession(c, id, name, email, ct));
    }

    [HttpPost("register")]
    public async Task<IActionResult> Register([FromBody] RegisterInput input, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(input.FullName) || string.IsNullOrWhiteSpace(input.Email) || string.IsNullOrWhiteSpace(input.Phone) || string.IsNullOrWhiteSpace(input.Password) || !input.AcceptedTerms) return BadRequest(new { code = "registration_fields_required", message = "Cần nhập đủ thông tin và đồng ý điều khoản." });
        if (input.Password.Length < 8) return BadRequest(new { code = "weak_password", message = "Mật khẩu cần ít nhất 8 ký tự." });
        await using var c = await Db.OpenConnectionAsync(ct); await using var t = await c.BeginTransactionAsync(ct);
        try { await using var create = new NpgsqlCommand("insert into users(code,display_name,email,phone,password_hash,login_enabled,accepted_terms_at) values(next_code('TEN'),@name,@email,@phone,@hash,true,now()) returning id", c, t); create.Parameters.AddWithValue("name", input.FullName.Trim()); create.Parameters.AddWithValue("email", input.Email.Trim()); create.Parameters.AddWithValue("phone", input.Phone.Trim()); create.Parameters.AddWithValue("hash", Passwords.HashPassword(new object(), input.Password)); var id = (Guid)(await create.ExecuteScalarAsync(ct))!; await t.CommitAsync(ct); return Created("api/v1/me", await OpenSession(c, id, input.FullName.Trim(), input.Email.Trim(), ct)); }
        catch (PostgresException e) when (e.SqlState == "23505") { await t.RollbackAsync(ct); return Conflict(new { code = "email_taken", message = "Email này đã có tài khoản." }); }
    }

    [HttpPost("logout")]
    public async Task<IActionResult> Logout(CancellationToken ct) { var raw = Request.Headers.Authorization.ToString(); if (!raw.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase)) return NoContent(); await using var c = await Db.OpenConnectionAsync(ct); await using var command = new NpgsqlCommand("update auth_tokens set revoked_at=now() where kind='session' and token_hash=@hash", c); command.Parameters.AddWithValue("hash", TokenAuthenticationHandler.TokenHash(raw[7..].Trim())); await command.ExecuteNonQueryAsync(ct); return NoContent(); }

    [HttpPost("refresh")]
    public async Task<IActionResult> Refresh(CancellationToken ct) { if (!TryActor(out _, out _)) return Unauthorized(); var raw = Request.Headers.Authorization.ToString(); var token = raw[7..].Trim(); var expires = DateTimeOffset.UtcNow.AddHours(SessionHours); await using var c = await Db.OpenConnectionAsync(ct); await using var command = new NpgsqlCommand("update auth_tokens set expires_at=@expires where kind='session' and token_hash=@hash and revoked_at is null", c); command.Parameters.AddWithValue("expires", expires); command.Parameters.AddWithValue("hash", TokenAuthenticationHandler.TokenHash(token)); return await command.ExecuteNonQueryAsync(ct) == 1 ? Ok(new { accessToken = token, expiresAt = expires }) : Unauthorized(); }

    private async Task<object> OpenSession(NpgsqlConnection c, Guid id, string name, string email, CancellationToken ct) { var token = Convert.ToHexString(RandomNumberGenerator.GetBytes(32)).ToLowerInvariant(); var expires = DateTimeOffset.UtcNow.AddHours(SessionHours); await using var command = new NpgsqlCommand("insert into auth_tokens(user_id,kind,token_hash,expires_at,user_agent) values(@user,'session',@hash,@expires,@agent); update users set last_login_at=now(),failed_login_count=0 where id=@user;", c); command.Parameters.AddWithValue("user", id); command.Parameters.AddWithValue("hash", TokenAuthenticationHandler.TokenHash(token)); command.Parameters.AddWithValue("expires", expires); command.Parameters.AddWithValue("agent", Request.Headers.UserAgent.ToString()[..Math.Min(120, Request.Headers.UserAgent.ToString().Length)]); await command.ExecuteNonQueryAsync(ct); return new { accessToken = token, expiresAt = expires, user = new { id, displayName = name, email } }; }
}

public sealed record LoginInput(string? Email, string? Password, string? Audience);
public sealed record RegisterInput(string? FullName, string? Phone, string? Email, string? Password, bool AcceptedTerms);
