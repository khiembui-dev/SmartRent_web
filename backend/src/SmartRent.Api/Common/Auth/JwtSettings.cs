namespace SmartRent.Api.Common.Auth;

public class JwtSettings
{
    public const string SectionName = "Jwt";

    public string Secret { get; set; } = "SmartRentSuperSecretKey_ForJwtTokenGeneration_AtLeast32BytesLong!";
    public string Issuer { get; set; } = "SmartRentApi";
    public string Audience { get; set; } = "SmartRentClients";
    public int ExpiryMinutes { get; set; } = 120;
    public int RefreshTokenExpiryDays { get; set; } = 30;
}
