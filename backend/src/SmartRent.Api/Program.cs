using System.Text;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using Npgsql;
using SmartRent.Api.Common;
using SmartRent.Api.Common.Auth;
using SmartRent.Api.Common.Errors;
using SmartRent.Api.Data;
using SmartRent.Api.Data.Entities;
using SmartRent.Api.Features.Auth;
using SmartRent.Api.Features.Settings;

var builder = WebApplication.CreateBuilder(args);

// 1. Cấu hình CORS cho phép frontend kết nối kèm Cookie credentials
builder.Services.AddCors(options =>
{
    options.AddDefaultPolicy(policy =>
    {
        policy.WithOrigins(
                "http://localhost:5173",
                "http://localhost:5174",
                "http://127.0.0.1:5173",
                "http://127.0.0.1:5174"
            )
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials();
    });
});

// 2. Cấu hình Filter xử lý ngoại lệ toàn cục theo RFC 7807 Problem Details
builder.Services.AddControllers(options =>
{
    options.Filters.Add<ProblemDetailsExceptionFilter>();
});

builder.Services.AddOpenApi();
builder.Services.AddHttpContextAccessor();

// 3. Cấu hình DbContext kết nối PostgreSQL 16 (EF Core)
builder.Services.AddDbContext<SmartRentDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("SmartRent")));

// 4. Cấu hình NpgsqlDataSource cho các module Leasing (Tenants, Contracts, Billing, Invoices)
var connectionString = builder.Configuration.GetConnectionString("SmartRent")
    ?? throw new InvalidOperationException("Thiếu ConnectionStrings:SmartRent.");
var dsBuilder = new NpgsqlDataSourceBuilder(connectionString);
dsBuilder.ConnectionStringBuilder.SearchPath = "smartrent,public";
builder.Services.AddSingleton(dsBuilder.Build());

// 5. Cấu hình JWT Settings & Services
var jwtSection = builder.Configuration.GetSection(JwtSettings.SectionName);
builder.Services.Configure<JwtSettings>(jwtSection);
var jwtSettings = jwtSection.Get<JwtSettings>() ?? new JwtSettings();

builder.Services.AddScoped<IJwtTokenService, JwtTokenService>();
builder.Services.AddScoped<ICurrentUser, CurrentUser>();
builder.Services.AddScoped<IPasswordHasher<User>, PasswordHasher<User>>();
builder.Services.AddScoped<IAuthService, AuthService>();
builder.Services.AddScoped<ISettingsService, SettingsService>();

// 6. Cấu hình Xác thực: hỗ trợ cả JWT Bearer (mặc định) và TokenAuthenticationHandler (SmartRentBearer)
builder.Services.AddAuthentication(options =>
{
    options.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    options.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(options =>
{
    options.RequireHttpsMetadata = false;
    options.SaveToken = true;
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true,
        ValidIssuer = jwtSettings.Issuer,
        ValidateAudience = true,
        ValidAudience = jwtSettings.Audience,
        ValidateIssuerSigningKey = true,
        IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSettings.Secret)),
        ValidateLifetime = true,
        ClockSkew = TimeSpan.Zero
    };
})
.AddScheme<AuthenticationSchemeOptions, TokenAuthenticationHandler>(TokenAuthenticationHandler.AuthenticationScheme, _ => { });

builder.Services.AddAuthorization();

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseCors();
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

app.Run();
