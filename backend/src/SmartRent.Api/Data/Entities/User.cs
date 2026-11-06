using System;
using System.Collections.Generic;

namespace SmartRent.Api.Data.Entities;

/// <summary>
/// Tài khoản và toàn bộ hồ sơ khách, kể cả khách chưa kích hoạt đăng nhập.
/// </summary>
public partial class User
{
    public Guid Id { get; set; }

    public string Role { get; set; } = null!;

    public string? Email { get; set; }

    public string? PasswordHash { get; set; }

    public string DisplayName { get; set; } = null!;

    public string? Code { get; set; }

    public string? Phone { get; set; }

    public bool LoginEnabled { get; set; }

    public DateOnly? DateOfBirth { get; set; }

    public string? AddressLine { get; set; }

    public string? Locality { get; set; }

    public string? Province { get; set; }

    public string? EmergencyContactName { get; set; }

    public string? EmergencyContactPhone { get; set; }

    public string? Notes { get; set; }

    public string IdentityDocuments { get; set; } = null!;

    public Guid? AvatarFileId { get; set; }

    public bool IsActive { get; set; }

    public DateTime? EmailVerifiedAt { get; set; }

    public DateTime? AcceptedTermsAt { get; set; }

    public Guid SecurityStamp { get; set; }

    public int FailedLoginCount { get; set; }

    public DateTime? LockedUntil { get; set; }

    public DateTime? LastLoginAt { get; set; }

    public DateTime CreatedAt { get; set; }

    public DateTime UpdatedAt { get; set; }

    public virtual ICollection<AuthToken> AuthTokens { get; set; } = new List<AuthToken>();

    public virtual File? AvatarFile { get; set; }

    public virtual ICollection<BillingPeriod> BillingPeriods { get; set; } = new List<BillingPeriod>();

    public virtual ICollection<Booking> BookingReviewedByNavigations { get; set; } = new List<Booking>();

    public virtual ICollection<Booking> BookingUsers { get; set; } = new List<Booking>();

    public virtual ICollection<Contract> Contracts { get; set; } = new List<Contract>();

    public virtual ICollection<File> Files { get; set; } = new List<File>();

    public virtual ICollection<Invoice> Invoices { get; set; } = new List<Invoice>();

    public virtual ICollection<Notification> Notifications { get; set; } = new List<Notification>();

    public virtual ICollection<Payment> PaymentConfirmedByNavigations { get; set; } = new List<Payment>();

    public virtual ICollection<Payment> PaymentSubmittedByNavigations { get; set; } = new List<Payment>();

    public virtual ICollection<Payment> PaymentUsers { get; set; } = new List<Payment>();

    public virtual ICollection<Setting> Settings { get; set; } = new List<Setting>();

    public virtual ICollection<Ticket> TicketAssignedToNavigations { get; set; } = new List<Ticket>();

    public virtual ICollection<Ticket> TicketReportedByNavigations { get; set; } = new List<Ticket>();
}
