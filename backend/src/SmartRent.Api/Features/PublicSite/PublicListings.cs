using System.Text.Json.Nodes;
using Npgsql;
using SmartRent.Api.Features.Rooms;
using static SmartRent.Api.Common.BusinessData;
namespace SmartRent.Api.Features.PublicSite;

// Dữ liệu tin phòng công khai, dùng chung cho trang Thuê phòng và trang Phòng yêu thích. Không có thông tin khách thuê.
internal static class PublicListings
{
    /// <summary>Tin đang công khai (phòng đã đăng, đang khai thác, cơ sở hoạt động). <paramref name="only"/> giới hạn theo ID phòng.</summary>
    public static async Task<List<JsonObject>> Load(NpgsqlConnection c, NpgsqlTransaction? t, CancellationToken ct, IReadOnlyCollection<Guid>? only = null)
    {
        // Một truy vấn lấy toàn bộ dữ liệu công khai. Không gọi Room() cho từng tin
        // (Room() còn tải khách thuê/ticket riêng tư và gây nhiều truy vấn không cần thiết).
        var source = await Rows(c, t, """
            select (to_jsonb(r) || jsonb_build_object('propertyData',to_jsonb(p),'occupancyStatus',o.occupancy_status,
              'publicImages',coalesce((select jsonb_agg(jsonb_build_object('id',f.id,'fileId',f.id,
                'url','/api/v1/files/'||f.id||'/public','caption',img->>'caption','isCover',coalesce((img->>'isCover')::boolean,false),
                'sortOrder',coalesce((img->>'sortOrder')::int,0)) order by coalesce((img->>'sortOrder')::int,0))
                from jsonb_array_elements(r.images) img join files f on f.id::text=img->>'fileId'
                where f.scan_status='clean' and f.purpose='room_image' and f.visibility='public'
                  and f.storage_key ~ '^[0-9a-f]{32}$'),'[]')))::text
            from rooms r join properties p on p.id=r.property_id join v_room_occupancy o on o.id=r.id
            where p.is_active and r.listing_status='published' and o.occupancy_status in ('available','reserved')
              and r.operating_status in ('available','reserved') and (@only::uuid[] is null or r.id=any(@only::uuid[]))
              and not exists(select 1 from contracts c where c.room_id=r.id and c.status in ('active','planned'))
            order by r.published_at desc nulls last,r.id
            """, ct, "only", only?.ToArray());
        var rows = new List<JsonObject>();
        foreach (var raw in source)
        {
            var p = raw["propertyData"]!;
            var location = raw["address_override"]?.DeepClone() ?? HousingAddress.Property(p);
            var rates = Effective(p["rates"]!.AsArray(), raw["rates"]!.AsArray(), Today);
            var images = raw["publicImages"]!.AsArray();
            var r = new JsonObject {
                ["id"] = Copy(raw["id"]), ["code"] = raw.Text("code"),
                ["listing"] = new JsonObject { ["slug"] = raw.Text("listing_slug"), ["title"] = raw.Text("listing_title"), ["description"] = raw.Text("listing_description") },
                ["property"] = new JsonObject { ["id"] = Copy(p["id"]), ["name"] = p.Text("name"), ["description"] = p.Text("description") },
                ["address"] = location, ["mapUrl"] = HousingAddress.Map(location), ["mapEmbedUrl"] = location.Text("mapEmbedUrl"),
                ["rates"] = new JsonObject { ["effective"] = rates }, ["images"] = images.DeepClone(),
                ["currentRent"] = rates.FirstOrDefault(x => x.Text("category") == "rent")?.Number("unitPrice"),
                ["coverImageUrl"] = images.FirstOrDefault(x => x?["isCover"]?.GetValue<bool>() == true)?.Text("url") ?? images.FirstOrDefault().Text("url"),
                ["amenities"] = Copy(raw["amenities"]), ["roomType"] = new JsonObject { ["id"] = raw.Text("room_type_code"), ["name"] = raw.Text("room_type_name") }
            };
            foreach (var (key, column) in new[] { ("areaM2","area_m2"), ("capacity","capacity"), ("requiredDeposit","required_deposit"), ("description","description"), ("rulesText","rules_text"), ("floorLabel","floor_label"), ("occupancyStatus","occupancyStatus") }) r[key] = Copy(raw[column]);
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
                ["provinceCode"] = address.Text("provinceCode"), ["wardCode"] = address.Text("wardCode"),
                ["address"] = Copy(address),
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
}
