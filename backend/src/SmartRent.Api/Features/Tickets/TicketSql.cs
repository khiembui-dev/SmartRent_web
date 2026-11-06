namespace SmartRent.Api.Features.Tickets;

// Các đoạn SQL này chỉ chứa tên cột/alias do lập trình viên định nghĩa.
// Giá trị từ HTTP luôn đi qua NpgsqlParameter, không được ghép vào các chuỗi này.
internal static class TicketSql
{
    // Khách được xem ticket mình báo, của hợp đồng mình đại diện, hoặc phòng mình đang ở cùng.
    // Điều kiện dùng lại cho đọc, khóa khi ghi, và quyền tải ảnh; tránh mỗi API kiểm tra một kiểu.
    public const string Visible = """
        (@is_admin OR t.reported_by=@actor_id OR EXISTS (
          SELECT 1 FROM smartrent.contracts c WHERE c.id=t.contract_id AND
            (c.user_id=@actor_id OR EXISTS (
              SELECT 1 FROM jsonb_array_elements(c.occupants) x
              WHERE x->>'userId'=@actor_id::text AND x->>'leftOn' IS NULL))))
        """;

    // Metadata của file được trả về; đường dẫn vật lý không bao giờ gửi ra trình duyệt.
    private static string Files(string ids) => $$"""
        coalesce((SELECT jsonb_agg(jsonb_build_object('id',f.id,'fileName',f.file_name,
          'contentType',f.content_type,'sizeBytes',f.byte_size,'scanStatus',f.scan_status))
          FROM smartrent.files f WHERE {{ids}} @> jsonb_build_array(f.id::text)), '[]'::jsonb)
        """;

    // JSON khớp ticket-thread.js và hai giao diện hiện có. Tin nội bộ bị loại ngay tại SQL của khách.
    public static readonly string Projection = $$"""
        SELECT jsonb_build_object(
          'id',t.id,'code',t.code,'title',t.title,'description',t.description,
          'status',t.status,'priority',t.priority,'tenancyId',t.contract_id,
          'room',jsonb_build_object('id',r.id,'code',r.code,'name',r.name,
            'propertyId',p.id,'propertyCode',p.code,'propertyName',p.name),
          'category',jsonb_build_object('id',t.category_code,'code',t.category_code,
            'name',CASE t.category_code WHEN 'ELECTRICITY' THEN 'Điện' WHEN 'WATER' THEN 'Nước'
              WHEN 'INTERNET' THEN 'Internet' ELSE 'Khác' END),
          'reportedBy',jsonb_build_object('id',reporter.id,'displayName',reporter.display_name),
          'assignedTo',CASE WHEN assignee.id IS NULL THEN NULL ELSE
            jsonb_build_object('id',assignee.id,'displayName',assignee.display_name) END,
          'dueAt',t.due_at,'createdAt',t.created_at,'resolvedAt',t.resolved_at,'closedAt',t.closed_at,
          'resolutionNotes',t.resolution_notes,
          'isOverdue',t.status NOT IN ('resolved','closed') AND t.due_at<now(),
          'messageCount',(SELECT count(*) FROM jsonb_array_elements(t.messages) m
            WHERE NOT (m->>'isInternal')::boolean),
          'files',{{Files("t.attachment_file_ids")}},
          'messages',coalesce((SELECT jsonb_agg(jsonb_build_object(
            'id',m->>'id','body',m->>'body','isInternal',(m->>'isInternal')::boolean,
            'createdAt',m->>'createdAt','author',jsonb_build_object('id',u.id,'displayName',u.display_name),
            'files',{{Files("coalesce(m->'fileIds','[]'::jsonb)")}}) ORDER BY m->>'createdAt',m->>'id')
            FROM jsonb_array_elements(t.messages) m
            JOIN smartrent.users u ON u.id=(m->>'authorId')::uuid
            WHERE @is_admin OR NOT (m->>'isInternal')::boolean),'[]'::jsonb),
          'events',coalesce((SELECT jsonb_agg(jsonb_build_object(
            'id',coalesce(h->>'id',h->>'at',h->>'occurredAt'),
            'kind',coalesce(h->>'kind','status'),
            'fromStatus',coalesce(h->>'fromStatus',h->>'from'),
            'toStatus',coalesce(h->>'toStatus',h->>'to'),
            'reason',h->>'reason','occurredAt',coalesce(h->>'occurredAt',h->>'at'),
            'actor',CASE WHEN eu.id IS NULL THEN NULL ELSE
              jsonb_build_object('id',eu.id,'displayName',eu.display_name) END,
            'assignedTo',CASE WHEN ea.id IS NULL THEN NULL ELSE
              jsonb_build_object('id',ea.id,'displayName',ea.display_name) END)
            ORDER BY coalesce(h->>'occurredAt',h->>'at'))
            FROM jsonb_array_elements(t.history) h
            LEFT JOIN smartrent.users eu ON eu.id=nullif(h->>'actorId','')::uuid
            LEFT JOIN smartrent.users ea ON ea.id=nullif(h->>'assignedTo','')::uuid),'[]'::jsonb))::text
        FROM smartrent.tickets t JOIN smartrent.rooms r ON r.id=t.room_id
        JOIN smartrent.properties p ON p.id=r.property_id
        JOIN smartrent.users reporter ON reporter.id=t.reported_by
        LEFT JOIN smartrent.users assignee ON assignee.id=t.assigned_to
        """;
}
