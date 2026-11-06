using System;
using System.Text.Json;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Mvc;
using Npgsql;
using SmartRent.Api.Common;

namespace SmartRent.Api.Features.Billing;

[ApiController]
[Route("api/v1/billing-periods")]
public sealed class BillingPeriodsController(NpgsqlDataSource db) : LeasingController(db)
{
    // 1. Danh sách kỳ tính tiền
    [HttpGet]
    public async Task<IActionResult> List(
        [FromQuery] Guid? propertyId,
        [FromQuery] string? status = null,
        [FromQuery] string? month = null,
        [FromQuery] int page = 1,
        [FromQuery] int pageSize = 60,
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
                if (propertyId.HasValue) where += " and bp.property_id=@property";
                if (!string.IsNullOrWhiteSpace(status)) where += " and bp.status=@status";
                if (!string.IsNullOrWhiteSpace(month)) where += " and to_char(bp.month_start, 'YYYY-MM')=@month";

                var countSql = $"select count(*)::text from billing_periods bp {where}";
                var totalStr = await ScalarStringAsync(c, t, countSql, ct,
                    P("property", propertyId), P("status", status), P("month", month));
                int.TryParse(totalStr, out var totalItems);

                var listSql = $@"
                    select jsonb_build_object(
                        'id', bp.id,
                        'property', jsonb_build_object('id', p.id, 'name', p.name, 'code', p.code),
                        'monthStart', bp.month_start,
                        'label', 'Tháng ' || to_char(bp.month_start, 'MM/YYYY'),
                        'status', bp.status,
                        'lockedAt', bp.locked_at,
                        'lockedBy', case when u.id is not null then jsonb_build_object('id', u.id, 'fullName', u.display_name) else null end,
                        'stats', jsonb_build_object(
                            'totalRooms', coalesce((select count(*) from rooms r where r.property_id=bp.property_id), 0),
                            'tenancyCount',coalesce((select count(distinct ct.id) from contracts ct join rooms r on r.id=ct.room_id where r.property_id=bp.property_id and ct.status in ('active','planned')),0),
                            'blocked',0,
                            'occupiedRooms', coalesce((select count(distinct ct.room_id) from contracts ct join rooms r on r.id=ct.room_id where r.property_id=bp.property_id and ct.status in ('active','planned')), 0),
                            'missingReadings', coalesce((select count(*) from contracts ct join rooms r on r.id=ct.room_id where r.property_id=bp.property_id and ct.status in ('active','planned') and not exists(select 1 from invoices inv where inv.contract_id=ct.id and inv.period_id=bp.id and inv.electricity_end is not null and inv.water_end is not null)), 0),
                            'readyToDraft', coalesce((select count(*) from contracts ct join rooms r on r.id=ct.room_id where r.property_id=bp.property_id and ct.status in ('active','planned') and exists(select 1 from invoices inv where inv.contract_id=ct.id and inv.period_id=bp.id and inv.status='draft' and inv.electricity_end is not null and inv.water_end is not null)), 0),
                            'drafts', coalesce((select count(*) from invoices inv where inv.period_id=bp.id and inv.status='draft'), 0),
                            'issuedUnpaid', coalesce((select count(*) from invoices inv join v_invoice_balances b on b.id=inv.id where inv.period_id=bp.id and inv.status='issued' and b.payment_status='unpaid'), 0),
                            'issuedPartial', coalesce((select count(*) from invoices inv join v_invoice_balances b on b.id=inv.id where inv.period_id=bp.id and inv.status='issued' and b.payment_status='partial'), 0),
                            'paid', coalesce((select count(*) from invoices inv join v_invoice_balances b on b.id=inv.id where inv.period_id=bp.id and inv.status='issued' and b.payment_status='paid'), 0)
                        )
                    )
                    from billing_periods bp
                    join properties p on p.id=bp.property_id
                    left join users u on u.id=bp.locked_by
                    {where}
                    order by bp.month_start desc
                    offset @skip limit @take";

                var items = await JsonRowsAsync(c, t, listSql, ct,
                    P("property", propertyId), P("status", status), P("month", month),
                    P("skip", (page - 1) * pageSize), P("take", pageSize));

                await t.RollbackAsync(ct);
                var totalPages = (int)Math.Ceiling(totalItems / (double)pageSize);
                return Ok(new { items, totalItems, page, pageSize, totalPages });
            }
        }
        catch (LeaseHttpException e) { return LeaseProblem(e); }
        catch (PostgresException e) { return DatabaseProblem(e); }
    }

    // 2. Tạo kỳ tính tiền mới
    [HttpPost]
    public async Task<IActionResult> Create([FromBody] JsonElement body, CancellationToken ct)
    {
        try
        {
            var propertyId = body.TryGetProperty("propertyId", out var pProp) && pProp.TryGetGuid(out var g) ? g : (Guid?)null;
            var monthStartStr = body.TryGetProperty("monthStart", out var pMonth) ? pMonth.GetString() : null;

            if (!propertyId.HasValue || string.IsNullOrWhiteSpace(monthStartStr))
            {
                return BadRequest(new { code = "validation_failed", message = "Cần chọn cơ sở và ngày đầu tháng." });
            }

            if (!DateOnly.TryParse(monthStartStr, out var monthStart) || monthStart.Day != 1)
            {
                return UnprocessableEntity(new { code = "validation_failed", message = "Kỳ tính tiền phải bắt đầu từ ngày 01." });
            }

            var (c, t, _) = await BeginAsync(true, ct);
            await using (c) await using (t)
            {
                var exists = await ScalarStringAsync(c, t,
                    "select exists(select 1 from billing_periods where property_id=@prop and month_start=@month)::text",
                    ct, P("prop", propertyId.Value), P("month", monthStart));

                if (exists == "True" || exists == "true")
                {
                    await t.RollbackAsync(ct);
                    return Conflict(new { code = "period_exists", message = "Kỳ tính tiền này đã tồn tại." });
                }

                var json = await ScalarStringAsync(c, t, @"
                    insert into billing_periods(property_id, month_start, status)
                    values(@prop, @month, 'open')
                    returning jsonb_build_object(
                        'id', id,
                        'propertyId', property_id,
                        'monthStart', month_start,
                        'label', 'Tháng ' || to_char(month_start, 'MM/YYYY'),
                        'status', status,
                        'lockedAt', locked_at
                    )::text", ct, P("prop", propertyId.Value), P("month", monthStart));

                await CommitAsync(t, ct);
                return Content(json!, "application/json");
            }
        }
        catch (LeaseHttpException e) { return LeaseProblem(e); }
        catch (PostgresException e) { return DatabaseProblem(e); }
    }

    // 3. Bảng tính Worksheet điện nước theo phòng
    [HttpGet("{id:guid}/worksheet")]
    public async Task<IActionResult> GetWorksheet(Guid id, CancellationToken ct)
    {
        try
        {
            var (c, t, _) = await BeginAsync(true, ct);
            await using (c) await using (t)
            {
                var sql = @"
                    select jsonb_build_object(
                        'period', (
                            select jsonb_build_object(
                                'id', bp.id,
                                'property', jsonb_build_object('id', p.id, 'name', p.name, 'code', p.code),
                                'monthStart', bp.month_start,
                                'label', 'Tháng ' || to_char(bp.month_start, 'MM/YYYY'),
                                'status', bp.status,
                                'lockedAt', bp.locked_at,
                                'lockedBy', case when u.id is not null then jsonb_build_object('id', u.id, 'fullName', u.display_name) else null end
                            )
                            from billing_periods bp
                            join properties p on p.id=bp.property_id
                            left join users u on u.id=bp.locked_by
                            where bp.id=@id
                        ),
                        'stats', (
                            select jsonb_build_object(
                                'tenancyCount',(select count(*) from contracts ct join rooms r on r.id=ct.room_id join billing_periods bp on bp.property_id=r.property_id where bp.id=@id and ct.status in ('active','planned')),
                                'blocked',0,
                                'missingReadings', coalesce((select count(*) from contracts ct join rooms r on r.id=ct.room_id join billing_periods bp on bp.property_id=r.property_id where bp.id=@id and ct.status in ('active','planned') and not exists(select 1 from invoices inv where inv.contract_id=ct.id and inv.period_id=bp.id and inv.electricity_end is not null and inv.water_end is not null)), 0),
                                'drafts', coalesce((select count(*) from invoices inv where inv.period_id=@id and inv.status='draft'), 0),
                                'issued', coalesce((select count(*) from invoices inv where inv.period_id=@id and inv.status='issued'), 0)
                            )
                        ),
                        'rows', coalesce((
                            select jsonb_agg(jsonb_build_object(
                                'room', jsonb_build_object('id', r.id, 'code', r.code, 'name', r.name),
                                'tenancy', case when ct.id is not null then jsonb_build_object(
                                    'id', ct.id,
                                    'code', ct.code,
                                    'status', ct.status,
                                    'representative', jsonb_build_object('id', cu.id, 'fullName', cu.display_name, 'phone', cu.phone)
                                ) else null end,
                                'group', case
                                    when inv.status='issued' then (case when b.payment_status='paid' then 'paid' when b.payment_status='partial' then 'issued_partial' else 'issued_unpaid' end)
                                    when inv.status='draft' then 'draft'
                                    when inv.electricity_end is not null and inv.water_end is not null then 'ready'
                                    else 'missing_readings'
                                end,
                                'problems', '[]'::jsonb,
                                'readings', jsonb_build_object(
                                    'electricity', jsonb_build_object(
                                        'meterId', md5(r.id::text || 'electricity')::uuid,
                                        'previous', case when inv.electricity_start is not null then jsonb_build_object('value', inv.electricity_start, 'observedAt', inv.electricity_from_at) else null end,
                                        'current', case when inv.electricity_end is not null then jsonb_build_object('id', inv.id, 'value', inv.electricity_end, 'observedAt', inv.electricity_to_at, 'inUse', (inv.status='issued'), 'kind', 'periodic') else null end,
                                        'consumption', case when inv.electricity_end is not null and inv.electricity_start is not null then inv.electricity_end - inv.electricity_start else null end
                                    ),
                                    'water', jsonb_build_object(
                                        'meterId', md5(r.id::text || 'water')::uuid,
                                        'previous', case when inv.water_start is not null then jsonb_build_object('value', inv.water_start, 'observedAt', inv.water_from_at) else null end,
                                        'current', case when inv.water_end is not null then jsonb_build_object('id', inv.id, 'value', inv.water_end, 'observedAt', inv.water_to_at, 'inUse', (inv.status='issued'), 'kind', 'periodic') else null end,
                                        'consumption', case when inv.water_end is not null and inv.water_start is not null then inv.water_end - inv.water_start else null end
                                    )
                                ),
                                'estimate', jsonb_build_object(
                                    'fixedTotal', coalesce((select (x->>'unitPrice')::numeric from jsonb_array_elements(p.rates) x where x->>'category'='rent' limit 1), 0),
                                    'unitPrices', jsonb_build_object(
                                        'electricity', coalesce((select (x->>'unitPrice')::numeric from jsonb_array_elements(p.rates) x where x->>'category'='electricity' limit 1), 0),
                                        'water', coalesce((select (x->>'unitPrice')::numeric from jsonb_array_elements(p.rates) x where x->>'category'='water' limit 1), 0)
                                    )
                                ),
                                'invoice', case when inv.id is not null then jsonb_build_object(
                                    'id', inv.id,
                                    'code', inv.code,
                                    'status', inv.status,
                                    'totalAmount', inv.total_amount,
                                    'lines', inv.lines
                                ) else null end
                            ) order by r.code)
                            from rooms r
                            join billing_periods bp on bp.property_id=r.property_id
                            join properties p on p.id=r.property_id
                            join contracts ct on ct.room_id=r.id and ct.status in ('active','planned')
                            left join users cu on cu.id=ct.user_id
                            left join invoices inv on inv.contract_id=ct.id and inv.period_id=bp.id and inv.status <> 'void'
                            left join v_invoice_balances b on b.id=inv.id
                            where bp.id=@id
                        ), '[]'::jsonb)
                    )::text";

                var json = await ScalarStringAsync(c, t, sql, ct, P("id", id));
                await t.RollbackAsync(ct);

                return json == null ? NotFound() : Content(json, "application/json");
            }
        }
        catch (LeaseHttpException e) { return LeaseProblem(e); }
        catch (PostgresException e) { return DatabaseProblem(e); }
    }

    // 4. Khóa kỳ tính tiền
    [HttpPost("{id:guid}/lock")]
    public async Task<IActionResult> Lock(Guid id, [FromBody] JsonElement body, CancellationToken ct)
    {
        try
        {
            var reason = body.TryGetProperty("reason", out var pR) ? pR.GetString() : null;
            var (c, t, actor) = await BeginAsync(true, ct);
            await using (c) await using (t)
            {
                var currentStatus = await ScalarStringAsync(c, t,
                    "select status from billing_periods where id=@id for update", ct, P("id", id));

                if (currentStatus == null)
                {
                    await t.RollbackAsync(ct);
                    return NotFound();
                }

                if (currentStatus == "locked")
                {
                    await t.RollbackAsync(ct);
                    return Conflict(new { code = "period_locked", message = "Kỳ tính tiền này đã bị khóa." });
                }

                var json = await ScalarStringAsync(c, t, @"
                    update billing_periods
                    set status='locked',
                        locked_at=now(),
                        locked_by=@actor,
                        history=history || jsonb_build_array(jsonb_build_object('action','lock','reason',@reason,'actorId',@actor,'at',now()))
                    where id=@id
                    returning jsonb_build_object('id', id, 'status', status, 'lockedAt', locked_at)::text",
                    ct, P("id", id), P("actor", actor), P("reason", reason));

                await CommitAsync(t, ct);
                return Content(json!, "application/json");
            }
        }
        catch (LeaseHttpException e) { return LeaseProblem(e); }
        catch (PostgresException e) { return DatabaseProblem(e); }
    }

    // 5. Mở khóa kỳ tính tiền
    [HttpPost("{id:guid}/unlock")]
    public async Task<IActionResult> Unlock(Guid id, [FromBody] JsonElement body, CancellationToken ct)
    {
        try
        {
            var reason = body.TryGetProperty("reason", out var pR) ? pR.GetString() : null;
            if (string.IsNullOrWhiteSpace(reason))
            {
                return BadRequest(new { code = "reason_required", message = "Cần nhập lý do mở khóa kỳ." });
            }

            var (c, t, actor) = await BeginAsync(true, ct);
            await using (c) await using (t)
            {
                var currentStatus = await ScalarStringAsync(c, t,
                    "select status from billing_periods where id=@id for update", ct, P("id", id));

                if (currentStatus == null)
                {
                    await t.RollbackAsync(ct);
                    return NotFound();
                }

                if (currentStatus != "locked")
                {
                    await t.RollbackAsync(ct);
                    return Conflict(new { code = "period_open", message = "Kỳ tính tiền hiện đang mở." });
                }

                var json = await ScalarStringAsync(c, t, @"
                    update billing_periods
                    set status='open',
                        locked_at=null,
                        locked_by=null,
                        unlock_reason=@reason,
                        history=history || jsonb_build_array(jsonb_build_object('action','unlock','reason',@reason,'actorId',@actor,'at',now()))
                    where id=@id
                    returning jsonb_build_object('id', id, 'status', status, 'unlockReason', unlock_reason)::text",
                    ct, P("id", id), P("actor", actor), P("reason", reason));

                await CommitAsync(t, ct);
                return Content(json!, "application/json");
            }
        }
        catch (LeaseHttpException e) { return LeaseProblem(e); }
        catch (PostgresException e) { return DatabaseProblem(e); }
    }
}
