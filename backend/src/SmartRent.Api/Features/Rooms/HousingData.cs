using System.Text.Json.Nodes;
using Npgsql;
using SmartRent.Api.Common;
using static SmartRent.Api.Common.BusinessData;
namespace SmartRent.Api.Features.Rooms;

// Chuyển cấu trúc SQL sang dữ liệu mà giao diện đọc. Tin công khai dùng projection riêng.
internal static class HousingData
{
    public static async Task<JsonObject> Property(NpgsqlConnection c, NpgsqlTransaction? t, Guid id, CancellationToken ct)
    {
        var p = await Row(c, t, "select to_jsonb(p)::text from properties p where id=@id", ct, "id", id);
        var rates = Effective(p["rates"]!.AsArray(), new(), Today);
        var rooms = await Rows(c, t, "select jsonb_build_object('status',occupancy_status)::text from v_room_occupancy where property_id=@id", ct, "id", id);
        int Count(string status) => rooms.Count(r => r.Text("status") == status);
        var prices = new JsonObject();
        foreach (var r in rates)
            prices[r.Text("code")!] = r.Number("unitPrice");
        return new JsonObject
        {
            ["id"] = id,
            ["code"] = p.Text("code"),
            ["name"] = p.Text("name"),
            ["description"] = p.Text("description"),
            ["isActive"] = Copy(p["is_active"]),
            ["mapUrl"] = p.Text("map_url"), ["mapEmbedUrl"] = p.Text("map_embed_url"),
            ["address"] = HousingAddress.Property(p),
            ["billingSettings"] = new JsonObject { ["invoiceDay"] = Copy(p["invoice_day"]), ["dueAfterDays"] = Copy(p["due_after_days"]), ["prorationPolicy"] = p.Text("proration_policy") },
            ["rates"] = rates,
            ["prices"] = prices,
            ["roomCount"] = rooms.Count,
            ["occupiedCount"] = Count("occupied"),
            ["availableCount"] = Count("available"),
            ["reservedCount"] = Count("reserved"),
            ["maintenanceCount"] = Count("maintenance"),
            ["inactiveCount"] = Count("inactive")
        };
    }
    public static async Task<JsonObject> Room(NpgsqlConnection c, NpgsqlTransaction? t, Guid id, CancellationToken ct)
    {
        var r = await Row(c, t, "select to_jsonb(r)::text from rooms r where id=@id", ct, "id", id);
        var p = await Row(c, t, "select to_jsonb(p)::text from properties p where id=@id", ct, "id", r.Id("property_id"));
        var effective = Effective(p["rates"]!.AsArray(), r["rates"]!.AsArray(), Today);
        var images = new JsonArray();
        foreach (var img in r["images"]!.AsArray().OrderBy(x => x.Number("sortOrder")))
        {
            var key = await Scalar(c, t, "select storage_key from files where id::text=@id and scan_status='clean'", ct, "id", img.Text("fileId"));
            if (key is null || !Guid.TryParseExact(key, "N", out _))
                continue;
            images.Add(new JsonObject { ["id"] = img.Text("fileId"), ["fileId"] = img.Text("fileId"), ["url"] = "/api/v1/files/" + img.Text("fileId") + "/public", ["caption"] = img.Text("caption"), ["isCover"] = Copy(img?["isCover"]), ["sortOrder"] = img.Number("sortOrder") });
        }
        var tenants = await Rows(c, t, """
            select jsonb_build_object('id',c.id,'since',c.move_in_on,'hasContract',jsonb_array_length(c.versions)>0,
             'onboardingMode',c.onboarding_mode,'representative',jsonb_build_object('id',u.id,'fullName',u.display_name))::text
            from contracts c join users u on u.id=c.user_id where c.room_id=@id and c.status='active'
            """, ct, "id", id);
        var holds = await Rows(c, t, """
            select jsonb_build_object('holdExpiresAt',hold_expires_at,'reservation',jsonb_build_object('id',b.id,'status','holding',
              'tenant',jsonb_build_object('id',u.id,'fullName',u.display_name)))::text from bookings b join users u on u.id=b.user_id
            where b.room_id=@id and b.hold_status='holding' and b.hold_expires_at>now()
            """, ct, "id", id);
        var tickets = await Rows(c, t, "select jsonb_build_object('id',id,'code',code,'title',title,'status',status,'createdAt',created_at)::text from tickets where room_id=@id order by created_at desc limit 10", ct, "id", id);
        var status = await Scalar(c, t, "select occupancy_status from v_room_occupancy where id=@id", ct, "id", id);
        var address = r["address_override"]?.DeepClone().AsObject() ?? HousingAddress.Property(p);
        // current: có hợp đồng hiệu lực/sắp vào ở (tin tự tạm ẩn); history: từng có hợp đồng (không chuyển cơ sở được).
        var contractState = await Scalar(c, t, """
            select case when exists(select 1 from contracts where room_id=@id and status in ('active','planned')) then 'current'
                        when exists(select 1 from contracts where room_id=@id and status<>'cancelled') then 'history' else 'none' end
            """, ct, "id", id);
        return new JsonObject
        {
            ["id"] = id,
            ["code"] = r.Text("code"),
            ["name"] = r.Text("name"),
            ["property"] = new JsonObject { ["id"] = p.Id("id"), ["name"] = p.Text("name"), ["code"] = p.Text("code"), ["description"] = p.Text("description"), ["isActive"] = Copy(p["is_active"]) },
            ["areaM2"] = Copy(r["area_m2"]),
            ["capacity"] = Copy(r["capacity"]),
            ["floorLabel"] = r.Text("floor_label"),
            ["description"] = r.Text("description"),
            ["rulesText"] = r.Text("rules_text"),
            ["operatingStatus"] = r.Text("operating_status"),
            ["occupancyStatus"] = status,
            ["requiredDeposit"] = Copy(r["required_deposit"]),
            ["rates"] = new JsonObject { ["effective"] = effective, ["history"] = Copy(r["rates"]) },
            ["currentRent"] = effective.FirstOrDefault(x => x.Text("category") == "rent")?.Number("unitPrice"),
            ["images"] = images,
            ["coverImageUrl"] = images.FirstOrDefault(x => x?["isCover"]?.GetValue<bool>() == true)?.Text("url") ?? images.FirstOrDefault().Text("url"),
            ["amenities"] = new JsonArray(r["amenities"]!.AsArray().Select(x => { var a = x!.DeepClone(); a["id"] = x.Text("code"); return a; }).ToArray()),
            ["tickets"] = Array(tickets),
            ["calendar"] = Array(holds),
            ["currentTenancy"] = tenants.FirstOrDefault(),
            ["listing"] = new JsonObject { ["slug"] = r.Text("listing_slug"), ["title"] = r.Text("listing_title"), ["description"] = r.Text("listing_description"), ["status"] = r.Text("listing_status"), ["lockedByContract"] = contractState == "current" },
            ["canChangeProperty"] = contractState == "none",
            ["addressOverride"] = Copy(r["address_override"]),
            ["mapUrl"] = HousingAddress.Map(address), ["mapEmbedUrl"] = address.Text("mapEmbedUrl"),
            ["address"] = address,
            ["roomType"] = new JsonObject { ["id"] = r.Text("room_type_code"), ["name"] = r.Text("room_type_name") }
        };
    }
}
