using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

/// <summary>
/// Đơn vị chủ trọ. Quản trị hệ thống tạo, tạm ngưng hoặc mở lại đơn vị.
/// </summary>
public partial class Organization
{
    public Guid Id { get; set; }

    public string Code { get; set; } = null!;

    public string Name { get; set; } = null!;

    public string? LegalName { get; set; }

    public string? TaxCode { get; set; }

    public string? Phone { get; set; }

    public string? Email { get; set; }

    public bool IsActive { get; set; }

    public string? SuspendedReason { get; set; }

    public DateTime CreatedAt { get; set; }

    public virtual ICollection<Amenity> Amenities { get; set; } = new List<Amenity>();

    public virtual ICollection<AuditLog> AuditLogs { get; set; } = new List<AuditLog>();

    public virtual BankAccount? BankAccount { get; set; }

    public virtual ICollection<BusinessRole> BusinessRoles { get; set; } = new List<BusinessRole>();

    public virtual ICollection<ChargeType> ChargeTypes { get; set; } = new List<ChargeType>();

    public virtual ICollection<DocumentCounter> DocumentCounters { get; set; } = new List<DocumentCounter>();

    public virtual ICollection<EmailOutbox> EmailOutboxes { get; set; } = new List<EmailOutbox>();

    public virtual ICollection<Notification> Notifications { get; set; } = new List<Notification>();

    public virtual ICollection<OrganizationMembership> OrganizationMemberships { get; set; } = new List<OrganizationMembership>();

    public virtual OrganizationSetting? OrganizationSetting { get; set; }

    public virtual ICollection<Property> Properties { get; set; } = new List<Property>();

    public virtual ICollection<RoomType> RoomTypes { get; set; } = new List<RoomType>();

    public virtual ICollection<SlaPolicy> SlaPolicies { get; set; } = new List<SlaPolicy>();

    public virtual ICollection<StoredFile> StoredFiles { get; set; } = new List<StoredFile>();

    public virtual ICollection<SupportAccessGrant> SupportAccessGrants { get; set; } = new List<SupportAccessGrant>();

    public virtual ICollection<Tenant> Tenants { get; set; } = new List<Tenant>();

    public virtual ICollection<TicketCategory> TicketCategories { get; set; } = new List<TicketCategory>();
}
