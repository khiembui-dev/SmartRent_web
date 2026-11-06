using System.Data;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Options;
using Npgsql;

namespace SmartRent.Api.Common;

/// <summary>Hạ tầng tối thiểu cho các module thuê phòng. Schema luôn là smartrent.</summary>
public static class LeasingInfrastructure
{
    public static IServiceCollection AddLeasingInfrastructure(this IServiceCollection services, IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString("SmartRent")
            ?? throw new InvalidOperationException("Thiếu ConnectionStrings:SmartRent.");
        var builder = new NpgsqlDataSourceBuilder(connectionString);
        builder.ConnectionStringBuilder.SearchPath = "smartrent,public";
        services.AddSingleton(builder.Build());
        services.AddAuthentication(TokenAuthenticationHandler.AuthenticationScheme)
            .AddScheme<AuthenticationSchemeOptions, TokenAuthenticationHandler>(TokenAuthenticationHandler.AuthenticationScheme, _ => { });
        services.AddAuthorization();
        return services;
    }
}

/// <summary>Bearer session token được so sánh bằng SHA-256; token rõ không lưu trong auth_tokens.</summary>
public sealed class TokenAuthenticationHandler : AuthenticationHandler<AuthenticationSchemeOptions>
{
    public const string AuthenticationScheme = "SmartRentBearer";
    private readonly NpgsqlDataSource _dataSource;
    public TokenAuthenticationHandler(IOptionsMonitor<AuthenticationSchemeOptions> options, ILoggerFactory logger,
        System.Text.Encodings.Web.UrlEncoder encoder, NpgsqlDataSource dataSource) : base(options, logger, encoder) => _dataSource = dataSource;
    protected override async Task<AuthenticateResult> HandleAuthenticateAsync()
    {
        var raw = Request.Headers.Authorization.ToString();
        if (!raw.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase)) return AuthenticateResult.NoResult();
        var token = raw[7..].Trim();
        if (token.Length < 20) return AuthenticateResult.Fail("Token không hợp lệ.");
        await using var connection = await _dataSource.OpenConnectionAsync(Context.RequestAborted);
        await using var command = new NpgsqlCommand("""
            select u.id, u.role, u.display_name, u.email from auth_tokens t join users u on u.id=t.user_id
            where t.kind='session' and upper(t.token_hash)=@hash and t.revoked_at is null and t.consumed_at is null
              and t.expires_at>now() and u.is_active and u.login_enabled
            """, connection);
        command.Parameters.AddWithValue("hash", TokenHash(token));
        await using var reader = await command.ExecuteReaderAsync(Context.RequestAborted);
        if (!await reader.ReadAsync(Context.RequestAborted)) return AuthenticateResult.Fail("Phiên đăng nhập đã hết hạn.");
        var claims = new[] { new Claim(ClaimTypes.NameIdentifier, reader.GetGuid(0).ToString()),
            new Claim(ClaimTypes.Role, reader.GetString(1)), new Claim(ClaimTypes.Name, reader.GetString(2)), new Claim("displayName", reader.GetString(2)),
            new Claim(ClaimTypes.Email, reader.IsDBNull(3) ? "" : reader.GetString(3)) };
        return AuthenticateResult.Success(new AuthenticationTicket(new ClaimsPrincipal(new ClaimsIdentity(claims, AuthenticationScheme)), AuthenticationScheme));
    }
    public static string TokenHash(string token) => Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(token)));
}

/// <summary>Base controller: lấy actor từ phiên, khóa transaction và đặt context DB.</summary>
[Microsoft.AspNetCore.Authorization.Authorize]
public abstract class LeasingController : ControllerBase
{
    protected readonly NpgsqlDataSource Db;
    protected LeasingController(NpgsqlDataSource db) => Db = db;
    protected bool TryActor(out Guid id, out string role)
    { role = User.FindFirstValue(ClaimTypes.Role) ?? ""; return Guid.TryParse(User.FindFirstValue(ClaimTypes.NameIdentifier), out id); }
    protected async Task<(NpgsqlConnection Connection, NpgsqlTransaction Transaction, Guid Actor)> BeginAsync(bool admin, CancellationToken ct)
    {
        if (!TryActor(out var actor, out var role)) throw new LeaseHttpException(401, "unauthenticated", "Cần đăng nhập.");
        if (admin && role != "admin") throw new LeaseHttpException(403, "admin_required", "Chỉ quản trị viên được thực hiện.");
        if (!admin && role != "user") throw new LeaseHttpException(403,"customer_required","Chỉ tài khoản khách được vào khu khách.");
        var connection = await Db.OpenConnectionAsync(ct); var transaction = await connection.BeginTransactionAsync(IsolationLevel.Serializable, ct);
        await using var context = new NpgsqlCommand("select set_config('smartrent.user_id', @actor, true)", connection, transaction);
        context.Parameters.AddWithValue("actor", actor.ToString()); await context.ExecuteNonQueryAsync(ct);
        return (connection, transaction, actor);
    }
    // PostgreSQL timestamptz lưu một thời điểm UTC; trình duyệt có thể gửi +07:00.
    protected static NpgsqlParameter P(string name, object? value) => new(name,
        value is DateTimeOffset instant ? instant.ToUniversalTime() : value ?? DBNull.Value);
    protected static string Json(object? value) => JsonSerializer.Serialize(value ?? new { });
    protected static async Task<string?> ScalarStringAsync(NpgsqlConnection c, NpgsqlTransaction? t, string sql, CancellationToken ct, params NpgsqlParameter[] ps)
    { await using var cmd = new NpgsqlCommand(sql, c, t); cmd.Parameters.AddRange(ps); var result = await cmd.ExecuteScalarAsync(ct); return result is null or DBNull ? null : Convert.ToString(result); }
    protected static async Task<List<JsonElement>> JsonRowsAsync(NpgsqlConnection c, NpgsqlTransaction? t, string sql, CancellationToken ct, params NpgsqlParameter[] ps)
    { await using var cmd = new NpgsqlCommand(sql, c, t); cmd.Parameters.AddRange(ps); await using var r = await cmd.ExecuteReaderAsync(ct); var rows = new List<JsonElement>(); while (await r.ReadAsync(ct)) using (var doc = JsonDocument.Parse(r.GetString(0))) rows.Add(doc.RootElement.Clone()); return rows; }
    protected static async Task CommitAsync(NpgsqlTransaction transaction, CancellationToken ct)
    { try { await transaction.CommitAsync(ct); } catch (PostgresException e) { throw new LeaseHttpException(422, e.MessageText, "Dữ liệu không thỏa quy tắc nghiệp vụ."); } }
    protected ObjectResult LeaseProblem(LeaseHttpException e) => StatusCode(e.Status, new { code = e.Code, detail = e.Message });
    protected ObjectResult DatabaseProblem(PostgresException e) => StatusCode(e.SqlState is "23505" ? 409 : 422, new { code = e.MessageText, detail = "Dữ liệu không thỏa quy tắc nghiệp vụ." });
}
public sealed class LeaseHttpException(int status, string code, string message) : Exception(message)
{ public int Status { get; } = status; public string Code { get; } = code; }
