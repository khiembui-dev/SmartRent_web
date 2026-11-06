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
            if (!TryActor(out var actor,out var role)) throw new LeaseHttpException(401,"unauthenticated","Cần đăng nhập.");
            if (role!="user") throw new LeaseHttpException(403,"customer_required","Chỉ tài khoản khách được truy cập.");

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
    // 2. Chi tiết hóa đơn (Portal - Khách thuê)
    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id, CancellationToken ct)
    {
        try
        {
            await using var connection = await Db.OpenConnectionAsync(ct);

            // Xác thực tài khoản khách từ phiên đăng nhập hiện tại.
            if (!TryActor(out var actor,out var role)) throw new LeaseHttpException(401,"unauthenticated","Cần đăng nhập.");
            if (role!="user") throw new LeaseHttpException(403,"customer_required","Chỉ tài khoản khách được truy cập.");

            await using var context = new NpgsqlCommand("select set_config('smartrent.user_id', @actor, true)", connection);
            context.Parameters.AddWithValue("actor", actor.ToString());
            await context.ExecuteNonQueryAsync(ct);

            // 2. Lấy chi tiết hóa đơn theo id và quyền sở hữu của khách thuê
            var sql = @"
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
                    'totalAmount', coalesce(b.receivable_amount, i.total_amount),
                    'originalAmount', i.total_amount,
                    'adjustmentAmount', coalesce((select sum(total_amount) from invoices where adjusts_invoice_id=i.id and status='issued'), 0),
                    'receivableAmount', coalesce(b.receivable_amount, i.total_amount),
                    'paidAmount', coalesce(b.paid_amount, 0),
                    'outstandingAmount', coalesce(b.outstanding_amount, i.total_amount),
                    'paymentStatus', coalesce(b.payment_status, 'unpaid'),
                    'isOverdue', coalesce(b.is_overdue, false),
                    'daysOverdue', case when coalesce(b.is_overdue, false) and i.due_on is not null then greatest(0, ((now() at time zone 'Asia/Ho_Chi_Minh')::date - i.due_on)) else 0 end,
                    'lines', coalesce((
                        select jsonb_agg(
                            x || jsonb_build_object(
                                'amount', round((x->>'quantity')::numeric * (x->>'unitPrice')::numeric * coalesce((x->>'sign')::integer, 1) * coalesce((x->>'numerator')::integer, 1) / coalesce((x->>'denominator')::integer, 1)),
                                'sign', coalesce((x->>'sign')::integer, 1)
                            )
                        )
                        from jsonb_array_elements(i.lines) x
                    ), '[]'::jsonb),
                    'meterSegments', coalesce((
                        select jsonb_agg(jsonb_build_object(
                            'lineId', x->>'id',
                            'startValue', case when x->>'category'='electricity' then i.electricity_start when x->>'category'='water' then i.water_start else null end,
                            'endValue', case when x->>'category'='electricity' then i.electricity_end when x->>'category'='water' then i.water_end else null end
                        ))
                        from jsonb_array_elements(i.lines) x
                        where (x->>'category'='electricity' and i.electricity_start is not null and i.electricity_end is not null)
                           or (x->>'category'='water' and i.water_start is not null and i.water_end is not null)
                    ), '[]'::jsonb),
                    'allocations', coalesce((
                        select jsonb_agg(jsonb_build_object(
                            'id', py.id,
                            'source', case when py.kind='deposit_offset' then 'deposit_offset' else 'receipt' end,
                            'payment', jsonb_build_object('code', py.code),
                            'allocatedAt', coalesce(py.confirmed_at, py.received_at),
                            'amount', (al->>'amount')::numeric,
                            'reversedAmount', 0,
                            'reversesId', null
                        ))
                        from payments py
                        cross join lateral jsonb_array_elements(py.allocations) al
                        where al->>'invoiceId' = i.id::text and py.status = 'confirmed'
                    ), '[]'::jsonb),
                    'pendingPayments', coalesce((
                        select jsonb_agg(jsonb_build_object(
                            'id', py.id,
                            'code', py.code,
                            'amount', py.amount,
                            'receivedAt', py.received_at,
                            'externalReference', py.external_reference
                        ))
                        from payments py
                        where py.status = 'pending'
                          and (
                            py.intended_invoice_id = i.id
                            or exists (select 1 from jsonb_array_elements(py.allocations) a where a->>'invoiceId' = i.id::text)
                          )
                    ), '[]'::jsonb),
                    'notes', i.notes,
                    'voidedAt', i.voided_at,
                    'voidReason', i.void_reason,
                    'createdAt', i.created_at
                )::text
                from invoices i
                left join v_invoice_balances b on b.id=i.id
                join contracts c on c.id=i.contract_id
                join rooms r on r.id=c.room_id
                join properties p on p.id=r.property_id
                join users u on u.id=c.user_id
                left join billing_periods bp on bp.id=i.period_id
                where i.id=@id
                  and c.user_id=@user
                  and i.status <> 'draft'";

            var json = await ScalarStringAsync(connection, null, sql, ct, P("id", id), P("user", actor));
            return json == null ? NotFound() : Content(json, "application/json");
        }
        catch (LeaseHttpException e) { return LeaseProblem(e); }
        catch (PostgresException e) { return DatabaseProblem(e); }
    }
    // 3. Lấy thông tin thanh toán VietQR cho hóa đơn
    [HttpGet("{id:guid}/payment-qr")]
    public async Task<IActionResult> GetPaymentQr(Guid id, CancellationToken ct)
    {
        try
        {
            await using var connection = await Db.OpenConnectionAsync(ct);
            // 1. Xác định Actor
            if (!TryActor(out var actor,out var role)) throw new LeaseHttpException(401,"unauthenticated","Cần đăng nhập.");
            if (role!="user") throw new LeaseHttpException(403,"customer_required","Chỉ tài khoản khách được truy cập.");
            // 2. Lấy thông tin hóa đơn và số nợ còn lại
            var invoiceSql = @"
                select i.code, b.outstanding_amount
                from invoices i
                join v_invoice_balances b on b.id = i.id
                join contracts c on c.id = i.contract_id
                where i.id = @id
                  and c.user_id=@user
                  and i.status = 'issued'";
            await using var cmd = new NpgsqlCommand(invoiceSql, connection);
            cmd.Parameters.AddWithValue("id", id);
            cmd.Parameters.AddWithValue("user", actor);
            await using var reader = await cmd.ExecuteReaderAsync(ct);
            if (!await reader.ReadAsync(ct))
            {
                return NotFound(new { code = "invoice_not_found", message = "Hóa đơn không tồn tại hoặc không còn nợ." });
            }
            var invoiceCode = reader.GetString(0);
            var outstandingAmount = reader.GetDecimal(1);
            await reader.CloseAsync();
            if (outstandingAmount <= 0)
            {
                return BadRequest(new { code = "already_paid", message = "Hóa đơn đã được thanh toán đủ." });
            }
            // 3. Lấy thông tin ngân hàng nhận tiền từ bảng settings
            await using var setCmd = new NpgsqlCommand(
                "select bank_name, bank_account_number, bank_account_name from settings where id=1", connection);
            await using var setReader = await setCmd.ExecuteReaderAsync(ct);
            string? bankName = null, accountNumber = null, accountName = null;
            if (await setReader.ReadAsync(ct))
            {
                bankName = setReader.IsDBNull(0) ? null : setReader.GetString(0);
                accountNumber = setReader.IsDBNull(1) ? null : setReader.GetString(1);
                accountName = setReader.IsDBNull(2) ? null : setReader.GetString(2);
            }
            await setReader.CloseAsync();
            if (string.IsNullOrWhiteSpace(accountNumber))
                return Conflict(new { code = "bank_not_configured", detail = "Chủ trọ chưa cấu hình tài khoản nhận tiền trong Cài đặt." });
            // Database hiện lưu tên ngân hàng, chưa có BIN. Trả thông tin thực;
            // chỉ sinh VietQR khi hệ thống đã bổ sung BIN được xác thực.
            string? bankBin = null, qrImageUrl = null;
            var memo = invoiceCode;
            return Ok(new
            {
                provider = "vietqr",
                invoiceId = id,
                invoiceCode,
                amount = outstandingAmount,
                transferContent = memo,
                bankName,
                bankBin,
                accountNumber,
                accountName,
                qrImageUrl
            });
        }
        catch (LeaseHttpException e) { return LeaseProblem(e); }
        catch (PostgresException e) { return DatabaseProblem(e); }
    }
}