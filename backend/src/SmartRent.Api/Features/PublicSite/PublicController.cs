using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Mvc;
using Npgsql;
using SmartRent.Api.Common;
using SmartRent.Api.Features.Rooms;
using static SmartRent.Api.Common.BusinessData;
namespace SmartRent.Api.Features.PublicSite;

// Endpoint công khai chỉ đọc phòng đã đăng và thông tin liên hệ chủ trọ.
[ApiController, Route("api/v1/public")]
public sealed class PublicController(NpgsqlDataSource db) : ControllerBase
{
    private async Task<List<JsonObject>> Listings(CancellationToken ct)
    {
        await using var c = await db.OpenConnectionAsync(ct);
        var ids = await Rows(c, null, "select jsonb_build_object('id',r.id)::text from rooms r join properties p on p.id=r.property_id where p.is_active and r.listing_status='published' and r.operating_status='available' order by r.published_at desc", ct);
        var rows = new List<JsonObject>();
        foreach (var id in ids)
        {
            var r = await HousingData.Room(c, null, id.Id("id"), ct);
            var listing = r["listing"]!;
            var address = r["address"]!;
            var fees = new JsonArray();
            foreach (var x in r["rates"]!["effective"]!.AsArray())
                fees.Add(new JsonObject { ["code"] = x.Text("code"), ["name"] = x.Text("name"), ["category"] = x.Text("category"), ["unitLabel"] = x.Text("unit"), ["billingCycle"] = x.Text("cycle"), ["unitPrice"] = x.Number("unitPrice") });
            rows.Add(new JsonObject
            {
                ["id"] = r.Id("id"),
                ["slug"] = listing.Text("slug"),
                ["title"] = listing.Text("title"),
                ["roomCode"] = r.Text("code"),
                ["propertyName"] = r["property"].Text("name"),
                ["property"] = new JsonObject { ["id"] = r["property"]!.Id("id"), ["name"] = r["property"].Text("name"), ["addressLine"] = address.Text("line"), ["locality"] = address.Text("locality"), ["description"] = r["property"].Text("description") },
                ["locality"] = address.Text("locality"),
                ["province"] = address.Text("province"),
                ["mapUrl"] = Copy(r["mapUrl"]), ["mapEmbedUrl"] = Copy(r["mapEmbedUrl"]),
                ["rent"] = Copy(r["currentRent"]),
                ["areaM2"] = Copy(r["areaM2"]),
                ["capacity"] = Copy(r["capacity"]),
                ["requiredDeposit"] = Copy(r["requiredDeposit"]),
                ["description"] = listing.Text("description") ?? r.Text("description"),
                ["rulesText"] = r.Text("rulesText"),
                ["floorLabel"] = r.Text("floorLabel"),
                ["roomType"] = Copy(r["roomType"]),
                ["coverImageUrl"] = r.Text("coverImageUrl"),
                ["images"] = Copy(r["images"]),
                ["amenities"] = Copy(r["amenities"]),
                ["fees"] = fees,
                ["hasVideo"] = false,
                ["availability"] = new JsonObject { ["status"] = r.Text("occupancyStatus") == "reserved" ? "on_hold" : r.Text("occupancyStatus") }
            });
        }
        return rows;
    }
    [HttpGet("rooms")]
    public async Task<IActionResult> List(string? locality, string? roomType, decimal? priceMin, decimal? priceMax, string? sort = "price", int page = 1, int pageSize = 12, CancellationToken ct = default)
    {
        var rows = (await Listings(ct)).Where(r => r["availability"].Text("status") == "available" && (string.IsNullOrEmpty(locality) || r.Text("locality") == locality)
            && (string.IsNullOrEmpty(roomType) || r["roomType"].Text("id") == roomType) && (!priceMin.HasValue || r.Number("rent") >= priceMin) && (!priceMax.HasValue || r.Number("rent") <= priceMax)).ToList();
        rows = sort == "-price" ? rows.OrderByDescending(r => r.Number("rent")).ToList() : rows.OrderBy(r => r.Number("rent")).ToList();
        return Ok(Page(rows, page, pageSize));
    }
    [HttpGet("rooms/{slug}")]
    public async Task<IActionResult> Get(string slug, CancellationToken ct)
    {
        var room = (await Listings(ct)).FirstOrDefault(r => r.Text("slug") == slug);
        return room is null ? NotFound() : Ok(room);
    }
    [HttpGet("filters")]
    public async Task<IActionResult> Filters(CancellationToken ct)
    {
        var rows = (await Listings(ct)).Where(r => r["availability"].Text("status") == "available").ToList();
        var fees = rows.SelectMany(r => r["fees"]!.AsArray()).ToList();
        return Ok(new
        {
            totalListings = rows.Count,
            propertyCount = rows.Select(r => r["property"]!.Id("id")).Distinct().Count(),
            provinces = rows.GroupBy(r => r.Text("province")).Select(g => new { name = g.Key, localities = g.Select(r => r.Text("locality")).Where(x => !string.IsNullOrWhiteSpace(x)).Distinct() }),
            roomTypes = rows.Select(r => r["roomType"]).DistinctBy(r => r.Text("id")).Select(r => new { code = r.Text("id"), name = r.Text("name") }),
            feeSummary = fees.GroupBy(f => f.Text("code")).Select(g => new { code = g.Key, min = g.Min(x => x.Number("unitPrice")), max = g.Max(x => x.Number("unitPrice")), unitLabel = g.First().Text("unitLabel") }),
            depositRange = new
            {
                min = rows.Count == 0 ? (decimal?)null : rows.Min(x => x.Number("requiredDeposit")),
                max = rows.Count == 0 ? (decimal?)null : rows.Max(x => x.Number("requiredDeposit"))
            }
        });
    }
    [HttpGet("contact-info")]
    public async Task<IActionResult> Contact(CancellationToken ct)
    {
        await using var c = await db.OpenConnectionAsync(ct);
        var org = await Row(c, null, "select jsonb_build_object('name',s.business_name,'contactName',u.display_name,'phone',u.phone,'email',u.email,'properties',coalesce((select jsonb_agg(jsonb_build_object('id',p.id,'name',p.name,'addressLine',p.address_line,'locality',p.locality,'province',p.province)) from properties p where p.is_active),'[]'))::text from settings s cross join users u where s.id=1 and u.role='admin'", ct);
        return Ok(new
        {
            organizations = new[] { org }
        });
    }
}
