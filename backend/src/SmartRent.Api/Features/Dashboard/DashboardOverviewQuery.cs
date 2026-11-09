using Npgsql;
using NpgsqlTypes;

namespace SmartRent.Api.Features.Dashboard;

// Một snapshot JSON cho đúng hợp đồng dữ liệu mà frontend/src/pages/admin/dashboard.js đang đọc.
// Mỗi số được truy vấn từ PostgreSQL; không lấy từ mock hay localStorage.
internal static class DashboardOverviewQuery
{
    private const string Sql = """
        WITH clock AS (
          SELECT (now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS today,
                 @month_start::date AS selected_month,
                 date_trunc('month', now() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS current_month
        ),
        scoped_properties AS (
          SELECT p.* FROM smartrent.properties p
          WHERE @property_id IS NULL OR p.id = @property_id
        ),
        scoped_rooms AS (
          SELECT r.id, r.code, r.property_id, p.code AS property_code,
                 p.name AS property_name, r.occupancy_status,
                 ac.id AS contract_id, u.display_name AS tenant_name,
                 EXISTS (
                   SELECT 1 FROM smartrent.bookings b
                   WHERE b.room_id = r.id AND b.hold_status = 'holding'
                     AND b.hold_expires_at > now()
                 ) AS has_hold
          FROM smartrent.v_room_occupancy r
          JOIN scoped_properties p ON p.id = r.property_id
          LEFT JOIN LATERAL (
            SELECT c.id, c.user_id FROM smartrent.contracts c
            WHERE c.room_id = r.id AND c.status = 'active'
            ORDER BY c.starts_on DESC LIMIT 1
          ) ac ON true
          LEFT JOIN smartrent.users u ON u.id = ac.user_id
        ),
        scoped_invoices AS (
          SELECT i.id, i.code, i.contract_id, i.status, i.kind,
                 i.due_on, coalesce(bp.month_start, i.service_from) AS period_day,
                 b.receivable_amount, b.paid_amount, b.outstanding_amount,
                 b.is_overdue, r.id AS room_id, r.code AS room_code,
                 u.display_name AS tenant_name
          FROM smartrent.invoices i
          JOIN smartrent.v_invoice_balances b ON b.id = i.id
          JOIN smartrent.contracts c ON c.id = i.contract_id
          JOIN scoped_rooms r ON r.id = c.room_id
          JOIN smartrent.users u ON u.id = c.user_id
          LEFT JOIN smartrent.billing_periods bp ON bp.id = i.period_id
        ),
        issued AS (
          SELECT * FROM scoped_invoices
          WHERE status = 'issued' AND kind NOT IN ('debit_adjustment','credit_adjustment')
        ),
        scoped_payments AS (
          SELECT p.* FROM smartrent.payments p
          LEFT JOIN smartrent.contracts c ON c.id = p.contract_id
          LEFT JOIN smartrent.rooms r ON r.id = c.room_id
          WHERE r.property_id IN (SELECT id FROM scoped_properties)
             OR (p.contract_id IS NULL AND @property_id IS NULL)
        ),
        cash AS (
          SELECT p.id, p.kind, p.status, p.amount,
                 (p.received_at AT TIME ZONE 'Asia/Ho_Chi_Minh')::date AS received_day,
                 coalesce((SELECT sum((a.value->>'amount')::numeric)
                   FROM jsonb_array_elements(p.allocations) a),0) AS invoice_amount
          FROM scoped_payments p
        ),
        scoped_bookings AS (
          SELECT b.*, r.code AS room_code
          FROM smartrent.bookings b JOIN scoped_rooms r ON r.id = b.room_id
          WHERE b.kind = 'viewing'
        ),
        scheduled_viewings AS (
          SELECT b.id, b.room_id, b.room_code, b.contact_name,
                 (a.item->>'startsAt')::timestamptz AS starts_at
          FROM scoped_bookings b
          CROSS JOIN LATERAL jsonb_array_elements(b.appointments) a(item)
          WHERE a.item->>'status' = 'scheduled'
            AND (a.item->>'startsAt')::timestamptz > now()
        ),
        scoped_tickets AS (
          SELECT t.*, r.code AS room_code FROM smartrent.tickets t
          JOIN scoped_rooms r ON r.id = t.room_id
        ),
        scoped_contracts AS (
          SELECT c.*, r.code AS room_code, u.display_name AS tenant_name
          FROM smartrent.contracts c JOIN scoped_rooms r ON r.id = c.room_id
          JOIN smartrent.users u ON u.id = c.user_id
        ),
        billing AS (
          SELECT count(*)::int AS tenancy_count,
                 count(*) FILTER (WHERE i.id IS NULL OR (i.status='draft' AND EXISTS (
                   SELECT 1 FROM jsonb_array_elements(c.versions) v CROSS JOIN LATERAL jsonb_array_elements(v->'rates') rate
                   WHERE nullif(v->>'signedAt','') IS NOT NULL AND rate->>'method'='metered' AND
                     ((rate->>'category'='electricity' AND i.electricity_end IS NULL) OR
                      (rate->>'category'='water' AND i.water_end IS NULL)))))::int AS missing_readings,
                 count(*) FILTER (WHERE i.status = 'draft' AND NOT EXISTS (
                   SELECT 1 FROM jsonb_array_elements(c.versions) v CROSS JOIN LATERAL jsonb_array_elements(v->'rates') rate
                   WHERE nullif(v->>'signedAt','') IS NOT NULL AND rate->>'method'='metered' AND
                     ((rate->>'category'='electricity' AND i.electricity_end IS NULL) OR
                      (rate->>'category'='water' AND i.water_end IS NULL))))::int AS draft_count,
                 count(*) FILTER (WHERE i.status = 'issued')::int AS invoiced
          FROM scoped_contracts c CROSS JOIN clock k
          LEFT JOIN smartrent.billing_periods bp ON bp.property_id =
            (SELECT property_id FROM smartrent.rooms WHERE id = c.room_id)
            AND bp.month_start = k.current_month
          LEFT JOIN smartrent.invoices i ON i.contract_id = c.id
            AND i.period_id = bp.id AND i.status <> 'void'
            AND i.kind = 'periodic'
          WHERE c.status = 'active'
        ),
        room_counts AS (
          SELECT count(*)::int AS total,
                 count(*) FILTER (WHERE occupancy_status = 'occupied')::int AS occupied,
                 count(*) FILTER (WHERE occupancy_status IN ('available','reserved'))::int AS available,
                 count(*) FILTER (WHERE occupancy_status = 'reserved')::int AS held,
                 count(*) FILTER (WHERE occupancy_status = 'maintenance')::int AS maintenance,
                 count(*) FILTER (WHERE occupancy_status = 'inactive')::int AS inactive
          FROM scoped_rooms
        ),
        invoice_counts AS (
          SELECT coalesce(sum(outstanding_amount),0) AS outstanding,
                 coalesce(sum(outstanding_amount) FILTER (WHERE is_overdue),0) AS overdue_amount,
                 count(*) FILTER (WHERE is_overdue)::int AS overdue_count
          FROM issued
        ),
        ticket_counts AS (
          SELECT count(*) FILTER (WHERE status NOT IN ('resolved','closed'))::int AS open_count,
                 count(*) FILTER (WHERE status NOT IN ('resolved','closed') AND due_at < now())::int AS overdue_count,
                 count(*) FILTER (WHERE status = 'new')::int AS new_count
          FROM scoped_tickets
        ),
        booking_counts AS (
          SELECT (SELECT count(*) FROM scoped_bookings b
                  WHERE b.status IN ('new','accepted','consulting')
                    AND NOT EXISTS (SELECT 1 FROM scheduled_viewings v WHERE v.id=b.id))::int AS pending_count,
                 (SELECT count(*) FROM scheduled_viewings)::int AS upcoming_count
        ),
        contract_counts AS (
          SELECT count(*) FILTER (WHERE status = 'active' AND ends_on > k.today
                   AND ends_on <= k.today + 30)::int AS expiring_count,
                 count(*) FILTER (WHERE status = 'active' AND ends_on <= k.today)::int AS expired_count
          FROM scoped_contracts CROSS JOIN clock k
        ),
        period_stats AS (
          SELECT date_trunc('month', period_day)::date AS month_day,
                 coalesce(sum(receivable_amount),0) AS receivable,
                 coalesce(sum(paid_amount),0) AS allocated,
                 coalesce(sum(outstanding_amount),0) AS outstanding,
                 coalesce(sum(outstanding_amount) FILTER (WHERE is_overdue),0) AS overdue,
                 count(*)::int AS invoice_count
          FROM issued GROUP BY 1
        ),
        selected_cash AS (
          SELECT coalesce(sum(CASE WHEN kind IN ('receipt','deposit_receipt') THEN amount
                            WHEN kind IN ('receipt_reversal','deposit_refund') THEN -amount
                            ELSE 0 END),0) AS total,
                 coalesce(sum(CASE WHEN kind = 'receipt' THEN invoice_amount
                            WHEN kind = 'receipt_reversal' THEN -invoice_amount
                            ELSE 0 END),0) AS to_invoices,
                 coalesce(sum(CASE WHEN kind = 'deposit_receipt' THEN amount
                            WHEN kind = 'deposit_refund' THEN -amount
                            ELSE 0 END),0) AS to_deposit
          FROM cash CROSS JOIN clock k
          WHERE status = 'confirmed'
            AND received_day >= k.selected_month
            AND received_day < (k.selected_month + interval '1 month')::date
        ),
        pending_cash AS (
          SELECT count(*)::int AS pending_count,
                 coalesce(sum(amount),0) AS pending_amount
          FROM scoped_payments WHERE status = 'pending'
        ),
        deposits AS (
          SELECT coalesce(sum(d.held),0) AS held
          FROM smartrent.v_deposit_balances d
          JOIN scoped_contracts c ON c.id = d.contract_id
          WHERE c.status IN ('active','planned')
        )
        SELECT jsonb_build_object(
          'scope', jsonb_build_object(
            'properties', coalesce((SELECT jsonb_agg(jsonb_build_object(
              'id',id,'code',code,'name',name) ORDER BY name) FROM scoped_properties),'[]'::jsonb),
            'month', to_char(k.selected_month,'YYYY-MM'),
            'label', 'Tháng ' || extract(month FROM k.selected_month)::int || '/' || extract(year FROM k.selected_month)::int,
            'asOf', k.today, 'allProperties', @property_id IS NULL),
          'rooms', jsonb_build_object(
            'total',rc.total,'occupied',rc.occupied,'available',rc.available,
            'maintenance',rc.maintenance,'inactive',rc.inactive,
            'availableWithUpcoming',rc.held,
            'occupancyRate',CASE WHEN rc.total - rc.inactive > 0
              THEN round(100.0 * rc.occupied / (rc.total - rc.inactive),1) ELSE 0 END,
            'strip',coalesce((SELECT jsonb_agg(jsonb_build_object(
              'id',r.id,'code',r.code,'propertyCode',r.property_code,
              'propertyName',r.property_name,
              'status',CASE WHEN r.occupancy_status = 'reserved' THEN 'available'
                            ELSE r.occupancy_status END,
              'upcoming',CASE WHEN r.occupancy_status = 'reserved' THEN 'held' ELSE NULL END,
              'tenantName',r.tenant_name,
              'needsReading',r.contract_id IS NOT NULL AND NOT EXISTS (
                SELECT 1 FROM scoped_invoices i JOIN clock x ON true
                WHERE i.contract_id = r.contract_id AND i.status <> 'void'
                  AND date_trunc('month',i.period_day)::date = x.current_month),
              'overdue',EXISTS (SELECT 1 FROM issued i WHERE i.contract_id = r.contract_id
                            AND i.is_overdue)) ORDER BY r.property_name,r.code)
              FROM scoped_rooms r),'[]'::jsonb)),
          'finance',jsonb_build_object(
            'period',jsonb_build_object(
              'month',to_char(k.selected_month,'YYYY-MM'),
              'label','Tháng ' || extract(month FROM k.selected_month)::int || '/' || extract(year FROM k.selected_month)::int,
              'receivable',coalesce(ps.receivable,0),'allocated',coalesce(ps.allocated,0),
              'outstanding',coalesce(ps.outstanding,0),'overdue',coalesce(ps.overdue,0),
              'count',coalesce(ps.invoice_count,0)),
            'overdueOutstanding',ic.overdue_amount,'overdueCount',ic.overdue_count,
            'totalOutstanding',ic.outstanding,
            'collectedThisMonth',jsonb_build_object(
              'total',sc.total,'toInvoices',sc.to_invoices,'toDeposit',sc.to_deposit,
              'unapplied',sc.total - sc.to_invoices - sc.to_deposit),
            'pendingReported',jsonb_build_object('count',pc.pending_count,'amount',pc.pending_amount),
            'depositHeld',dep.held),
          'billing',jsonb_build_object(
            'tenancyCount',bi.tenancy_count,'missingReadings',bi.missing_readings,
            'readyToInvoice',0,'draftCount',bi.draft_count,'invoiced',bi.invoiced,'blocked',0,
            'month',to_char(k.current_month,'YYYY-MM'),
            'label','Tháng ' || extract(month FROM k.current_month)::int || '/' || extract(year FROM k.current_month)::int,
            'schedule',jsonb_build_object(
              'meterReadingDay',s.meter_reading_day,'invoiceCreateDay',s.invoice_create_day,
              'reminderEnabled',s.reminder_enabled,
              'readingDue',s.reminder_enabled AND extract(day FROM k.today) >= s.meter_reading_day
                AND bi.missing_readings > 0,
              'invoiceDue',false)),
          'viewings',jsonb_build_object('pending',bc.pending_count,'upcoming',bc.upcoming_count),
          'tickets',jsonb_build_object('open',tc.open_count,'overdue',tc.overdue_count,'new',tc.new_count),
          'contracts',jsonb_build_object('expiring',cc.expiring_count,'expiredOccupied',cc.expired_count),
          'tasks',jsonb_build_array(
            jsonb_build_object('key','overdue','label','Hóa đơn quá hạn còn nợ','count',ic.overdue_count,'url','/admin/invoices?overdue=true','tone','danger'),
            jsonb_build_object('key','expired_occupied','label','Hợp đồng đã hết hạn, khách vẫn ở','count',cc.expired_count,'url','/admin/contracts?stillOccupied=true','tone','danger'),
            jsonb_build_object('key','sla_overdue','label','Ticket quá hạn xử lý','count',tc.overdue_count,'url','/admin/tickets?overdue=true','tone','danger'),
            jsonb_build_object('key','missing_readings','label','Phòng chưa nhập số điện nước tháng này','count',bi.missing_readings,'url','/admin/billing?group=missing_readings','tone','warning'),
            jsonb_build_object('key','pending_payments','label','Báo chuyển khoản chờ xác minh','count',pc.pending_count,'url','/admin/invoices?hasPending=true','tone','warning'),
            jsonb_build_object('key','new_inquiries','label','Yêu cầu xem phòng chờ xếp lịch','count',bc.pending_count,'url','/admin/viewings','tone','warning'),
            jsonb_build_object('key','expiring','label','Hợp đồng sắp hết hạn','count',cc.expiring_count,'url','/admin/contracts?expiring=true','tone','warning'),
            jsonb_build_object('key','new_tickets','label','Ticket mới chưa tiếp nhận','count',tc.new_count,'url','/admin/tickets?status=new','tone','info'),
            jsonb_build_object('key','drafts','label','Hóa đơn nháp chưa phát hành','count',(SELECT count(*) FROM scoped_invoices WHERE status='draft'),'url','/admin/invoices?status=draft','tone','info')),
          'charts',jsonb_build_object(
            'monthly',coalesce((SELECT jsonb_agg(jsonb_build_object(
              'month',to_char(g.day,'YYYY-MM'),
              'label','Tháng ' || extract(month FROM g.day)::int || '/' || extract(year FROM g.day)::int,
              'receivable',coalesce(x.receivable,0),'allocated',coalesce(x.allocated,0),
              'outstanding',coalesce(x.outstanding,0),'overdue',coalesce(x.overdue,0),
              'count',coalesce(x.invoice_count,0)) ORDER BY g.day)
              FROM generate_series(k.selected_month - interval '5 months',k.selected_month,interval '1 month') g(day)
              LEFT JOIN period_stats x ON x.month_day = g.day::date),'[]'::jsonb),
            'occupancy','[]'::jsonb),
          'recent',jsonb_build_object(
            'inquiries',coalesce((SELECT jsonb_agg(x.item ORDER BY x.created_at DESC) FROM (
              SELECT b.created_at,jsonb_build_object('id',b.id,'room',jsonb_build_object('id',b.room_id,'code',b.room_code),
                'contactName',b.contact_name,'status',b.status) AS item
              FROM scoped_bookings b WHERE b.status IN ('new','accepted','consulting')
                AND NOT EXISTS (SELECT 1 FROM scheduled_viewings v WHERE v.id=b.id)
              ORDER BY b.created_at DESC LIMIT 5) x),'[]'::jsonb),
            'viewings',coalesce((SELECT jsonb_agg(x.item ORDER BY x.starts_at) FROM (
              SELECT v.starts_at,
                jsonb_build_object('id',v.id,'startsAt',v.starts_at,
                  'inquiry',jsonb_build_object('room',jsonb_build_object('id',v.room_id,'code',v.room_code),
                    'contactName',v.contact_name)) AS item
              FROM scheduled_viewings v
              ORDER BY v.starts_at LIMIT 5) x),'[]'::jsonb),
            'overdueInvoices',coalesce((SELECT jsonb_agg(x.item ORDER BY x.due_on) FROM (
              SELECT i.due_on,jsonb_build_object('id',i.id,'room',jsonb_build_object('id',i.room_id,'code',i.room_code),
                'representative',jsonb_build_object('fullName',i.tenant_name),
                'daysOverdue',k.today-i.due_on,'outstandingAmount',i.outstanding_amount) AS item
              FROM issued i WHERE i.is_overdue ORDER BY i.due_on LIMIT 5) x),'[]'::jsonb),
            'expiringContracts',coalesce((SELECT jsonb_agg(x.item ORDER BY x.ends_on) FROM (
              SELECT c.ends_on,jsonb_build_object('id',c.id,'room',jsonb_build_object('id',c.room_id,'code',c.room_code),
                'representative',jsonb_build_object('fullName',c.tenant_name),
                'displayEndOn',c.ends_on-1,'daysLeft',c.ends_on-k.today) AS item
              FROM scoped_contracts c WHERE c.status='active' AND c.ends_on IS NOT NULL
                AND c.ends_on <= k.today + 30 ORDER BY c.ends_on LIMIT 5) x),'[]'::jsonb),
            'tickets',coalesce((SELECT jsonb_agg(x.item ORDER BY x.due_at) FROM (
              SELECT t.due_at,jsonb_build_object('id',t.id,'room',jsonb_build_object('id',t.room_id,'code',t.room_code),
                'title',t.title,'code',t.code,'isOverdue',t.due_at<now(),
                'priority',t.priority) AS item
              FROM scoped_tickets t WHERE t.status NOT IN ('resolved','closed')
              ORDER BY t.due_at LIMIT 5) x),'[]'::jsonb))
        )::text
        FROM clock k CROSS JOIN room_counts rc CROSS JOIN invoice_counts ic
        CROSS JOIN ticket_counts tc CROSS JOIN booking_counts bc
        CROSS JOIN contract_counts cc CROSS JOIN billing bi
        CROSS JOIN selected_cash sc CROSS JOIN pending_cash pc CROSS JOIN deposits dep
        CROSS JOIN smartrent.settings s
        LEFT JOIN period_stats ps ON ps.month_day = k.selected_month;
        """;

    public static async Task<string> ExecuteAsync(NpgsqlDataSource source, DateOnly monthStart,
        Guid? propertyId, CancellationToken cancellationToken)
    {
        await using var command = source.CreateCommand(Sql);
        command.Parameters.Add("month_start", NpgsqlDbType.Date).Value = monthStart;
        command.Parameters.Add("property_id", NpgsqlDbType.Uuid).Value =
            (object?)propertyId ?? DBNull.Value;
        return (string?)await command.ExecuteScalarAsync(cancellationToken)
            ?? throw new InvalidOperationException("Chưa có bản ghi settings cho Dashboard.");
    }
}
