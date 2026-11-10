using SmartRent.Api.Common;
namespace SmartRent.Api.Features.Rooms;

public static class HousingLinks
{
    public static string? Map(string? value, bool embed = false)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        value = value.Trim();
        if (value.Length > 4096 || !Uri.TryCreate(value, UriKind.Absolute, out var url) || url.Scheme != "https" || !string.IsNullOrEmpty(url.UserInfo) || !url.IsDefaultPort)
            throw new LeaseHttpException(422, "invalid_map_url", "Cần URL Google Maps HTTPS hợp lệ, không dán toàn bộ thẻ iframe.");
        var google = url.Host is "google.com" or "www.google.com" or "maps.google.com";
        var valid = embed ? google && url.AbsolutePath.StartsWith("/maps/embed", StringComparison.Ordinal)
            : (google && (url.Host == "maps.google.com" || url.AbsolutePath.StartsWith("/maps", StringComparison.Ordinal))) || url.Host == "maps.app.goo.gl" || (url.Host == "goo.gl" && url.AbsolutePath.StartsWith("/maps/", StringComparison.Ordinal));
        if (!valid) throw new LeaseHttpException(422, "invalid_map_url", embed ? "URL nhúng phải từ Google Maps /maps/embed." : "Chỉ dùng liên kết Google Maps hoặc liên kết chia sẻ maps.app.goo.gl.");
        return value;
    }
}
