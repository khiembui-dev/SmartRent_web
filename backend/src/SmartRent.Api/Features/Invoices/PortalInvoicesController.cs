using System;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Npgsql;
using SmartRent.Api.Common;

namespace SmartRent.Api.Features.Invoices;

[ApiController]
[Route("api/v1/portal/invoices")]
public sealed class PortalInvoicesController(NpgsqlDataSource db) : LeasingController(db)
{
    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 12,
        [FromQuery] string? sort = "-serviceFrom",
        [FromQuery] string? q = null,
        [FromQuery] string? status = null,
        [FromQuery] string? paymentStatus = null,
        [FromQuery] bool? hasPending = null,
        CancellationToken ct = default)
    {
        try
        {
            await using var connection = await Db.OpenConnectionAsync(ct);

            // 1. Xác định Actor
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

            page = Math.Max(1, page);
            pageSize = Math.Clamp(pageSize, 1, 100);

            // 2. Xây dựng điều kiện lọc
            var where = "where c.user_id=@user";

            if (status == "open")
            {
                where += " and i.status='issued' and b.outstanding_amount > 0";
            }
            else if (!string.IsNullOrWhiteSpace(status))
            {
                where += " and i.status=@status";
            }
            else
            {
                where += " and i.status<>'draft'";
            }

            if (!string.IsNullOrWhiteSpace(paymentStatus))
            {
                where += " and b.payment_status=@paymentStatus";
            }

            if (hasPending == true)
            {
                where += " and exists(select 1 from payments py cross join lateral jsonb_array_elements(py.allocations) a where py.status='pending' and a->>'invoiceId'=i.id::text)";
            }
            else if (hasPending == false)
            {
                where += " and not exists(select 1 from payments py cross join lateral jsonb_array_elements(py.allocations) a where py.status='pending' and a->>'invoiceId'=i.id::text)";
            }

            if (!string.IsNullOrWhiteSpace(q))
            {
                where += " and (i.code ilike @q or r.code ilike @q)";
            }

            var orderBy = sort switch
            {
                "serviceFrom" => "order by i.service_from asc",
                "dueOn" => "order by i.due_on asc",
                "-dueOn" => "order by i.due_on desc",
                _ => "order by i.service_from desc"
            };

            // 3. Đếm tổng số bản ghi
            var countSql = $@"
                select count(*)::text
                from invoices i
                join v_invoice_balances b on b.id=i.id
                join contracts c on c.id=i.contract_id
                join rooms r on r.id=c.room_id
                {where}";

            var qParam = string.IsNullOrWhiteSpace(q) ? null : $"%{q.Trim()}%";
            var totalStr = await ScalarStringAsync(connection, null, countSql, ct,
                P("user", actor), P("status", status), P("paymentStatus", paymentStatus), P("q", qParam));
            int.TryParse(totalStr, out var totalItems);

            // 4. Lấy danh sách phân trang
            var listSql = $@"
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
                {where}
                {orderBy}
                offset @skip limit @take";

            var items = await JsonRowsAsync(connection, null, listSql, ct,
                P("user", actor), P("status", status), P("paymentStatus", paymentStatus), P("q", qParam),
                P("skip", (page - 1) * pageSize), P("take", pageSize));

            var totalPages = (int)Math.Ceiling(totalItems / (double)pageSize);

            return Ok(new
            {
                items,
                totalItems,
                page,
                pageSize,
                totalPages
            });
        }
        catch (LeaseHttpException e) { return LeaseProblem(e); }
        catch (PostgresException e) { return DatabaseProblem(e); }
    }
}