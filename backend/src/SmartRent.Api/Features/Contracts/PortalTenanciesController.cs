using Microsoft.AspNetCore.Mvc;
using Npgsql;
using System.Text.Json.Nodes;
using SmartRent.Api.Common;
using static SmartRent.Api.Common.BusinessData;
namespace SmartRent.Api.Features.Contracts;

[ApiController, Route("api/v1/portal/tenancies")]
public sealed class PortalTenanciesController(NpgsqlDataSource db) : BusinessController(db)
{
    private static async Task<List<JsonObject>> Visible(NpgsqlConnection c, NpgsqlTransaction t, Guid actor, Guid? id, CancellationToken ct) => await Rows(c, t, """
        select to_jsonb(c)||jsonb_build_object('room',to_jsonb(r),'property',to_jsonb(p),'representative',jsonb_build_object('id',u.id,'fullName',u.display_name))
        from contracts c join rooms r on r.id=c.room_id join properties p on p.id=r.property_id join users u on u.id=c.user_id
        where c.status<>'cancelled' and (@id::uuid is null or c.id=@id) and (c.user_id=@user or exists(
          select 1 from jsonb_array_elements(c.occupants)x where x->>'userId'=@user::text and x->>'leftOn' is null)) order by c.starts_on desc
        """, ct, "id", id, "user", actor);
    [HttpGet]
    public Task<IActionResult> List(CancellationToken ct) => Run(false, async (c, t, a) =>
    {
        var result = new List<JsonObject>();
        foreach (var raw in await Visible(c, t, a, null, ct))
        {
            var detail = await ContractsController.Detail(c, t, raw.Id("id"), ct);
            var finance = raw.Id("user_id") == a;
            result.Add(new JsonObject
            {
                ["id"] = raw.Id("id"),
                ["status"] = raw.Text("status"),
                ["role"] = finance ? "representative" : "resident",
                ["financeVisible"] = finance,
                ["room"] = new JsonObject { ["id"] = raw["room"]!.Id("id"), ["code"] = raw["room"].Text("code") },
                ["property"] = new JsonObject { ["id"] = raw["property"]!.Id("id"), ["name"] = raw["property"].Text("name"), ["addressLine"] = raw["property"].Text("address_line"), ["locality"] = raw["property"].Text("locality") },
                ["representative"] = Copy(raw["representative"]),
                ["requiredDeposit"] = finance ? Copy(detail["requiredDeposit"]) : null,
                ["depositHeld"] = finance ? Copy(detail["depositHeld"]) : null,
                ["rent"] = finance ? Copy(detail["rent"]) : null,
                ["contract"] = raw["versions"]!.AsArray().Count == 0 ? null : new JsonObject { ["id"] = raw.Id("id"), ["code"] = raw.Text("code"), ["status"] = detail.Text("status"), ["displayEndOn"] = Copy(detail["displayEndOn"]), ["daysLeft"] = Copy(detail["daysLeft"]) }
            });
        }
        return result;
    }, ct);
    [HttpGet("{id:guid}")]
    public Task<IActionResult> Get(Guid id, CancellationToken ct) => Run(false, async (c, t, a) =>
    {
        var raw = (await Visible(c, t, a, id, ct)).FirstOrDefault() ?? throw Missing();
        var finance = raw.Id("user_id") == a;
        var detail = await ContractsController.Detail(c, t, id, ct);
        var residents = new List<JsonObject>();
        if (finance)
            residents = await Rows(c, t, "select jsonb_build_object('id',u.id,'fullName',u.display_name,'joinedOn',x->>'joinedOn','leftOn',x->>'leftOn','relationship',x->>'relationship)::text from contracts c cross join lateral jsonb_array_elements(c.occupants)x join users u on u.id=(x->>'userId')::uuid where c.id=@id", ct, "id", id);
        var handovers = new JsonArray();
        if (finance)
        {
            foreach (var (kind, key, dayKey) in new[] { ("checkin", "initial_readings", "move_in_on"), ("checkout", "final_readings", "move_out_on") })
            {
                if (raw.Text(dayKey) is not string day)
                    continue;
                var readings = new JsonArray();
                foreach (var (meter, reading) in raw[key]!.AsObject())
                if (reading is not null)
                    readings.Add(new JsonObject { ["meterKind"] = meter, ["serialNumber"] = meter, ["readingValue"] = Copy(reading["value"]) });
                handovers.Add(new JsonObject { ["kind"] = kind, ["occurredAt"] = day + "T00:00:00Z", ["notes"] = raw[kind + "_handover"].Text("notes"), ["readings"] = readings, ["assets"] = new JsonArray() });
            }
        }
        return new JsonObject { ["contracts"] = new JsonArray(new JsonObject { ["id"] = id, ["code"] = raw.Text("code"), ["status"] = detail.Text("status"), ["versions"] = finance ? Copy(detail["versions"]) : new JsonArray() }), ["residents"] = Array(residents), ["handovers"] = handovers };
    }, ct);
}
