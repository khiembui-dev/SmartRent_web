using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

/// <summary>
/// Tài khoản đăng nhập của cả nhân sự và khách. Mật khẩu chỉ lưu dạng băm. Chủ trọ sửa email, điện thoại ở Cài đặt và các số này hiện ở trang Liên hệ.
/// </summary>
public partial class User
{
    public Guid Id { get; set; }

    public string? UserName { get; set; }

    public string? NormalizedUserName { get; set; }

    public string? Email { get; set; }

    public string? NormalizedEmail { get; set; }

    public bool EmailConfirmed { get; set; }

    public string? PasswordHash { get; set; }

    public string? SecurityStamp { get; set; }

    public string? ConcurrencyStamp { get; set; }

    public string? PhoneNumber { get; set; }

    public bool PhoneNumberConfirmed { get; set; }

    public bool TwoFactorEnabled { get; set; }

    public DateTime? LockoutEnd { get; set; }

    public bool LockoutEnabled { get; set; }

    public int AccessFailedCount { get; set; }

    public string DisplayName { get; set; } = null!;

    public Guid? AvatarFileId { get; set; }

    public bool IsActive { get; set; }

    public DateTime? LastLoginAt { get; set; }

    public DateTime CreatedAt { get; set; }

    public virtual ICollection<ApiIdempotencyKey> ApiIdempotencyKeys { get; set; } = new List<ApiIdempotencyKey>();

    public virtual ICollection<AuditLog> AuditLogs { get; set; } = new List<AuditLog>();

    public virtual StoredFile? AvatarFile { get; set; }

    public virtual ICollection<BackupRun> BackupRuns { get; set; } = new List<BackupRun>();

    public virtual ICollection<BillingPeriodEvent> BillingPeriodEvents { get; set; } = new List<BillingPeriodEvent>();

    public virtual ICollection<BillingPeriod> BillingPeriods { get; set; } = new List<BillingPeriod>();

    public virtual ICollection<CheckoutSettlement> CheckoutSettlements { get; set; } = new List<CheckoutSettlement>();

    public virtual ICollection<ContractAttachment> ContractAttachments { get; set; } = new List<ContractAttachment>();

    public virtual ICollection<Contract> ContractCreatedByNavigations { get; set; } = new List<Contract>();

    public virtual ICollection<Contract> ContractTerminatedByNavigations { get; set; } = new List<Contract>();

    public virtual ICollection<ContractVersion> ContractVersions { get; set; } = new List<ContractVersion>();

    public virtual ICollection<DepositEntry> DepositEntries { get; set; } = new List<DepositEntry>();

    public virtual ICollection<EmailOutbox> EmailOutboxes { get; set; } = new List<EmailOutbox>();

    public virtual ICollection<Handover> HandoverLandlordConfirmedByNavigations { get; set; } = new List<Handover>();

    public virtual ICollection<Handover> HandoverTenantConfirmedByNavigations { get; set; } = new List<Handover>();

    public virtual ICollection<Invoice> InvoiceCreatedByNavigations { get; set; } = new List<Invoice>();

    public virtual ICollection<Invoice> InvoiceIssuedByNavigations { get; set; } = new List<Invoice>();

    public virtual ICollection<Invoice> InvoiceVoidedByNavigations { get; set; } = new List<Invoice>();

    public virtual ICollection<MeterReading> MeterReadings { get; set; } = new List<MeterReading>();

    public virtual ICollection<Notification> Notifications { get; set; } = new List<Notification>();

    public virtual ICollection<OrganizationMembership> OrganizationMemberships { get; set; } = new List<OrganizationMembership>();

    public virtual ICollection<PaymentAllocation> PaymentAllocations { get; set; } = new List<PaymentAllocation>();

    public virtual ICollection<Payment> PaymentConfirmedByNavigations { get; set; } = new List<Payment>();

    public virtual ICollection<Payment> PaymentReportedByNavigations { get; set; } = new List<Payment>();

    public virtual ICollection<PaymentReversal> PaymentReversals { get; set; } = new List<PaymentReversal>();

    public virtual ICollection<RentalInquiry> RentalInquiries { get; set; } = new List<RentalInquiry>();

    public virtual ICollection<RoomStatusEvent> RoomStatusEvents { get; set; } = new List<RoomStatusEvent>();

    public virtual ICollection<RoomViewing> RoomViewings { get; set; } = new List<RoomViewing>();

    public virtual ICollection<StoredFile> StoredFiles { get; set; } = new List<StoredFile>();

    public virtual ICollection<SupportAccessGrant> SupportAccessGrantGrantedByNavigations { get; set; } = new List<SupportAccessGrant>();

    public virtual ICollection<SupportAccessGrant> SupportAccessGrantUsers { get; set; } = new List<SupportAccessGrant>();

    public virtual ICollection<Tenancy> TenancyCreatedByNavigations { get; set; } = new List<Tenancy>();

    public virtual ICollection<Tenancy> TenancyEndedByNavigations { get; set; } = new List<Tenancy>();

    public virtual ICollection<TenancyRequest> TenancyRequestRequestedByNavigations { get; set; } = new List<TenancyRequest>();

    public virtual ICollection<TenancyRequest> TenancyRequestReviewedByNavigations { get; set; } = new List<TenancyRequest>();

    public virtual ICollection<TenantIdentityDocument> TenantIdentityDocuments { get; set; } = new List<TenantIdentityDocument>();

    public virtual ICollection<TenantProfileChangeRequest> TenantProfileChangeRequestRequestedByNavigations { get; set; } = new List<TenantProfileChangeRequest>();

    public virtual ICollection<TenantProfileChangeRequest> TenantProfileChangeRequestReviewedByNavigations { get; set; } = new List<TenantProfileChangeRequest>();

    public virtual ICollection<Tenant> Tenants { get; set; } = new List<Tenant>();

    public virtual ICollection<Ticket> TicketAssignedToNavigations { get; set; } = new List<Ticket>();

    public virtual ICollection<TicketEvent> TicketEventActors { get; set; } = new List<TicketEvent>();

    public virtual ICollection<TicketEvent> TicketEventNewAssignees { get; set; } = new List<TicketEvent>();

    public virtual ICollection<TicketEvent> TicketEventOldAssignees { get; set; } = new List<TicketEvent>();

    public virtual ICollection<TicketMessage> TicketMessages { get; set; } = new List<TicketMessage>();

    public virtual ICollection<Ticket> TicketReportedByNavigations { get; set; } = new List<Ticket>();

    public virtual ICollection<UserClaim> UserClaims { get; set; } = new List<UserClaim>();

    public virtual ICollection<UserLogin> UserLogins { get; set; } = new List<UserLogin>();

    public virtual ICollection<UserSession> UserSessions { get; set; } = new List<UserSession>();

    public virtual ICollection<UserToken> UserTokens { get; set; } = new List<UserToken>();

    public virtual ICollection<Role> Roles { get; set; } = new List<Role>();
}
