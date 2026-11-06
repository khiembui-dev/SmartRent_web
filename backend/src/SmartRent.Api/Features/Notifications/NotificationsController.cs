using Microsoft.AspNetCore.Mvc;
using System.Text.Json.Nodes;
using Npgsql;
using SmartRent.Api.Features.Auth;
using SmartRent.Api.Features.Tickets;

namespace SmartRent.Api.Features.Notifications;

// Thông báo. Người 5 phụ trách.
// Danh sách API cần viết: backend/HUONG_DAN_THEO_TRANG.md.
[ApiController]
[Route("api/v1/notifications")]
public sealed class NotificationsController(AuthSessionService sessions,NpgsqlDataSource source)
    : TicketApiController(sessions)
{
    // Notification của Ticket đã ghi cùng transaction được hiển thị trên chuông của đúng người nhận.
    [HttpGet("unread-count")]
    public Task<IActionResult> Count(CancellationToken ct) => RunAsync(null,async actor=>
    {
        await using var cmd=source.CreateCommand("SELECT count(*) FROM smartrent.notifications WHERE recipient_id=@actor AND read_at IS NULL");
        cmd.Parameters.AddWithValue("actor",actor.Id);
        return new {unreadCount=(long)(await cmd.ExecuteScalarAsync(ct))!};
    },ct);

    [HttpGet]
    public Task<IActionResult> List(CancellationToken ct,[FromQuery] int page=1,[FromQuery] int pageSize=20,
        [FromQuery] bool unread=false) => RunAsync(null,async actor=>
    {
        if(page<1 || pageSize is <1 or >100) throw TicketRules.Invalid("page","Phân trang không hợp lệ.");
        await using var cmd=source.CreateCommand("""
            SELECT jsonb_build_object('id',n.id,'title',n.title,'body',n.body,'relativeUrl',n.url,
              'createdAt',n.created_at,'readAt',n.read_at)::text,
              count(*) OVER(),(SELECT count(*) FROM smartrent.notifications WHERE recipient_id=@actor AND read_at IS NULL)
            FROM smartrent.notifications n WHERE recipient_id=@actor AND (NOT @unread OR read_at IS NULL)
            ORDER BY created_at DESC,id LIMIT @limit OFFSET @offset
            """);
        cmd.Parameters.AddWithValue("actor",actor.Id);cmd.Parameters.AddWithValue("unread",unread);
        cmd.Parameters.AddWithValue("limit",pageSize);cmd.Parameters.AddWithValue("offset",((long)page-1)*pageSize);
        // COUNT riêng giữ tổng chính xác kể cả khi người dùng yêu cầu trang nằm ngoài dữ liệu.
        await using var stats=source.CreateCommand("""
            SELECT count(*) FILTER(WHERE NOT @unread OR read_at IS NULL),
              count(*) FILTER(WHERE read_at IS NULL)
            FROM smartrent.notifications WHERE recipient_id=@actor
            """);
        stats.Parameters.AddWithValue("actor",actor.Id);stats.Parameters.AddWithValue("unread",unread);
        long total,unreadCount;
        await using(var counts=await stats.ExecuteReaderAsync(ct))
        { await counts.ReadAsync(ct);total=counts.GetInt64(0);unreadCount=counts.GetInt64(1); }
        var items=new List<JsonObject>();
        await using var reader=await cmd.ExecuteReaderAsync(ct);
        while(await reader.ReadAsync(ct))
        { items.Add(JsonNode.Parse(reader.GetString(0))!.AsObject()); }
        return new {items,page,pageSize,totalItems=total,totalPages=(long)Math.Ceiling((double)total/pageSize),unreadCount};
    },ct);

    [HttpPost("{id:guid}/read")]
    public Task<IActionResult> Read(Guid id,CancellationToken ct) => MarkAsync(id,ct);
    [HttpPost("read-all")]
    public Task<IActionResult> ReadAll(CancellationToken ct) => MarkAsync(null,ct);

    // recipient_id luôn có trong WHERE: UUID thông báo của người khác không thể bị đánh dấu đã đọc.
    private Task<IActionResult> MarkAsync(Guid? id,CancellationToken ct) => RunAsync(null,async actor=>
    {
        await using var cmd=source.CreateCommand("""
            UPDATE smartrent.notifications SET read_at=coalesce(read_at,now())
            WHERE recipient_id=@actor AND (@id IS NULL OR id=@id)
            """);
        cmd.Parameters.AddWithValue("actor",actor.Id);
        cmd.Parameters.Add("id",NpgsqlTypes.NpgsqlDbType.Uuid).Value=(object?)id??DBNull.Value;
        var count=await cmd.ExecuteNonQueryAsync(ct);
        if(id is not null && count==0) throw new TicketException(404,"not_found","Không tìm thấy thông báo.");
        return new {updated=count};
    },ct);
}
