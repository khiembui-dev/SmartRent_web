using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Nodes;
using Npgsql;
using NpgsqlTypes;
using SmartRent.Api.Features.Auth;

namespace SmartRent.Api.Features.Tickets;

public sealed partial class TicketRepository
{
    private sealed record LockedTicket(string Status, string Priority, Guid Reporter, Guid? Assigned);

    // Tất cả thay đổi chạy trên cùng connection/transaction. GUC LOCAL cung cấp actor/action/reason
    // cho trigger ghi history và tự hết hiệu lực khi commit/rollback, không rò sang connection pool.
    private static async Task ContextAsync(NpgsqlConnection conn, NpgsqlTransaction tx,
        AuthUser actor, string action, string? reason, CancellationToken ct)
    {
        await using var cmd = new NpgsqlCommand("""
            SELECT set_config('smartrent.user_id',@actor,true),
                   set_config('smartrent.ticket_action',@action,true),
                   set_config('smartrent.ticket_reason',@reason,true)
            """, conn, tx);
        cmd.Parameters.AddWithValue("actor", actor.Id.ToString());
        cmd.Parameters.AddWithValue("action", action);
        cmd.Parameters.AddWithValue("reason", reason ?? "");
        await cmd.ExecuteNonQueryAsync(ct);
    }

    private static async Task<LockedTicket> LockAsync(NpgsqlConnection conn, NpgsqlTransaction tx,
        AuthUser actor, Guid id, CancellationToken ct)
    {
        await using var cmd = new NpgsqlCommand("""
            SELECT t.status,t.priority,t.reported_by,t.assigned_to
            FROM smartrent.tickets t WHERE t.id=@id AND
            """ + TicketSql.Visible + " FOR UPDATE", conn, tx);
        ActorParameters(cmd, actor);
        cmd.Parameters.AddWithValue("id", id);
        await using var reader = await cmd.ExecuteReaderAsync(ct);
        if (!await reader.ReadAsync(ct)) throw new TicketException(404,"not_found","Không tìm thấy ticket.");
        return new(reader.GetString(0),reader.GetString(1),reader.GetGuid(2),
            reader.IsDBNull(3) ? null : reader.GetGuid(3));
    }

    // Ảnh được phép gắn phải do chính người gửi tải lên, thuộc purpose ticket và đã kiểm tra định dạng.
    private static async Task CheckFilesAsync(NpgsqlConnection conn, NpgsqlTransaction tx,
        Guid actorId, Guid[] ids, CancellationToken ct)
    {
        if (ids.Length > 4 || ids.Distinct().Count() != ids.Length)
            throw TicketRules.Invalid("fileIds", "Tối đa 4 ảnh, không trùng ID.");
        await using var cmd = new NpgsqlCommand("""
            SELECT count(*) FROM smartrent.files WHERE id=ANY(@ids) AND uploaded_by=@actor
              AND purpose='ticket' AND visibility='private' AND scan_status='clean'
            """,conn,tx);
        cmd.Parameters.AddWithValue("ids",ids);
        cmd.Parameters.AddWithValue("actor",actorId);
        if ((long)(await cmd.ExecuteScalarAsync(ct))! != ids.Length)
            throw TicketRules.Invalid("fileIds","Ảnh không tồn tại hoặc không thuộc tài khoản này.");
    }

    // Tạo ticket theo hợp đồng đã xác minh. Toàn bộ idempotency/file/history/notification
    // cùng một transaction; chỉ trả detail sau khi COMMIT thành công.
    public async Task<JsonObject> CreateAsync(AuthUser actor, CreateTicketRequest request,
        string? key, CancellationToken ct)
    {
        var title=TicketRules.Text(request.Title,"title",200);
        var description=TicketRules.Text(request.Description,"description",10000);
        if (!TicketRules.Categories.Contains(request.CategoryId)) throw TicketRules.Invalid("categoryId","Loại sự cố không hợp lệ.");
        var dueAt=TicketRules.DueAt(request.Priority,DateTime.UtcNow);
        var files=request.FileIds ?? [];
        if (key?.Length > 200) throw TicketRules.Invalid("idempotencyKey","Mã yêu cầu quá dài.");
        // Hash xác định nội dung: cùng key mà body khác phải báo 409, không trả nhầm ticket cũ.
        var hash=Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(
            new { request.TenancyId, request.RoomId, request.CategoryId, title, description, request.Priority, files }))));
        await using var conn=await source.OpenConnectionAsync(ct);
        await using var tx=await conn.BeginTransactionAsync(ct);
        if (!string.IsNullOrWhiteSpace(key))
        {
            await using var mutex=new NpgsqlCommand(
                "SELECT pg_advisory_xact_lock(hashtextextended(@key,0))",conn,tx);
            mutex.Parameters.AddWithValue("key",actor.Id+":"+key);
            await mutex.ExecuteNonQueryAsync(ct);
            await using var existing=new NpgsqlCommand("""
                SELECT id,request_hash FROM smartrent.tickets
                WHERE reported_by=@actor AND idempotency_key=@key
                """,conn,tx);
            existing.Parameters.AddWithValue("actor",actor.Id);
            existing.Parameters.AddWithValue("key",key);
            Guid? previousId=null;
            await using(var reader=await existing.ExecuteReaderAsync(ct))
                if(await reader.ReadAsync(ct))
                {
                    if(reader.GetString(1)!=hash) throw new TicketException(409,"idempotency_conflict","Mã gửi lại đã được dùng cho nội dung khác.");
                    previousId=reader.GetGuid(0);
                }
            if(previousId is Guid previous)
            {
                await tx.CommitAsync(ct);
                return await GetAsync(actor,previous,ct);
            }
        }
        // Dùng contract đã xác minh để xác định room_id; người dùng không tự nhận reported_by của người khác.
        Guid roomId;
        Guid? contractId=request.TenancyId == Guid.Empty ? null : request.TenancyId;
        if(contractId is not null)
        {
            await using var contract=new NpgsqlCommand("""
                SELECT c.room_id FROM smartrent.contracts c WHERE c.id=@id AND c.status='active'
                  AND (@admin OR c.user_id=@actor OR EXISTS (
                    SELECT 1 FROM jsonb_array_elements(c.occupants) x
                    WHERE x->>'userId'=@actor::text AND x->>'leftOn' IS NULL)) FOR SHARE
                """,conn,tx);
            contract.Parameters.AddWithValue("id",contractId.Value);
            contract.Parameters.AddWithValue("actor",actor.Id);
            contract.Parameters.AddWithValue("admin",actor.Role=="admin");
            var value=await contract.ExecuteScalarAsync(ct);
            if(value is not Guid verifiedRoom) throw TicketRules.Invalid("tenancyId","Chọn hợp đồng/phòng đang ở thuộc tài khoản của bạn.");
            roomId=verifiedRoom;
        }
        else if(actor.Role=="admin" && request.RoomId is Guid adminRoom)
        {
            await using var room=new NpgsqlCommand("SELECT id FROM smartrent.rooms WHERE id=@id FOR SHARE",conn,tx);
            room.Parameters.AddWithValue("id",adminRoom);
            if(await room.ExecuteScalarAsync(ct) is not Guid) throw TicketRules.Invalid("roomId","Phòng không tồn tại.");
            roomId=adminRoom;
        }
        else throw TicketRules.Invalid("tenancyId","Chọn phòng đang ở.");
        await CheckFilesAsync(conn,tx,actor.Id,files,ct);
        await ContextAsync(conn,tx,actor,"created",null,ct);
        await using var insert=new NpgsqlCommand("""
            INSERT INTO smartrent.tickets(code,room_id,contract_id,category_code,reported_by,
              title,description,priority,due_at,attachment_file_ids,idempotency_key,request_hash,history)
            VALUES(smartrent.next_code('SC'),@room,@contract,@category,@actor,@title,@description,
              @priority,@due,@files,@key,@hash,jsonb_build_array(jsonb_build_object(
                'id',gen_random_uuid(),'kind','created','toStatus','new','actorId',@actor::text,'occurredAt',now())))
            RETURNING id
            """,conn,tx);
        insert.Parameters.AddWithValue("room",roomId);
        insert.Parameters.Add("contract",NpgsqlDbType.Uuid).Value=(object?)contractId??DBNull.Value;
        insert.Parameters.AddWithValue("category",request.CategoryId);
        insert.Parameters.AddWithValue("actor",actor.Id);
        insert.Parameters.AddWithValue("title",title);
        insert.Parameters.AddWithValue("description",description);
        insert.Parameters.AddWithValue("priority",request.Priority);
        insert.Parameters.AddWithValue("due",dueAt);
        insert.Parameters.Add("files",NpgsqlDbType.Jsonb).Value=JsonSerializer.Serialize(files);
        insert.Parameters.Add("key",NpgsqlDbType.Text).Value=(object?)key??DBNull.Value;
        insert.Parameters.AddWithValue("hash",hash);
        var id=(Guid)(await insert.ExecuteScalarAsync(ct))!;
        await NotifyAsync(conn,tx,actor,id,"Ticket mới",ct);
        await tx.CommitAsync(ct);
        return await GetAsync(actor,id,ct);
    }

    // JSONB append diễn ra trong SQL và dưới khóa dòng: hai tin nhắn đồng thời không làm mất nhau.
    public async Task<JsonObject> MessageAsync(AuthUser actor,Guid id,TicketMessageRequest request,CancellationToken ct)
    {
        var body=TicketRules.Text(request.Body,"body",10000);
        if(actor.Role!="admin" && request.IsInternal)
            throw new TicketException(403,"internal_forbidden","Khách không được gửi ghi chú nội bộ.");
        await using var conn=await source.OpenConnectionAsync(ct);
        await using var tx=await conn.BeginTransactionAsync(ct);
        var ticket=await LockAsync(conn,tx,actor,id,ct);
        if(ticket.Status=="closed") throw new TicketException(409,"ticket_closed","Mở lại ticket trước khi gửi tin nhắn.");
        await ContextAsync(conn,tx,actor,"message",null,ct);
        await using var cmd=new NpgsqlCommand("""
            UPDATE smartrent.tickets SET messages=messages||jsonb_build_array(jsonb_build_object(
              'id',gen_random_uuid(),'authorId',@actor::text,'body',@body,'createdAt',now(),
              'isInternal',@internal,'fileIds','[]'::jsonb)) WHERE id=@id
            """,conn,tx);
        cmd.Parameters.AddWithValue("id",id);cmd.Parameters.AddWithValue("actor",actor.Id);
        cmd.Parameters.AddWithValue("body",body);cmd.Parameters.AddWithValue("internal",request.IsInternal);
        await cmd.ExecuteNonQueryAsync(ct);
        // Không gửi notification của ghi chú nội bộ sang khách (kể cả preview nội dung).
        if(!request.IsInternal) await NotifyAsync(conn,tx,actor,id,"Trao đổi mới",ct);
        await tx.CommitAsync(ct);
        return await GetAsync(actor,id,ct);
    }

    // Hệ thống một admin: chỉ cho nhận xử lý bằng chính admin đăng nhập, không nhận userId khách.
    public async Task<JsonObject> AssignAsync(AuthUser actor,Guid id,TicketAssignRequest request,CancellationToken ct)
    {
        if(request.UserId!=actor.Id) throw TicketRules.Invalid("userId","Hệ thống chỉ có một admin; người xử lý là admin hiện tại.");
        await using var conn=await source.OpenConnectionAsync(ct);
        await using var tx=await conn.BeginTransactionAsync(ct);
        var ticket=await LockAsync(conn,tx,actor,id,ct);
        CheckExpected(ticket,request.ExpectedStatus);
        if(!TicketRules.OpenStatuses.Contains(ticket.Status)) throw new TicketException(409,"ticket_closed","Mở lại ticket trước khi phân công.");
        var note=string.IsNullOrWhiteSpace(request.Note)?null:TicketRules.Text(request.Note,"note",2000);
        await ContextAsync(conn,tx,actor,"assign",note,ct);
        await using var cmd=new NpgsqlCommand("""
            UPDATE smartrent.tickets SET assigned_to=@actor,
              status=CASE WHEN status='new' THEN 'accepted' ELSE status END WHERE id=@id
            """,conn,tx);
        cmd.Parameters.AddWithValue("actor",actor.Id);cmd.Parameters.AddWithValue("id",id);
        await cmd.ExecuteNonQueryAsync(ct);
        await NotifyAsync(conn,tx,actor,id,"Đã phân công xử lý",ct);
        await tx.CommitAsync(ct);
        return await GetAsync(actor,id,ct);
    }

    // Admin và khách cùng đi qua một state machine. Quyền action của khách bị giới hạn ở đây,
    // ngoài việc kiểm tra role ở controller, để không thể gọi nhầm service rồi leo quyền.
    public async Task<JsonObject> TransitionAsync(AuthUser actor,Guid id,TicketTransitionRequest request,CancellationToken ct)
    {
        if(actor.Role!="admin" && request.Action is not ("close" or "reopen"))
            throw new TicketException(403,"forbidden","Khách chỉ được xác nhận đã xong hoặc mở lại.");
        if(request.Action is not ("accept" or "start" or "wait" or "resume" or "resolve" or "close" or "reopen"))
            throw TicketRules.Invalid("action","Hành động không hợp lệ.");
        var reason=request.Action is "wait" or "reopen" ? TicketRules.Text(request.Reason,"reason",2000) : request.Reason;
        var notes=request.Action=="resolve" ? TicketRules.Text(request.ResolutionNotes,"resolutionNotes",5000) : null;
        await using var conn=await source.OpenConnectionAsync(ct);
        await using var tx=await conn.BeginTransactionAsync(ct);
        var ticket=await LockAsync(conn,tx,actor,id,ct);
        CheckExpected(ticket,request.ExpectedStatus);
        var next=TicketRules.NextStatus(ticket.Status,request.Action);
        await ContextAsync(conn,tx,actor,request.Action,reason??notes,ct);
        // Mỗi CASE chỉ sửa cột thuộc action: resolve chốt kết quả/time, close chốt closed_at,
        // reopen xóa mốc kết thúc và đặt hạn mới; resume xóa lý do waiting đã hết hiệu lực.
        await using var cmd=new NpgsqlCommand("""
            UPDATE smartrent.tickets SET status=@next,
              assigned_to=CASE WHEN @assign THEN coalesce(assigned_to,@actor) ELSE assigned_to END,
              waiting_reason=CASE WHEN @next='waiting' THEN @reason ELSE NULL END,
              resolution_notes=CASE WHEN @action='resolve' THEN @notes
                WHEN @action='reopen' THEN NULL ELSE resolution_notes END,
              resolved_at=CASE WHEN @action='resolve' THEN now()
                WHEN @action='reopen' THEN NULL ELSE resolved_at END,
              closed_at=CASE WHEN @action='close' THEN now()
                WHEN @action='reopen' THEN NULL ELSE closed_at END,
              due_at=CASE WHEN @action='reopen' THEN @new_due ELSE due_at END
            WHERE id=@id
            """,conn,tx);
        cmd.Parameters.AddWithValue("id",id);cmd.Parameters.AddWithValue("actor",actor.Id);
        cmd.Parameters.AddWithValue("next",next);cmd.Parameters.AddWithValue("action",request.Action);
        cmd.Parameters.AddWithValue("assign",actor.Role=="admin" && request.Action is "accept" or "start");
        cmd.Parameters.Add("reason",NpgsqlDbType.Text).Value=(object?)reason??DBNull.Value;
        cmd.Parameters.Add("notes",NpgsqlDbType.Text).Value=(object?)notes??DBNull.Value;
        cmd.Parameters.AddWithValue("new_due",TicketRules.DueAt(ticket.Priority,DateTime.UtcNow));
        await cmd.ExecuteNonQueryAsync(ct);
        await NotifyAsync(conn,tx,actor,id,"Cập nhật trạng thái",ct);
        await tx.CommitAsync(ct);
        return await GetAsync(actor,id,ct);
    }

    private static void CheckExpected(LockedTicket ticket,string? expected)
    {
        if(expected is not null && ticket.Status!=expected)
            throw new TicketException(409,"stale_ticket","Ticket đã được cập nhật. Tải lại trước khi thao tác.");
    }

    // Notification và ticket cùng transaction: lỗi một bên sẽ rollback cả hai.
    private static async Task NotifyAsync(NpgsqlConnection conn,NpgsqlTransaction tx,
        AuthUser actor,Guid id,string title,CancellationToken ct)
    {
        await using var cmd=new NpgsqlCommand("""
            INSERT INTO smartrent.notifications(recipient_id,event_key,title,body,url)
            SELECT u.id,@event,@title||' - '||t.code,t.title,
              CASE WHEN u.role='admin' THEN '/admin/tickets/' ELSE '/tickets/' END||t.id::text
            FROM smartrent.tickets t JOIN smartrent.users u ON
              (u.role='admin' OR u.id=t.reported_by OR u.id=(SELECT c.user_id FROM smartrent.contracts c WHERE c.id=t.contract_id))
            WHERE t.id=@id AND u.is_active AND u.id<>@actor
            ON CONFLICT(recipient_id,event_key) DO NOTHING
            """,conn,tx);
        cmd.Parameters.AddWithValue("id",id);cmd.Parameters.AddWithValue("actor",actor.Id);
        cmd.Parameters.AddWithValue("event","ticket:"+Guid.NewGuid());cmd.Parameters.AddWithValue("title",title);
        await cmd.ExecuteNonQueryAsync(ct);
    }
}
