using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.DataProtection;
using SmartRent.Api.Features.Auth;
using SmartRent.Api.Features.Tickets;

namespace SmartRent.Api.Features.Files;

// Ảnh Ticket private: upload multipart, cấp link có hạn, và phục vụ content sau khi kiểm tra quyền.
[ApiController]
[Route("api/v1/files")]
public sealed class FilesController(AuthSessionService sessions,TicketFileStore store,IDataProtectionProvider protection)
    : TicketApiController(sessions)
{
    private readonly IDataProtector _protector=protection.CreateProtector("SmartRent.TicketImage.v1");

    [HttpPost]
    [RequestSizeLimit(11*1024*1024)]
    public Task<IActionResult> Upload([FromForm] IFormFile file,[FromForm] string purpose,
        [FromForm] string visibility,CancellationToken ct) => RunAsync(null,async actor =>
    {
        if(purpose!="ticket" || visibility!="private") throw TicketRules.Invalid("purpose","API này nhận ảnh Ticket riêng tư.");
        return await store.SaveAsync(actor,file,ct);
    },ct);

    [HttpGet("{id:guid}/download-url")]
    public Task<IActionResult> DownloadUrl(Guid id,CancellationToken ct) => RunAsync(null,async actor =>
    {
        var stored=await store.GetAsync(actor,id,ct);
        // Token DP mã hóa cả session; nội dung ảnh vẫn bị chặn ngay sau logout/thu hồi phiên.
        var grant=_protector.Protect(id+"|"+DateTimeOffset.UtcNow.AddMinutes(2).ToUnixTimeSeconds()+"|"+
            AuthSessionService.BearerToken(Request));
        return new { file=stored.File,url=$"/api/v1/files/{id}/content?token={Uri.EscapeDataString(grant)}" };
    },ct);

    [HttpGet("{id:guid}/content")]
    public async Task<IActionResult> Content(Guid id,[FromQuery] string token,CancellationToken ct)
    {
        try
        {
            var grant=_protector.Unprotect(token).Split('|');
            if(grant.Length!=3 || !Guid.TryParse(grant[0],out var grantedId) || grantedId!=id ||
                !long.TryParse(grant[1],out var expires) || expires<DateTimeOffset.UtcNow.ToUnixTimeSeconds()) return NotFound();
            var actor=await Sessions.FindUserAsync(grant[2],ct);
            if(actor is null) return Unauthorized();
            var stored=await store.GetAsync(actor,id,ct);
            Response.Headers.CacheControl="no-store";
            Response.Headers["X-Content-Type-Options"]="nosniff";
            return PhysicalFile(stored.Path,stored.File.ContentType);
        }
        catch(System.Security.Cryptography.CryptographicException) { return NotFound(); }
        catch(TicketException) { return NotFound(); }
    }
}
