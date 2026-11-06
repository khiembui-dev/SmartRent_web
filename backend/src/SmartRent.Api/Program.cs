using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using SmartRent.Api.Common;
using SmartRent.Api.Common.Auth;
using SmartRent.Api.Common.Errors;
using SmartRent.Api.Data;
using SmartRent.Api.Data.Entities;
using SmartRent.Api.Features.Auth;
using SmartRent.Api.Features.Settings;
using System.Net;
using Npgsql;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers(options => options.Filters.Add<ProblemDetailsExceptionFilter>());
builder.Services.AddOpenApi();

// Mọi module dùng cùng connection string local và schema; không chạy EF migration/EnsureCreated.
builder.Services.AddLeasingInfrastructure(builder.Configuration);
builder.Services.AddDbContext<SmartRentDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("SmartRent")));
builder.Services.AddHttpContextAccessor();
builder.Services.AddScoped<ICurrentUser, CurrentUser>();
builder.Services.AddScoped<ISessionTokenService, SessionTokenService>();
builder.Services.AddScoped<IPasswordHasher<User>, PasswordHasher<User>>();
builder.Services.AddScoped<IAuthService, AuthService>();
builder.Services.AddScoped<ISettingsService, SettingsService>();
// Tạo repository theo vòng đời request để controller có thể yêu cầu qua constructor.
builder.Services.AddScoped<
    SmartRent.Api.Features.Dashboard.DashboardRepository
>();
builder.Services.AddScoped<SmartRent.Api.Features.Auth.AuthSessionService>();
// Repository Ticket dùng connection pool chung; DataProtection ký link xem ảnh có hạn sử dụng.
builder.Services.AddScoped<SmartRent.Api.Features.Tickets.TicketRepository>();
builder.Services.AddDataProtection();
builder.Services.AddScoped<SmartRent.Api.Features.Files.TicketFileStore>();
// Hoàn tất đăng ký dịch vụ rồi tạo ứng dụng HTTP.
var app = builder.Build();

if (args.Contains("--set-admin-password", StringComparer.Ordinal) ||
    args.Contains("--set-customer-password", StringComparer.Ordinal))
{
    if (!app.Environment.IsDevelopment())
        throw new InvalidOperationException("Chỉ đặt mật khẩu admin bằng lệnh này trong Development.");
    var customerFlag = Array.IndexOf(args,"--set-customer-password");
    if(customerFlag>=0 && customerFlag+1>=args.Length)
        throw new InvalidOperationException("Thêm email khách sau --set-customer-password.");
    await SmartRent.Api.Features.Auth.AdminPasswordSetup.RunAsync(
        app.Services.GetRequiredService<NpgsqlDataSource>(),customerFlag>=0?args[customerFlag+1]:null);
    return;
}

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();

    // Chỉ kiểm tra kết nối trên máy local; không trả dữ liệu nghiệp vụ.
    app.MapGet("/api/v1/dev/database-check", async (
        HttpContext context, NpgsqlDataSource dataSource, CancellationToken cancellationToken) =>
    {
        var address = context.Connection.RemoteIpAddress;
        if (address is null || !IPAddress.IsLoopback(address))
            return Results.NotFound();

        try
        {
            await using var command = dataSource.CreateCommand("SELECT 1");
            await command.ExecuteScalarAsync(cancellationToken);
            return Results.Ok(new { connected = true, database = "smartrent" });
        }
        catch (NpgsqlException)
        {
            return Results.Problem("Không thể kết nối PostgreSQL.", statusCode: 503);
        }
        catch (TimeoutException)
        {
            return Results.Problem("Kết nối PostgreSQL quá thời gian.", statusCode: 503);
        }
    });
}

// Ánh xạ các route từ controller, ví dụ /api/v1/dashboard/room-stats-dev.
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

app.Run();
