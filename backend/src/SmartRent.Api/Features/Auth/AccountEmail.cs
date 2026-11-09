using System.Net;
using System.Net.Mail;
using SmartRent.Api.Common.Errors;

namespace SmartRent.Api.Features.Auth;

// Production dùng SMTP từ cấu hình riêng. Local lưu thư .eml ngoài wwwroot để phát triển
// luồng quên mật khẩu mà không cần tài khoản SMTP hoặc gửi thư thật cho người dùng.
public sealed class AccountEmail(IConfiguration config, IWebHostEnvironment environment)
{
    public async Task SendReset(string email, string token, bool admin, CancellationToken ct)
    {
        var origin = config["Email:FrontendUrl"] ?? "http://localhost:5174";
        var path = admin ? "/admin/reset-password" : "/reset-password";
        var url = origin.TrimEnd('/') + path + "?token=" + Uri.EscapeDataString(token);
        using var message = new MailMessage(config["Email:From"] ?? "noreply@smartrent.local", email)
        {
            Subject = "SmartRent - Đặt mật khẩu",
            Body = "Mở liên kết để đặt mật khẩu. Không chia sẻ liên kết này.\r\n" + url + "\r\nNếu bạn không yêu cầu, hãy bỏ qua thư."
        };
        using var smtp = new SmtpClient();
        var host = config["Email:Host"];
        if (environment.IsDevelopment() && config.GetValue("Email:UsePickup", false))
            host = null;
        if (string.IsNullOrWhiteSpace(host))
        {
            if (!environment.IsDevelopment())
                throw new AppException("Chưa cấu hình dịch vụ email. Liên hệ chủ trọ.", HttpStatusCode.ServiceUnavailable, "email_not_configured");
            var directory = Path.Combine(environment.ContentRootPath, "App_Data", "mail");
            Directory.CreateDirectory(directory);
            smtp.DeliveryMethod = SmtpDeliveryMethod.SpecifiedPickupDirectory;
            smtp.PickupDirectoryLocation = directory;
        }
        else
        {
            smtp.Host = host;
            smtp.Port = config.GetValue("Email:Port", 587);
            smtp.EnableSsl = config.GetValue("Email:EnableSsl", true);
            var user = config["Email:Username"];
            if (!string.IsNullOrEmpty(user))
                smtp.Credentials = new NetworkCredential(user, config["Email:Password"]);
        }
        try
        {
            await smtp.SendMailAsync(message, ct);
        }
        catch (SmtpException) { throw new AppException("Không gửi được email. Kiểm tra cấu hình SMTP.", HttpStatusCode.ServiceUnavailable, "email_delivery_failed"); }
    }
}
