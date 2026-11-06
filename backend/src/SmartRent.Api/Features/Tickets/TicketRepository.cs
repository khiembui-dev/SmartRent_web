using System.Text.Json.Nodes;
using Npgsql;
using NpgsqlTypes;
using SmartRent.Api.Features.Auth;

namespace SmartRent.Api.Features.Tickets;

// Một repository cho cả admin và khách; quyền xem dùng cùng điều kiện trên mọi endpoint.
public sealed partial class TicketRepository(NpgsqlDataSource source)
{
    internal static void ActorParameters(NpgsqlCommand command, AuthUser actor)
    {
        command.Parameters.AddWithValue("actor_id", actor.Id);
        command.Parameters.AddWithValue("is_admin", actor.Role == "admin");
    }

    public async Task<JsonObject> GetAsync(AuthUser actor, Guid id, CancellationToken ct)
    {
        await using var command = source.CreateCommand(TicketSql.Projection +
            " WHERE t.id=@id AND " + TicketSql.Visible);
        ActorParameters(command, actor);
        command.Parameters.AddWithValue("id", id);
        var json = await command.ExecuteScalarAsync(ct) as string;
        if (json is null) throw new TicketException(404, "not_found", "Không tìm thấy ticket.");
        return JsonNode.Parse(json)!.AsObject();
    }

    // Đếm và lấy trang trong cùng snapshot để tổng số không lệch khi có người tạo ticket đồng thời.
    public async Task<object> ListAsync(AuthUser actor, TicketListQuery query, CancellationToken ct)
    {
        if (query.Page < 1 || query.PageSize is < 1 or > 100)
            throw TicketRules.Invalid("page", "Trang phải từ 1, số dòng mỗi trang từ 1 đến 100.");
        if (query.Status is not (null or "" or "open") && !TicketRules.Statuses.Contains(query.Status))
            throw TicketRules.Invalid("status", "Trạng thái không hợp lệ.");
        if (query.Priority is not null && !TicketRules.Priorities.Contains(query.Priority))
            throw TicketRules.Invalid("priority", "Mức ưu tiên không hợp lệ.");
        var sort = query.Sort switch
        {
            null or "" or "-createdAt" => "t.created_at DESC,t.id",
            "createdAt" => "t.created_at,t.id",
            "dueAt" => "t.due_at,t.id",
            "-dueAt" => "t.due_at DESC,t.id",
            _ => throw TicketRules.Invalid("sort", "Chỉ sắp xếp theo ngày tạo hoặc hạn xử lý.")
        };
        var where = " WHERE " + TicketSql.Visible + """
             AND (@status IS NULL OR @status='' OR
               (@status='open' AND t.status IN ('new','accepted','in_progress','waiting')) OR t.status=@status)
             AND (@q='' OR t.code ILIKE '%'||@q||'%' OR t.title ILIKE '%'||@q||'%'
                  OR r.code ILIKE '%'||@q||'%')
             AND (@overdue IS NULL OR (t.status NOT IN ('resolved','closed') AND t.due_at<now())=@overdue)
             AND (@priority IS NULL OR t.priority=@priority)
             AND (@property_id IS NULL OR r.property_id=@property_id)
             AND (@room_id IS NULL OR r.id=@room_id)
            """;
        await using var connection = await source.OpenConnectionAsync(ct);
        await using var tx = await connection.BeginTransactionAsync(System.Data.IsolationLevel.RepeatableRead, ct);
        void Add(NpgsqlCommand cmd)
        {
            ActorParameters(cmd, actor);
            cmd.Parameters.Add("status", NpgsqlDbType.Text).Value = (object?)query.Status ?? DBNull.Value;
            cmd.Parameters.AddWithValue("q", query.Q?.Trim() ?? "");
            cmd.Parameters.Add("overdue", NpgsqlDbType.Boolean).Value = (object?)query.Overdue ?? DBNull.Value;
            cmd.Parameters.Add("priority", NpgsqlDbType.Text).Value = (object?)query.Priority ?? DBNull.Value;
            cmd.Parameters.Add("property_id", NpgsqlDbType.Uuid).Value = (object?)query.PropertyId ?? DBNull.Value;
            cmd.Parameters.Add("room_id", NpgsqlDbType.Uuid).Value = (object?)query.RoomId ?? DBNull.Value;
        }
        await using var count = new NpgsqlCommand(
            "SELECT count(*) FROM smartrent.tickets t JOIN smartrent.rooms r ON r.id=t.room_id" + where, connection, tx);
        Add(count);
        var total = (long)(await count.ExecuteScalarAsync(ct))!;
        await using var list = new NpgsqlCommand(TicketSql.Projection + where +
            " ORDER BY " + sort + " LIMIT @limit OFFSET @offset", connection, tx);
        Add(list);
        list.Parameters.AddWithValue("limit", query.PageSize);
        list.Parameters.AddWithValue("offset", ((long)query.Page - 1) * query.PageSize);
        var items = new List<JsonObject>();
        await using (var reader = await list.ExecuteReaderAsync(ct))
            while (await reader.ReadAsync(ct))
            {
                var item = JsonNode.Parse(reader.GetString(0))!.AsObject();
                // Danh sách chỉ cần summary; tin nhắn/detail chỉ tải khi người dùng chọn ticket.
                foreach (var key in new[] { "messages", "events", "files", "description", "resolutionNotes" }) item.Remove(key);
                items.Add(item);
            }
        await tx.CommitAsync(ct);
        return new { items, page = query.Page, pageSize = query.PageSize, totalItems = total,
            totalPages = (long)Math.Ceiling((double)total / query.PageSize) };
    }

    // Trả các phòng mà khách có quyền gửi ticket. Tên tenancyId cũ ánh xạ vào contract.id mới.
    public async Task<object> TenanciesAsync(AuthUser actor, CancellationToken ct)
    {
        await using var cmd = source.CreateCommand("""
            SELECT jsonb_build_object('id',c.id,'status',c.status,
              'role',CASE WHEN c.user_id=@actor_id THEN 'representative' ELSE 'resident' END,
              'room',jsonb_build_object('id',r.id,'code',r.code,'name',r.name),
              'property',jsonb_build_object('id',p.id,'name',p.name))::text
            FROM smartrent.contracts c JOIN smartrent.rooms r ON r.id=c.room_id
            JOIN smartrent.properties p ON p.id=r.property_id
            WHERE c.status<>'cancelled' AND (c.user_id=@actor_id OR EXISTS (
              SELECT 1 FROM jsonb_array_elements(c.occupants) x
              WHERE x->>'userId'=@actor_id::text AND x->>'leftOn' IS NULL))
            ORDER BY c.starts_on DESC,c.id
            """);
        cmd.Parameters.AddWithValue("actor_id", actor.Id);
        var result = new List<JsonObject>();
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        while (await reader.ReadAsync(ct)) result.Add(JsonNode.Parse(reader.GetString(0))!.AsObject());
        return result;
    }

    // Danh mục code là hằng số nghiệp vụ khớp CHECK của SQL; danh sách người xử lý chỉ có admin.
    public async Task<object> CatalogAsync(bool admin, CancellationToken ct)
    {
        var categories = new[] { new { id="ELECTRICITY",code="ELECTRICITY",name="Điện" },
            new { id="WATER",code="WATER",name="Nước" }, new { id="INTERNET",code="INTERNET",name="Internet" },
            new { id="OTHER",code="OTHER",name="Khác" } };
        var staff = new List<object>();
        if (admin)
        {
            await using var cmd = source.CreateCommand(
                "SELECT id,display_name FROM smartrent.users WHERE role='admin' AND is_active");
            await using var reader = await cmd.ExecuteReaderAsync(ct);
            while (await reader.ReadAsync(ct)) staff.Add(new { id=reader.GetGuid(0), displayName=reader.GetString(1) });
        }
        return new { ticketCategories = categories, staff };
    }
}
