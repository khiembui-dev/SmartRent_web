using System.Security.Claims;
using SmartRent.Api.Common;
using SmartRent.Api.Features.Auth;

namespace SmartRent.Api.Features.Chatbot;

/// <summary>Khu sử dụng trợ lý. Mỗi khu chỉ thấy bộ công cụ của mình.</summary>
public enum ChatAudience
{
    Customer,
    Admin
}

/// <summary>
/// Người đang hỏi, lấy từ phiên đăng nhập trong database. Id và role không bao giờ lấy từ
/// nội dung hội thoại hay tham số do mô hình AI tạo ra.
/// </summary>
public sealed record ChatActor(Guid UserId, string Role, string DisplayName, string? Email, string Token)
{
    public ChatAudience? Audience => Role switch
    {
        "admin" => ChatAudience.Admin,
        "user" => ChatAudience.Customer,
        _ => null
    };

    /// <summary>Principal giống hệt TokenAuthenticationHandler tạo, để controller hiện có kiểm tra quyền như request thật.</summary>
    public ClaimsPrincipal ToPrincipal() => new(new ClaimsIdentity(
    [
        new Claim(ClaimTypes.NameIdentifier, UserId.ToString()),
        new Claim(ClaimTypes.Role, Role),
        new Claim(ClaimTypes.Name, DisplayName),
        new Claim("displayName", DisplayName),
        new Claim(ClaimTypes.Email, Email ?? "")
    ], TokenAuthenticationHandler.AuthenticationScheme));
}

public interface IChatActorResolver
{
    /// <summary>Trả null khi token không còn hiệu lực (hết hạn, đã đăng xuất, tài khoản bị khóa).</summary>
    Task<ChatActor?> ResolveAsync(string? bearerToken, CancellationToken ct);
}

/// <summary>Dùng chung truy vấn phiên với Dashboard, Ticket, Thông báo: token → auth_tokens → users.</summary>
public sealed class SessionChatActorResolver(AuthSessionService sessions) : IChatActorResolver
{
    public async Task<ChatActor?> ResolveAsync(string? bearerToken, CancellationToken ct)
    {
        if (string.IsNullOrWhiteSpace(bearerToken))
            return null;
        var user = await sessions.FindUserAsync(bearerToken, ct);
        return user is null ? null : new ChatActor(user.Id, user.Role, user.DisplayName, user.Email, bearerToken);
    }
}

/// <summary>Phiên hết hạn hoặc đổi quyền giữa chừng; dừng ngay, không gọi thêm công cụ.</summary>
public sealed class ChatAccessException(int status, string code, string message) : Exception(message)
{
    public int Status { get; } = status;
    public string Code { get; } = code;
}
