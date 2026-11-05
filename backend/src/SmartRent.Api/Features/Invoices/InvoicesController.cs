using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Npgsql;
using SmartRent.Api.Common;

namespace SmartRent.Api.Features.Invoices;

[ApiController]
[Route("api/v1/invoices")]
public sealed class InvoicesController(NpgsqlDataSource db) : LeasingController(db)
{
    // 1. Danh sách hóa đơn Admin
    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] Guid? propertyId,
        [FromQuery] Guid? periodId,
        [FromQuery] string? status = null,
        [FromQuery] string? paymentStatus = null,
        [FromQuery] string? kind = null,
        [FromQuery] string? q = null,
        [FromQuery] string? sort = "-serviceFrom",
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 20,
        CancellationToken ct = default)
    {
        try
        {
            var (c, t, _) = await BeginAsync(true, ct);
            await using (c) await using (t)
            {
                page = Math.Max(1, page);
                pageSize = Math.Clamp(pageSize, 1, 100);

                var where = "where 1=1";
                if (propertyId.HasValue) where += " and p.id=@prop";
                if (periodId.HasValue) where += " and i.period_id=@period";
                if (!string.IsNullOrWhiteSpace(kind)) where += " and i.kind=@kind";

                if (status == "open")
                {
                    where += " and i.status='issued' and b.outstanding_amount > 0";
                }
                else if (!string.IsNullOrWhiteSpace(status))
                {
                    where += " and i.status=@status";
                }

                if (!string.IsNullOrWhiteSpace(paymentStatus))
                {
                    where += " and b.payment_status=@paymentStatus";
                }

                if (!string.IsNullOrWhiteSpace(q))
                {
                    where += " and (i.code ilike @q or r.code ilike @q or u.display_name ilike @q)";
                }

                var orderBy = sort switch
                {
                    "serviceFrom" => "order by i.service_from asc",
                    "dueOn" => "order by i.due_on asc",
                    "-dueOn" => "order by i.due_on desc",
                    _ => "order by i.service_from desc, i.created_at desc"
                };

                var countSql = $@"
                    select count(*)::text
                    from invoices i
                    left join v_invoice_balances b on b.id=i.id
                    join contracts ct on ct.id=i.contract_id
                    join rooms r on r.id=ct.room_id
                    join properties p on p.id=r.property_id
                    join users u on u.id=ct.user_id
                    {where}";

                var qParam = string.IsNullOrWhiteSpace(q) ? null : $"%{q.Trim()}%";
                var totalStr = await ScalarStringAsync(c, t, countSql, ct,
                    P("prop", propertyId), P("period", periodId), P("kind", kind),
                    P("status", status), P("paymentStatus", paymentStatus), P("q", qParam));
                int.TryParse(totalStr, out var totalItems);

                var listSql = $@"
                    select jsonb_build_object(
                        'id', i.id,
                        'code', i.code,
                        'kind', i.kind,
                        'status', i.status,
                        'tenancyId', ct.id,
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
                    left join v_invoice_balances b on b.id=i.id
                    join contracts ct on ct.id=i.contract_id
                    join rooms r on r.id=ct.room_id
                    join properties p on p.id=r.property_id
                    join users u on u.id=ct.user_id
                    left join billing_periods bp on bp.id=i.period_id
                    {where}
                    {orderBy}
                    offset @skip limit @take";

                var items = await JsonRowsAsync(c, t, listSql, ct,
                    P("prop", propertyId), P("period", periodId), P("kind", kind),
                    P("status", status), P("paymentStatus", paymentStatus), P("q", qParam),
                    P("skip", (page - 1) * pageSize), P("take", pageSize));

                await t.RollbackAsync(ct);
                var totalPages = (int)Math.Ceiling(totalItems / (double)pageSize);
                return Ok(new { items, totalItems, page, pageSize, totalPages });
            }
        }
        catch (LeaseHttpException e) { return LeaseProblem(e); }
        catch (PostgresException e) { return DatabaseProblem(e); }
    }

    // 2. Chi tiết hóa đơn Admin
    [HttpGet("{id:guid}")]
    public async Task<IActionResult> Get(Guid id, CancellationToken ct)
    {
        try
        {
            var (c, t, _) = await BeginAsync(true, ct);
            await using (c) await using (t)
            {
                var sql = @"
                    select jsonb_build_object(
                        'id', i.id,
                        'code', i.code,
                        'kind', i.kind,
                        'status', i.status,
                        'tenancyId', ct.id,
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
                        'lines', i.lines,
                        'readings', jsonb_build_object(
                            'electricity', jsonb_build_object('start', i.electricity_start, 'end', i.electricity_end, 'usage', case when i.electricity_end is not null and i.electricity_start is not null then i.electricity_end - i.electricity_start else null end, 'fromAt', i.electricity_from_at, 'toAt', i.electricity_to_at),
                            'water', jsonb_build_object('start', i.water_start, 'end', i.water_end, 'usage', case when i.water_end is not null and i.water_start is not null then i.water_end - i.water_start else null end, 'fromAt', i.water_from_at, 'toAt', i.water_to_at)
                        ),
                        'allocations', coalesce((
                            select jsonb_agg(jsonb_build_object(
                                'id', py.id,
                                'paymentId', py.id,
                                'code', py.code,
                                'amount', (a->>'amount')::numeric,
                                'receivedAt', py.received_at,
                                'method', py.method,
                                'status', py.status,
                                'canReverse', (py.status='confirmed' and py.kind='receipt')
                            ))
                            from payments py cross join lateral jsonb_array_elements(py.allocations) a
                            where a->>'invoiceId'=i.id::text and py.status='confirmed'
                        ), '[]'::jsonb),
                        'pendingPayments', coalesce((
                            select jsonb_agg(jsonb_build_object(
                                'id', py.id,
                                'code', py.code,
                                'amount', (a->>'amount')::numeric,
                                'receivedAt', py.received_at,
                                'method', py.method,
                                'status', py.status,
                                'externalReference', py.external_reference
                            ))
                            from payments py cross join lateral jsonb_array_elements(py.allocations) a
                            where a->>'invoiceId'=i.id::text and py.status='pending'
                        ), '[]'::jsonb),
                        'history', i.readings_history,
                        'voidedAt', i.voided_at,
                        'voidReason', i.void_reason,
                        'createdAt', i.created_at
                    )::text
                    from invoices i
                    left join v_invoice_balances b on b.id=i.id
                    join contracts ct on ct.id=i.contract_id
                    join rooms r on r.id=ct.room_id
                    join properties p on p.id=r.property_id
                    join users u on u.id=ct.user_id
                    left join billing_periods bp on bp.id=i.period_id
                    where i.id=@id";

                var json = await ScalarStringAsync(c, t, sql, ct, P("id", id));
                await t.RollbackAsync(ct);
                return json == null ? NotFound() : Content(json, "application/json");
            }
        }
        catch (LeaseHttpException e) { return LeaseProblem(e); }
        catch (PostgresException e) { return DatabaseProblem(e); }
    }

    // 3. Phát hành hóa đơn nháp
    [HttpPost("{id:guid}/issue")]
    public async Task<IActionResult> Issue(Guid id, CancellationToken ct)
    {
        try
        {
            var (c, t, actor) = await BeginAsync(true, ct);
            await using (c) await using (t)
            {
                var infoSql = @"
                    select i.status, p.code, i.service_from, u.id, u.display_name, r.code
                    from invoices i
                    join contracts ct on ct.id=i.contract_id
                    join rooms r on r.id=ct.room_id
                    join properties p on p.id=r.property_id
                    join users u on u.id=ct.user_id
                    where i.id=@id for update";

                await using var cmd = new NpgsqlCommand(infoSql, c, t);
                cmd.Parameters.AddWithValue("id", id);
                await using var reader = await cmd.ExecuteReaderAsync(ct);

                if (!await reader.ReadAsync(ct))
                {
                    await reader.CloseAsync();
                    await t.RollbackAsync(ct);
                    return NotFound();
                }

                var status = reader.GetString(0);
                var propCode = reader.GetString(1);
                var serviceFrom = reader.GetFieldValue<DateOnly>(2);
                var userId = reader.GetGuid(3);
                var customerName = reader.GetString(4);
                var roomCode = reader.GetString(5);
                await reader.CloseAsync();

                if (status != "draft")
                {
                    await t.RollbackAsync(ct);
                    return Conflict(new { code = "invoice_not_draft", message = "Chỉ có thể phát hành hóa đơn nháp." });
                }

                // Sinh mã hóa đơn mới
                var prefix = $"HD-{propCode}{serviceFrom:yyMM}-";
                var nextSeqStr = await ScalarStringAsync(c, t,
                    "select coalesce(max(substring(code from '[0-9]+$')::int), 0) + 1 from invoices where code like @p",
                    ct, P("p", $"{prefix}%")) ?? "1";
                int.TryParse(nextSeqStr, out var nextSeq);
                var newCode = $"{prefix}{nextSeq:D3}";

                // Cập nhật phát hành
                var updateSql = @"
                    update invoices
                    set code=@code,
                        status='issued',
                        customer_snapshot=jsonb_build_object('name', @cname, 'room', @rcode),
                        issued_on=current_date,
                        due_on=current_date + interval '5 days',
                        issued_at=now(),
                        issued_by=@actor
                    where id=@id
                    returning id::text";

                await ScalarStringAsync(c, t, updateSql, ct,
                    P("code", newCode), P("cname", customerName), P("rcode", roomCode),
                    P("actor", actor), P("id", id));

                // Gửi thông báo cho khách
                await ScalarStringAsync(c, t, @"
                    insert into notifications(recipient_id, event_key, title, body, url)
                    values(@user, 'invoice:' || @code, 'Hóa đơn mới', 'Hóa đơn ' || @code || ' đã được phát hành.', '/invoices/' || @id::text)
                    returning id::text", ct, P("user", userId), P("code", newCode), P("id", id));

                await CommitAsync(t, ct);
                return Ok(new { id, code = newCode, status = "issued" });
            }
        }
        catch (LeaseHttpException e) { return LeaseProblem(e); }
        catch (PostgresException e) { return DatabaseProblem(e); }
    }

    // 4. Tính lại tiền hóa đơn nháp
    [HttpPost("{id:guid}/recompute")]
    public async Task<IActionResult> Recompute(Guid id, CancellationToken ct)
    {
        try
        {
            var (c, t, _) = await BeginAsync(true, ct);
            await using (c) await using (t)
            {
                var infoSql = @"
                    select i.status, p.rates, i.electricity_start, i.electricity_end, i.water_start, i.water_end, i.service_from
                    from invoices i
                    join contracts ct on ct.id=i.contract_id
                    join rooms r on r.id=ct.room_id
                    join properties p on p.id=r.property_id
                    where i.id=@id for update";

                await using var cmd = new NpgsqlCommand(infoSql, c, t);
                cmd.Parameters.AddWithValue("id", id);
                await using var reader = await cmd.ExecuteReaderAsync(ct);

                if (!await reader.ReadAsync(ct))
                {
                    await reader.CloseAsync();
                    await t.RollbackAsync(ct);
                    return NotFound();
                }

                if (reader.GetString(0) != "draft")
                {
                    await reader.CloseAsync();
                    await t.RollbackAsync(ct);
                    return Conflict(new { code = "invoice_not_draft", message = "Chỉ có thể tính lại tiền cho hóa đơn nháp." });
                }

                var ratesRaw = reader.GetString(1);
                var elecStart = reader.IsDBNull(2) ? 0 : reader.GetDecimal(2);
                var elecEnd = reader.IsDBNull(3) ? 0 : reader.GetDecimal(3);
                var waterStart = reader.IsDBNull(4) ? 0 : reader.GetDecimal(4);
                var waterEnd = reader.IsDBNull(5) ? 0 : reader.GetDecimal(5);
                var serviceFrom = reader.GetFieldValue<DateOnly>(6);
                await reader.CloseAsync();

                decimal rentPrice = 3000000, elecRate = 4000, waterRate = 20000;
                using var pRatesDoc = JsonDocument.Parse(ratesRaw);
                foreach (var rateEl in pRatesDoc.RootElement.EnumerateArray())
                {
                    var cat = rateEl.TryGetProperty("category", out var pC) ? pC.GetString() : "";
                    var price = rateEl.TryGetProperty("unitPrice", out var pPrc) ? pPrc.GetDecimal() : 0;
                    if (cat == "rent" && price > 0) rentPrice = price;
                    if (cat == "electricity" && price > 0) elecRate = price;
                    if (cat == "water" && price > 0) waterRate = price;
                }

                var elecUsage = Math.Max(0, elecEnd - elecStart);
                var waterUsage = Math.Max(0, waterEnd - waterStart);

                var linesList = new List<object>
                {
                    new { id = "line-rent", code = "RENT", category = "rent", description = $"Tiền phòng tháng {serviceFrom.Month}/{serviceFrom.Year}", unit = "tháng", quantity = 1, unitPrice = rentPrice },
                    new { id = "line-electric", code = "ELECTRICITY", category = "electricity", description = $"Tiền điện ({elecUsage} kWh)", unit = "kWh", quantity = elecUsage, unitPrice = elecRate },
                    new { id = "line-water", code = "WATER", category = "water", description = $"Tiền nước ({waterUsage} m³)", unit = "m³", quantity = waterUsage, unitPrice = waterRate }
                };

                var linesJson = JsonSerializer.Serialize(linesList);
                await ScalarStringAsync(c, t, "update invoices set lines=@lines::jsonb where id=@id returning id::text",
                    ct, P("lines", linesJson), P("id", id));

                await CommitAsync(t, ct);
                return Ok(new { id, status = "draft", message = "Đã tính lại tiền thành công" });
            }
        }
        catch (LeaseHttpException e) { return LeaseProblem(e); }
        catch (PostgresException e) { return DatabaseProblem(e); }
    }

    // 5. Xóa hóa đơn nháp
    [HttpDelete("{id:guid}")]
    public async Task<IActionResult> DeleteDraft(Guid id, CancellationToken ct)
    {
        try
        {
            var (c, t, _) = await BeginAsync(true, ct);
            await using (c) await using (t)
            {
                var status = await ScalarStringAsync(c, t, "select status from invoices where id=@id", ct, P("id", id));
                if (status == null)
                {
                    await t.RollbackAsync(ct);
                    return NotFound();
                }

                if (status != "draft")
                {
                    await t.RollbackAsync(ct);
                    return Conflict(new { code = "cannot_delete_issued", message = "Không thể xóa hóa đơn đã phát hành. Vui lòng dùng chức năng Hủy hóa đơn." });
                }

                await ScalarStringAsync(c, t, "delete from invoices where id=@id returning id::text", ct, P("id", id));
                await CommitAsync(t, ct);
                return NoContent();
            }
        }
        catch (LeaseHttpException e) { return LeaseProblem(e); }
        catch (PostgresException e) { return DatabaseProblem(e); }
    }

    // 6. Hủy hóa đơn đã phát hành (Void)
    [HttpPost("{id:guid}/void")]
    public async Task<IActionResult> Void(Guid id, [FromBody] JsonElement body, CancellationToken ct)
    {
        try
        {
            var reason = body.TryGetProperty("reason", out var pR) ? pR.GetString() : null;
            if (string.IsNullOrWhiteSpace(reason))
            {
                return BadRequest(new { code = "reason_required", message = "Cần nhập lý do hủy hóa đơn." });
            }

            var (c, t, _) = await BeginAsync(true, ct);
            await using (c) await using (t)
            {
                var invInfoSql = @"
                    select i.status, coalesce(b.paid_amount, 0)
                    from invoices i
                    left join v_invoice_balances b on b.id=i.id
                    where i.id=@id";

                await using var cmd = new NpgsqlCommand(invInfoSql, c, t);
                cmd.Parameters.AddWithValue("id", id);
                await using var reader = await cmd.ExecuteReaderAsync(ct);

                if (!await reader.ReadAsync(ct))
                {
                    await reader.CloseAsync();
                    await t.RollbackAsync(ct);
                    return NotFound();
                }

                var status = reader.GetString(0);
                var paidAmount = reader.GetDecimal(1);
                await reader.CloseAsync();

                if (status == "draft")
                {
                    await t.RollbackAsync(ct);
                    return Conflict(new { code = "draft_cannot_void", message = "Hóa đơn nháp không cần hủy, hãy dùng nút xóa." });
                }

                if (status == "void")
                {
                    await t.RollbackAsync(ct);
                    return Conflict(new { code = "already_void", message = "Hóa đơn này đã bị hủy trước đó." });
                }

                if (paidAmount > 0)
                {
                    await t.RollbackAsync(ct);
                    return Conflict(new { code = "invoice_has_payments", message = "Hóa đơn đã có khoản thanh toán được duyệt, cần hoàn tác thanh toán trước khi hủy." });
                }

                var updateSql = @"
                    update invoices
                    set status='void',
                        voided_at=now(),
                        void_reason=@reason
                    where id=@id
                    returning jsonb_build_object('id', id, 'status', status, 'voidedAt', voided_at, 'voidReason', void_reason)::text";

                var json = await ScalarStringAsync(c, t, updateSql, ct, P("reason", reason), P("id", id));
                await CommitAsync(t, ct);
                return Content(json!, "application/json");
            }
        }
        catch (LeaseHttpException e) { return LeaseProblem(e); }
        catch (PostgresException e) { return DatabaseProblem(e); }
    }
}