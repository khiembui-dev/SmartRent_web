using System.Security.Cryptography;
using System.Text;

namespace SmartRent.Api.Common.Auth;

public interface ISessionTokenService
{
    (string RawToken,string TokenHash,DateTime ExpiresAt) GenerateRefreshToken();
    string HashToken(string rawToken);
}

// Dùng một phiên SQL thống nhất cho Auth, Leasing, Billing và Ticket.
// Token rõ chỉ trả cho trình duyệt; auth_tokens lưu SHA-256 và cho phép thu hồi ngay.
public sealed class SessionTokenService : ISessionTokenService
{
    public (string RawToken,string TokenHash,DateTime ExpiresAt) GenerateRefreshToken()
    {
        var token=Convert.ToBase64String(RandomNumberGenerator.GetBytes(32));
        return (token,HashToken(token),DateTime.UtcNow.AddHours(12));
    }
    public string HashToken(string rawToken) =>
        Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(rawToken)));
}
