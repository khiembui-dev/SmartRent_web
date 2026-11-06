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
[Route("api/v1/invoice-batches")]
public sealed class InvoiceBatchesController(NpgsqlDataSource db) : LeasingController(db)
{
    [HttpPost]
    public async Task<IActionResult> CreateBatch(
        [FromBody] JsonElement body,
        [FromHeader(Name = "Idempotency-Key")] string? idempotencyKey,
        CancellationToken ct = default)
    {
        try
        {
            var periodId = body.TryGetProperty("periodId", out var pP) && pP.TryGetGuid(out var pGuid) ? pGuid : Guid.Empty;
            var action = body.TryGetProperty("action", out var pAct) ? pAct.GetString() ?? "draft" : "draft";

            if (periodId == Guid.Empty || !body.TryGetProperty("tenancyIds", out var pT) || pT.ValueKind != JsonValueKind.Array)
            {
                return BadRequest(new { code = "validation_failed", message = "Cần chọn kỳ tính tiền và danh sách hợp đồng thuê." });
            }

            var (c, t, actor) = await BeginAsync(true, ct);
            await using (c) await using (t)
            {
                // 1. Kiểm tra kỳ tính tiền
                var periodInfoSql = @"
                    select bp.property_id, p.code as prop_code, bp.month_start, bp.status
                    from billing_periods bp
                    join properties p on p.id = bp.property_id
                    where bp.id = @pid";

                await using var pCmd = new NpgsqlCommand(periodInfoSql, c, t);
                pCmd.Parameters.AddWithValue("pid", periodId);
                await using var pReader = await pCmd.ExecuteReaderAsync(ct);

                if (!await pReader.ReadAsync(ct))
                {
                    await t.RollbackAsync(ct);
                    return NotFound(new { code = "period_not_found", message = "Không tìm thấy kỳ tính tiền." });
                }

                var propId = pReader.GetGuid(0);
                var propCode = pReader.GetString(1);
                var monthStart = pReader.GetFieldValue<DateOnly>(2);
                var periodStatus = pReader.GetString(3);
                await pReader.CloseAsync();

                if (periodStatus == "locked")
                {
                    await t.RollbackAsync(ct);
                    return Conflict(new { code = "period_locked", message = "Kỳ tính tiền đã bị khóa, không thể tạo hóa đơn." });
                }

                var results = new List<object>();
                var succeededCount = 0;
                var failedCount = 0;
                var skippedCount = 0;

                // 2. Duyệt qua từng hợp đồng để tạo/phát hành hóa đơn
                foreach (var item in pT.EnumerateArray())
                {
                    if (!item.TryGetGuid(out var contractId))
                    {
                        failedCount++;
                        continue;
                    }

                    // Lấy thông tin phòng, giá và khách thuê của hợp đồng
                    var contractSql = @"
                        select ct.id, r.code as room_code, u.id as user_id, u.display_name,
                               p.rates as prop_rates, r.rates as room_rates, ct.versions
                        from contracts ct
                        join rooms r on r.id = ct.room_id
                        join properties p on p.id = r.property_id
                        join users u on u.id = ct.user_id
                        where ct.id = @cid";

                    await using var cCmd = new NpgsqlCommand(contractSql, c, t);
                    cCmd.Parameters.AddWithValue("cid", contractId);
                    await using var cReader = await cCmd.ExecuteReaderAsync(ct);

                    if (!await cReader.ReadAsync(ct))
                    {
                        await cReader.CloseAsync();
                        results.Add(new { tenancyId = contractId, room = "Phòng không tồn tại", status = "failed", message = "Không tìm thấy hợp đồng thuê." });
                        failedCount++;
                        continue;
                    }

                    var roomCode = cReader.GetString(1);
                    var userId = cReader.GetGuid(2);
                    var customerName = cReader.GetString(3);
                    var propRatesRaw = cReader.GetString(4);
                    var roomRatesRaw = cReader.GetString(5);
                    await cReader.CloseAsync();

                    // Tìm hóa đơn hiện tại (nếu đã có draft)
                    var existingSql = @"
                        select id, status, code, electricity_start, electricity_end, water_start, water_end
                        from invoices
                        where contract_id=@cid and period_id=@pid and status <> 'void'
                        limit 1";

                    await using var invCmd = new NpgsqlCommand(existingSql, c, t);
                    invCmd.Parameters.AddWithValue("cid", contractId);
                    invCmd.Parameters.AddWithValue("pid", periodId);
                    await using var invReader = await invCmd.ExecuteReaderAsync(ct);

                    Guid invoiceId;
                    var isIssued = false;
                    decimal elecStart = 0, elecEnd = 0, waterStart = 0, waterEnd = 0;

                    if (await invReader.ReadAsync(ct))
                    {
                        invoiceId = invReader.GetGuid(0);
                        var invStatus = invReader.GetString(1);
                        if (invStatus == "issued") isIssued = true;

                        elecStart = invReader.IsDBNull(3) ? 0 : invReader.GetDecimal(3);
                        elecEnd = invReader.IsDBNull(4) ? 0 : invReader.GetDecimal(4);
                        waterStart = invReader.IsDBNull(5) ? 0 : invReader.GetDecimal(5);
                        waterEnd = invReader.IsDBNull(6) ? 0 : invReader.GetDecimal(6);
                        await invReader.CloseAsync();
                    }
                    else
                    {
                        await invReader.CloseAsync();
                        invoiceId = Guid.NewGuid();
                        var insertInvSql = @"
                            insert into invoices(id, contract_id, period_id, status, kind, service_from, service_to,
                                                electricity_start, electricity_end, water_start, water_end, lines)
                            values(@id, @cid, @pid, 'draft', 'periodic', @sFrom, @sFrom + interval '1 month',
                                   0, 0, 0, 0, '[]'::jsonb)";

                        await ScalarStringAsync(c, t, insertInvSql, ct,
                            P("id", invoiceId), P("cid", contractId), P("pid", periodId), P("sFrom", monthStart));
                    }

                    if (isIssued)
                    {
                        results.Add(new { tenancyId = contractId, room = $"Phòng {roomCode}", status = "skipped", message = "Hóa đơn đã được phát hành trước đó." });
                        skippedCount++;
                        continue;
                    }

                    // 3. Tính toán các dòng tiền (Lines)
                    decimal rentPrice = 3000000;
                    decimal elecRate = 4000;
                    decimal waterRate = 20000;

                    using var pRatesDoc = JsonDocument.Parse(propRatesRaw);
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
                        new { id = "line-rent", code = "RENT", category = "rent", description = $"Tiền phòng tháng {monthStart.Month}/{monthStart.Year}", unit = "tháng", quantity = 1, unitPrice = rentPrice },
                        new { id = "line-electric", code = "ELECTRICITY", category = "electricity", description = $"Tiền điện ({elecUsage} kWh)", unit = "kWh", quantity = elecUsage, unitPrice = elecRate },
                        new { id = "line-water", code = "WATER", category = "water", description = $"Tiền nước ({waterUsage} m³)", unit = "m³", quantity = waterUsage, unitPrice = waterRate }
                    };
                    var linesJson = JsonSerializer.Serialize(linesList);

                    // 4. Nếu action là issue (phát hành chính thức)
                    if (action == "issue")
                    {
                        var prefix = $"HD-{propCode}{monthStart:yyMM}-";
                        var nextSeqStr = await ScalarStringAsync(c, t,
                            "select coalesce(max(substring(code from '[0-9]+$')::int), 0) + 1 from invoices where code like @p",
                            ct, P("p", $"{prefix}%")) ?? "1";
                        int.TryParse(nextSeqStr, out var nextSeq);
                        var newCode = $"{prefix}{nextSeq:D3}";

                        var updateSql = @"
                            update invoices
                            set code = @code,
                                status = 'issued',
                                lines = @lines::jsonb,
                                customer_snapshot = jsonb_build_object('name', @cname, 'room', @rcode),
                                issued_on = current_date,
                                due_on = current_date + interval '5 days',
                                issued_at = now(),
                                issued_by = @actor
                            where id = @id
                            returning total_amount::text";

                        var totalStr = await ScalarStringAsync(c, t, updateSql, ct,
                            P("code", newCode), P("lines", linesJson), P("cname", customerName),
                            P("rcode", roomCode), P("actor", actor), P("id", invoiceId));

                        decimal.TryParse(totalStr, out var totalAmount);

                        // Gửi thông báo đến tài khoản khách thuê
                        await ScalarStringAsync(c, t, @"
                            insert into notifications(recipient_id, event_key, title, body, url)
                            values(@user, 'invoice:' || @code, 'Hóa đơn mới', 'Hóa đơn ' || @code || ' đã được phát hành.', '/invoices/' || @id::text)
                            returning id::text", ct, P("user", userId), P("code", newCode), P("id", invoiceId));

                        results.Add(new
                        {
                            tenancyId = contractId,
                            room = $"Phòng {roomCode}",
                            status = "succeeded",
                            message = "Phát hành thành công",
                            invoiceId,
                            invoiceCode = newCode,
                            totalAmount
                        });
                        succeededCount++;
                    }
                    else
                    {
                        // Lưu nháp (draft)
                        await ScalarStringAsync(c, t,
                            "update invoices set lines = @lines::jsonb where id = @id returning id::text",
                            ct, P("lines", linesJson), P("id", invoiceId));

                        results.Add(new
                        {
                            tenancyId = contractId,
                            room = $"Phòng {roomCode}",
                            status = "succeeded",
                            message = "Lưu nháp thành công",
                            invoiceId
                        });
                        succeededCount++;
                    }
                }

                await CommitAsync(t, ct);

                return Ok(new
                {
                    id = Guid.NewGuid(),
                    periodId,
                    action,
                    requestedBy = new { id = actor, fullName = "Quản trị viên" },
                    requestedAt = DateTimeOffset.UtcNow,
                    idempotencyKey = idempotencyKey ?? Guid.NewGuid().ToString(),
                    summary = new
                    {
                        total = results.Count,
                        succeeded = succeededCount,
                        failed = failedCount,
                        skipped = skippedCount
                    },
                    items = results
                });
            }
        }
        catch (LeaseHttpException e) { return LeaseProblem(e); }
        catch (PostgresException e) { return DatabaseProblem(e); }
    }
}