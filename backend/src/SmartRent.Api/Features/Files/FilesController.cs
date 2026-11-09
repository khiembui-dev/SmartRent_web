using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.DataProtection;
using SmartRent.Api.Features.Auth;
using SmartRent.Api.Features.Tickets;

namespace SmartRent.Api.Features.Files;

// Ảnh Ticket private: upload multipart, cấp link có hạn, và phục vụ content sau khi kiểm tra quyền.
[ApiController]
[Route("api/v1/files")]
public sealed class FilesController(AuthSessionService sessions, TicketFileStore store, IDataProtectionProvider protection, Npgsql.NpgsqlDataSource db, IWebHostEnvironment environment)
    : TicketApiController(sessions)
{
    private readonly IDataProtector _protector = protection.CreateProtector("SmartRent.TicketImage.v1");

    [HttpPost]
    [RequestSizeLimit(11 * 1024 * 1024)]
    public Task<IActionResult> Upload([FromForm] IFormFile file, [FromForm] string purpose,
        [FromForm] string visibility, CancellationToken ct) => RunAsync(null, async actor =>
    {
        if (purpose is not ("ticket" or "avatar" or "room_image" or "contract_signed" or "contract_attachment" or "payment_proof"))
            throw TicketRules.Invalid("purpose", "Mục đích tải lên không hợp lệ.");
        if (purpose is "room_image" or "contract_signed" or "contract_attachment" && actor.Role != "admin")
            throw new TicketException(403, "admin_required", "Chỉ chủ trọ được tải loại tệp này.");
        visibility = purpose is "room_image" or "avatar" ? "public" : "private";
        return await store.SaveAsync(actor, file, ct, purpose, visibility);
    }, ct);

    [HttpGet("{id:guid}/download-url")]
    public Task<IActionResult> DownloadUrl(Guid id, CancellationToken ct) => RunAsync(null, async actor =>
    {
        var stored = await store.GetAsync(actor, id, ct);
        // Token DP mã hóa cả session; nội dung ảnh vẫn bị chặn ngay sau logout/thu hồi phiên.
        var grant = _protector.Protect(id + "|" + DateTimeOffset.UtcNow.AddMinutes(2).ToUnixTimeSeconds() + "|" +
            AuthSessionService.BearerToken(Request));
        return new
        {
            file = stored.File,
            url = $"/api/v1/files/{id}/content?token={Uri.EscapeDataString(grant)}"
        };
    }, ct);

    [HttpGet("{id:guid}/content")]
    public async Task<IActionResult> Content(Guid id, [FromQuery] string token, CancellationToken ct)
    {
        try
        {
            var grant = _protector.Unprotect(token).Split('|');
            if (grant.Length != 3 || !Guid.TryParse(grant[0], out var grantedId) || grantedId != id ||
                !long.TryParse(grant[1], out var expires) || expires < DateTimeOffset.UtcNow.ToUnixTimeSeconds())
                return NotFound();
            var actor = await Sessions.FindUserAsync(grant[2], ct);
            if (actor is null)
                return Unauthorized();
            var stored = await store.GetAsync(actor, id, ct);
            Response.Headers.CacheControl = "no-store";
            Response.Headers["X-Content-Type-Options"] = "nosniff";
            return PhysicalFile(stored.Path, stored.File.ContentType);
        }
        catch (System.Security.Cryptography.CryptographicException) { return NotFound(); }
        catch (TicketException) { return NotFound(); }
    }
    // Chỉ ảnh gắn với tin đã đăng hoặc avatar đang sử dụng có URL công khai.
    [HttpGet("{id:guid}/public")]
    public async Task<IActionResult> Public(Guid id, CancellationToken ct)
    {
        await using var cmd = db.CreateCommand("""
          select f.storage_key,f.content_type from smartrent.files f where f.id=@id
            and f.visibility='public' and f.scan_status='clean' and (exists (
              select 1 from smartrent.rooms r join smartrent.properties p on p.id=r.property_id
              where r.listing_status='published' and p.is_active and r.images @> jsonb_build_array(jsonb_build_object('fileId',f.id::text)))
              or exists(select 1 from smartrent.users u where u.avatar_file_id=f.id and u.is_active))
          """);
        cmd.Parameters.AddWithValue("id", id);
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        if (!await reader.ReadAsync(ct))
            return NotFound();
        var key = reader.GetString(0);
        if (!Guid.TryParseExact(key, "N", out _))
            return NotFound();
        var path = Path.Combine(environment.ContentRootPath, "App_Data", "ticket-files", key);
        if (!System.IO.File.Exists(path))
            return NotFound();
        Response.Headers["X-Content-Type-Options"] = "nosniff";
        return PhysicalFile(path, reader.GetString(1));
    }
}
