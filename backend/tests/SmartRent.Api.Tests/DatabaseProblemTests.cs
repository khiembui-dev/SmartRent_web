using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;
using Npgsql;
using SmartRent.Api.Common;

namespace SmartRent.Api.Tests;

public class DatabaseProblemTests
{
    private sealed class TestController(NpgsqlDataSource db) : LeasingController(db)
    {
        public ObjectResult Map(PostgresException error) => DatabaseProblem(error);
    }

    [Theory]
    [InlineData("42601", 500)]
    [InlineData("42P01", 500)]
    [InlineData("23514", 422)]
    [InlineData("23505", 409)]
    [InlineData("23P01", 409)]
    public void DistinguishesServerErrorsFromBusinessConstraints(string state, int status)
    {
        using var source = NpgsqlDataSource.Create("Host=localhost;Database=unused");
        using var services = new ServiceCollection().BuildServiceProvider();
        var controller = new TestController(source)
        {
            ControllerContext = new ControllerContext { HttpContext = new DefaultHttpContext { RequestServices = services } }
        };
        var result = controller.Map(new PostgresException("private SQL error detail", "ERROR", "ERROR", state));
        Assert.Equal(status, result.StatusCode);
        if (status == 500)
        {
            var json = System.Text.Json.JsonSerializer.Serialize(result.Value);
            Assert.Contains("database_error", json);
            Assert.DoesNotContain("private SQL error detail", json);
        }
    }
}
