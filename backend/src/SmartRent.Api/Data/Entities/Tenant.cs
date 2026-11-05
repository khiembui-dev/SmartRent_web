using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

/// <summary>
/// Hồ sơ khách theo từng đơn vị, hiện ở mục Khách thuê của admin. Khách tự đăng ký có user_id; khách nhập tay có thể chưa có tài khoản. Điện thoại không bắt buộc duy nhất vì người thân có thể dùng chung số.
/// </summary>
public partial class Tenant
{
    public Guid Id { get; set; }

    public Guid OrganizationId { get; set; }

    public Guid? UserId { get; set; }

    public string Code { get; set; } = null!;

    public string FullName { get; set; } = null!;

    public string? Email { get; set; }

    public string? Phone { get; set; }

    public DateOnly? DateOfBirth { get; set; }

    public string? AddressLine { get; set; }

    public string? EmergencyContactName { get; set; }

    public string? EmergencyContactPhone { get; set; }

    public string? Notes { get; set; }

    public DateTime CreatedAt { get; set; }

    public virtual ICollection<ContractParty> ContractParties { get; set; } = new List<ContractParty>();

    public virtual Organization Organization { get; set; } = null!;

    public virtual ICollection<Payment> Payments { get; set; } = new List<Payment>();

    public virtual ICollection<RentalInquiry> RentalInquiries { get; set; } = new List<RentalInquiry>();

    public virtual Tenancy? Tenancy { get; set; }

    public virtual ICollection<TenancyResident> TenancyResidents { get; set; } = new List<TenancyResident>();

    public virtual ICollection<TenantIdentityDocument> TenantIdentityDocuments { get; set; } = new List<TenantIdentityDocument>();

    public virtual TenantProfileChangeRequest? TenantProfileChangeRequest { get; set; }

    public virtual User? User { get; set; }
}
