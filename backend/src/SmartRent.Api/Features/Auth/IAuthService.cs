namespace SmartRent.Api.Features.Auth;

/// <summary>
/// Giao diện xử lý nghiệp vụ xác thực và tài khoản
/// </summary>
public interface IAuthService
{
    Task<LoginResponse> LoginAsync(LoginRequest request, string? ipAddress, string? userAgent, CancellationToken ct = default);
    Task<LoginResponse> RegisterAsync(RegisterRequest request, string? ipAddress, string? userAgent, CancellationToken ct = default);
    Task<LoginResponse> RefreshTokenAsync(string refreshToken, CancellationToken ct = default);
    Task LogoutAsync(string? refreshToken, CancellationToken ct = default);
    Task ForgotPasswordAsync(ForgotPasswordRequest request, CancellationToken ct = default);
    Task ResetPasswordAsync(ResetPasswordRequest request, CancellationToken ct = default);
    Task ChangePasswordAsync(Guid userId, ChangePasswordRequest request, CancellationToken ct = default);
    Task<UserInfoDto> UpdateProfileAsync(Guid userId, UpdateProfileRequest request, CancellationToken ct = default);
    Task<MeResponse> GetMeAsync(Guid userId, CancellationToken ct = default);
    Task<List<SessionDto>> GetSessionsAsync(Guid userId, CancellationToken ct = default);
    Task RevokeSessionAsync(Guid userId, Guid sessionId, CancellationToken ct = default);
}
