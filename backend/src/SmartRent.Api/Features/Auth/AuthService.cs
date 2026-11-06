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
    private readonly ISessionTokenService _sessionTokens;
    private readonly IPasswordHasher<User> _passwordHasher;
    private readonly ILogger<AuthService> _logger;

    private static readonly Guid DefaultOrgId = Guid.Parse("00000000-0000-0000-0000-000000000001");

    public AuthService(
        SmartRentDbContext db,
        ISessionTokenService jwtTokenService,
        IPasswordHasher<User> passwordHasher,
        ILogger<AuthService> logger)
    {
        _db = db;
        _sessionTokens = jwtTokenService;
        _passwordHasher = passwordHasher;
        _logger = logger;
    }

    public async Task<LoginResponse> LoginAsync(LoginRequest request, string? ipAddress, string? userAgent, CancellationToken ct = default)
    {
        if (request.Audience is not ("admin" or "customer"))
            throw new BadRequestException("Khu đăng nhập phải là admin hoặc customer.");
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

        PasswordVerificationResult verify;
        try { verify = _passwordHasher.VerifyHashedPassword(user, user.PasswordHash, request.Password); }
        catch (FormatException) { throw new UnauthorizedException("Tài khoản chưa có mật khẩu hợp lệ."); }
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

        var (rawRefreshToken, refreshTokenHash, refreshExpiresAt) = _sessionTokens.GenerateRefreshToken();

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
            AccessToken = rawRefreshToken,
            RefreshToken = rawRefreshToken,
            ExpiresAt = refreshExpiresAt,
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

        if (existingUser != null)
            throw new ConflictException("Email đã có hồ sơ. Liên hệ chủ trọ để kích hoạt, không tự nhận hồ sơ theo email.");
        if (!request.AcceptedTerms)
            throw new BadRequestException("Cần đồng ý điều khoản trước khi tạo tài khoản.");
        var user = new User
        {
            Id = Guid.NewGuid(), Email = normalizedEmail, DisplayName = request.DisplayName.Trim(),
            Phone = request.Phone?.Trim(), LoginEnabled = true, IsActive = true,
            IdentityDocuments = "[]", AcceptedTermsAt = DateTime.UtcNow
        };
        user.PasswordHash = _passwordHasher.HashPassword(user, request.Password);
        _db.Users.Add(user);

        await _db.SaveChangesAsync(ct);

        var (rawRefreshToken, refreshTokenHash, refreshExpiresAt) = _sessionTokens.GenerateRefreshToken();

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
            AccessToken = rawRefreshToken,
            RefreshToken = rawRefreshToken,
            ExpiresAt = refreshExpiresAt,
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

        var hash = _sessionTokens.HashToken(refreshToken);
        var tokenRecord = await _db.AuthTokens
            .Include(t => t.User)
            .FirstOrDefaultAsync(t => t.TokenHash.ToUpper() == hash.ToUpper() && t.Kind == "session", ct);

        if (tokenRecord == null || tokenRecord.ExpiresAt <= DateTime.UtcNow || tokenRecord.RevokedAt.HasValue)
        {
            throw new UnauthorizedException("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
        }

        var user = tokenRecord.User;
        if (!user.IsActive || !user.LoginEnabled)
        {
            throw new ForbiddenException("Tài khoản đang bị khóa hoặc vô hiệu hóa.");
        }

        // Cùng phiên SQL được dùng cho mọi module; refresh không phát JWT mà module khác không nhận.

        return new LoginResponse
        {
            AccessToken = refreshToken,
            RefreshToken = refreshToken,
            ExpiresAt = tokenRecord.ExpiresAt,
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
            var hash = _sessionTokens.HashToken(refreshToken);
            var tokenRecord = await _db.AuthTokens.FirstOrDefaultAsync(t => t.TokenHash.ToUpper() == hash.ToUpper(), ct);
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
            var (rawToken, tokenHash, expiresAt) = _sessionTokens.GenerateRefreshToken();
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

            _logger.LogInformation("Đã tạo yêu cầu đặt lại mật khẩu; delivery email cần cấu hình riêng.");
        }
    }

    public async Task ResetPasswordAsync(ResetPasswordRequest request, CancellationToken ct = default)
    {
        var hash = _sessionTokens.HashToken(request.Token);
        var tokenRecord = await _db.AuthTokens
            .Include(t => t.User)
            .FirstOrDefaultAsync(t => t.TokenHash.ToUpper() == hash.ToUpper() && t.Kind == "password_reset", ct);

        if (tokenRecord == null || tokenRecord.ExpiresAt <= DateTime.UtcNow || tokenRecord.ConsumedAt.HasValue)
        {
            throw new BadRequestException("Mã đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.");
        }

        var user = tokenRecord.User;
        user.PasswordHash = _passwordHasher.HashPassword(user, request.NewPassword);

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
            var contracts = await _db.Contracts.FromSqlInterpolated($@"SELECT * FROM smartrent.contracts c
                WHERE c.status<>'cancelled' AND (c.user_id={user.Id} OR EXISTS (
                  SELECT 1 FROM jsonb_array_elements(c.occupants) x
                  WHERE x->>'userId'={user.Id.ToString()} AND x->>'leftOn' IS NULL))")
                .Include(c => c.Room)
                .ThenInclude(r => r.Property)
                .ToListAsync(ct);

            var tenancies = contracts.Select(c => new MeTenancyDto
            {
                TenancyId = c.Id,
                Role = c.UserId == user.Id ? "representative" : "resident",
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
