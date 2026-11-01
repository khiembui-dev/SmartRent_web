var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddOpenApi();

// Phần nền đăng ký ở đây: DbContext, xác thực, phân quyền, xử lý lỗi.
// Xem backend/HUONG_DAN_THEO_TRANG.md mục 3.

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.MapControllers();

app.Run();
