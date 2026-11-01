# Tích hợp ASP.NET Core, EF Core và Npgsql

## 1. Kiểu và quy ước mapping

| PostgreSQL | C# | Ghi chú |
|---|---|---|
| `uuid` | `Guid`, `Guid?` | PK mặc định `gen_random_uuid()`; có thể cấp `Guid.NewGuid()` từ ứng dụng |
| `integer GENERATED ... IDENTITY` | `int` | Claim Identity |
| `bigint GENERATED ... IDENTITY` | `long` | Audit |
| `numeric(18,0)` | `decimal` | Tiền VND nguyên, không dùng float/double |
| `numeric(18,4)` | `decimal` | Đơn giá |
| `numeric(18,3)` | `decimal` | Chỉ số |
| `numeric(18,6)` | `decimal` | Lượng trên dòng hóa đơn |
| `date` | `DateOnly` | Ngày nhận/trả, kỳ, ngày lập/hạn |
| `timestamptz` | `DateTime` có `Kind=Utc` | Chuyển múi giờ khi trình bày |
| `daterange` | `NpgsqlRange<DateOnly>` | `tenancies.stay`, cột sinh tự động, chỉ đọc |
| `bytea` | `byte[]` | Ciphertext, không phải mật khẩu rõ |
| `jsonb` | `JsonDocument` hoặc mapping JSON theo provider | Chỉ nhật ký và phản hồi lưu lại của khóa chống trùng |
| `inet` | `IPAddress` | Địa chỉ IP phiên |
| `varchar` + CHECK | `string` hoặc enum có converter string | Enum lưu mã như `pending`, không lưu index enum C# |

Npgsql yêu cầu giá trị UTC khi ghi `timestamptz`; kiểu này không lưu tên múi giờ. Vì vậy cấu hình giữ riêng `Asia/Ho_Chi_Minh`; dùng `DateOnly` cho ngày nghiệp vụ. [Tài liệu Npgsql về ngày giờ](https://www.npgsql.org/doc/types/datetime.html).

## 2. Scaffold từ database đã tạo

Project nằm ở `backend/src/SmartRent.Api`, đã cài sẵn EF Core 10.0.13, Identity 10.0.13 và Npgsql EF 10.0.3. Phiên bản khóa trong `packages.lock.json`, còn `dotnet-ef` khóa trong `backend/dotnet-tools.json`. Giữ cùng major version khi nâng cấp, không trộn EF 10 với provider 8.

```powershell
# Chạy tại backend/src/SmartRent.Api, sau khi đã lưu ConnectionStrings:SmartRent bằng user-secrets.
dotnet tool restore
dotnet restore
dotnet ef dbcontext scaffold 'Name=ConnectionStrings:SmartRent' Npgsql.EntityFrameworkCore.PostgreSQL --schema smartrent --context SmartRentDbContext --context-dir Data --output-dir Data/Entities --no-onconfiguring
```

Lệnh đã chạy thử trên database mẫu bằng tài khoản `smartrent_app`: sinh 78 file entity và build được. Máy mới phải `dotnet restore` trước, nếu không `dotnet ef` báo lỗi `NETSDK1004`. Các dòng `Expression index ... cannot be scaffolded` là bình thường.

`--schema smartrent` sinh mapping cho toàn bộ bảng/view trong schema, FK thành navigation và precision/default từ catalog. Bảng nối đơn giản có thể thành skip navigation thay vì một class riêng. Giữ phần tùy chỉnh trong partial class và `OnModelCreatingPartial`. [Microsoft: reverse engineering](https://learn.microsoft.com/en-us/ef/core/managing-schemas/scaffolding/).

Hai cột sinh tự động `tenancies.stay` và `charge_rates.scope_id` phải để chỉ đọc (`ValueGeneratedOnAddOrUpdate`), không gán từ ứng dụng. Cần các extension `btree_gist`, `pg_trgm`, `unaccent`, `pgcrypto`; chúng nằm ở schema `public` nên `search_path` của ứng dụng là `smartrent, public`.

Scaffold không thay thế toàn bộ migration SQL: cần giữ EXCLUDE, trigger, function, deferred constraints, filtered indexes và view từ các script gốc. View phải keyless/read-only, không gọi Add/Update cho view. `__EFMigrationsHistory` do EF tạo khi chuyển sang quản lý migrations, không phải dữ liệu nghiệp vụ nên không khai báo trong bộ schema này.

Đăng ký context nghiệp vụ bằng connection string trong cấu hình:

```csharp
builder.Services.AddDbContext<SmartRentDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("SmartRent")));
```

## 3. ASP.NET Core Identity

Bảy bảng `users/roles/user_roles/user_claims/role_claims/user_logins/user_tokens` có các cột chuẩn Identity khóa Guid. Chủ trọ/nhân viên dùng các bảng role nghiệp vụ theo đơn vị; `roles` chỉ dùng vai trò toàn hệ thống. Không gán tất cả chủ trọ vào `SystemAdmin`.

Cách tích hợp ít sửa scaffold: dùng `SmartRentDbContext` cho nghiệp vụ và một `AuthDbContext : IdentityDbContext<ApplicationUser, IdentityRole<Guid>, Guid>` cho Identity; cả hai kết nối cùng database. Model User sinh từ scaffold chỉ để tham chiếu dữ liệu/người thao tác; mọi thay đổi mật khẩu/email/tài khoản đi qua UserManager và AuthDbContext. SQL là chủ sở hữu schema ở giai đoạn này, không cho hai context cùng tạo migrations cho một bảng.

`ApplicationUser` thêm `DisplayName` (required), `AvatarFileId`, `IsActive`, `LastLoginAt`, `CreatedAt`; map chúng lần lượt vào `display_name`, `avatar_file_id`, `is_active`, `last_login_at`, `created_at`. Cấu hình tài khoản:

```csharp
builder.Services.AddIdentity<ApplicationUser, IdentityRole<Guid>>(options =>
{
    options.User.RequireUniqueEmail = true;
    options.Stores.SchemaVersion = IdentitySchemaVersions.Version1;
    options.Stores.MaxLengthForKeys = 128;
})
.AddEntityFrameworkStores<AuthDbContext>()
.AddDefaultTokenProviders();
```

Bộ schema dùng Identity Version1 cơ bản; passkey/WebAuthn không nằm trong đặc tả. Nếu bật schema Identity mới với passkey, thêm bảng/migration chính thức tương ứng. Giữ cùng SchemaVersion/MaxLengthForKeys khi chạy runtime và design-time. [Microsoft: tùy chỉnh Identity](https://learn.microsoft.com/en-us/aspnet/core/security/authentication/customize-identity-model?view=aspnetcore-10.0), [Identity Version1](https://learn.microsoft.com/en-us/dotnet/api/microsoft.aspnetcore.identity.identityschemaversions.version1?view=aspnetcore-10.0).

Trong `AuthDbContext.OnModelCreating`, gọi `base` trước, đổi tên bảng rồi map toàn bộ cột chuẩn sang snake_case:

```csharp
protected override void OnModelCreating(ModelBuilder modelBuilder)
{
    base.OnModelCreating(modelBuilder);
    modelBuilder.HasDefaultSchema("smartrent");
    modelBuilder.Entity<ApplicationUser>().ToTable("users");
    modelBuilder.Entity<IdentityRole<Guid>>().ToTable("roles");
    modelBuilder.Entity<IdentityUserRole<Guid>>().ToTable("user_roles");
    modelBuilder.Entity<IdentityUserClaim<Guid>>().ToTable("user_claims");
    modelBuilder.Entity<IdentityRoleClaim<Guid>>().ToTable("role_claims");
    modelBuilder.Entity<IdentityUserLogin<Guid>>().ToTable("user_logins");
    modelBuilder.Entity<IdentityUserToken<Guid>>().ToTable("user_tokens");

    // Các property của 7 entity Identity đều có tên PascalCase đơn giản.
    foreach (var entity in modelBuilder.Model.GetEntityTypes())
    foreach (var property in entity.GetProperties())
    {
        var column = System.Text.RegularExpressions.Regex.Replace(
            property.Name, "([a-z0-9])([A-Z])", "$1_$2").ToLowerInvariant();
        property.SetColumnName(column);
    }
    modelBuilder.Entity<ApplicationUser>().Property(x => x.DisplayName).HasMaxLength(200).IsRequired();
    modelBuilder.Entity<ApplicationUser>().Property(x => x.IsActive).HasDefaultValue(true);
    modelBuilder.Entity<ApplicationUser>().Property(x => x.CreatedAt).HasDefaultValueSql("now()");
    modelBuilder.Entity<ApplicationUser>().Property(x => x.Id).HasDefaultValueSql("gen_random_uuid()");
    modelBuilder.Entity<IdentityRole<Guid>>().Property(x => x.Id).HasDefaultValueSql("gen_random_uuid()");
}
```

Đoạn trên minh họa mapping runtime; nếu chuyển sang migrations cần đồng bộ thêm tên/filter/uniqueness index từ DDL (email chuẩn hóa unique), precision/default và delete behavior để migration không sửa sai schema đang dùng.

## 4. Concurrency, transaction và lỗi ràng buộc

Dùng `xmin` cho optimistic concurrency của các bảng cho phép sửa; không tạo thêm cột `rowversion` kiểu SQL Server:

```csharp
// Trong partial mapping, đổi Room/Invoice theo tên class được scaffold.
modelBuilder.Entity<Room>()
    .Property<uint>("Version")
    .IsRowVersion()
    .HasColumnName("xmin");
```

`xmin` là cột hệ thống PostgreSQL, thay đổi theo transaction cập nhật. Dùng nó để phát hiện form đã cũ; database exclusion/khóa hàng vẫn bảo vệ xung đột phòng và tiền. [Npgsql: concurrency tokens](https://www.npgsql.org/efcore/modeling/concurrency.html).

Với một nghiệp vụ nhiều SaveChanges, mở transaction tường minh:

```csharp
await using var tx = await db.Database.BeginTransactionAsync(cancellationToken);
await db.Database.ExecuteSqlInterpolatedAsync(
    $"SELECT set_config('smartrent.actor_id', {actorId.ToString()}, true)", cancellationToken);
await db.Database.ExecuteSqlInterpolatedAsync(
    $"SELECT set_config('smartrent.reason', {reason}, true)", cancellationToken);
// Kiểm authorization, khóa các đối tượng theo thứ tự nhất quán.
// Ghi các dòng đối ứng, email_outbox và sự kiện trong cùng transaction.
await db.SaveChangesAsync(cancellationToken);
await db.Database.ExecuteSqlRawAsync("SET CONSTRAINTS ALL IMMEDIATE", cancellationToken);
await tx.CommitAsync(cancellationToken);
```

Nếu sửa cùng nghiệp vụ phải rollback toàn bộ khi có lỗi, kể cả lỗi tại COMMIT. Retry phải bao trọn transaction và dùng lại idempotency key. Không tạo key mới mỗi lần retry. Với khóa nhiều khách/phòng, khóa theo thứ tự ID để giảm deadlock; xử lý serialization/deadlock bằng retry có giới hạn và đọc lại dữ liệu.

| SQLSTATE | Cách xử lý ở API |
|---|---|
| `23505` | Trùng mã/yêu cầu đã xử lý; đối chiếu idempotency và trả kết quả cũ khi payload khớp |
| `23503` | Tham chiếu thiếu/đang được sử dụng, không thể xóa |
| `23514` | Quy tắc nghiệp vụ không hợp lệ, thiếu đối ứng hoặc số dư không đủ |
| `23P01` | Lịch phòng, giá hoặc công tơ bị chồng |
| `40001`, `40P01` | Xung đột serialization/deadlock; retry cả transaction nếu an toàn |

Map thông báo dựa trên `ConstraintName` và nghiệp vụ, không trả chi tiết SQL/PII ra người dùng. `DbUpdateConcurrencyException` xử lý form cũ; với lỗi Npgsql tại commit cần bắt `PostgresException` tương ứng.

## 5. Phân quyền, số tiền và quản lý migration

- Query filter cho đơn vị chỉ là một lớp. Do các bảng con suy ra đơn vị qua FK, filter qua navigation/join đúng đường sở hữu; không thêm dư organization_id chỉ để viết filter ngắn. Raw SQL, xuất file và AI cần cùng kiểm tra quyền.
- Dùng DTO riêng cho phòng công khai, hồ sơ riêng tư và portal; không serialize entity với toàn bộ navigation.
- Tính tiền .NET bằng `decimal.Round(amount, 0, MidpointRounding.AwayFromZero)` cho từng dòng. Giữ `quantity`, `unit_price`, tỷ lệ chia ngày như DDL; không dùng số tiền do trình duyệt tự tính làm nguồn tin cậy.
- Giữ cùng transaction khi xác nhận payment + phân bổ, deposit offset + allocation, refund + deposit debit. `SaveChanges()` đơn lẻ không đồng nghĩa cả nghiệp vụ đã hoàn tất.
- Không gọi `EnsureCreated()` hoặc chạy InitialCreate mặc định lên database đã cài SQL.
- Nếu chọn Code First sau này: tạo model/snapshot khớp schema, baseline database hiện hữu; initial migration cho database mới cần cài cả function/view/trigger/EXCLUDE bằng SQL đã version hóa. Test trên database mới và database nâng cấp. Không để scaffold lại làm mất file partial hoặc đối tượng PostgreSQL đặc thù.

PostgreSQL range và btree_gist hỗ trợ ràng buộc không chồng dùng trong schema này; constraint là lớp bảo vệ cuối trước hai yêu cầu đồng thời. [PostgreSQL: range constraints](https://www.postgresql.org/docs/current/rangetypes.html#RANGETYPES-CONSTRAINT).
