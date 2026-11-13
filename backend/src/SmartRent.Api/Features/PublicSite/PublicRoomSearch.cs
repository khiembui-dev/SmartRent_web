using System.Text.Json.Nodes;
using SmartRent.Api.Common;
using static SmartRent.Api.Common.BusinessData;

namespace SmartRent.Api.Features.PublicSite;

/// <summary>Tìm trên projection công khai; lọc trước phân trang, khớp mọi tiện ích đã chọn.</summary>
public static class PublicRoomSearch
{
    public static string Fold(string? text) => SearchText.Fold(text);

    public static List<JsonObject> Filter(IEnumerable<JsonObject> source, string? q, string? province, string? locality,
        string? roomType, decimal? priceMin, decimal? priceMax, decimal? areaMin, int? capacity, string? amenities, string? sort, bool includeHeld = false)
    {
        if (priceMin < 0 || priceMax < 0 || priceMin > priceMax || priceMin > 1_000_000_000 || priceMax > 1_000_000_000)
            throw Invalid("Khoảng giá không hợp lệ. Giá từ phải nhỏ hơn hoặc bằng giá đến.");
        if (areaMin < 0 || areaMin > 500 || capacity < 1 || capacity > 20) throw Invalid("Diện tích hoặc số người không hợp lệ.");
        if ((q?.Length ?? 0) > 120 || (amenities?.Length ?? 0) > 1000) throw Invalid("Bộ lọc quá dài.");
        if (sort is not (null or "price" or "-price" or "newest" or "-area")) throw Invalid("Thứ tự sắp xếp không hợp lệ.");
        var words = Fold(q).Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        var required = (amenities ?? "").Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).Distinct().ToArray();
        var rows = source.Where(r => (r["availability"].Text("status") == "available" || includeHeld)
            && (string.IsNullOrWhiteSpace(province) || r.Text("province") == province || r.Text("provinceCode") == province)
            && (string.IsNullOrWhiteSpace(locality) || r.Text("locality") == locality || r.Text("wardCode") == locality)
            && (string.IsNullOrWhiteSpace(roomType) || r["roomType"].Text("id") == roomType)
            && (!priceMin.HasValue || r.Number("rent") >= priceMin) && (!priceMax.HasValue || r.Number("rent") <= priceMax)
            && (!areaMin.HasValue || r.Number("areaM2") >= areaMin) && (!capacity.HasValue || r.Number("capacity") >= capacity)
            && required.All(code => r["amenities"]!.AsArray().Any(a => a.Text("code") == code || a.Text("id") == code))
            && words.All(word => Fold(string.Join(' ', r.Text("title"), r.Text("roomCode"), r.Text("propertyName"), r["address"].Text("line"), r.Text("locality"), r.Text("province"))).Contains(word))).ToList();
        return sort switch {
            "newest" => rows,
            "-price" => rows.OrderByDescending(r => r.Number("rent")).ThenBy(r => r.Text("id")).ToList(),
            "-area" => rows.OrderByDescending(r => r.Number("areaM2")).ThenBy(r => r.Number("rent")).ThenBy(r => r.Text("id")).ToList(),
            _ => rows.OrderBy(r => r.Number("rent")).ThenBy(r => r.Text("id")).ToList()
        };
    }
}
