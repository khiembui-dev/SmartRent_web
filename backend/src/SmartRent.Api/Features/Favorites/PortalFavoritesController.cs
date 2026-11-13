using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Mvc;
using Npgsql;
using SmartRent.Api.Common;
using SmartRent.Api.Features.PublicSite;
using static SmartRent.Api.Common.BusinessData;
namespace SmartRent.Api.Features.Favorites;

// Trang Phòng yêu thích của khách. Danh sách nằm ở users.favorite_rooms = [{roomId, savedAt}], mới lưu đứng đầu.
// Chủ danh sách luôn là người đang đăng nhập (actor); client không gửi userId. Chỉ lưu được phòng đang công khai.
[ApiController, Route("api/v1/portal/favorites")]
public sealed class PortalFavoritesController(NpgsqlDataSource db) : LeasingController(db)
{
    public const int Limit = 100;
    private const string Published = """
        select r.id::text from rooms r join properties p on p.id=r.property_id
        where r.id=any(@ids::uuid[]) and r.listing_status='published' and r.operating_status='available' and p.is_active
        """;

    /// <summary>Chỉ ID phòng đã lưu, để tô trái tim trên mọi thẻ phòng.</summary>
    [HttpGet]
    public Task<IActionResult> Ids(CancellationToken ct) => Run(async (c, t, actor) => await Saved(c, t, actor, ct, lockRow: false), ct);

    /// <summary>Thẻ phòng đã lưu. Phòng không còn công khai (đã có người thuê, tạm ẩn, đã gỡ) vẫn trả về để khách tự bỏ lưu.</summary>
    [HttpGet("rooms")]
    public Task<IActionResult> Rooms(CancellationToken ct) => Run(async (c, t, actor) =>
    {
        var saved = await Saved(c, t, actor, ct, lockRow: false);
        var ids = saved.Select(x => x.Id("roomId")).ToArray();
        var listings = (await PublicListings.Load(c, t, ct, ids)).ToDictionary(x => x.Id("id"));
        var items = new JsonArray();
        foreach (var fav in saved)
        {
            var id = fav.Id("roomId");
            if (listings.TryGetValue(id, out var room))
            {
                items.Add(new JsonObject { ["roomId"] = id, ["savedAt"] = fav.Text("savedAt"), ["status"] = room["availability"].Text("status"), ["room"] = room });
                continue;
            }
            var gone = await Scalar(c, t, """
                select jsonb_build_object('title',coalesce(nullif(btrim(r.listing_title),''),r.name),'roomCode',r.code,'propertyName',p.name)::text
                from rooms r join properties p on p.id=r.property_id where r.id=@id
                """, ct, "id", id);
            var info = gone is null ? null : JsonNode.Parse(gone)!.AsObject();
            items.Add(new JsonObject
            {
                ["roomId"] = id, ["savedAt"] = fav.Text("savedAt"), ["status"] = info is null ? "removed" : "unlisted", ["room"] = null,
                ["title"] = info?.Text("title") ?? "Phòng đã gỡ khỏi trang", ["roomCode"] = info?.Text("roomCode"), ["propertyName"] = info?.Text("propertyName")
            });
        }
        return new JsonObject { ["items"] = items, ["total"] = items.Count };
    }, ct);

    [HttpPut("{roomId:guid}")]
    public Task<IActionResult> Add(Guid roomId, CancellationToken ct) => Run(async (c, t, actor) =>
    {
        var saved = await Saved(c, t, actor, ct);
        if (saved.Any(x => x.Id("roomId") == roomId))
            return await Write(c, t, actor, saved, ct);
        if (await Scalar(c, t, Published, ct, "ids", new[] { roomId }) is null)
            throw new LeaseHttpException(404, "room_not_listed", "Phòng này không còn đăng trên trang khách nên không lưu được.");
        if (saved.Count >= Limit)
            throw new LeaseHttpException(422, "favorites_limit", $"Đã lưu tối đa {Limit} phòng. Bỏ bớt phòng cũ rồi lưu lại.");
        saved.Insert(0, Entry(roomId));
        return await Write(c, t, actor, saved, ct);
    }, ct, commit: true);

    [HttpDelete("{roomId:guid}")]
    public Task<IActionResult> Remove(Guid roomId, CancellationToken ct) => Run(async (c, t, actor) =>
    {
        var saved = await Saved(c, t, actor, ct);
        saved.RemoveAll(x => x.Id("roomId") == roomId);
        return await Write(c, t, actor, saved, ct);
    }, ct, commit: true);

    /// <summary>Gộp danh sách khách lưu trên trình duyệt trước khi đăng nhập. Bỏ qua ID sai hoặc phòng đã ngừng đăng.</summary>
    [HttpPost("merge")]
    public Task<IActionResult> Merge([FromBody] JsonElement body, CancellationToken ct) => Run(async (c, t, actor) =>
    {
        var incoming = new List<Guid>();
        if (body.ValueKind == JsonValueKind.Object && body.TryGetProperty("roomIds", out var list) && list.ValueKind == JsonValueKind.Array)
            foreach (var x in list.EnumerateArray())
                if (x.ValueKind == JsonValueKind.String && Guid.TryParse(x.GetString(), out var g) && !incoming.Contains(g) && incoming.Count < Limit)
                    incoming.Add(g);
        var saved = await Saved(c, t, actor, ct);
        var fresh = incoming.Where(g => saved.All(x => x.Id("roomId") != g)).ToArray();
        if (fresh.Length > 0)
        {
            var listed = (await Rows(c, t, $"select jsonb_build_object('id',id)::text from ({Published}) x(id)", ct, "ids", fresh)).Select(x => x.Id("id")).ToHashSet();
            saved.InsertRange(0, fresh.Where(listed.Contains).Select(Entry));
            if (saved.Count > Limit)
                saved.RemoveRange(Limit, saved.Count - Limit);
        }
        return await Write(c, t, actor, saved, ct);
    }, ct, commit: true);

    private static JsonObject Entry(Guid roomId) => new() { ["roomId"] = roomId.ToString(), ["savedAt"] = DateTimeOffset.UtcNow.ToString("O") };

    private static async Task<List<JsonObject>> Saved(NpgsqlConnection c, NpgsqlTransaction t, Guid actor, CancellationToken ct, bool lockRow = true)
    {
        var raw = await Scalar(c, t, "select favorite_rooms::text from users where id=@id and role='user'" + (lockRow ? " for update" : ""), ct, "id", actor)
            ?? throw new LeaseHttpException(404, "not_found", "Không tìm thấy tài khoản.");
        return JsonNode.Parse(raw)!.AsArray().OfType<JsonObject>().Where(x => Guid.TryParse(x.Text("roomId"), out _)).Select(x => x.DeepClone().AsObject()).ToList();
    }

    private static async Task<JsonObject> Write(NpgsqlConnection c, NpgsqlTransaction t, Guid actor, List<JsonObject> saved, CancellationToken ct)
    {
        var json = new JsonArray(saved.Select(x => (JsonNode)x.DeepClone()).ToArray()).ToJsonString();
        await Scalar(c, t, "update users set favorite_rooms=@fav::jsonb where id=@id and favorite_rooms is distinct from @fav::jsonb returning id::text", ct, "fav", json, "id", actor);
        return Result(saved);
    }

    private static JsonObject Result(List<JsonObject> saved) => new() { ["roomIds"] = new JsonArray(saved.Select(x => (JsonNode?)x.Text("roomId")).ToArray()) };

    private async Task<IActionResult> Run(Func<NpgsqlConnection, NpgsqlTransaction, Guid, Task<object>> work, CancellationToken ct, bool commit = false)
    {
        try
        {
            var (c, t, actor) = await BeginAsync(false, ct);
            await using (c)
            await using (t)
            {
                var result = await work(c, t, actor);
                if (commit) await CommitAsync(t, ct);
                else await t.RollbackAsync(ct);
                return Ok(result is List<JsonObject> saved ? Result(saved) : result);
            }
        }
        catch (LeaseHttpException e) { return LeaseProblem(e); }
        catch (PostgresException e) { return DatabaseProblem(e); }
    }
}
