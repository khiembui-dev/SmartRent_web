using System.Text.Json.Nodes;
using static SmartRent.Api.Common.BusinessData;

namespace SmartRent.Api.Features.Rooms;

/// <summary>Danh mục tỉnh/phường được đóng gói cùng API; xác minh mã và tự dựng địa chỉ chuẩn ở máy chủ.</summary>
internal static class HousingAddress
{
    private static readonly Lazy<JsonObject> Reference = new(() =>
    {
        using var stream = typeof(HousingAddress).Assembly.GetManifestResourceStream("SmartRent.Api.Data.Reference.vietnam-addresses.json")!;
        return JsonNode.Parse(stream)!.AsObject();
    });
    public static JsonObject Catalog() => Reference.Value.DeepClone().AsObject();

    public static JsonObject Normalize(JsonNode input)
    {
        var province = Reference.Value["provinces"]!.AsArray().FirstOrDefault(p => p.Text("code") == input.Text("provinceCode"));
        var ward = province?["wards"]!.AsArray().FirstOrDefault(w => w.Text("code") == input.Text("wardCode"));
        if (province is null || ward is null) throw Invalid("Chọn tỉnh/thành và phường/xã thuộc tỉnh/thành đó.");
        var house = input.Text("houseNumber")?.Trim();
        var street = input.Text("street")?.Trim();
        if (string.IsNullOrWhiteSpace(house) || house.Length > 100 || string.IsNullOrWhiteSpace(street) || street.Length > 200)
            throw Invalid("Cần số nhà và tên đường/thôn/ấp hợp lệ.");
        return new JsonObject
        {
            ["houseNumber"] = house, ["street"] = street,
            ["provinceCode"] = province.Text("code"), ["wardCode"] = ward.Text("code"),
            ["line"] = $"{house} {street}", ["locality"] = ward.Text("name"), ["province"] = province.Text("name"),
            // null nghĩa là dùng link tìm theo địa chỉ. Chỉ lưu ghim do admin chỉ định, không lưu link tự tạo cũ.
            ["mapUrl"] = HousingLinks.Map(input.Text("mapUrl")),
            ["mapEmbedUrl"] = HousingLinks.Map(input.Text("mapEmbedUrl"), true)
        };
    }

    public static JsonObject Property(JsonNode p)
    {
        var address = p["address_details"]?.DeepClone().AsObject() ?? new JsonObject();
        address["line"] = p.Text("address_line"); address["locality"] = p.Text("locality"); address["province"] = p.Text("province");
        address["mapUrl"] = p.Text("map_url"); address["mapEmbedUrl"] = p.Text("map_embed_url");
        return address;
    }
    public static string Full(JsonNode address) => string.Join(", ", new[] { address.Text("line"), address.Text("locality"), address.Text("province"), "Việt Nam" }.Where(s => !string.IsNullOrWhiteSpace(s)));
    public static string Map(JsonNode address) => address.Text("mapUrl") ?? "https://www.google.com/maps/search/?api=1&query=" + Uri.EscapeDataString(Full(address));
}
