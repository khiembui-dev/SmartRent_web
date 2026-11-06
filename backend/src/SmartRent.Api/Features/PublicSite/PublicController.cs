using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Npgsql;

namespace SmartRent.Api.Features.PublicSite;

[ApiController]
[Route("api/v1/public")]
public sealed class PublicController(NpgsqlDataSource db) : ControllerBase
{
    [HttpGet("filters")]
    public async Task<IActionResult> Filters(CancellationToken ct)
    {
        await using var c = await db.OpenConnectionAsync(ct);
        await using var cmd = new NpgsqlCommand("select jsonb_build_object('localities',coalesce(jsonb_agg(distinct p.locality) filter(where p.locality is not null),'[]'::jsonb),'roomTypes',coalesce(jsonb_agg(distinct jsonb_build_object('code',r.room_type_code,'name',r.room_type_name)),'[]'::jsonb))::text from rooms r join properties p on p.id=r.property_id where r.operating_status='available' and r.listing_status='published'", c);
        return Content((string)(await cmd.ExecuteScalarAsync(ct))!, "application/json");
    }

    [HttpGet("rooms")]
    public async Task<IActionResult> Rooms([FromQuery] string? q, [FromQuery] string? locality, [FromQuery] string? roomType, [FromQuery] decimal? minPrice, [FromQuery] decimal? maxPrice, [FromQuery] int page = 1, [FromQuery] int pageSize = 24, CancellationToken ct = default)
    {
        page = Math.Max(1, page); pageSize = Math.Clamp(pageSize, 1, 100);
        const string dto = "jsonb_build_object('id',r.id,'slug',r.listing_slug,'title',r.listing_title,'description',r.listing_description,'room',jsonb_build_object('id',r.id,'code',r.code,'name',r.name,'areaM2',r.area_m2,'capacity',r.capacity,'roomType',r.room_type_name),'property',jsonb_build_object('id',p.id,'name',p.name,'addressLine',p.address_line,'locality',p.locality,'province',p.province),'rates',r.rates,'images',r.images)";
        const string where = "r.operating_status='available' and r.listing_status='published' and (@q='' or lower(coalesce(r.listing_title,'')||' '||r.name||' '||p.name) like '%'||lower(@q)||'%') and (@locality='' or p.locality=@locality) and (@type='' or r.room_type_code=@type) and (@min is null or coalesce((select min((x->>'unitPrice')::numeric) from jsonb_array_elements(r.rates)x where x->>'category'='rent'),0)>=@min) and (@max is null or coalesce((select min((x->>'unitPrice')::numeric) from jsonb_array_elements(r.rates)x where x->>'category'='rent'),0)<=@max)";
        await using var c = await db.OpenConnectionAsync(ct); await using var cmd = new NpgsqlCommand($"select jsonb_build_object('items',coalesce(jsonb_agg(x.item),'[]'::jsonb),'page',@page,'pageSize',@size,'total',coalesce(max(x.total),0))::text from (select {dto} item,count(*) over() total from rooms r join properties p on p.id=r.property_id where {where} order by r.published_at desc offset @skip limit @size) x", c);
        cmd.Parameters.AddWithValue("q", q?.Trim() ?? ""); cmd.Parameters.AddWithValue("locality", locality?.Trim() ?? ""); cmd.Parameters.AddWithValue("type", roomType?.Trim() ?? ""); cmd.Parameters.AddWithValue("min", (object?)minPrice ?? DBNull.Value); cmd.Parameters.AddWithValue("max", (object?)maxPrice ?? DBNull.Value); cmd.Parameters.AddWithValue("page", page); cmd.Parameters.AddWithValue("size", pageSize); cmd.Parameters.AddWithValue("skip", (page - 1) * pageSize);
        var json = await cmd.ExecuteScalarAsync(ct) as string ?? "{\"items\":[],\"page\":1,\"pageSize\":24,\"total\":0}"; return Content(json, "application/json");
    }

    [HttpGet("rooms/{slug}")]
    public async Task<IActionResult> Room(string slug, CancellationToken ct)
    {
        await using var c = await db.OpenConnectionAsync(ct); await using var cmd = new NpgsqlCommand("select jsonb_build_object('id',r.id,'slug',r.listing_slug,'title',r.listing_title,'description',r.listing_description,'rulesText',r.rules_text,'room',jsonb_build_object('id',r.id,'code',r.code,'name',r.name,'areaM2',r.area_m2,'capacity',r.capacity,'roomType',r.room_type_name),'property',jsonb_build_object('id',p.id,'name',p.name,'addressLine',p.address_line,'locality',p.locality,'province',p.province),'rates',r.rates,'images',r.images,'amenities',r.amenities)::text from rooms r join properties p on p.id=r.property_id where r.listing_slug=@slug and r.listing_status='published' and r.operating_status='available'", c); cmd.Parameters.AddWithValue("slug", slug); var json = await cmd.ExecuteScalarAsync(ct) as string; return json is null ? NotFound() : Content(json, "application/json");
    }

    [HttpGet("contact-info")]
    public async Task<IActionResult> Contact(CancellationToken ct) { await using var c = await db.OpenConnectionAsync(ct); await using var cmd = new NpgsqlCommand("select jsonb_build_object('businessName',business_name,'bankName',bank_name,'bankAccountNumber',bank_account_number,'bankAccountName',bank_account_name)::text from settings where id=1", c); return Content((string)(await cmd.ExecuteScalarAsync(ct))!, "application/json"); }
}
