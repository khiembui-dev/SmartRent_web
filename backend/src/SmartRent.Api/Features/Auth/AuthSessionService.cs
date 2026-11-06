using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.Identity;
using Npgsql;
using NpgsqlTypes;

namespace SmartRent.Api.Features.Auth;

public sealed record AuthUser(Guid Id, string Role, string DisplayName, string? Email,
    string? Phone, string PasswordHash);

public sealed record AuthSession(string AccessToken, DateTime ExpiresAt, AuthUser User);

// Token ngẫu nhiên chỉ lưu dạng SHA-256 trong PostgreSQL. Mật khẩu dùng PasswordHasher của ASP.NET Identity.
public sealed class AuthSessionService(NpgsqlDataSource source)
{
    private readonly PasswordHasher<object> _hasher = new();

    public async Task<AuthSession?> LoginAsync(string email, string password, string audience,
        CancellationToken cancellationToken)
    {
        await using var connection = await source.OpenConnectionAsync(cancellationToken);
        await using var find = new NpgsqlCommand("""
            SELECT id,role,display_name,email,phone,password_hash
            FROM smartrent.users
            WHERE lower(btrim(email))=lower(btrim(@email))
              AND is_active AND login_enabled
              AND (locked_until IS NULL OR locked_until <= now())
            """, connection);
        find.Parameters.AddWithValue("email", email);
        AuthUser? user;
        await using (var reader = await find.ExecuteReaderAsync(cancellationToken))
        {
            if (!await reader.ReadAsync(cancellationToken)) return null;
            user = new AuthUser(reader.GetGuid(0), reader.GetString(1), reader.GetString(2),
                reader.IsDBNull(3) ? null : reader.GetString(3),
                reader.IsDBNull(4) ? null : reader.GetString(4),
                reader.GetString(5));
        }

        PasswordVerificationResult result;
        try { result = _hasher.VerifyHashedPassword(user, user.PasswordHash, password); }
        catch (FormatException) { return null; } // Hash demo bị vô hiệu hóa không được dùng đăng nhập.
        if (result == PasswordVerificationResult.Failed ||
            user.Role != (audience == "admin" ? "admin" : "user")) return null;

        var token = Convert.ToBase64String(RandomNumberGenerator.GetBytes(32));
        var expiresAt = DateTime.UtcNow.AddHours(12);
        await using var create = new NpgsqlCommand("""
            INSERT INTO smartrent.auth_tokens(user_id,kind,token_hash,expires_at)
            VALUES(@user_id,'session',@token_hash,@expires_at)
            """, connection);
        create.Parameters.AddWithValue("user_id", user.Id);
        create.Parameters.AddWithValue("token_hash", TokenHash(token));
        create.Parameters.Add("expires_at", NpgsqlDbType.TimestampTz).Value = expiresAt;
        await create.ExecuteNonQueryAsync(cancellationToken);
        await using var lastLogin = new NpgsqlCommand(
            "UPDATE smartrent.users SET last_login_at=now(),failed_login_count=0 WHERE id=@user_id", connection);
        lastLogin.Parameters.AddWithValue("user_id", user.Id);
        await lastLogin.ExecuteNonQueryAsync(cancellationToken);
        return new AuthSession(token, expiresAt, user);
    }

    public async Task<AuthUser?> FindUserAsync(string? token, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(token) || token.Length > 128) return null;
        await using var command = source.CreateCommand("""
            SELECT u.id,u.role,u.display_name,u.email,u.phone,u.password_hash
            FROM smartrent.auth_tokens t JOIN smartrent.users u ON u.id=t.user_id
            WHERE t.kind='session' AND t.token_hash=@token_hash
              AND t.expires_at>now() AND t.revoked_at IS NULL
              AND u.is_active AND u.login_enabled
            """);
        command.Parameters.AddWithValue("token_hash", TokenHash(token));
        await using var reader = await command.ExecuteReaderAsync(cancellationToken);
        if (!await reader.ReadAsync(cancellationToken)) return null;
        return new AuthUser(reader.GetGuid(0), reader.GetString(1), reader.GetString(2),
            reader.IsDBNull(3) ? null : reader.GetString(3),
            reader.IsDBNull(4) ? null : reader.GetString(4), reader.GetString(5));
    }

    public async Task<DateTime?> SessionExpiryAsync(string? token, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(token) || token.Length > 128) return null;
        await using var command = source.CreateCommand("""
            SELECT expires_at FROM smartrent.auth_tokens
            WHERE kind='session' AND token_hash=@token_hash
              AND expires_at>now() AND revoked_at IS NULL
            """);
        command.Parameters.AddWithValue("token_hash", TokenHash(token));
        return await command.ExecuteScalarAsync(cancellationToken) as DateTime?;
    }

    public async Task RevokeAsync(string? token, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(token) || token.Length > 128) return;
        await using var command = source.CreateCommand("""
            UPDATE smartrent.auth_tokens SET revoked_at=now()
            WHERE kind='session' AND token_hash=@token_hash AND revoked_at IS NULL
            """);
        command.Parameters.AddWithValue("token_hash", TokenHash(token));
        await command.ExecuteNonQueryAsync(cancellationToken);
    }

    public async Task<object> MeAsync(AuthUser user, CancellationToken cancellationToken)
    {
        var properties = new List<object>();
        string businessName;
        await using var connection = await source.OpenConnectionAsync(cancellationToken);
        await using (var name = new NpgsqlCommand("SELECT business_name FROM smartrent.settings WHERE id=1", connection))
            businessName = (string?)await name.ExecuteScalarAsync(cancellationToken) ?? "SmartRent";
        if (user.Role == "admin")
        {
            await using var command = new NpgsqlCommand(
                "SELECT id,code,name FROM smartrent.properties ORDER BY name", connection);
            await using var reader = await command.ExecuteReaderAsync(cancellationToken);
            while (await reader.ReadAsync(cancellationToken))
                properties.Add(new { id = reader.GetGuid(0), code = reader.GetString(1),
                    name = reader.GetString(2) });
        }
        return new
        {
            user = new { id = user.Id, role = user.Role, displayName = user.DisplayName,
                email = user.Email, phone = user.Phone, avatarUrl = (string?)null },
            // Frontend hiện còn mô hình organization cũ; một scope tương thích cho 1 chủ trọ.
            organizations = user.Role == "admin"
                ? new object[] { new { id = Guid.Empty, code = "SMARTRENT", name = businessName,
                    propertyScope = "all", properties } }
                : Array.Empty<object>(),
            tenantProfiles = Array.Empty<object>()
        };
    }

    public static string? BearerToken(HttpRequest request)
    {
        var header = request.Headers.Authorization.ToString();
        return header.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase)
            ? header[7..].Trim() : null;
    }

    private static string TokenHash(string token) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));
}
