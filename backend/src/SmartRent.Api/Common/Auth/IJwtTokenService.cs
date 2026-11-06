using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.Extensions.Options;
using Microsoft.IdentityModel.Tokens;
using SmartRent.Api.Data.Entities;

namespace SmartRent.Api.Common.Auth;

public interface IJwtTokenService
{
    (string Token, DateTime ExpiresAt) GenerateAccessToken(User user);
    (string RawToken, string TokenHash, DateTime ExpiresAt) GenerateRefreshToken();
    string HashToken(string rawToken);
}

public class JwtTokenService : IJwtTokenService
{
    private readonly JwtSettings _settings;

    public JwtTokenService(IOptions<JwtSettings> settings)
    {
        _settings = settings.Value;
    }

    public (string Token, DateTime ExpiresAt) GenerateAccessToken(User user)
    {
        var expiresAt = DateTime.UtcNow.AddMinutes(_settings.ExpiryMinutes);
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(_settings.Secret));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var claims = new List<Claim>
        {
            new(JwtRegisteredClaimNames.Sub, user.Id.ToString()),
            new(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new(ClaimTypes.Role, user.Role),
            new("displayName", user.DisplayName)
        };

        if (!string.IsNullOrEmpty(user.Email))
        {
            claims.Add(new Claim(JwtRegisteredClaimNames.Email, user.Email));
            claims.Add(new Claim(ClaimTypes.Email, user.Email));
        }

        var tokenDescriptor = new SecurityTokenDescriptor
        {
            Subject = new ClaimsIdentity(claims),
            Expires = expiresAt,
            Issuer = _settings.Issuer,
            Audience = _settings.Audience,
            SigningCredentials = credentials
        };

        var tokenHandler = new JwtSecurityTokenHandler();
        var token = tokenHandler.CreateToken(tokenDescriptor);
        return (tokenHandler.WriteToken(token), expiresAt);
    }

    public (string RawToken, string TokenHash, DateTime ExpiresAt) GenerateRefreshToken()
    {
        var randomBytes = new byte[64];
        using var rng = RandomNumberGenerator.Create();
        rng.GetBytes(randomBytes);
        var rawToken = Convert.ToBase64String(randomBytes)
            .Replace("+", "-")
            .Replace("/", "_")
            .Replace("=", "");

        var expiresAt = DateTime.UtcNow.AddDays(_settings.RefreshTokenExpiryDays);
        var tokenHash = HashToken(rawToken);

        return (rawToken, tokenHash, expiresAt);
    }

    public string HashToken(string rawToken)
    {
        var bytes = SHA256.HashData(Encoding.UTF8.GetBytes(rawToken));
        return Convert.ToHexString(bytes).ToLowerInvariant();
    }
}
