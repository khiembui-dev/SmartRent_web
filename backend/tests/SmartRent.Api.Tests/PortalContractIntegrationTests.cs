using System.Security.Claims;
using System.Text.Json.Nodes;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using SmartRent.Api.Features.Contracts;

namespace SmartRent.Api.Tests;

public class PortalContractIntegrationTests
{
    public sealed class LocalDatabaseFactAttribute : FactAttribute
    {
        public LocalDatabaseFactAttribute()
        {
            if (string.IsNullOrWhiteSpace(Environment.GetEnvironmentVariable("SMARTRENT_TEST_CONNECTION_STRING")))
                Skip = "Set SMARTRENT_TEST_CONNECTION_STRING to run against a seeded local database.";
        }
    }

    [LocalDatabaseFact]
    public async Task RepresentativeCanReadSavedSignedContractAndHandover()
    {
        var builder = new NpgsqlConnectionStringBuilder(Environment.GetEnvironmentVariable("SMARTRENT_TEST_CONNECTION_STRING"))
        {
            SearchPath = "smartrent,public"
        };
        await using var db = NpgsqlDataSource.Create(builder.ConnectionString);
        await using var find = db.CreateCommand("""
            select id,user_id from contracts
            where status='active' and jsonb_array_length(versions)>0
              and versions->-1->>'signedAt' is not null
            order by created_at desc limit 1
            """);
        Guid contractId, userId;
        await using (var reader = await find.ExecuteReaderAsync())
        {
            Assert.True(await reader.ReadAsync(), "Local database needs an active signed contract.");
            contractId = reader.GetGuid(0);
            userId = reader.GetGuid(1);
        }
        using var services = new ServiceCollection().AddLogging().BuildServiceProvider();
        var controller = new PortalTenanciesController(db)
        {
            ControllerContext = new ControllerContext
            {
                HttpContext = new DefaultHttpContext
                {
                    RequestServices = services,
                    User = new ClaimsPrincipal(new ClaimsIdentity([
                        new Claim(ClaimTypes.NameIdentifier, userId.ToString()),
                        new Claim(ClaimTypes.Role, "user")
                    ], "test"))
                }
            }
        };
        var list = Assert.IsType<OkObjectResult>(await controller.List(default));
        var stays = Assert.IsType<List<JsonObject>>(list.Value);
        Assert.True(stays.Any(x => x["contract"]?["id"]?.GetValue<Guid>() == contractId),
            $"Expected contract {contractId}, user {userId}: " + string.Join("\n", stays.Select(x => x.ToJsonString())));
        var response = Assert.IsType<OkObjectResult>(await controller.Get(contractId, default));
        var detail = Assert.IsType<JsonObject>(response.Value);
        Assert.NotEmpty(detail["contracts"]!.AsArray());
        Assert.NotEmpty(detail["contracts"]![0]!["versions"]!.AsArray());
        Assert.IsType<JsonArray>(detail["residents"]);
        Assert.NotEmpty(detail["handovers"]!.AsArray());
    }
}
