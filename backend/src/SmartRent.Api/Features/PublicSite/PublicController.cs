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
    [HttpGet("administrative-units"), ResponseCache(Duration = 86400)]
    public IActionResult AddressUnits() => Ok(HousingAddress.Catalog());
    private async Task<List<JsonObject>> Listings(CancellationToken ct, IReadOnlyCollection<Guid>? only = null)
    {
        await using var c = await db.OpenConnectionAsync(ct);
        return await PublicListings.Load(c, null, ct, only);
    }
    // ids: tra cứu danh sách phòng đã lưu của khách chưa đăng nhập (lưu ở trình duyệt). Khi có ids thì giữ cả phòng đang có người giữ chỗ.
    [HttpGet("rooms")]
    public async Task<IActionResult> List(string? locality, string? roomType, decimal? priceMin, decimal? priceMax,
        string? sort = "price", int page = 1, int pageSize = 12, string? ids = null, CancellationToken ct = default,
        string? q = null, string? province = null, decimal? areaMin = null, int? capacity = null, string? amenities = null)
    {
        var only = ParseIds(ids);
        var rows = PublicRoomSearch.Filter(await Listings(ct, only), q, province, locality, roomType,
            priceMin, priceMax, areaMin, capacity, amenities, sort, only is not null);
        pageSize = Math.Clamp(pageSize, 1, 100);
        // Xóa/sửa tin trong khi đang xem trang cuối: trả về trang hợp lệ thay vì danh sách rỗng giả.
        page = Math.Clamp(page, 1, Math.Max(1, (int)Math.Ceiling(rows.Count / (double)pageSize)));
        return Ok(Page(rows, page, pageSize));
    }
    private static Guid[]? ParseIds(string? ids)
    {
        if (string.IsNullOrWhiteSpace(ids))
            return null;
        var list = ids.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Select(x => Guid.TryParse(x, out var g) ? g : Guid.Empty).Where(g => g != Guid.Empty).Distinct();
        return list.Take(Favorites.PortalFavoritesController.Limit).ToArray();
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
            amenities = rows.SelectMany(r => r["amenities"]!.AsArray()).DistinctBy(a => a.Text("code")).Select(a => new { code = a.Text("code"), name = a.Text("name") }),
            provinces = rows.GroupBy(r => r.Text("province")).Select(g => new { name = g.Key, code = g.First().Text("provinceCode"), localities = g.Select(r => r.Text("locality")).Where(x => !string.IsNullOrWhiteSpace(x)).Distinct().OrderBy(x => x) }),
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
