using System.Text.Json;
using Microsoft.AspNetCore.Mvc;
using Npgsql;
using SmartRent.Api.Common;
using static SmartRent.Api.Common.BusinessData;
namespace SmartRent.Api.Features.Catalog;

[ApiController, Route("api/v1/catalog/amenities")]
public sealed class CatalogWriteController(NpgsqlDataSource db) : BusinessController(db)
{
    // Tiện ích lưu trong JSONB của cơ sở, không tạo bảng danh mục mới.
    [HttpPost]
    public Task<IActionResult> Amenity(JsonElement body, CancellationToken ct) => Run(true, async (c, t, a) =>
    {
        var name = body.String("name")?.Trim();
        if (string.IsNullOrWhiteSpace(name))
            throw Invalid("Cần tên tiện ích.");
        var code = "AM" + Guid.NewGuid().ToString("N")[..10].ToUpperInvariant();
        var value = new
        {
            code,
            name,
            icon = body.String("icon") ?? "check2"
        };
        if (await Execute(c, t, "update properties set amenity_options=amenity_options||jsonb_build_array(@v::jsonb) where id=(select id from properties order by created_at limit 1)", ct, "v", System.Text.Json.JsonSerializer.Serialize(value)) == 0)
            throw Invalid("Cần tạo cơ sở trước.");
        return new
        {
            id = code,
            code,
            name,
            icon = value.icon
        };
    }, ct);
}
