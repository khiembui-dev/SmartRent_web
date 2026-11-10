using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Npgsql;
using SmartRent.Api.Common;
using SmartRent.Api.Features.Rooms;
using static SmartRent.Api.Common.BusinessData;
namespace SmartRent.Api.Features.Properties;

[ApiController, Route("api/v1/properties")]
public sealed class PropertiesController(NpgsqlDataSource db) : BusinessController(db)
{
    [HttpGet]
    public Task<IActionResult> List(string? q, int page = 1, int pageSize = 100, CancellationToken ct = default) => Run(true, async (c, t, a) =>
    {
        var rows = await Rows(c, t, "select jsonb_build_object('id',id)::text from properties where @q='' or name ilike '%'||@q||'%' or address_line ilike '%'||@q||'%' order by name", ct, "q", q ?? "");
        var output = new List<System.Text.Json.Nodes.JsonObject>();
        foreach (var r in rows)
            output.Add(await HousingData.Property(c, t, r.Id("id"), ct));
        return Page(output, page, pageSize);
    }, ct);
    [HttpGet("{id:guid}")] public Task<IActionResult> Get(Guid id, CancellationToken ct) => Run(true, async (c, t, a) => await HousingData.Property(c, t, id, ct), ct);
    [HttpPost] public Task<IActionResult> Create(JsonElement body, CancellationToken ct) => Save(null, body, ct);
    [HttpPut("{id:guid}")] public Task<IActionResult> Update(Guid id, JsonElement body, CancellationToken ct) => Save(id, body, ct);
    // Cơ sở giữ lịch sử giá; đổi giá không sửa snapshot của hợp đồng/hóa đơn đã ký.
    private Task<IActionResult> Save(Guid? id, JsonElement body, CancellationToken ct) => Run(true, async (c, t, a) =>
    {
        var b = Object(body);
        var address = b["address"];
        if (string.IsNullOrWhiteSpace(b.Text("name")) || string.IsNullOrWhiteSpace(address.Text("line")) || string.IsNullOrWhiteSpace(address.Text("province")))
            throw Invalid("Cần tên, địa chỉ và tỉnh/thành phố.");
        var pid = id ?? Guid.NewGuid();
        var old = id is null ? null : await Row(c, t, "select to_jsonb(p)::text from properties p where id=@id for update", ct, "id", pid);
        var rates = Rates(b["rates"], Today, old?["rates"]?.AsArray());
        var map = HousingLinks.Map(b.ContainsKey("mapUrl") ? b.Text("mapUrl") : old.Text("map_url"));
        var embed = HousingLinks.Map(b.ContainsKey("mapEmbedUrl") ? b.Text("mapEmbedUrl") : old.Text("map_embed_url"), true);
        await Execute(c, t, id is null ?
            "insert into properties(id,code,name,address_line,locality,province,description,rates) values(@id,next_code('CS'),@name,@line,@locality,@province,@description,@rates::jsonb)" :
            "update properties set name=@name,address_line=@line,locality=@locality,province=@province,description=@description,rates=@rates::jsonb where id=@id",
            ct, "id", pid, "name", b.Text("name")!.Trim(), "line", address.Text("line"), "locality", address.Text("locality"), "province", address.Text("province"), "description", b.Text("description"), "rates", rates.ToJsonString());
        await Execute(c, t, "update properties set map_url=@map,map_embed_url=@embed where id=@id", ct, "map", map, "embed", embed, "id", pid);
        return await HousingData.Property(c, t, pid, ct);
    }, ct);
    [HttpPost("{id:guid}/activate")] public Task<IActionResult> Activate(Guid id, CancellationToken ct) => State(id, true, null, ct);
    [HttpPost("{id:guid}/deactivate")] public Task<IActionResult> Deactivate(Guid id, JsonElement body, CancellationToken ct) => State(id, false, body.String("reason"), ct);
    private Task<IActionResult> State(Guid id, bool active, string? reason, CancellationToken ct) => Run(true, async (c, t, a) =>
    {
        if (!active && string.IsNullOrWhiteSpace(reason))
            throw Invalid("Cần lý do ngừng hoạt động.");
        if (await Execute(c, t, "update properties set is_active=@active,inactive_reason=@reason where id=@id", ct, "id", id, "active", active, "reason", reason) == 0)
            throw Missing();
        return await HousingData.Property(c, t, id, ct);
    }, ct);
    [HttpDelete("{id:guid}")]
    public Task<IActionResult> Delete(Guid id, CancellationToken ct) => Run(true, async (c, t, a) =>
    {
        if (await Scalar(c, t, "select id::text from rooms where property_id=@id limit 1", ct, "id", id) is not null)
            throw new LeaseHttpException(409, "property_has_rooms", "Cơ sở còn phòng nên không thể xóa.");
        await Execute(c, t, "delete from billing_periods b where b.property_id=@id and not exists(select 1 from invoices i where i.period_id=b.id)", ct, "id", id);
        if (await Execute(c, t, "delete from properties where id=@id", ct, "id", id) == 0)
            throw Missing();
        return new
        {
            id
        };
    }, ct);
}
