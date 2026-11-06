using Microsoft.AspNetCore.Identity;
using Npgsql;

namespace SmartRent.Api.Features.Auth;

// Chạy một lần trên máy phát triển: dotnet run --no-build --launch-profile http -- --set-admin-password
// Mật khẩu chỉ nhập qua terminal, hash lưu vào users; không ghi mật khẩu vào source/.env.
internal static class AdminPasswordSetup
{
    public static async Task RunAsync(NpgsqlDataSource source, string? customerEmail = null)
    {
        await using var connection = await source.OpenConnectionAsync();
        // Lệnh khách chỉ cập nhật user có sẵn, không được tạo/nâng role thành admin.
        var role = customerEmail is null ? "admin" : "user";
        await using var find = new NpgsqlCommand(
            "SELECT id,email FROM smartrent.users WHERE role=@role AND (@email IS NULL OR lower(email)=lower(@email))", connection);
        find.Parameters.AddWithValue("role",role);
        find.Parameters.Add("email",NpgsqlTypes.NpgsqlDbType.Text).Value=(object?)customerEmail??DBNull.Value;
        Guid adminId;
        string email;
        await using (var reader = await find.ExecuteReaderAsync())
        {
            if (!await reader.ReadAsync())
                throw new InvalidOperationException("Không tìm thấy tài khoản đúng role/email trong database.");
            adminId = reader.GetGuid(0);
            email = reader.GetString(1);
        }

        Console.WriteLine($"Đặt mật khẩu cho {role}: {email}");
        Console.Write("Mật khẩu mới (ít nhất 12 ký tự): ");
        var password = ReadPassword();
        if (password.Length < 12)
            throw new InvalidOperationException("Mật khẩu phải có ít nhất 12 ký tự.");

        if (!Console.IsInputRedirected)
        {
            Console.Write("Nhập lại mật khẩu: ");
            if (password != ReadPassword())
                throw new InvalidOperationException("Hai lần nhập mật khẩu không khớp.");
        }

        var hash = new PasswordHasher<object>().HashPassword(new object(), password);
        await using var update = new NpgsqlCommand("""
            UPDATE smartrent.users SET password_hash=@hash,login_enabled=true
            WHERE id=@id AND role=@role
            """, connection);
        update.Parameters.AddWithValue("hash", hash);
        update.Parameters.AddWithValue("id", adminId);
        update.Parameters.AddWithValue("role",role);
        await update.ExecuteNonQueryAsync();
        await using var revoke = new NpgsqlCommand(
            "UPDATE smartrent.auth_tokens SET revoked_at=now() WHERE user_id=@id AND revoked_at IS NULL", connection);
        revoke.Parameters.AddWithValue("id", adminId);
        await revoke.ExecuteNonQueryAsync();
        Console.WriteLine("Đã lưu hash mật khẩu trong PostgreSQL và thu hồi phiên cũ.");
    }

    private static string ReadPassword()
    {
        if (Console.IsInputRedirected) return Console.ReadLine() ?? "";
        var buffer = new System.Text.StringBuilder();
        while (true)
        {
            var key = Console.ReadKey(intercept: true);
            if (key.Key == ConsoleKey.Enter) { Console.WriteLine(); break; }
            if (key.Key == ConsoleKey.Backspace)
            {
                if (buffer.Length > 0) buffer.Length--;
                continue;
            }
            if (!char.IsControl(key.KeyChar)) buffer.Append(key.KeyChar);
        }
        return buffer.ToString();
    }
}
