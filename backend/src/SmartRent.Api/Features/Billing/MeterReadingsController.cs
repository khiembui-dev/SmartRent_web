using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Npgsql;
using SmartRent.Api.Common;

namespace SmartRent.Api.Features.Billing;

[ApiController]
[Route("api/v1/meter-readings")]
public sealed class MeterReadingsController(NpgsqlDataSource db) : LeasingController(db)
{
    // 1. Ghi hàng loạt chỉ số điện nước từ bảng tính Worksheet
    [HttpPost("batch")]
    public async Task<IActionResult> RecordBatch([FromBody] JsonElement body, CancellationToken ct = default)
    {
        try
        {
            var billingPeriodId = body.TryGetProperty("billingPeriodId", out var pBp) && pBp.TryGetGuid(out var bpGuid)
                ? bpGuid : Guid.Empty;

            if (billingPeriodId == Guid.Empty || !body.TryGetProperty("items", out var pItems) || pItems.ValueKind != JsonValueKind.Array)
            {
                return BadRequest(new { code = "validation_failed", message = "Cần chọn kỳ tính tiền và danh sách chỉ số." });
            }

            var (c, t, _) = await BeginAsync(true, ct);
            await using (c) await using (t)
            {
                // Kiểm tra xem kỳ có bị khóa không
                var periodStatus = await ScalarStringAsync(c, t,
                    "select status from billing_periods where id=@id", ct, P("id", billingPeriodId));

                if (periodStatus == "locked")
                {
                    await t.RollbackAsync(ct);
                    return Conflict(new { code = "period_locked", message = "Kỳ tính tiền đã bị khóa, không thể ghi số." });
                }

                var results = new List<object>();
                var index = 0;

                foreach (var item in pItems.EnumerateArray())
                {
                    var meterId = item.TryGetProperty("meterId", out var pM) && pM.TryGetGuid(out var mGuid) ? mGuid : Guid.Empty;
                    var readingValue = item.TryGetProperty("readingValue", out var pV) ? pV.GetDecimal() : (decimal?)null;
                    var observedAt = item.TryGetProperty("observedAt", out var pO) ? pO.GetString() : DateTimeOffset.UtcNow.ToString("O");

                    if (meterId == Guid.Empty || !readingValue.HasValue || readingValue < 0)
                    {
                        results.Add(new { index, meterId, status = "failed", message = "Chỉ số không hợp lệ." });
                        index++;
                        continue;
                    }

                    // Xác định phòng và loại công tơ từ meterId
                    var targetSql = @"
                        select r.id as room_id, ct.id as contract_id,
                               case when md5(r.id::text || 'electricity')::uuid=@m then 'electricity' else 'water' end as meter_kind
                        from rooms r
                        left join contracts ct on ct.room_id=r.id and ct.status in ('active','planned')
                        where md5(r.id::text || 'electricity')::uuid=@m or md5(r.id::text || 'water')::uuid=@m
                        limit 1";

                    await using var cmd = new NpgsqlCommand(targetSql, c, t);
                    cmd.Parameters.AddWithValue("m", meterId);
                    await using var r = await cmd.ExecuteReaderAsync(ct);

                    if (!await r.ReadAsync(ct))
                    {
                        results.Add(new { index, meterId, status = "failed", message = "Không tìm thấy công tơ của phòng." });
                        index++;
                        continue;
                    }

                    var roomId = r.GetGuid(0);
                    var contractId = r.IsDBNull(1) ? (Guid?)null : r.GetGuid(1);
                    var meterKind = r.GetString(2);
                    await r.CloseAsync();

                    if (!contractId.HasValue)
                    {
                        results.Add(new { index, meterId, status = "failed", message = "Phòng chưa có hợp đồng thuê hoạt động." });
                        index++;
                        continue;
                    }

                    // Tìm hoặc tạo hóa đơn nháp (draft) cho hợp đồng trong kỳ này
                    var invoiceIdStr = await ScalarStringAsync(c, t,
                        "select id::text from invoices where contract_id=@cid and period_id=@pid and status='draft' limit 1",
                        ct, P("cid", contractId.Value), P("pid", billingPeriodId));

                    Guid invoiceId;
                    if (invoiceIdStr == null)
                    {
                        var newInvId = Guid.NewGuid();
                        var insertSql = @"
                            insert into invoices(id, contract_id, period_id, status, kind, service_from, service_to,
                                                electricity_start, water_start, lines)
                            select @id, @cid, @pid, 'draft', 'periodic', bp.month_start, bp.month_start + interval '1 month',
                                   coalesce((select inv_prev.electricity_end from invoices inv_prev where inv_prev.contract_id=@cid and inv_prev.status='issued' order by inv_prev.service_to desc limit 1), 0),
                                   coalesce((select inv_prev.water_end from invoices inv_prev where inv_prev.contract_id=@cid and inv_prev.status='issued' order by inv_prev.service_to desc limit 1), 0),
                                   '[]'::jsonb
                            from billing_periods bp where bp.id=@pid
                            returning id::text";

                        await ScalarStringAsync(c, t, insertSql, ct,
                            P("id", newInvId), P("cid", contractId.Value), P("pid", billingPeriodId));
                        invoiceId = newInvId;
                    }
                    else
                    {
                        invoiceId = Guid.Parse(invoiceIdStr);
                    }

                    // Cập nhật chỉ số mới vào hóa đơn draft
                    if (meterKind == "electricity")
                    {
                        await ScalarStringAsync(c, t,
                            "update invoices set electricity_end=@val, electricity_to_at=@at::timestamptz where id=@id returning id::text",
                            ct, P("val", readingValue.Value), P("at", observedAt), P("id", invoiceId));
                    }
                    else
                    {
                        await ScalarStringAsync(c, t,
                            "update invoices set water_end=@val, water_to_at=@at::timestamptz where id=@id returning id::text",
                            ct, P("val", readingValue.Value), P("at", observedAt), P("id", invoiceId));
                    }

                    results.Add(new { index, meterId, status = "succeeded", readingId = invoiceId });
                    index++;
                }

                await CommitAsync(t, ct);
                return Ok(new { results });
            }
        }
        catch (LeaseHttpException e) { return LeaseProblem(e); }
        catch (PostgresException e) { return DatabaseProblem(e); }
    }

    // 2. Sửa chỉ số (Điều chỉnh sai sót)
    [HttpPost("{id:guid}/correct")]
    public async Task<IActionResult> Correct(Guid id, [FromBody] JsonElement body, CancellationToken ct = default)
    {
        try
        {
            var readingValue = body.TryGetProperty("readingValue", out var pVal) ? pVal.GetDecimal() : (decimal?)null;
            var reason = body.TryGetProperty("reason", out var pR) ? pR.GetString() : null;

            if (!readingValue.HasValue || string.IsNullOrWhiteSpace(reason))
            {
                return BadRequest(new { code = "validation_failed", message = "Cần nhập chỉ số mới và lý do sửa." });
            }

            var (c, t, _) = await BeginAsync(true, ct);
            await using (c) await using (t)
            {
                // Cập nhật chỉ số và lưu vết lịch sử vào readings_history
                var updateSql = @"
                    update invoices
                    set readings_history = readings_history || jsonb_build_array(
                            jsonb_build_object(
                                'changedAt', now(),
                                'reason', @reason,
                                'oldElectricityEnd', electricity_end,
                                'oldWaterEnd', water_end
                            )
                        ),
                        electricity_end = (case when electricity_end is not null then @val else electricity_end end),
                        water_end = (case when water_end is not null and electricity_end is null then @val else water_end end),
                        correction_reason = @reason
                    where id=@id and status='draft'
                    returning id::text";

                var updated = await ScalarStringAsync(c, t, updateSql, ct,
                    P("id", id), P("val", readingValue.Value), P("reason", reason));

                if (updated == null)
                {
                    await t.RollbackAsync(ct);
                    return NotFound(new { code = "not_found", message = "Không tìm thấy hóa đơn nháp để sửa chỉ số." });
                }

                await CommitAsync(t, ct);
                return Ok(new { id, readingValue, reason });
            }
        }
        catch (LeaseHttpException e) { return LeaseProblem(e); }
        catch (PostgresException e) { return DatabaseProblem(e); }
    }
}