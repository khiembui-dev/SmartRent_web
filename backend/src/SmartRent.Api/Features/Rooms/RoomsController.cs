using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Mvc;
using Npgsql;
using SmartRent.Api.Common;
using static SmartRent.Api.Common.BusinessData;
namespace SmartRent.Api.Features.Rooms;

[ApiController, Route("api/v1/rooms")]
public sealed class RoomsController(NpgsqlDataSource db) : BusinessController(db)
{
    [HttpGet]
    public Task<IActionResult> List(string? q, Guid? propertyId, string? status, [FromQuery(Name = "contract")] string? contractFilter, int page = 1, int pageSize = 30, CancellationToken ct = default) => Run(true, async (c, t, a) =>
    {
        var ids = await Rows(c, t, "select jsonb_build_object('id',id)::text from rooms where (@p::uuid is null or property_id=@p) order by code", ct, "p", propertyId);
        var rows = new List<JsonObject>();
        foreach (var id in ids)
        {
            var r = await HousingData.Room(c, t, id.Id("id"), ct);
            if (!string.IsNullOrWhiteSpace(status) && r.Text("occupancyStatus") != status)
                continue;
            if (contractFilter == "missing" && (r["currentTenancy"] is null || r["currentTenancy"]!["hasContract"]!.GetValue<bool>()))
                continue;
            if (!string.IsNullOrWhiteSpace(q) && !r.ToJsonString().Contains(q, StringComparison.OrdinalIgnoreCase))
                continue;
            rows.Add(r);
        }
        return Page(rows, page, pageSize);
    }, ct);
    [HttpGet("{id:guid}")] public Task<IActionResult> Get(Guid id, CancellationToken ct) => Run(true, async (c, t, a) => await HousingData.Room(c, t, id, ct), ct);
    [HttpPost] public Task<IActionResult> Create(JsonElement body, CancellationToken ct) => Save(null, body, ct);
    [HttpPut("{id:guid}")] public Task<IActionResult> Update(Guid id, JsonElement body, CancellationToken ct) => Save(id, body, ct);
    // Thông tin phòng, giá riêng, ảnh và khách nhập ban đầu cùng transaction.
    private Task<IActionResult> Save(Guid? id, JsonElement body, CancellationToken ct) => Run(true, async (c, t, a) =>
    {
        var b = Object(body);
        var rid = id ?? Guid.NewGuid();
        var old = id is null ? null : await Row(c, t, "select to_jsonb(r)::text from rooms r where id=@id for update", ct, "id", rid);
        var pid = old?.Id("property_id") ?? b.Id("propertyId");
        var p = await Row(c, t, "select to_jsonb(p)::text from properties p where id=@id", ct, "id", pid);
        var code = b.Text("code")?.Trim();
        if (string.IsNullOrWhiteSpace(code) || string.IsNullOrWhiteSpace(b.Text("name")))
            throw Invalid("Cần mã và tên phòng.");
        var active = await Scalar(c, t, "select id::text from contracts where room_id=@id and status in ('active','planned') limit 1", ct, "id", rid);
        var inputRates = b["rates"]?.DeepClone().AsArray() ?? new JsonArray();
        if (b["rent"] is not null)
            inputRates.Add(new JsonObject { ["chargeTypeId"] = "RENT", ["unitPrice"] = b.Number("rent") });
        var rates = Rates(inputRates, Today, old?["rates"]?.AsArray());
        // Khi giá bằng cơ sở, giữ nguồn kế thừa thay vì sao chép thành giá riêng.
        var propertyPrices = Effective(p["rates"]!.AsArray(), new(), Today);
        foreach (var r in rates.Where(x => x.Text("effectiveTo") is null).ToArray())
            if (propertyPrices.Any(x => x.Text("code") == r.Text("code") && x.Number("unitPrice") == r.Number("unitPrice")))
                rates.Remove(r);
        var options = await Rows(c, t, "select distinct x::text from properties cross join lateral jsonb_array_elements(amenity_options) x", ct);
        var amenityIds = b["amenityIds"]?.AsArray().Select(x => x!.GetValue<string>()).ToHashSet() ?? [];
        var amenities = new JsonArray(options.Where(x => amenityIds.Contains(x.Text("code")!)).Select(x => (JsonNode)x).ToArray());
        var images = old?["images"]?.DeepClone().AsArray() ?? new JsonArray();
        foreach (var f in b["imageFileIds"]?.AsArray() ?? new JsonArray())
        {
            var fid = Guid.Parse(f!.GetValue<string>());
            await CheckFile(c, t, fid, a, "room_image", ct);
            if (!images.Any(x => x.Text("fileId") == fid.ToString()))
                images.Add(new JsonObject { ["fileId"] = fid, ["sortOrder"] = images.Count, ["isCover"] = images.Count == 0 });
        }
        var op = old.Text("operating_status") ?? b.Text("operatingStatus") ?? "available";
        if (op is not ("available" or "maintenance" or "inactive"))
            throw Invalid("Trạng thái phòng không hợp lệ.");
        await Execute(c, t, id is null ?
          "insert into rooms(id,property_id,code,name,area_m2,capacity,floor_label,description,required_deposit,operating_status,status_reason,rates,amenities,images) values(@id,@p,@code,@name,@area,@cap,@floor,@description,@deposit,@op,@reason,@rates::jsonb,@amenities::jsonb,@images::jsonb)" :
          "update rooms set code=@code,name=@name,area_m2=@area,capacity=@cap,floor_label=@floor,description=@description,required_deposit=@deposit,rates=@rates::jsonb,amenities=@amenities::jsonb,images=@images::jsonb where id=@id",
          ct, "id", rid, "p", pid, "code", code, "name", b.Text("name"), "area", b.Number("areaM2"), "cap", (short)b.Number("capacity", 2), "floor", b.Text("floorLabel"), "description", b.Text("description"), "deposit", b.Number("requiredDeposit"), "op", op, "reason", op == "available" ? null : "Thiết lập ban đầu", "rates", rates.ToJsonString(), "amenities", amenities.ToJsonString(), "images", images.ToJsonString());
        if (b["occupant"] is JsonObject occupant && active is null)
        {
            var user = occupant.Id("tenantId");
            var move = DateOnly.Parse(occupant.Text("moveInOn")!);
            if (move > Today)
                throw Invalid("Ngày vào ở không được ở tương lai.");
            await Execute(c, t, "insert into contracts(code,room_id,user_id,starts_on,move_in_on,onboarding_mode,onboarding_gaps) values(next_code('CON'),@room,@user,@day,@day,'import',jsonb_build_array('contract','initial_readings'))", ct, "room", rid, "user", user, "day", move);
        }
        return await HousingData.Room(c, t, rid, ct);
    }, ct);
    internal static async Task CheckFile(NpgsqlConnection c, NpgsqlTransaction t, Guid id, Guid actor, string purpose, CancellationToken ct)
    {
        if (await Scalar(c, t, "select id::text from files where id=@id and uploaded_by=@actor and purpose=@purpose and scan_status='clean'", ct, "id", id, "actor", actor, "purpose", purpose) is null)
            throw Invalid("Tệp không thuộc tài khoản hoặc sai mục đích sử dụng.");
    }
    [HttpPost("{id:guid}/status")]
    public Task<IActionResult> Status(Guid id, JsonElement body, CancellationToken ct) => Run(true, async (c, t, a) =>
    {
        var s = body.String("status");
        if (s is not ("available" or "maintenance" or "inactive") || string.IsNullOrWhiteSpace(body.String("reason")))
            throw Invalid("Cần trạng thái và lý do.");
        if (await Execute(c, t, "update rooms set operating_status=@s,status_reason=@reason where id=@id", ct, "id", id, "s", s, "reason", body.String("reason")) == 0)
            throw Missing();
        return await HousingData.Room(c, t, id, ct);
    }, ct);
    [HttpPut("{id:guid}/listing")]
    public Task<IActionResult> Listing(Guid id, JsonElement body, CancellationToken ct) => Run(true, async (c, t, a) =>
    {
        var b = Object(body);
        var s = b.Text("status");
        if (s is not ("published" or "hidden" or "draft"))
            throw Invalid("Trạng thái tin không hợp lệ.");
        var title = b.Text("title");
        if (string.IsNullOrWhiteSpace(title))
            throw Invalid("Cần tiêu đề tin.");
        await Execute(c, t, "update rooms set listing_title=@title,listing_description=@description,listing_status=@status,listing_slug=coalesce(listing_slug,'phong-'||lower(code)||'-'||substr(id::text,1,8)),published_at=case when @status='published' then now() else published_at end where id=@id", ct, "id", id, "title", title, "description", b.Text("description"), "status", s);
        return await HousingData.Room(c, t, id, ct);
    }, ct);
    [HttpDelete("{id:guid}")]
    public Task<IActionResult> Delete(Guid id, CancellationToken ct) => Run(true, async (c, t, a) =>
    {
        if (await Scalar(c, t, "select id::text from contracts where room_id=@id union all select id::text from bookings where room_id=@id union all select id::text from tickets where room_id=@id limit 1", ct, "id", id) is not null)
            throw new LeaseHttpException(409, "room_has_history", "Phòng có lịch sử; hãy ngừng khai thác để giữ hồ sơ.");
        if (await Execute(c, t, "delete from rooms where id=@id", ct, "id", id) == 0)
            throw Missing();
        return new
        {
            id
        };
    }, ct);
    [HttpPatch("{id:guid}/images")]
    public Task<IActionResult> Images(Guid id, JsonElement body, CancellationToken ct) => Run(true, async (c, t, a) =>
    {
        var old = await Row(c, t, "select to_jsonb(r)::text from rooms r where id=@id for update", ct, "id", id);
        var b = Object(body);
        var images = old["images"]!.AsArray();
        if (b.Text("coverImageId") is string cover)
        foreach (var x in images)
            x!["isCover"] = x.Text("fileId") == cover;
        await Execute(c, t, "update rooms set images=@images::jsonb where id=@id", ct, "id", id, "images", images.ToJsonString());
        return (await HousingData.Room(c, t, id, ct))["images"]!.DeepClone();
    }, ct);
    [HttpDelete("{id:guid}/images/{fileId:guid}")]
    public Task<IActionResult> RemoveImage(Guid id, Guid fileId, CancellationToken ct) => Run(true, async (c, t, a) =>
    {
        await Execute(c, t, "update rooms set images=(select coalesce(jsonb_agg(x),'[]') from jsonb_array_elements(images) x where x->>'fileId'<>@file) where id=@id", ct, "id", id, "file", fileId.ToString());
        return (await HousingData.Room(c, t, id, ct))["images"]!.DeepClone();
    }, ct);
}
