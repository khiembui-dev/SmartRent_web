using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Mvc;
using Npgsql;
using SmartRent.Api.Common;
using SmartRent.Api.Features.Rooms;
using static SmartRent.Api.Common.BusinessData;
namespace SmartRent.Api.Features.Contracts;

[ApiController, Route("api/v1/contracts")]
public sealed class ContractsController(NpgsqlDataSource db) : BusinessController(db)
{
    internal static async Task<JsonObject> Detail(NpgsqlConnection c, NpgsqlTransaction t, Guid id, CancellationToken ct) => await Row(c, t, $"select {ContractSql.Json("c", true)} from contracts c where c.id=@id", ct, "id", id);
    [HttpGet]
    public Task<IActionResult> List(Guid? tenantId, Guid? roomId, Guid? propertyId, string? status, string? q, bool? expiring, bool? stillOccupied, string? requests, int page = 1, int pageSize = 30, CancellationToken ct = default) => Run(true, async (c, t, a) =>
    {
        var rows = await Rows(c, t, $"select {ContractSql.Json("c")} from contracts c join rooms r on r.id=c.room_id where (@tenant::uuid is null or c.user_id=@tenant) and (@room::uuid is null or c.room_id=@room) and (@property::uuid is null or r.property_id=@property) order by c.created_at desc", ct, "tenant", tenantId, "room", roomId, "property", propertyId);
        rows = rows.Where(r => (string.IsNullOrEmpty(status) || r.Text("status") == status) && (string.IsNullOrEmpty(q) || r.ToJsonString().Contains(q, StringComparison.OrdinalIgnoreCase)) && (!expiring.GetValueOrDefault() || r["expiring"]!.GetValue<bool>()) && (!stillOccupied.GetValueOrDefault() || r["stillOccupiedAfterExpiry"]!.GetValue<bool>())).ToList();
        if (requests == "pending")
        {
            var pending = await Rows(c, t, "select jsonb_build_object('id',contract_id)::text from bookings where contract_id is not null and status='pending'", ct);
            rows = rows.Where(r => pending.Any(p => p.Id("id") == r.Id("id"))).ToList();
        }
        return Page(rows, page, pageSize);
    }, ct);
    [HttpGet("{id:guid}")] public Task<IActionResult> Get(Guid id, CancellationToken ct) => Run(true, async (c, t, a) => await Detail(c, t, id, ct), ct);
    [HttpPost("{id:guid}/versions")] public Task<IActionResult> CreateVersion(Guid id, JsonElement body, CancellationToken ct) => SaveVersion(id, null, body, ct);
    [HttpPut("{id:guid}/versions/{versionId}")] public Task<IActionResult> UpdateVersion(Guid id, string versionId, JsonElement body, CancellationToken ct) => SaveVersion(id, versionId, body, ct);
    private Task<IActionResult> SaveVersion(Guid id, string? versionId, JsonElement body, CancellationToken ct) => Run(true, async (c, t, a) =>
    {
        var raw = await Row(c, t, "select to_jsonb(c)::text from contracts c where id=@id and status in ('active','planned') for update", ct, "id", id);
        var versions = raw["versions"]!.AsArray();
        var b = Object(body);
        var from = DateOnly.Parse(b.Text("effectiveFrom")!);
        var end = DateOnly.Parse(b.Text("endsOn")!);
        if (end <= from)
            throw Invalid("Ngày hết hạn phải sau ngày bắt đầu.");
        var old = versionId is null ? null : versions.FirstOrDefault(v => v.Text("id") == versionId);
        if (versionId is not null && old is null)
            throw Missing();
        if (old.Text("signedAt") is not null)
            throw new LeaseHttpException(409, "signed_version_immutable", "Không sửa bản đã ký.");
        if (old is null && versions.Any(v => v.Text("signedAt") is null))
            throw new LeaseHttpException(409, "draft_exists", "Hợp đồng đã có phiên bản nháp.");
        var v = new JsonObject
        {
            ["id"] = versionId ?? Guid.NewGuid().ToString(),
            ["versionNo"] = old?.Number("versionNo") ?? (versions.Count == 0 ? 1 : versions.Max(x => x.Number("versionNo")) + 1),
            ["effectiveFrom"] = from.ToString("yyyy-MM-dd"),
            ["endsOn"] = end.ToString("yyyy-MM-dd"),
            ["requiredDeposit"] = b.Number("requiredDeposit"),
            ["invoiceDay"] = b.Number("invoiceDay", 1),
            ["dueAfterDays"] = b.Number("dueAfterDays", 5),
            ["termsText"] = b.Text("termsText") ?? "",
            ["prorationPolicy"] = b.Text("prorationPolicy") ?? "actual_days",
            ["changeReason"] = b.Text("changeReason"),
            ["signedAt"] = null,
            ["signedBy"] = null,
            ["fileIds"] = new JsonArray(),
            ["rates"] = Rates(b["rates"], from),
            ["partiesSnapshot"] = new JsonObject()
        };
        if (old is not null)
            versions.Remove(old);
        versions.Add(v);
        await Execute(c, t, "update contracts set versions=@v::jsonb where id=@id", ct, "id", id, "v", versions.ToJsonString());
        return await Detail(c, t, id, ct);
    }, ct);
    [HttpPost("{id:guid}/versions/{versionId}/sign")]
    public Task<IActionResult> Sign(Guid id, string versionId, JsonElement body, CancellationToken ct) => Run(true, async (c, t, a) =>
    {
        var b = Object(body);
        var file = b.Id("signedFileId");
        await RoomsController.CheckFile(c, t, file, a, "contract_signed", ct);
        var raw = await Row(c, t, "select to_jsonb(c)::text from contracts c where id=@id for update", ct, "id", id);
        var versions = raw["versions"]!.AsArray();
        var v = versions.FirstOrDefault(x => x.Text("id") == versionId) ?? throw Missing();
        if (v.Text("signedAt") is null)
        {
            await ContractTenantRules.ValidateAsync(c, t, raw.Id("user_id"), ct);
            v["signedAt"] = DateTimeOffset.Parse(b.Text("signedAt") ?? DateTimeOffset.UtcNow.ToString("O")).ToUniversalTime().ToString("O");
            v["signedBy"] = a;
            v["fileIds"] = new JsonArray(JsonValue.Create(file));
            await Execute(c, t, "update contracts set versions=@v::jsonb where id=@id", ct, "id", id, "v", versions.ToJsonString());
        }
        return await Detail(c, t, id, ct);
    }, ct);
    [HttpDelete("{id:guid}/versions/{versionId}")]
    public Task<IActionResult> DeleteVersion(Guid id, string versionId, CancellationToken ct) => Run(true, async (c, t, a) =>
    {
        var raw = await Row(c, t, "select to_jsonb(c)::text from contracts c where id=@id for update", ct, "id", id);
        var versions = raw["versions"]!.AsArray();
        var v = versions.FirstOrDefault(x => x.Text("id") == versionId) ?? throw Missing();
        if (v.Text("signedAt") is not null)
            throw Invalid("Không xóa bản đã ký.");
        versions.Remove(v);
        await Execute(c, t, "update contracts set versions=@v::jsonb where id=@id", ct, "id", id, "v", versions.ToJsonString());
        return await Detail(c, t, id, ct);
    }, ct);
    [HttpPost("{id:guid}/attachments")] public Task<IActionResult> Attach(Guid id, JsonElement body, CancellationToken ct) => Attachment(id, Object(body).Id("fileId"), true, ct);
    [HttpDelete("{id:guid}/attachments/{fileId:guid}")] public Task<IActionResult> RemoveAttachment(Guid id, Guid fileId, CancellationToken ct) => Attachment(id, fileId, false, ct);
    private Task<IActionResult> Attachment(Guid id, Guid file, bool add, CancellationToken ct) => Run(true, async (c, t, a) =>
    {
        if (add)
        {
            var purpose = await Scalar(c, t, "select purpose from files where id=@id and uploaded_by=@a and scan_status='clean'", ct, "id", file, "a", a);
            if (purpose is not ("contract_signed" or "contract_attachment"))
                throw Invalid("Tệp đính kèm hợp đồng không hợp lệ.");
        }
        await Execute(c, t, add ? "update contracts set attachments=case when attachments @> jsonb_build_array(@file::text) then attachments else attachments||jsonb_build_array(@file::text) end where id=@id" : "update contracts set attachments=(select coalesce(jsonb_agg(x),'[]') from jsonb_array_elements(attachments) x where x<>to_jsonb(@file::text)) where id=@id", ct, "id", id, "file", file.ToString());
        return await Detail(c, t, id, ct);
    }, ct);
    [HttpPost("{id:guid}/archive")]
    public Task<IActionResult> Archive(Guid id, CancellationToken ct) => Run(true, async (c, t, a) =>
    {
        if (await Execute(c, t, "update contracts set archived_at=now() where id=@id and status in ('ended','cancelled')", ct, "id", id) == 0)
            throw Invalid("Chỉ lưu trữ hợp đồng đã kết thúc.");
        return new
        {
            id
        };
    }, ct);
}

internal static class ContractSql
{
    // Correlated subqueries also work in UPDATE ... RETURNING, where u/r/p aliases do not exist.
    public static string Json(string c, bool detail = false) => $"""
        (select jsonb_build_object(
          'id',{c}.id,'contractId',{c}.id,'tenancyId',{c}.id,'code',{c}.code,
          'status',case when {c}.archived_at is not null then 'archived' when {c}.status='ended' then 'terminated'
            when {c}.status='active' and {c}.ends_on<=current_date then 'expired'
            when {c}.status='active' then 'active' when {c}.status='planned' then 'signed' else 'draft' end,
          'invoiceDay',({c}.versions->-1->>'invoiceDay')::int,'tenancyStatus',{c}.status,'onboardingMode',{c}.onboarding_mode,
          'startsOn',{c}.starts_on,'effectiveFrom',{c}.starts_on,'endsOn',{c}.ends_on,'displayEndOn',{c}.ends_on-1,
          'daysLeft',{c}.ends_on-current_date,'expiring',({c}.status='active' and {c}.ends_on between current_date and current_date+30),
          'stillOccupiedAfterExpiry',({c}.status='active' and {c}.ends_on<=current_date),
          'moveInOn',{c}.move_in_on,'moveOutOn',{c}.move_out_on,'requiredDeposit',{c}.required_deposit,
          'archivedAt',{c}.archived_at,'rent',coalesce((select (rate->>'unitPrice')::numeric from jsonb_array_elements(coalesce((select v->'rates' from jsonb_array_elements({c}.versions) v where nullif(v->>'signedAt','') is not null and (v->>'effectiveFrom')::date<=current_date order by (v->>'versionNo')::int desc limit 1),'[]')) rate where rate->>'category'='rent' and rate->>'effectiveTo' is null limit 1),0),
          'depositHeld',d.held,'deposit',jsonb_build_object('required',{c}.required_deposit,'received',d.received,'held',d.held,'offset',d.offset_amount,'refunded',d.refunded),
          'tenant',jsonb_build_object('id',u.id,'fullName',u.display_name,'code',u.code,'phone',u.phone,'email',u.email,'address',jsonb_build_object('line',u.address_line)),
          'representative',jsonb_build_object('id',u.id,'fullName',u.display_name,'code',u.code,'phone',u.phone,'email',u.email),
          'room',jsonb_build_object('id',r.id,'code',r.code,'name',r.name,'propertyId',p.id,'propertyName',p.name),
          'roomInfo',jsonb_build_object('name',r.name,'areaM2',r.area_m2,'capacity',r.capacity,'address',jsonb_build_object('line',p.address_line,'locality',p.locality,'province',p.province)),
          'tenancy',jsonb_build_object('id',{c}.id,'status',{c}.status,'actualMoveIn',{c}.move_in_on,'actualMoveOut',{c}.move_out_on,
            'residentsCount',1+(select count(*) from jsonb_array_elements({c}.occupants) x where x->>'leftOn' is null)),
          'versions',coalesce((select jsonb_agg(v || jsonb_build_object('isSigned',nullif(v->>'signedAt','') is not null,
            'displayEndOn',(v->>'endsOn')::date-1,'files',coalesce((select jsonb_agg(jsonb_build_object('fileKind','signed','file',jsonb_build_object('id',f.id,'fileName',f.file_name,'contentType',f.content_type,'scanStatus',f.scan_status))) from jsonb_array_elements_text(v->'fileIds') fid join files f on f.id::text=fid),'[]'),
            'rates',coalesce((select jsonb_agg(rate || jsonb_build_object('billingCycle',rate->>'cycle','chargeType',jsonb_build_object('id',rate->>'code','code',rate->>'code','name',rate->>'name','category',rate->>'category','unitLabel',rate->>'unit'))) from jsonb_array_elements(v->'rates') rate),'[]')) order by (v->>'versionNo')::int) from jsonb_array_elements({c}.versions) v),'[]'),
          'attachments',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'file',jsonb_build_object('id',f.id,'fileName',f.file_name,'contentType',f.content_type,'scanStatus',f.scan_status))) from jsonb_array_elements({c}.attachments) a join files f on f.id::text=coalesce(a->>'fileId',(a #>> ARRAY[]::text[]))),'[]'),
          'occupants',{c}.occupants,'initialReadings',{c}.initial_readings,'finalReadings',{c}.final_readings)
          {(detail ? $"""
          || jsonb_build_object('meters',coalesce((select jsonb_agg(jsonb_build_object('meterKind',k,'serialNumber',k,'lastReading',coalesce((select jsonb_build_object('value',(to_jsonb(i)->>(k||'_end'))::numeric,'observedAt',to_jsonb(i)->>(k||'_to_at')) from invoices i where i.contract_id={c}.id and i.status='issued' and i.adjusts_invoice_id is null and to_jsonb(i)->>(k||'_end') is not null order by service_to desc limit 1),{c}.initial_readings->k))) from unnest(ARRAY['electricity','water']) k where {c}.initial_readings ? k),'[]'), 'requests',coalesce((select jsonb_agg(jsonb_build_object('id',b.id,'status',b.status,'requestType',b.kind,'desiredOn',b.desired_on,'message',b.message,'createdAt',b.created_at)) from bookings b where b.contract_id={c}.id),'[]'),
            'invoices',coalesce((select jsonb_agg(jsonb_build_object('id',i.id,'code',i.code,'status',i.status,'dueOn',i.due_on,'totalAmount',i.total_amount,'outstandingAmount',b.outstanding_amount,'paymentStatus',b.payment_status,'isOverdue',b.is_overdue)) from invoices i join v_invoice_balances b on b.id=i.id where i.contract_id={c}.id),'[]'),
            'checkinHandover',{c}.checkin_handover,'checkoutHandover',{c}.checkout_handover,'checkoutSummary',{c}.checkout_summary,'onboardingGaps',{c}.onboarding_gaps,'endedReason',{c}.ended_reason,'remainingDebtReason',{c}.remaining_debt_reason)
          """ : "")}
          from users u cross join rooms r join properties p on p.id=r.property_id
          left join v_deposit_balances d on d.contract_id={c}.id
          where u.id={c}.user_id and r.id={c}.room_id)
        """;
    public static string Version(JsonElement b, Guid id, int number, Guid? signer, string? at)
    {
        var rates = b.ValueOr("rates", JsonInput.EmptyArray).GetRawText();
        return JsonSerializer.Serialize(new
        {
            id,
            versionNo = number,
            effectiveFrom = b.String("effectiveFrom") ?? b.String("startsOn"),
            endsOn = b.String("endsOn"),
            requiredDeposit = b.Decimal("requiredDeposit") ?? 0,
            invoiceDay = b.Decimal("invoiceDay") ?? 1,
            dueAfterDays = b.Decimal("dueAfterDays") ?? 5,
            prorationPolicy = b.String("prorationPolicy") ?? "actual_days",
            termsText = b.String("termsText") ?? "",
            changeReason = b.String("changeReason"),
            signedAt = at,
            signedBy = signer,
            fileIds = System.Array.Empty<string>(),
            partiesSnapshot = new
            {
            },
            rates = JsonDocument.Parse(rates).RootElement
        });
    }
}
