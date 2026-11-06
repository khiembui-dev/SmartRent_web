namespace SmartRent.Api.Features.Settings;

public interface ISettingsService
{
    Task<BillingScheduleDto> GetBillingScheduleAsync(CancellationToken ct = default);
    Task<BillingScheduleDto> UpdateBillingScheduleAsync(Guid? userId, UpdateBillingScheduleRequest request, CancellationToken ct = default);
    Task<OrganizationSettingsDto> GetOrganizationAsync(CancellationToken ct = default);
    Task<OrganizationSettingsDto> UpdateOrganizationAsync(Guid? userId, UpdateOrganizationSettingsRequest request, CancellationToken ct = default);
}
