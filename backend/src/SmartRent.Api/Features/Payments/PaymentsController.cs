using System;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Npgsql;
using SmartRent.Api.Common;

namespace SmartRent.Api.Features.Payments;

[ApiController]
[Route("api/v1/payments")]
public sealed class PaymentsController(NpgsqlDataSource db) : LeasingController(db)
{
    // 1. Tạo phiếu thu tiền / Ghi nhận thanh toán
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] JsonElement body, CancellationToken ct = default)
    {
        try
        {
            var amount = body.TryGetProperty("amount", out var pAmt) ? pAmt.GetDecimal() : 0;
            var method = body.TryGetProperty("method", out var pM) ? pM.GetString() : "cash";
            var externalRef = body.TryGetProperty("externalReference", out var pRef) ? pRef.GetString() : null;
            var notes = body.TryGetProperty("notes", out var pN) ? pN.GetString() : null;
            var invoiceId = body.TryGetProperty("invoiceId", out var pInv) && pInv.TryGetGuid(out var invGuid) ? invGuid : (Guid?)null;

            if (amount <= 0)
            {
                return BadRequest(new { code = "validation_failed", message = "Số tiền thanh toán phải lớn hơn 0." });
            }

            var (c, t, actor) = await BeginAsync(true, ct);
            await using (c) await using (t)
            {
                Guid userId = Guid.Empty;
                Guid? contractId = null;

                if (invoiceId.HasValue)
                {
                    var invSql = @"
                        select ct.user_id, ct.id
                        from invoices i
                        join contracts ct on ct.id = i.contract_id
                        where i.id = @inv";

                    await using var cmd = new NpgsqlCommand(invSql, c, t);
                    cmd.Parameters.AddWithValue("inv", invoiceId.Value);
                    await using var reader = await cmd.ExecuteReaderAsync(ct);

                    if (await reader.ReadAsync(ct))
                    {
                        userId = reader.GetGuid(0);
                        contractId = reader.GetGuid(1);
                    }
                    await reader.CloseAsync();
                }

                if (userId == Guid.Empty)
                {
                    await t.RollbackAsync(ct);
                    return BadRequest(new { code = "invoice_required", message = "Cần chọn hóa đơn hợp lệ để ghi nhận thanh toán." });
                }

                var codeStr = await ScalarStringAsync(c, t, "select next_code('PT')", ct) ?? $"PT-{DateTime.UtcNow:yyMMddHHmmss}";

                var allocations = invoiceId.HasValue
                    ? JsonSerializer.Serialize(new[] { new { invoiceId = invoiceId.Value, amount } })
                    : "[]";

                var insertSql = @"
                    insert into payments(code, user_id, contract_id, intended_invoice_id, kind, status,
                                        amount, method, external_reference, allocations, submitted_by,
                                        confirmed_by, confirmed_at, notes, received_at)
                    values(@code, @user, @contract, @inv, 'receipt', 'confirmed',
                           @amount, @method, @extRef, @alloc::jsonb, @actor,
                           @actor, now(), @notes, now())
                    returning jsonb_build_object(
                        'id', id,
                        'code', code,
                        'amount', amount,
                        'status', status,
                        'method', method,
                        'confirmedAt', confirmed_at
                    )::text";

                var json = await ScalarStringAsync(c, t, insertSql, ct,
                    P("code", codeStr), P("user", userId), P("contract", contractId),
                    P("inv", invoiceId), P("amount", amount), P("method", method),
                    P("extRef", externalRef), P("alloc", allocations), P("actor", actor), P("notes", notes));

                await CommitAsync(t, ct);
                return Content(json!, "application/json");
            }
        }
        catch (LeaseHttpException e) { return LeaseProblem(e); }
        catch (PostgresException e) { return DatabaseProblem(e); }
    }

    // 2. Chi tiết phiếu thu
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
                        'id', p.id,
                        'code', p.code,
                        'amount', p.amount,
                        'status', p.status,
                        'kind', p.kind,
                        'method', p.method,
                        'externalReference', p.external_reference,
                        'notes', p.notes,
                        'allocations', p.allocations,
                        'receivedAt', p.received_at,
                        'confirmedAt', p.confirmed_at
                    )::text
                    from payments p
                    where p.id = @id";

                var json = await ScalarStringAsync(c, t, sql, ct, P("id", id));
                await t.RollbackAsync(ct);
                return json == null ? NotFound() : Content(json, "application/json");
            }
        }
        catch (LeaseHttpException e) { return LeaseProblem(e); }
        catch (PostgresException e) { return DatabaseProblem(e); }
    }

    // 3. Xác nhận duyệt thanh toán (Confirm)
    [HttpPost("{id:guid}/confirm")]
    public async Task<IActionResult> Confirm(Guid id, [FromBody] JsonElement body, CancellationToken ct)
    {
        try
        {
            var (c, t, actor) = await BeginAsync(true, ct);
            await using (c) await using (t)
            {
                var status = await ScalarStringAsync(c, t,
                    "select status from payments where id=@id for update", ct, P("id", id));

                if (status == null)
                {
                    await t.RollbackAsync(ct);
                    return NotFound();
                }

                if (status != "pending")
                {
                    await t.RollbackAsync(ct);
                    return Conflict(new { code = "payment_not_pending", message = "Khoản thanh toán này không ở trạng thái chờ duyệt." });
                }

                var updateSql = @"
                    update payments
                    set status='confirmed',
                        confirmed_at=now(),
                        confirmed_by=@actor
                    where id=@id
                    returning jsonb_build_object('id', id, 'code', code, 'status', status, 'confirmedAt', confirmed_at)::text";

                var json = await ScalarStringAsync(c, t, updateSql, ct, P("actor", actor), P("id", id));
                await CommitAsync(t, ct);
                return Content(json!, "application/json");
            }
        }
        catch (LeaseHttpException e) { return LeaseProblem(e); }
        catch (PostgresException e) { return DatabaseProblem(e); }
    }

    // 4. Từ chối thanh toán (Reject)
    [HttpPost("{id:guid}/reject")]
    public async Task<IActionResult> Reject(Guid id, [FromBody] JsonElement body, CancellationToken ct)
    {
        try
        {
            var reason = body.TryGetProperty("reason", out var pR) ? pR.GetString() : null;
            if (string.IsNullOrWhiteSpace(reason))
            {
                return BadRequest(new { code = "reason_required", message = "Cần nhập lý do từ chối khoản thanh toán." });
            }

            var (c, t, actor) = await BeginAsync(true, ct);
            await using (c) await using (t)
            {
                var status = await ScalarStringAsync(c, t,
                    "select status from payments where id=@id for update", ct, P("id", id));

                if (status == null)
                {
                    await t.RollbackAsync(ct);
                    return NotFound();
                }

                if (status != "pending")
                {
                    await t.RollbackAsync(ct);
                    return Conflict(new { code = "payment_not_pending", message = "Khoản thanh toán này không ở trạng thái chờ duyệt." });
                }

                var updateSql = @"
                    update payments
                    set status='rejected',
                        reason=@reason,
                        confirmed_at=now(),
                        confirmed_by=@actor
                    where id=@id
                    returning jsonb_build_object('id', id, 'code', code, 'status', status, 'reason', reason)::text";

                var json = await ScalarStringAsync(c, t, updateSql, ct,
                    P("reason", reason), P("actor", actor), P("id", id));

                await CommitAsync(t, ct);
                return Content(json!, "application/json");
            }
        }
        catch (LeaseHttpException e) { return LeaseProblem(e); }
        catch (PostgresException e) { return DatabaseProblem(e); }
    }
}