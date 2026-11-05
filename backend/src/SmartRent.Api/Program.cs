using Microsoft.EntityFrameworkCore;
using SmartRent.Api.Data;
using SmartRent.Api.Common;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddOpenApi();

// Phần nền đăng ký ở đây: DbContext, xác thực, phân quyền, xử lý lỗi.
// Xem backend/HUONG_DAN_THEO_TRANG.md mục 3.
builder.Services.AddDbContext<SmartRentDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("SmartRent")));

builder.Services.AddScoped<SmartRent.Api.Features.Billing.BillingPeriodsService>();

builder.Services.AddScoped<SmartRent.Api.Features.Billing.BillingWorksheetService>();

builder.Services.AddScoped<SmartRent.Api.Features.Invoices.InvoiceBuilder>();

builder.Services.AddScoped<SmartRent.Api.Features.Billing.MeterReadingsService>();

builder.Services.AddScoped<SmartRent.Api.Features.Invoices.InvoiceBatchService>();

builder.Services.AddScoped<SmartRent.Api.Features.Invoices.InvoicesService>();

builder.Services.AddScoped<SmartRent.Api.Features.Invoices.InvoicesService>();

builder.Services.AddScoped<SmartRent.Api.Features.Payments.PaymentsService>();

builder.Services.AddScoped<SmartRent.Api.Features.Invoices.PortalInvoicesService>();

builder.Services.AddScoped<SmartRent.Api.Features.Invoices.PortalOverviewService>();

builder.Services.AddLeasingInfrastructure(builder.Configuration);

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

app.Run();
