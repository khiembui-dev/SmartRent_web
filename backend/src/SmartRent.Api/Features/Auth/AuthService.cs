using Microsoft.AspNetCore.Identity;
using Microsoft.EntityFrameworkCore;
using SmartRent.Api.Common.Auth;
using SmartRent.Api.Common.Errors;
using SmartRent.Api.Data;
using SmartRent.Api.Data.Entities;

namespace SmartRent.Api.Features.Auth;

/// <summary>
/// Lớp triển khai nghiệp vụ xác thực người dùng kết nối trực tiếp với PostgreSQL
/// </summary>
public class AuthService : IAuthService
{
    private readonly SmartRentDbContext _db;
    private readonly IJwtTokenService _jwtTokenService;
    private readonly IPasswordHasher<User> _passwordHasher;
    private readonly ILogger<AuthService> _logger;

    private static readonly Guid DefaultOrgId = Guid.Parse("00000000-0000-0000-0000-000000000001");

    public AuthService(
        SmartRentDbContext db,
        IJwtTokenService jwtTokenService,
        IPasswordHasher<User> passwordHasher,
        ILogger<AuthService> logger)
    {
        _db = db;
        _jwtTokenService = jwtTokenService;
        _passwordHasher = passwordHasher;
        _logger = logger;
    }

    public async Task<LoginResponse> LoginAsync(LoginRequest request, string? ipAddress, string? userAgent, CancellationToken ct = default)
    {
        var normalizedEmail = request.Email.Trim().ToLowerInvariant();
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Email != null && u.Email.ToLower() == normalizedEmail, ct);

        if (user == null || !user.LoginEnabled || string.IsNullOrEmpty(user.PasswordHash))
        {
            throw new UnauthorizedException("Email hoặc mật khẩu chưa đúng.");
        }

        if (!user.IsActive)
        {
            throw new ForbiddenException("Tài khoản đang bị khóa. Liên hệ chủ trọ.");
        }

        if (user.LockedUntil.HasValue && user.LockedUntil.Value > DateTime.UtcNow)
        {
            var remaining = (user.LockedUntil.Value - DateTime.UtcNow).Minutes + 1;
            throw new ForbiddenException($"Tài khoản bị tạm khóa do nhập sai nhiều lần. Vui lòng thử lại sau {remaining} phút.");
        }

        var verify = _passwordHasher.VerifyHashedPassword(user, user.PasswordHash, request.Password);
        if (verify == PasswordVerificationResult.Failed)
        {
            user.FailedLoginCount += 1;
            if (user.FailedLoginCount >= 5)
            {
                user.LockedUntil = DateTime.UtcNow.AddMinutes(15);
                _logger.LogWarning("Tài khoản {Email} bị khóa 15 phút do nhập sai 5 lần.", user.Email);
            }
            await _db.SaveChangesAsync(ct);
            throw new UnauthorizedException("Email hoặc mật khẩu chưa đúng.");
        }

        // Kiểm tra đúng cửa đăng nhập
        if (string.Equals(request.Audience, "admin", StringComparison.OrdinalIgnoreCase) && user.Role != "admin")
        {
            throw new ForbiddenException("Chỉ tài khoản admin (chủ trọ) được đăng nhập trang quản trị.");
        }
        if (string.Equals(request.Audience, "customer", StringComparison.OrdinalIgnoreCase) && user.Role != "user")
        {
            throw new ForbiddenException("Tài khoản admin vui lòng đăng nhập tại /admin.");
        }

        // Đăng nhập thành công
        user.FailedLoginCount = 0;
        user.LockedUntil = null;
        user.LastLoginAt = DateTime.UtcNow;

        var (accessToken, accessExpiresAt) = _jwtTokenService.GenerateAccessToken(user);
        var (rawRefreshToken, refreshTokenHash, refreshExpiresAt) = _jwtTokenService.GenerateRefreshToken();

        var sessionToken = new AuthToken
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            Kind = "session",
            TokenHash = refreshTokenHash,
            CreatedAt = DateTime.UtcNow,
            ExpiresAt = refreshExpiresAt,
            UserAgent = userAgent,
            IpAddress = !string.IsNullOrEmpty(ipAddress) && System.Net.IPAddress.TryParse(ipAddress, out var ip) ? ip : null
        };

        _db.AuthTokens.Add(sessionToken);
        await _db.SaveChangesAsync(ct);

        return new LoginResponse
        {
            AccessToken = accessToken,
            RefreshToken = rawRefreshToken,
            ExpiresAt = accessExpiresAt,
            User = new UserInfoDto
            {
                Id = user.Id,
                Email = user.Email,
                DisplayName = user.DisplayName,
                Role = user.Role,
                Phone = user.Phone,
                AvatarFileId = user.AvatarFileId
            }
        };
    }

    public async Task<LoginResponse> RegisterAsync(RegisterRequest request, string? ipAddress, string? userAgent, CancellationToken ct = default)
    {
        var normalizedEmail = request.Email.Trim().ToLowerInvariant();
        var existingUser = await _db.Users.FirstOrDefaultAsync(u => u.Email != null && u.Email.ToLower() == normalizedEmail, ct);

        User user;
        if (existingUser != null)
        {
            if (existingUser.LoginEnabled)
            {
                throw new ConflictException("Email này đã có tài khoản. Đăng nhập hoặc dùng email khác.");
            }

            // Kích hoạt hồ sơ có sẵn chưa từng tạo tài khoản đăng nhập
            user = existingUser;
            user.DisplayName = request.DisplayName.Trim();
            user.Phone = request.Phone?.Trim() ?? user.Phone;
            user.LoginEnabled = true;
            user.IsActive = true;
            user.UpdatedAt = DateTime.UtcNow;
            user.PasswordHash = _passwordHasher.HashPassword(user, request.Password);
        }
        else
        {
            user = new User
            {
                Id = Guid.NewGuid(),
                Email = normalizedEmail,
                DisplayName = request.DisplayName.Trim(),
                Phone = request.Phone?.Trim(),
                LoginEnabled = true,
                IsActive = true,
                IdentityDocuments = "[]",
                AcceptedTermsAt = request.AcceptedTerms ? DateTime.UtcNow : null
            };
            user.PasswordHash = _passwordHasher.HashPassword(user, request.Password);
            _db.Users.Add(user);
        }

        await _db.SaveChangesAsync(ct);

        var (accessToken, accessExpiresAt) = _jwtTokenService.GenerateAccessToken(user);
        var (rawRefreshToken, refreshTokenHash, refreshExpiresAt) = _jwtTokenService.GenerateRefreshToken();

        var sessionToken = new AuthToken
        {
            Id = Guid.NewGuid(),
            UserId = user.Id,
            Kind = "session",
            TokenHash = refreshTokenHash,
            CreatedAt = DateTime.UtcNow,
            ExpiresAt = refreshExpiresAt,
            UserAgent = userAgent,
            IpAddress = !string.IsNullOrEmpty(ipAddress) && System.Net.IPAddress.TryParse(ipAddress, out var ip) ? ip : null
        };

        _db.AuthTokens.Add(sessionToken);
        await _db.SaveChangesAsync(ct);

        return new LoginResponse
        {
            AccessToken = accessToken,
            RefreshToken = rawRefreshToken,
            ExpiresAt = accessExpiresAt,
            User = new UserInfoDto
            {
                Id = user.Id,
                Email = user.Email,
                DisplayName = user.DisplayName,
                Role = user.Role,
                Phone = user.Phone,
                AvatarFileId = user.AvatarFileId
            }
        };
    }

    public async Task<LoginResponse> RefreshTokenAsync(string refreshToken, CancellationToken ct = default)
    {
        if (string.IsNullOrEmpty(refreshToken))
        {
            throw new UnauthorizedException("Không tìm thấy refresh token.");
        }

        var hash = _jwtTokenService.HashToken(refreshToken);
        var tokenRecord = await _db.AuthTokens
            .Include(t => t.User)
            .FirstOrDefaultAsync(t => t.TokenHash == hash && t.Kind == "session", ct);

        if (tokenRecord == null || tokenRecord.ExpiresAt <= DateTime.UtcNow || tokenRecord.RevokedAt.HasValue)
        {
            throw new UnauthorizedException("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
        }

        var user = tokenRecord.User;
        if (!user.IsActive || !user.LoginEnabled)
        {
            throw new ForbiddenException("Tài khoản đang bị khóa hoặc vô hiệu hóa.");
        }

        var (newAccessToken, accessExpiresAt) = _jwtTokenService.GenerateAccessToken(user);

        return new LoginResponse
        {
            AccessToken = newAccessToken,
            RefreshToken = refreshToken,
            ExpiresAt = accessExpiresAt,
            User = new UserInfoDto
            {
                Id = user.Id,
                Email = user.Email,
                DisplayName = user.DisplayName,
                Role = user.Role,
                Phone = user.Phone,
                AvatarFileId = user.AvatarFileId
            }
        };
    }

    public async Task LogoutAsync(string? refreshToken, CancellationToken ct = default)
    {
        if (!string.IsNullOrEmpty(refreshToken))
        {
            var hash = _jwtTokenService.HashToken(refreshToken);
            var tokenRecord = await _db.AuthTokens.FirstOrDefaultAsync(t => t.TokenHash == hash, ct);
            if (tokenRecord != null)
            {
                tokenRecord.RevokedAt = DateTime.UtcNow;
                await _db.SaveChangesAsync(ct);
            }
        }
    }

    public async Task ForgotPasswordAsync(ForgotPasswordRequest request, CancellationToken ct = default)
    {
        var normalizedEmail = request.Email.Trim().ToLowerInvariant();
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Email != null && u.Email.ToLower() == normalizedEmail && u.LoginEnabled, ct);

        if (user != null && user.IsActive)
        {
            var (rawToken, tokenHash, expiresAt) = _jwtTokenService.GenerateRefreshToken();
            var resetToken = new AuthToken
            {
                Id = Guid.NewGuid(),
                UserId = user.Id,
                Kind = "password_reset",
                TokenHash = tokenHash,
                CreatedAt = DateTime.UtcNow,
                ExpiresAt = DateTime.UtcNow.AddMinutes(15)
            };
            _db.AuthTokens.Add(resetToken);
            await _db.SaveChangesAsync(ct);

            _logger.LogInformation("Password reset token cho {Email}: {Token}", user.Email, rawToken);
        }
    }

    public async Task ResetPasswordAsync(ResetPasswordRequest request, CancellationToken ct = default)
    {
        var hash = _jwtTokenService.HashToken(request.Token);
        var tokenRecord = await _db.AuthTokens
            .Include(t => t.User)
            .FirstOrDefaultAsync(t => t.TokenHash == hash && t.Kind == "password_reset", ct);

        if (tokenRecord == null || tokenRecord.ExpiresAt <= DateTime.UtcNow || tokenRecord.ConsumedAt.HasValue)
        {
            throw new BadRequestException("Mã đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.");
        }

        var user = tokenRecord.User;
        user.PasswordHash = _passwordHasher.HashPassword(user, request.NewPassword);
        user.SecurityStamp = Guid.NewGuid();
        user.UpdatedAt = DateTime.UtcNow;

        tokenRecord.ConsumedAt = DateTime.UtcNow;
        await _db.SaveChangesAsync(ct);
    }

    public async Task ChangePasswordAsync(Guid userId, ChangePasswordRequest request, CancellationToken ct = default)
    {
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == userId, ct);
        if (user == null || string.IsNullOrEmpty(user.PasswordHash))
        {
            throw new NotFoundException("Không tìm thấy thông tin tài khoản.");
        }

        var verify = _passwordHasher.VerifyHashedPassword(user, user.PasswordHash, request.CurrentPassword);
        if (verify == PasswordVerificationResult.Failed)
        {
            throw new BadRequestException("Mật khẩu hiện tại không đúng.");
        }

        user.PasswordHash = _passwordHasher.HashPassword(user, request.NewPassword);
        user.SecurityStamp = Guid.NewGuid();
        user.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync(ct);
    }

    public async Task<UserInfoDto> UpdateProfileAsync(Guid userId, UpdateProfileRequest request, CancellationToken ct = default)
    {
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == userId, ct);
        if (user == null)
        {
            throw new NotFoundException("Không tìm thấy thông tin tài khoản.");
        }

        user.DisplayName = request.DisplayName.Trim();
        user.Phone = request.Phone?.Trim();
        user.AvatarFileId = request.AvatarFileId;
        user.UpdatedAt = DateTime.UtcNow;

        await _db.SaveChangesAsync(ct);

        return new UserInfoDto
        {
            Id = user.Id,
            Email = user.Email,
            DisplayName = user.DisplayName,
            Role = user.Role,
            Phone = user.Phone,
            AvatarFileId = user.AvatarFileId
        };
    }

    public async Task<MeResponse> GetMeAsync(Guid userId, CancellationToken ct = default)
    {
        var user = await _db.Users.FirstOrDefaultAsync(u => u.Id == userId, ct);
        if (user == null || !user.IsActive)
        {
            throw new UnauthorizedException("Tài khoản không tồn tại hoặc đã bị khóa.");
        }

        var setting = await _db.Settings.FirstOrDefaultAsync(ct);
        var orgName = setting?.BusinessName ?? "SmartRent";

        var orgs = new List<MeOrganizationDto>();
        var tenantProfiles = new List<MeTenantProfileDto>();

        if (user.Role == "admin")
        {
            var properties = await _db.Properties
                .Select(p => new MePropertyDto { Id = p.Id, Code = p.Code, Name = p.Name })
                .ToListAsync(ct);

            orgs.Add(new MeOrganizationDto
            {
                Id = DefaultOrgId,
                Code = "SR",
                Name = orgName,
                IsActive = true,
                MembershipId = user.Id,
                Status = "active",
                PropertyScope = "all",
                Permissions = [
                    "properties.read", "properties.write",
                    "rooms.read", "rooms.write",
                    "viewings.read", "viewings.write",
                    "tenants.read", "tenants.write",
                    "contracts.read", "contracts.write",
                    "billing.read", "billing.write",
                    "invoices.read", "invoices.write",
                    "payments.read", "payments.write",
                    "tickets.read", "tickets.write",
                    "settings.read", "settings.write"
                ],
                Properties = properties
            });
        }
        else
        {
            var contracts = await _db.Contracts
                .Include(c => c.Room)
                .ThenInclude(r => r.Property)
                .Where(c => c.UserId == user.Id && (c.Status == "active" || c.Status == "pending_checkout" || c.Status == "draft"))
                .ToListAsync(ct);

            var tenancies = contracts.Select(c => new MeTenancyDto
            {
                TenancyId = c.Id,
                Role = "representative",
                Status = c.Status,
                Room = new MeRoomRefDto
                {
                    Id = c.Room.Id,
                    Code = c.Room.Code,
                    Name = c.Room.Name,
                    PropertyName = c.Room.Property.Name
                }
            }).ToList();

            tenantProfiles.Add(new MeTenantProfileDto
            {
                TenantId = user.Id,
                OrganizationId = DefaultOrgId,
                OrganizationName = orgName,
                FullName = user.DisplayName,
                Tenancies = tenancies
            });
        }

        return new MeResponse
        {
            User = new MeUserDto
            {
                Id = user.Id,
                Role = user.Role,
                DisplayName = user.DisplayName,
                Email = user.Email,
                Phone = user.Phone,
                TwoFactorEnabled = false,
                AvatarFileId = user.AvatarFileId
            },
            Organizations = orgs,
            TenantProfiles = tenantProfiles
        };
    }

    public async Task<List<SessionDto>> GetSessionsAsync(Guid userId, CancellationToken ct = default)
    {
        return await _db.AuthTokens
            .Where(t => t.UserId == userId && t.Kind == "session" && t.RevokedAt == null && t.ExpiresAt > DateTime.UtcNow)
            .OrderByDescending(t => t.CreatedAt)
            .Select(t => new SessionDto
            {
                Id = t.Id,
                UserAgent = t.UserAgent,
                IpAddress = t.IpAddress != null ? t.IpAddress.ToString() : null,
                CreatedAt = t.CreatedAt,
                ExpiresAt = t.ExpiresAt,
                IsCurrent = false
            })
            .ToListAsync(ct);
    }

    public async Task RevokeSessionAsync(Guid userId, Guid sessionId, CancellationToken ct = default)
    {
        var session = await _db.AuthTokens
            .FirstOrDefaultAsync(t => t.Id == sessionId && t.UserId == userId && t.Kind == "session", ct);

        if (session != null)
        {
            session.RevokedAt = DateTime.UtcNow;
            await _db.SaveChangesAsync(ct);
        }
    }
}
