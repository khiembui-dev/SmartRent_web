using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Npgsql;
using SmartRent.Api.Common;
using SmartRent.Api.Features.Billing;

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
            await using (c)
            await using (t)
            {
                page = Math.Max(1, page);
                pageSize = Math.Clamp(pageSize, 1, 100);

                var where = "where 1=1";
                if (propertyId.HasValue)
                    where += " and p.id=@prop";
                if (periodId.HasValue)
                    where += " and i.period_id=@period";
                if (!string.IsNullOrWhiteSpace(kind))
                    where += " and i.kind=@kind";

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

                var month = Request.Query["month"].ToString();
                if (month != "")
                {
                    if (!DateOnly.TryParse(month + "-01", out _))
                        throw new LeaseHttpException(422, "invalid_month", "Tháng không hợp lệ.");
                    where += " and to_char(coalesce((select month_start from billing_periods where id=i.period_id),i.service_from),'YYYY-MM')=@month";
                }
                if (Request.Query["balance"] == "outstanding")
                    where += " and b.outstanding_amount>0";
                if (Request.Query["overdue"] == "true")
                    where += " and b.is_overdue";
                if (Request.Query["hasPending"] == "true")
                    where += " and exists(select 1 from payments py where py.intended_invoice_id=i.id and py.status='pending')";
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
                    P("month", month), P("prop", propertyId), P("period", periodId), P("kind", kind),
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
                    P("month", month), P("prop", propertyId), P("period", periodId), P("kind", kind),
                    P("status", status), P("paymentStatus", paymentStatus), P("q", qParam),
                    P("skip", (page - 1) * pageSize), P("take", pageSize));

                await t.RollbackAsync(ct);
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
            await using (c)
            await using (t)
            {
                var result = await InvoiceData.Get(c, t, id, ct);
                await t.RollbackAsync(ct);
                return Ok(result);
            }
        }
        catch (LeaseHttpException e) { return LeaseProblem(e); }
        catch (PostgresException e) { return DatabaseProblem(e); }
    }

    // 3. Phát hành hóa đơn nháp
    [HttpPost("{id:guid}/issue")] public Task<IActionResult> Issue(Guid id, CancellationToken ct) => Compute(id, true, ct);
    [HttpPost("{id:guid}/recompute")] public Task<IActionResult> Recompute(Guid id, CancellationToken ct) => Compute(id, false, ct);
    private async Task<IActionResult> Compute(Guid id, bool issue, CancellationToken ct)
    {
        try
        {
            var (c, t, actor) = await BeginAsync(true, ct);
            await using (c)
            await using (t)
            {
                await BillingEngine.Recompute(c, t, id, issue, actor, ct);
                var result = await InvoiceData.Get(c, t, id, ct);
                await CommitAsync(t, ct);
                return Ok(result);
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
            await using (c)
            await using (t)
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
                    return Conflict(new
                    {
                        code = "cannot_delete_issued",
                        message = "Không thể xóa hóa đơn đã phát hành. Vui lòng dùng chức năng Hủy hóa đơn."
                    });
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
                return BadRequest(new
                {
                    code = "reason_required",
                    message = "Cần nhập lý do hủy hóa đơn."
                });
            }

            var (c, t, _) = await BeginAsync(true, ct);
            await using (c)
            await using (t)
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
                    return Conflict(new
                    {
                        code = "draft_cannot_void",
                        message = "Hóa đơn nháp không cần hủy, hãy dùng nút xóa."
                    });
                }

                if (status == "void")
                {
                    await t.RollbackAsync(ct);
                    return Conflict(new
                    {
                        code = "already_void",
                        message = "Hóa đơn này đã bị hủy trước đó."
                    });
                }

                if (paidAmount > 0)
                {
                    await t.RollbackAsync(ct);
                    return Conflict(new
                    {
                        code = "invoice_has_payments",
                        message = "Hóa đơn đã có khoản thanh toán được duyệt, cần hoàn tác thanh toán trước khi hủy."
                    });
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