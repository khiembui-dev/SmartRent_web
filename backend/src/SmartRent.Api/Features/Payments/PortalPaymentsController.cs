using System;
using System.Collections.Generic;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Npgsql;
using SmartRent.Api.Common;

namespace SmartRent.Api.Features.Payments;

[ApiController]
[Route("api/v1/portal/payments")]
public sealed class PortalPaymentsController(NpgsqlDataSource db) : LeasingController(db)
{
    // 1. Danh sách khoản thanh toán của khách thuê
    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 12,
        CancellationToken ct = default)
    {
        try
        {
            await using var connection = await Db.OpenConnectionAsync(ct);

            if (!TryActor(out var actor,out var role)) throw new LeaseHttpException(401,"unauthenticated","Cần đăng nhập.");
            if (role!="user") throw new LeaseHttpException(403,"customer_required","Chỉ tài khoản khách được truy cập.");

            page = Math.Max(1, page);
            pageSize = Math.Clamp(pageSize, 1, 100);

            var countSql = "select count(*)::text from payments where user_id=@user";
            var totalStr = await ScalarStringAsync(connection, null, countSql, ct, P("user", actor));
            int.TryParse(totalStr, out var totalItems);

            var sql = @"
                select jsonb_build_object(
                    'id', p.id,
                    'code', p.code,
                    'amount', p.amount,
                    'method', p.method,
                    'status', p.status,
                    'externalReference', p.external_reference,
                    'notes', p.notes,
                    'receivedAt', p.received_at,
                    'confirmedAt', p.confirmed_at,
                    'createdAt', p.created_at
                )
                from payments p
                where p.user_id=@user
                order by p.received_at desc
                offset @skip limit @take";

            var items = await JsonRowsAsync(connection, null, sql, ct,
                P("user", actor), P("skip", (page - 1) * pageSize), P("take", pageSize));

            var totalPages = (int)Math.Ceiling(totalItems / (double)pageSize);
            return Ok(new { items, totalItems, page, pageSize, totalPages });
        }
        catch (LeaseHttpException e) { return LeaseProblem(e); }
        catch (PostgresException e) { return DatabaseProblem(e); }
    }

    // 2. Khách báo đã chuyển khoản (Báo thanh toán)
    [HttpPost]
    public async Task<IActionResult> ReportPayment([FromBody] JsonElement body, CancellationToken ct = default)
    {
        try
        {
            var amount = body.TryGetProperty("amount", out var pAmt) ? pAmt.GetDecimal() : 0;
            if (amount <= 0)
            {
                return BadRequest(new { code = "validation_failed", message = "Số tiền thanh toán phải lớn hơn 0." });
            }

            var externalRef = body.TryGetProperty("externalReference", out var pRef) ? pRef.GetString()?.Trim() : null;
            if (string.IsNullOrWhiteSpace(externalRef))
            {
                externalRef = $"BANK-{DateTime.UtcNow:yyMMddHHmmss}";
            }

            var notes = body.TryGetProperty("notes", out var pN) ? pN.GetString() : null;
            var receivedAt = body.TryGetProperty("receivedAt", out var pR) && pR.TryGetDateTimeOffset(out var rDt)
                ? rDt
                : DateTimeOffset.UtcNow;

            var invoiceIds = new List<Guid>();
            if (body.TryGetProperty("invoiceIds", out var pInvs) && pInvs.ValueKind == JsonValueKind.Array)
            {
                foreach (var el in pInvs.EnumerateArray())
                {
                    if (el.TryGetGuid(out var invId)) invoiceIds.Add(invId);
                }
            }

            var fileIds = new List<Guid>();
            if (body.TryGetProperty("fileIds", out var pFiles) && pFiles.ValueKind == JsonValueKind.Array)
            {
                foreach (var el in pFiles.EnumerateArray())
                {
                    if (el.TryGetGuid(out var fId)) fileIds.Add(fId);
                }
            }

            // Mở kết nối và transaction
            await using var connection = await Db.OpenConnectionAsync(ct);
            await using var transaction = await connection.BeginTransactionAsync(System.Data.IsolationLevel.Serializable, ct);

            // 1. Xác định Actor
            if (!TryActor(out var actor,out var role)) throw new LeaseHttpException(401,"unauthenticated","Cần đăng nhập.");
            if (role!="user") throw new LeaseHttpException(403,"customer_required","Chỉ tài khoản khách được truy cập.");

            await using (var context = new NpgsqlCommand("select set_config('smartrent.user_id', @actor, true)", connection, transaction))
            {
                context.Parameters.AddWithValue("actor", actor.ToString());
                await context.ExecuteNonQueryAsync(ct);
            }

            // 2. Kiểm tra quyền sở hữu và tính hợp lệ của hóa đơn
            Guid? contractId = null;
            Guid? intendedInvoiceId = null;

            if (invoiceIds.Count > 0)
            {
                intendedInvoiceId = invoiceIds[0];
                var invCheckSql = @"
                    select c.id as contract_id
                    from invoices i
                    join contracts c on c.id = i.contract_id
                    where i.id = @inv
                      and c.user_id=@user
                      and i.status = 'issued'";

                await using var checkCmd = new NpgsqlCommand(invCheckSql, connection, transaction);
                checkCmd.Parameters.AddWithValue("inv", intendedInvoiceId.Value);
                checkCmd.Parameters.AddWithValue("user", actor);
                var cResult = await checkCmd.ExecuteScalarAsync(ct);

                if (cResult == null || cResult is DBNull)
                {
                    await transaction.RollbackAsync(ct);
                    return BadRequest(new { code = "invalid_invoice", message = "Hóa đơn không hợp lệ hoặc đã đóng." });
                }

                contractId = (Guid)cResult;
            }

            // 3. Chuẩn bị allocations phân bổ vào hóa đơn
            var allocationsJson = intendedInvoiceId.HasValue
                ? JsonSerializer.Serialize(new[] { new { invoiceId = intendedInvoiceId.Value, amount } })
                : "[]";

            var proofFilesJson = JsonSerializer.Serialize(fileIds);

            // 4. Sinh mã phiếu thu (PT-...)
            var code = await ScalarStringAsync(connection, transaction, "select next_code('PT')", ct)
                ?? $"PT-{DateTime.UtcNow:yyMMddHHmmss}";

            // 5. Ghi vào sổ thanh toán payments với status = pending
            var insertSql = @"
                insert into payments (
                    code,
                    user_id,
                    contract_id,
                    intended_invoice_id,
                    kind,
                    status,
                    amount,
                    method,
                    external_reference,
                    allocations,
                    proof_file_ids,
                    submitted_by,
                    notes,
                    received_at
                ) values (
                    @code,
                    @user,
                    @contract,
                    @intendedInv,
                    'receipt',
                    'pending',
                    @amount,
                    'bank_transfer',
                    @extRef,
                    @allocations::jsonb,
                    @proofFiles::jsonb,
                    @user,
                    @notes,
                    @receivedAt
                ) returning id";

            await using var insertCmd = new NpgsqlCommand(insertSql, connection, transaction);
            insertCmd.Parameters.AddWithValue("code", code);
            insertCmd.Parameters.AddWithValue("user", actor);
            insertCmd.Parameters.AddWithValue("contract", contractId.HasValue ? contractId.Value : DBNull.Value);
            insertCmd.Parameters.AddWithValue("intendedInv", intendedInvoiceId.HasValue ? intendedInvoiceId.Value : DBNull.Value);
            insertCmd.Parameters.AddWithValue("amount", amount);
            insertCmd.Parameters.AddWithValue("extRef", externalRef);
            insertCmd.Parameters.AddWithValue("allocations", allocationsJson);
            insertCmd.Parameters.AddWithValue("proofFiles", proofFilesJson);
            insertCmd.Parameters.AddWithValue("notes", notes ?? (object)DBNull.Value);
            insertCmd.Parameters.AddWithValue("receivedAt", receivedAt);

            var newIdObj = await insertCmd.ExecuteScalarAsync(ct);
            var newId = (Guid)newIdObj!;

            // 6. Commit transaction an toàn
            await CommitAsync(transaction, ct);

            return Ok(new
            {
                id = newId,
                code,
                status = "pending",
                amount,
                message = "Đã gửi thông tin chuyển khoản, chờ quản lý xác nhận."
            });
        }
        catch (LeaseHttpException e) { return LeaseProblem(e); }
        catch (PostgresException e) { return DatabaseProblem(e); }
    }
}