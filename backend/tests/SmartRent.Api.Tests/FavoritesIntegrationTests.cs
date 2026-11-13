using System.Security.Claims;
using System.Text.Json;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using SmartRent.Api.Features.Favorites;
using static SmartRent.Api.Tests.PortalContractIntegrationTests;

namespace SmartRent.Api.Tests;

// Phòng yêu thích: chỉ lưu phòng đang công khai, chủ danh sách là người đăng nhập, gộp danh sách của trình duyệt khi đăng nhập.
public class FavoritesIntegrationTests
{
    private static NpgsqlDataSource Db() => NpgsqlDataSource.Create(new NpgsqlConnectionStringBuilder(Environment.GetEnvironmentVariable("SMARTRENT_TEST_CONNECTION_STRING")) { SearchPath = "smartrent,public" }.ConnectionString);

    private static PortalFavoritesController Controller(NpgsqlDataSource db, Guid userId, string role)
    {
        var services = new ServiceCollection().AddLogging().BuildServiceProvider();
        return new PortalFavoritesController(db)
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext
                {
                    RequestServices = services,
                    User = new ClaimsPrincipal(new ClaimsIdentity([new Claim(ClaimTypes.NameIdentifier, userId.ToString()), new Claim(ClaimTypes.Role, role)], "test"))
                }
            }
        };
    }

    private static async Task<List<Guid>> Column(NpgsqlDataSource db, string sql)
    {
        await using var cmd = db.CreateCommand(sql);
        await using var r = await cmd.ExecuteReaderAsync();
        var list = new List<Guid>();
        while (await r.ReadAsync()) list.Add(r.GetGuid(0));
        return list;
    }

    private static JsonObject Body(IActionResult result) => Assert.IsType<JsonObject>(Assert.IsType<OkObjectResult>(result).Value);
    private static List<string> Ids(IActionResult result) => Body(result)["roomIds"]!.AsArray().Select(x => x!.GetValue<string>()).ToList();
    private static (int Status, string? Code) Problem(IActionResult result)
    {
        var o = Assert.IsAssignableFrom<ObjectResult>(result);
        return (o.StatusCode ?? 0, JsonSerializer.SerializeToNode(o.Value)?["code"]?.GetValue<string>());
    }

    [LocalDatabaseFact]
    public async Task CustomerSavesOnlyListedRoomsAndMergesBrowserList()
    {
        await using var db = Db();
        var user = (await Column(db, "select id from users where role='user' and login_enabled order by created_at limit 1")).Single();
        var admin = (await Column(db, "select id from users where role='admin'")).Single();
        var listed = await Column(db, "select r.id from rooms r join properties p on p.id=r.property_id where r.listing_status='published' and r.operating_status='available' and p.is_active order by r.code limit 2");
        var hidden = (await Column(db, "select id from rooms where listing_status<>'published' order by code limit 1")).Single();
        Assert.True(listed.Count == 2, "Local database needs two published rooms.");
        await using var backup = db.CreateCommand("select favorite_rooms::text from users where id=$1");
        backup.Parameters.AddWithValue(user);
        var original = (string)(await backup.ExecuteScalarAsync())!;
        try
        {
            await using (var clear = db.CreateCommand("update users set favorite_rooms='[]' where id=$1")) { clear.Parameters.AddWithValue(user); await clear.ExecuteNonQueryAsync(); }
            var api = Controller(db, user, "user");

            Assert.Equal([listed[0].ToString()], Ids(await api.Add(listed[0], default)));
            Assert.Equal([listed[0].ToString()], Ids(await api.Add(listed[0], default)));
            Assert.Equal((404, "room_not_listed"), Problem(await api.Add(hidden, default)));

            var merge = JsonDocument.Parse(JsonSerializer.Serialize(new { roomIds = new[] { hidden.ToString(), listed[1].ToString(), "không-phải-id", listed[0].ToString() } })).RootElement;
            Assert.Equal([listed[1].ToString(), listed[0].ToString()], Ids(await api.Merge(merge, default)));

            var rooms = Body(await api.Rooms(default))["items"]!.AsArray();
            Assert.Equal(2, rooms.Count);
            Assert.All(rooms, x => Assert.NotNull(x!["room"]?["slug"]));

            // Phòng bị ẩn sau khi lưu vẫn nằm trong danh sách, kèm trạng thái để khách tự bỏ lưu.
            await using (var hide = db.CreateCommand("update users set favorite_rooms=jsonb_build_array(jsonb_build_object('roomId',$2::text,'savedAt',now()))||favorite_rooms where id=$1"))
            { hide.Parameters.AddWithValue(user); hide.Parameters.AddWithValue(hidden.ToString()); await hide.ExecuteNonQueryAsync(); }
            var first = Body(await api.Rooms(default))["items"]!.AsArray()[0]!;
            Assert.Equal("unlisted", first["status"]!.GetValue<string>());
            Assert.Null(first["room"]);

            Assert.Equal([listed[1].ToString(), listed[0].ToString()], Ids(await api.Remove(hidden, default)));
            Assert.Equal([listed[0].ToString()], Ids(await api.Remove(listed[1], default)));
            Assert.Equal((403, "customer_required"), Problem(await Controller(db, admin, "admin").Ids(default)));
        }
        finally
        {
            await using var restore = db.CreateCommand("update users set favorite_rooms=$2::jsonb where id=$1");
            restore.Parameters.AddWithValue(user);
            restore.Parameters.AddWithValue(original);
            await restore.ExecuteNonQueryAsync();
        }
    }
}
