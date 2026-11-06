using System.ComponentModel.DataAnnotations;

namespace SmartRent.Api.Features.Auth;

/// <summary>
/// Yêu cầu đăng nhập bằng Email và Mật khẩu
/// </summary>
public class LoginRequest
{
    [Required(ErrorMessage = "Email không được để trống")]
    [EmailAddress(ErrorMessage = "Định dạng email không hợp lệ")]
    public string Email { get; set; } = null!;

    [Required(ErrorMessage = "Mật khẩu không được để trống")]
    public string Password { get; set; } = null!;

    /// <summary>
    /// Khu vực đăng nhập: 'admin' (chủ trọ) hoặc 'customer' (khách thuê)
    /// </summary>
    public string? Audience { get; set; }
}

/// <summary>
/// Kết quả trả về sau khi đăng nhập hoặc đăng ký thành công
/// </summary>
public class LoginResponse
{
    public string AccessToken { get; set; } = null!;
    public string RefreshToken { get; set; } = null!;
    public DateTime ExpiresAt { get; set; }
    public UserInfoDto User { get; set; } = null!;
}

/// <summary>
/// Thông tin cơ bản của người dùng
/// </summary>
public class UserInfoDto
{
    public Guid Id { get; set; }
    public string? Email { get; set; }
    public string DisplayName { get; set; } = null!;
    public string Role { get; set; } = null!;
    public string? Phone { get; set; }
    public Guid? AvatarFileId { get; set; }
}

/// <summary>
/// Yêu cầu khách thuê tự đăng ký tài khoản mới
/// </summary>
public class RegisterRequest
{
    [Required(ErrorMessage = "Email không được để trống")]
    [EmailAddress(ErrorMessage = "Định dạng email không hợp lệ")]
    public string Email { get; set; } = null!;

    [Required(ErrorMessage = "Mật khẩu không được để trống")]
    [MinLength(8, ErrorMessage = "Mật khẩu phải từ 8 ký tự trở lên")]
    public string Password { get; set; } = null!;

    [Required(ErrorMessage = "Họ tên không được để trống")]
    [System.Text.Json.Serialization.JsonPropertyName("fullName")]
    public string DisplayName { get; set; } = null!;

    public string? Phone { get; set; }
    public bool AcceptedTerms { get; set; }
}

/// <summary>
/// Yêu cầu làm mới access token
/// </summary>
public class RefreshTokenRequest
{
    public string? RefreshToken { get; set; }
}

/// <summary>
/// Yêu cầu đổi mật khẩu cho tài khoản đang đăng nhập
/// </summary>
public class ChangePasswordRequest
{
    [Required(ErrorMessage = "Mật khẩu hiện tại không được để trống")]
    public string CurrentPassword { get; set; } = null!;

    [Required(ErrorMessage = "Mật khẩu mới không được để trống")]
    [MinLength(8, ErrorMessage = "Mật khẩu mới phải từ 8 ký tự trở lên")]
    public string NewPassword { get; set; } = null!;
}

/// <summary>
/// Yêu cầu cập nhật hồ sơ cá nhân
/// </summary>
public class UpdateProfileRequest
{
    [Required(ErrorMessage = "Họ tên không được để trống")]
    [System.Text.Json.Serialization.JsonPropertyName("fullName")]
    public string DisplayName { get; set; } = null!;

    public string? Phone { get; set; }
    public Guid? AvatarFileId { get; set; }
}

/// <summary>
/// Yêu cầu gửi mã đặt lại mật khẩu khi quên
/// </summary>
public class ForgotPasswordRequest
{
    [Required(ErrorMessage = "Email không được để trống")]
    [EmailAddress(ErrorMessage = "Định dạng email không hợp lệ")]
    public string Email { get; set; } = null!;
}

/// <summary>
/// Yêu cầu đặt lại mật khẩu bằng mã xác thực
/// </summary>
public class ResetPasswordRequest
{
    [Required(ErrorMessage = "Mã xác thực token không được để trống")]
    public string Token { get; set; } = null!;

    [Required(ErrorMessage = "Mật khẩu mới không được để trống")]
    [MinLength(8, ErrorMessage = "Mật khẩu mới phải từ 8 ký tự trở lên")]
    public string NewPassword { get; set; } = null!;
}

/// <summary>
/// Thông tin một phiên đăng nhập
/// </summary>
public class SessionDto
{
    public Guid Id { get; set; }
    public string? UserAgent { get; set; }
    public string? IpAddress { get; set; }
    public DateTime CreatedAt { get; set; }
    public DateTime ExpiresAt { get; set; }
    public bool IsCurrent { get; set; }
}

/// <summary>
/// Cấu trúc dữ liệu trả về cho GET /api/v1/me (khớp OpenAPI schema Me)
/// </summary>
public class MeResponse
{
    public MeUserDto User { get; set; } = null!;
    public List<MeOrganizationDto> Organizations { get; set; } = [];
    public List<MeTenantProfileDto> TenantProfiles { get; set; } = [];
}

public class MeUserDto
{
    public Guid Id { get; set; }
    public string Role { get; set; } = null!;
    public string DisplayName { get; set; } = null!;
    public string? Email { get; set; }
    public string? Phone { get; set; }
    public bool TwoFactorEnabled { get; set; }
    public Guid? AvatarFileId { get; set; }
    public string? AvatarUrl { get; set; }
}

public class MeOrganizationDto
{
    public Guid Id { get; set; }
    public string Code { get; set; } = "SR";
    public string Name { get; set; } = null!;
    public bool IsActive { get; set; } = true;
    public Guid MembershipId { get; set; }
    public string Status { get; set; } = "active";
    public List<string> Permissions { get; set; } = [];
    public string PropertyScope { get; set; } = "all";
    public List<MePropertyDto> Properties { get; set; } = [];
}

public class MePropertyDto
{
    public Guid Id { get; set; }
    public string Code { get; set; } = null!;
    public string Name { get; set; } = null!;
}

public class MeTenantProfileDto
{
    public Guid TenantId { get; set; }
    public Guid OrganizationId { get; set; }
    public string OrganizationName { get; set; } = null!;
    public string FullName { get; set; } = null!;
    public List<MeTenancyDto> Tenancies { get; set; } = [];
}

public class MeTenancyDto
{
    public Guid TenancyId { get; set; }
    public string Role { get; set; } = "representative";
    public string Status { get; set; } = "active";
    public MeRoomRefDto Room { get; set; } = null!;
}

public class MeRoomRefDto
{
    public Guid Id { get; set; }
    public string Code { get; set; } = null!;
    public string Name { get; set; } = null!;
    public string PropertyName { get; set; } = null!;
}
