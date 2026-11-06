using System.Text.Json;
using SmartRent.Api.Common;

namespace SmartRent.Api.Features.Billing;

// The imported calculator currently handles rent, electricity and water only.
// Resolve actual effective prices instead of silently using demo prices.
internal static class BillingPriceResolver
{
    public static (decimal Rent, decimal Electricity, decimal Water) Resolve(
        string propertyRates, string roomRates, string versions, DateOnly on)
    {
        var selected = new Dictionary<string, JsonElement>();
        void Apply(JsonElement rates)
        {
            foreach (var rate in rates.EnumerateArray())
            {
                if (!DateOnly.TryParse(rate.GetProperty("effectiveFrom").GetString(), out var start) || start > on) continue;
                if (rate.TryGetProperty("effectiveTo", out var end) && end.ValueKind == JsonValueKind.String
                    && DateOnly.Parse(end.GetString()!) <= on) continue;
                selected[rate.GetProperty("code").GetString()!] = rate.Clone();
            }
        }
        using var properties = JsonDocument.Parse(propertyRates);
        using var rooms = JsonDocument.Parse(roomRates);
        using var contracts = JsonDocument.Parse(versions);
        Apply(properties.RootElement);
        Apply(rooms.RootElement);
        var version = contracts.RootElement.EnumerateArray().Where(v =>
            v.TryGetProperty("signedAt", out var signed) && signed.ValueKind == JsonValueKind.String
            && DateOnly.Parse(v.GetProperty("effectiveFrom").GetString()!) <= on
            && DateOnly.Parse(v.GetProperty("endsOn").GetString()!) > on)
            .OrderBy(v => v.GetProperty("versionNo").GetInt32()).LastOrDefault();
        if (version.ValueKind == JsonValueKind.Undefined)
            throw new LeaseHttpException(422,"signed_contract_required","Cần hợp đồng đã ký và có hiệu lực trong kỳ tính tiền.");
        Apply(version.GetProperty("rates"));
        if (selected.Values.Any(r => r.GetProperty("category").GetString() is not ("rent" or "electricity" or "water")
            || r.GetProperty("cycle").GetString() != "monthly"))
            throw new LeaseHttpException(422,"billing_calculator_incomplete","Bộ tính tiền từ nhánh nhóm chưa hỗ trợ khoản phí này; cần bổ sung trước khi phát hành.");
        decimal Price(string category, string method)
        {
            var rates = selected.Values.Where(r => r.GetProperty("category").GetString() == category).ToArray();
            if (rates.Length != 1 || rates[0].GetProperty("method").GetString() != method)
                throw new LeaseHttpException(422,"billing_rates_missing","Cần đơn giá tiền phòng, điện và nước hợp lệ; hệ thống không dùng giá mẫu.");
            return rates[0].GetProperty("unitPrice").GetDecimal();
        }
        return (Price("rent","fixed"),Price("electricity","metered"),Price("water","metered"));
    }
}
