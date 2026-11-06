using System;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Npgsql;
using SmartRent.Api.Common;

namespace SmartRent.Api.Features.Payments;

[ApiController]
[Route("api/v1/payment-allocations")]
public sealed class PaymentAllocationsController(NpgsqlDataSource db) : LeasingController(db)
{
    // Hoàn tác phân bổ thanh toán (Reverse Allocation)
    [HttpPost("{id:guid}/reverse")]
    public async Task<IActionResult> Reverse(Guid id, [FromBody] JsonElement body, CancellationToken ct = default)
    {
        try
        {
            var reason = body.TryGetProperty("reason", out var pR) ? pR.GetString() : null;
            if (string.IsNullOrWhiteSpace(reason))
            {
                return BadRequest(new { code = "reason_required", message = "Cần nhập lý do hoàn tác thanh toán." });
            }

            var (c, t, actor) = await BeginAsync(true, ct);
            await using (c) await using (t)
            {
                // Tìm phiếu thu gốc
                var origSql = @"
                    select p.id, p.user_id, p.contract_id, p.amount, p.status, p.kind, p.allocations
                    from payments p
                    where p.id = @id for update";

                await using var cmd = new NpgsqlCommand(origSql, c, t);
                cmd.Parameters.AddWithValue("id", id);
                await using var reader = await cmd.ExecuteReaderAsync(ct);

                if (!await reader.ReadAsync(ct))
                {
                    await reader.CloseAsync();
                    await t.RollbackAsync(ct);
                    return NotFound(new { code = "payment_not_found", message = "Không tìm thấy khoản thanh toán gốc." });
                }

                var origId = reader.GetGuid(0);
                var userId = reader.GetGuid(1);
                var contractId = reader.IsDBNull(2) ? (Guid?)null : reader.GetGuid(2);
                var amount = reader.GetDecimal(3);
                var status = reader.GetString(4);
                var kind = reader.GetString(5);
                var allocRaw = reader.GetString(6);
                await reader.CloseAsync();

                if (status != "confirmed" || kind != "receipt")
                {
                    await t.RollbackAsync(ct);
                    return Conflict(new { code = "cannot_reverse", message = "Chỉ có thể hoàn tác khoản thanh toán đã duyệt thành công." });
                }

                // Kiểm tra xem đã từng bị hoàn tác chưa
                var alreadyReversed = await ScalarStringAsync(c, t,
                    "select exists(select 1 from payments where reverses_id=@id and kind='receipt_reversal')::text",
                    ct, P("id", origId));

                if (alreadyReversed == "True" || alreadyReversed == "true")
                {
                    await t.RollbackAsync(ct);
                    return Conflict(new { code = "already_reversed", message = "Khoản thanh toán này đã được hoàn tác trước đó." });
                }

                var revCode = await ScalarStringAsync(c, t, "select next_code('HT')", ct) ?? $"HT-{DateTime.UtcNow:yyMMddHHmmss}";

                // Tạo dòng ghi hoàn tác (receipt_reversal)
                var insertRevSql = @"
                    insert into payments(code, user_id, contract_id, kind, reverses_id, status,
                                        amount, allocations, submitted_by, confirmed_by, confirmed_at, reason, received_at)
                    values(@code, @user, @contract, 'receipt_reversal', @reversesId, 'confirmed',
                           @amount, @alloc::jsonb, @actor, @actor, now(), @reason, now())
                    returning jsonb_build_object(
                        'id', id,
                        'code', code,
                        'reversesId', reverses_id,
                        'status', status,
                        'amount', amount,
                        'reason', reason
                    )::text";

                var json = await ScalarStringAsync(c, t, insertRevSql, ct,
                    P("code", revCode), P("user", userId), P("contract", contractId),
                    P("reversesId", origId), P("amount", amount), P("alloc", allocRaw),
                    P("actor", actor), P("reason", reason));

                await CommitAsync(t, ct);
                return Content(json!, "application/json");
            }
        }
        catch (LeaseHttpException e) { return LeaseProblem(e); }
        catch (PostgresException e) { return DatabaseProblem(e); }
    }
}