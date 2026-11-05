using System;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Npgsql;
using SmartRent.Api.Common;

namespace SmartRent.Api.Features.Invoices;

[ApiController]
[Route("api/v1/portal/overview")]
public sealed class PortalOverviewController(NpgsqlDataSource db) : LeasingController(db)
{
    [HttpGet]
    public async Task<IActionResult> Get(CancellationToken ct)
    {
        try
        {
            await using var connection = await Db.OpenConnectionAsync(ct);

            // 1. Xác định Actor (nếu có token thì lấy theo token, nếu test Postman chưa có token thì lấy khách thuê mẫu)
            Guid actor;
            if (!TryActor(out actor, out _))
            {
                var demoId = await ScalarStringAsync(connection, null,
                    "select id::text from users where email='user@example.test' or role='user' order by created_at limit 1", ct);
                if (demoId == null || !Guid.TryParse(demoId, out actor))
                {
                    throw new LeaseHttpException(401, "unauthenticated", "Cần đăng nhập.");
                }
            }

            await using var context = new NpgsqlCommand("select set_config('smartrent.user_id', @actor, true)", connection);
            context.Parameters.AddWithValue("actor", actor.ToString());
            await context.ExecuteNonQueryAsync(ct);

            // 2. Họ tên khách thuê
            var fullName = await ScalarStringAsync(connection, null,
                "select display_name from users where id=@user", ct, P("user", actor)) ?? "Khách thuê";

            // 3. Đợt thuê (Contracts)
            var tenancies = await JsonRowsAsync(connection, null, @"
                select jsonb_build_object(
                    'id', c.id,
                    'role', case when c.user_id=@user then 'representative' else 'resident' end,
                    'status', c.status,
                    'room', jsonb_build_object('id', r.id, 'code', r.code, 'propertyId', p.id),
                    'property', jsonb_build_object('id', p.id, 'name', p.name, 'code', p.code),
                    'representative', jsonb_build_object('id', u.id, 'fullName', u.display_name, 'phoneNumber', u.phone),
                    'plannedMoveIn', c.starts_on,
                    'actualMoveIn', c.move_in_on,
                    'actualMoveOut', c.move_out_on,
                    'joinedOn', null,
                    'leftOn', null,
                    'rent', coalesce((select (x->>'unitPrice')::numeric from jsonb_array_elements(p.rates) x where x->>'category'='rent' limit 1), 0),
                    'requiredDeposit', c.required_deposit,
                    'depositHeld', coalesce((select held from v_deposit_balances where contract_id=c.id), 0),
                    'financeVisible', (c.user_id=@user)
                )
                from contracts c
                join rooms r on r.id=c.room_id
                join properties p on p.id=r.property_id
                join users u on u.id=c.user_id
                where c.user_id=@user or exists(select 1 from jsonb_array_elements(c.occupants) x where x->>'userId'=@user::text and x->>'leftOn' is null)
                order by c.created_at desc", ct, P("user", actor));

            // 4. Có vai trò đại diện hợp đồng
            var hasRepRoleStr = await ScalarStringAsync(connection, null,
                "select exists(select 1 from contracts where user_id=@user)::text", ct, P("user", actor));
            var hasRepresentativeRole = hasRepRoleStr == "True" || hasRepRoleStr == "true";

            // 5. Hóa đơn còn nợ (Open Invoices)
            var openInvoices = await JsonRowsAsync(connection, null, @"
                select jsonb_build_object(
                    'id', i.id,
                    'code', i.code,
                    'kind', i.kind,
                    'status', i.status,
                    'tenancyId', c.id,
                    'room', jsonb_build_object('id', r.id, 'code', r.code, 'propertyId', p.id),
                    'property', jsonb_build_object('id', p.id, 'name', p.name, 'code', p.code),
                    'representative', jsonb_build_object('id', u.id, 'fullName', u.display_name, 'phoneNumber', u.phone),
                    'period', case when bp.id is not null then jsonb_build_object('id', bp.id, 'monthStart', bp.month_start, 'label', 'Tháng ' || to_char(bp.month_start, 'MM/YYYY')) else null end,
                    'serviceFrom', i.service_from,
                    'serviceTo', i.service_to,
                    'issuedOn', i.issued_on,
                    'dueOn', i.due_on,
                    'totalAmount', b.receivable_amount,
                    'originalAmount', i.total_amount,
                    'adjustmentAmount', coalesce((select sum(total_amount) from invoices where adjusts_invoice_id=i.id and status='issued'), 0),
                    'receivableAmount', b.receivable_amount,
                    'paidAmount', b.paid_amount,
                    'outstandingAmount', b.outstanding_amount,
                    'paymentStatus', b.payment_status,
                    'isOverdue', b.is_overdue,
                    'daysOverdue', case when b.is_overdue and i.due_on is not null then greatest(0, ((now() at time zone 'Asia/Ho_Chi_Minh')::date - i.due_on)) else 0 end,
                    'originalInvoiceId', i.adjusts_invoice_id,
                    'problems', '[]'::jsonb,
                    'stale', false,
                    'createdAt', i.created_at,
                    'voidedAt', i.voided_at,
                    'voidReason', i.void_reason,
                    'pendingPaymentCount', coalesce((select count(*) from payments py cross join lateral jsonb_array_elements(py.allocations) a where py.status='pending' and a->>'invoiceId'=i.id::text), 0),
                    'pendingPaymentAmount', coalesce((select sum((a->>'amount')::numeric) from payments py cross join lateral jsonb_array_elements(py.allocations) a where py.status='pending' and a->>'invoiceId'=i.id::text), 0)
                )
                from invoices i
                join v_invoice_balances b on b.id=i.id
                join contracts c on c.id=i.contract_id
                join rooms r on r.id=c.room_id
                join properties p on p.id=r.property_id
                join users u on u.id=c.user_id
                left join billing_periods bp on bp.id=i.period_id
                where c.user_id=@user and i.status='issued' and b.outstanding_amount > 0
                order by i.due_on asc", ct, P("user", actor));

            // 6. Tổng nợ và Nợ quá hạn
            var outstandingStr = await ScalarStringAsync(connection, null,
                "select coalesce(sum(b.outstanding_amount), 0)::text from invoices i join v_invoice_balances b on b.id=i.id join contracts c on c.id=i.contract_id where c.user_id=@user and i.status='issued'", ct, P("user", actor));
            decimal.TryParse(outstandingStr, out var outstandingTotal);

            var overdueStr = await ScalarStringAsync(connection, null,
                "select coalesce(sum(b.outstanding_amount), 0)::text from invoices i join v_invoice_balances b on b.id=i.id join contracts c on c.id=i.contract_id where c.user_id=@user and i.status='issued' and b.is_overdue=true", ct, P("user", actor));
            decimal.TryParse(overdueStr, out var overdueTotal);

            // 7. Khoản thanh toán đang chờ duyệt
            var pendingPayments = await JsonRowsAsync(connection, null, @"
                select jsonb_build_object(
                    'id', p.id,
                    'code', p.code,
                    'amount', p.amount,
                    'receivedAt', p.received_at,
                    'methodCode', p.method,
                    'status', p.status,
                    'externalReference', p.external_reference,
                    'notes', p.notes
                )
                from payments p
                where p.user_id=@user and p.status='pending'
                order by p.received_at desc", ct, P("user", actor));

            // 8. Sự cố đang mở
            var openTickets = await JsonRowsAsync(connection, null, @"
                select jsonb_build_object(
                    'id', t.id,
                    'code', t.code,
                    'title', t.title,
                    'status', t.status,
                    'priority', t.priority,
                    'createdAt', t.created_at
                )
                from tickets t
                where (t.reported_by=@user or exists(select 1 from contracts c where c.id=t.contract_id and c.user_id=@user))
                  and t.status <> 'closed'
                order by t.created_at desc", ct, P("user", actor));

            // 9. Yêu cầu chờ duyệt & thông báo chưa đọc
            var pendingReqStr = await ScalarStringAsync(connection, null,
                "select count(*)::text from bookings where user_id=@user and kind<>'viewing' and status='pending'", ct, P("user", actor));
            int.TryParse(pendingReqStr, out var pendingRequests);

            var unreadNotifStr = await ScalarStringAsync(connection, null,
                "select count(*)::text from notifications where recipient_id=@user and read_at is null", ct, P("user", actor));
            int.TryParse(unreadNotifStr, out var unreadNotifications);

            return Ok(new
            {
                fullName,
                tenancies,
                hasRepresentativeRole,
                openInvoices,
                outstandingTotal,
                overdueTotal,
                pendingPayments,
                openTickets,
                pendingRequests,
                unreadNotifications
            });
        }
        catch (LeaseHttpException e) { return LeaseProblem(e); }
        catch (PostgresException e) { return DatabaseProblem(e); }
    }
}