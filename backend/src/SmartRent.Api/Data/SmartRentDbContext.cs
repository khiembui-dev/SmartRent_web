using System;
using System.Collections.Generic;
using Microsoft.EntityFrameworkCore;
using SmartRent.Api.Data.Entities;

using File = SmartRent.Api.Data.Entities.File;

namespace SmartRent.Api.Data;

public partial class SmartRentDbContext : DbContext
{
    public SmartRentDbContext(DbContextOptions<SmartRentDbContext> options)
        : base(options)
    {
    }

    public virtual DbSet<AuthToken> AuthTokens { get; set; }

    public virtual DbSet<BillingPeriod> BillingPeriods { get; set; }

    public virtual DbSet<Booking> Bookings { get; set; }

    public virtual DbSet<Contract> Contracts { get; set; }

    public virtual DbSet<File> Files { get; set; }

    public virtual DbSet<Invoice> Invoices { get; set; }

    public virtual DbSet<Notification> Notifications { get; set; }

    public virtual DbSet<Payment> Payments { get; set; }

    public virtual DbSet<Property> Properties { get; set; }

    public virtual DbSet<Room> Rooms { get; set; }

    public virtual DbSet<Setting> Settings { get; set; }

    public virtual DbSet<Ticket> Tickets { get; set; }

    public virtual DbSet<User> Users { get; set; }

    public virtual DbSet<VDepositBalance> VDepositBalances { get; set; }

    public virtual DbSet<VInvoiceBalance> VInvoiceBalances { get; set; }

    public virtual DbSet<VPublicRoom> VPublicRooms { get; set; }

    public virtual DbSet<VRoomOccupancy> VRoomOccupancies { get; set; }

    public virtual DbSet<VUserBooking> VUserBookings { get; set; }

    public virtual DbSet<VUserContract> VUserContracts { get; set; }

    public virtual DbSet<VUserInvoice> VUserInvoices { get; set; }

    public virtual DbSet<VUserNotification> VUserNotifications { get; set; }

    public virtual DbSet<VUserTicket> VUserTickets { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasPostgresExtension("btree_gist");

        modelBuilder.Entity<AuthToken>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("auth_tokens_pkey");

            entity.ToTable("auth_tokens", "smartrent", tb => tb.HasComment("Phiên đăng nhập, đặt lại mật khẩu và lời mời; chỉ lưu hash token."));

            entity.HasIndex(e => e.TokenHash, "auth_tokens_token_hash_key").IsUnique();

            entity.HasIndex(e => new { e.UserId, e.Kind }, "auth_tokens_user_idx");

            entity.Property(e => e.Id)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("id");
            entity.Property(e => e.ConsumedAt).HasColumnName("consumed_at");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("now()").ValueGeneratedOnAdd().HasColumnName("created_at");
            entity.Property(e => e.ExpiresAt).HasColumnName("expires_at");
            entity.Property(e => e.IpAddress).HasColumnName("ip_address");
            entity.Property(e => e.Kind).HasColumnName("kind");
            entity.Property(e => e.RevokedAt).HasColumnName("revoked_at");
            entity.Property(e => e.TokenHash).HasColumnName("token_hash");
            entity.Property(e => e.UserAgent).HasColumnName("user_agent");
            entity.Property(e => e.UserId).HasColumnName("user_id");

            entity.HasOne(d => d.User).WithMany(p => p.AuthTokens)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("auth_tokens_user_id_fkey");
        });

        modelBuilder.Entity<BillingPeriod>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("billing_periods_pkey");

            entity.ToTable("billing_periods", "smartrent", tb => tb.HasComment("Kỳ tháng theo cơ sở và trạng thái khóa, kể cả tháng chưa có hóa đơn."));

            entity.HasIndex(e => new { e.PropertyId, e.MonthStart }, "billing_periods_property_id_month_start_key").IsUnique();

            entity.Property(e => e.Id)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("id");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("now()").ValueGeneratedOnAdd().HasColumnName("created_at");
            entity.Property(e => e.History)
                .HasDefaultValueSql("'[]'::jsonb")
                .HasColumnType("jsonb")
                .HasColumnName("history");
            entity.Property(e => e.LockedAt).HasColumnName("locked_at");
            entity.Property(e => e.LockedBy).HasColumnName("locked_by");
            entity.Property(e => e.MonthStart).HasColumnName("month_start");
            entity.Property(e => e.PropertyId).HasColumnName("property_id");
            entity.Property(e => e.Status)
                .HasDefaultValueSql("'open'::text")
                .HasColumnName("status");
            entity.Property(e => e.UnlockReason).HasColumnName("unlock_reason");

            entity.HasOne(d => d.LockedByNavigation).WithMany(p => p.BillingPeriods)
                .HasForeignKey(d => d.LockedBy)
                .HasConstraintName("billing_periods_locked_by_fkey");

            entity.HasOne(d => d.Property).WithMany(p => p.BillingPeriods)
                .HasForeignKey(d => d.PropertyId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("billing_periods_property_id_fkey");
        });

        modelBuilder.Entity<Booking>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("bookings_pkey");

            entity.ToTable("bookings", "smartrent", tb => tb.HasComment("Yêu cầu, lịch xem, giữ chỗ và đề nghị của khách, phân biệt bằng kind."));

            entity.HasIndex(e => e.Code, "bookings_code_key").IsUnique();

            entity.HasIndex(e => new { e.UserId, e.RoomId }, "bookings_one_open_viewing")
                .IsUnique()
                .HasFilter("((kind = 'viewing'::text) AND (status <> ALL (ARRAY['converted'::text, 'rejected'::text, 'cancelled'::text])))");

            entity.HasIndex(e => new { e.Kind, e.Status, e.PreferredViewingAt }, "bookings_queue_idx");

            entity.Property(e => e.Id)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("id");
            entity.Property(e => e.Appointments)
                .HasDefaultValueSql("'[]'::jsonb")
                .HasColumnType("jsonb")
                .HasColumnName("appointments");
            entity.Property(e => e.Changes)
                .HasDefaultValueSql("'{}'::jsonb")
                .HasColumnType("jsonb")
                .HasColumnName("changes");
            entity.Property(e => e.Code).HasColumnName("code");
            entity.Property(e => e.ContactName).HasColumnName("contact_name");
            entity.Property(e => e.ContractId).HasColumnName("contract_id");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("now()").ValueGeneratedOnAdd().HasColumnName("created_at");
            entity.Property(e => e.DecisionNotes).HasColumnName("decision_notes");
            entity.Property(e => e.DesiredOn).HasColumnName("desired_on");
            entity.Property(e => e.Email).HasColumnName("email");
            entity.Property(e => e.History)
                .HasDefaultValueSql("'[]'::jsonb")
                .HasColumnType("jsonb")
                .HasColumnName("history");
            entity.Property(e => e.HoldExpiresAt).HasColumnName("hold_expires_at");
            entity.Property(e => e.HoldFrom).HasColumnName("hold_from");
            entity.Property(e => e.HoldReason).HasColumnName("hold_reason");
            entity.Property(e => e.HoldStatus).HasColumnName("hold_status");
            entity.Property(e => e.HoldTo).HasColumnName("hold_to");
            entity.Property(e => e.Kind)
                .HasDefaultValueSql("'viewing'::text")
                .HasColumnName("kind");
            entity.Property(e => e.Message).HasColumnName("message");
            entity.Property(e => e.Occupants).HasColumnName("occupants");
            entity.Property(e => e.Phone).HasColumnName("phone");
            entity.Property(e => e.PreferredViewingAt).HasColumnName("preferred_viewing_at");
            entity.Property(e => e.ReviewedAt).HasColumnName("reviewed_at");
            entity.Property(e => e.ReviewedBy).HasColumnName("reviewed_by");
            entity.Property(e => e.RoomId).HasColumnName("room_id");
            entity.Property(e => e.Status)
                .HasDefaultValueSql("'new'::text")
                .HasColumnName("status");
            entity.Property(e => e.UpdatedAt)
                .HasDefaultValueSql("now()").ValueGeneratedOnAdd().HasColumnName("updated_at");
            entity.Property(e => e.UserId).HasColumnName("user_id");

            entity.HasOne(d => d.Contract).WithMany(p => p.Bookings)
                .HasForeignKey(d => d.ContractId)
                .HasConstraintName("bookings_contract_id_fkey");

            entity.HasOne(d => d.ReviewedByNavigation).WithMany(p => p.BookingReviewedByNavigations)
                .HasForeignKey(d => d.ReviewedBy)
                .HasConstraintName("bookings_reviewed_by_fkey");

            entity.HasOne(d => d.Room).WithMany(p => p.Bookings)
                .HasForeignKey(d => d.RoomId)
                .HasConstraintName("bookings_room_id_fkey");

            entity.HasOne(d => d.User).WithMany(p => p.BookingUsers)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("bookings_user_id_fkey");
        });

        modelBuilder.Entity<Contract>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("contracts_pkey");

            entity.ToTable("contracts", "smartrent", tb => tb.HasComment("Một hồ sơ thuê và hợp đồng; chứa gia hạn, bản ký, người ở cùng, bàn giao."));

            entity.HasIndex(e => e.BookingId, "contracts_booking_id_key").IsUnique();

            entity.HasIndex(e => e.Code, "contracts_code_key").IsUnique();

            entity.HasIndex(e => new { e.UserId, e.Status }, "contracts_customer_idx");

            entity.HasIndex(e => e.EndsOn, "contracts_expiry_idx").HasFilter("(status = 'active'::text)");

            entity.Property(e => e.Id)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("id");
            entity.Property(e => e.ArchivedAt).HasColumnName("archived_at");
            entity.Property(e => e.Attachments)
                .HasDefaultValueSql("'[]'::jsonb")
                .HasColumnType("jsonb")
                .HasColumnName("attachments");
            entity.Property(e => e.BookingId).HasColumnName("booking_id");
            entity.Property(e => e.CheckinHandover)
                .HasDefaultValueSql("'{}'::jsonb")
                .HasColumnType("jsonb")
                .HasColumnName("checkin_handover");
            entity.Property(e => e.CheckoutHandover)
                .HasDefaultValueSql("'{}'::jsonb")
                .HasColumnType("jsonb")
                .HasColumnName("checkout_handover");
            entity.Property(e => e.CheckoutSummary)
                .HasDefaultValueSql("'{}'::jsonb")
                .HasColumnType("jsonb")
                .HasColumnName("checkout_summary");
            entity.Property(e => e.Code).HasColumnName("code");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("now()").ValueGeneratedOnAdd().HasColumnName("created_at");
            entity.Property(e => e.EndedReason).HasColumnName("ended_reason");
            entity.Property(e => e.EndsOn).HasColumnName("ends_on");
            entity.Property(e => e.FinalReadings)
                .HasDefaultValueSql("'{}'::jsonb")
                .HasColumnType("jsonb")
                .HasColumnName("final_readings");
            entity.Property(e => e.InitialReadings)
                .HasDefaultValueSql("'{}'::jsonb")
                .HasColumnType("jsonb")
                .HasColumnName("initial_readings");
            entity.Property(e => e.MoveInOn).HasColumnName("move_in_on");
            entity.Property(e => e.MoveOutOn).HasColumnName("move_out_on");
            entity.Property(e => e.Occupants)
                .HasDefaultValueSql("'[]'::jsonb")
                .HasColumnType("jsonb")
                .HasColumnName("occupants");
            entity.Property(e => e.OnboardingGaps)
                .HasDefaultValueSql("'[]'::jsonb")
                .HasColumnType("jsonb")
                .HasColumnName("onboarding_gaps");
            entity.Property(e => e.OnboardingMode)
                .HasDefaultValueSql("'new'::text")
                .HasColumnName("onboarding_mode");
            entity.Property(e => e.RemainingDebtReason).HasColumnName("remaining_debt_reason");
            entity.Property(e => e.RequiredDeposit)
                .HasPrecision(16)
                .HasColumnName("required_deposit");
            entity.Property(e => e.RoomId).HasColumnName("room_id");
            entity.Property(e => e.StartsOn).HasColumnName("starts_on");
            entity.Property(e => e.Status)
                .HasDefaultValueSql("'active'::text")
                .HasColumnName("status");
            entity.Property(e => e.UpdatedAt)
                .HasDefaultValueSql("now()").ValueGeneratedOnAdd().HasColumnName("updated_at");
            entity.Property(e => e.UserId).HasColumnName("user_id");
            entity.Property(e => e.Versions)
                .HasDefaultValueSql("'[]'::jsonb")
                .HasColumnType("jsonb")
                .HasColumnName("versions");

            entity.HasOne(d => d.Booking).WithOne(p => p.ContractNavigation)
                .HasForeignKey<Contract>(d => d.BookingId)
                .HasConstraintName("contracts_booking_id_fkey");

            entity.HasOne(d => d.Room).WithMany(p => p.Contracts)
                .HasForeignKey(d => d.RoomId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("contracts_room_id_fkey");

            entity.HasOne(d => d.User).WithMany(p => p.Contracts)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("contracts_user_id_fkey");
        });

        modelBuilder.Entity<File>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("files_pkey");

            entity.ToTable("files", "smartrent", tb => tb.HasComment("Metadata tệp dùng chung; nội dung nhị phân ở storage."));

            entity.HasIndex(e => e.StorageKey, "files_storage_key_key").IsUnique();

            entity.Property(e => e.Id)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("id");
            entity.Property(e => e.ByteSize).HasColumnName("byte_size");
            entity.Property(e => e.ContentType).HasColumnName("content_type");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("now()").ValueGeneratedOnAdd().HasColumnName("created_at");
            entity.Property(e => e.FileName).HasColumnName("file_name");
            entity.Property(e => e.Purpose).HasColumnName("purpose");
            entity.Property(e => e.ScanStatus)
                .HasDefaultValueSql("'pending'::text")
                .HasColumnName("scan_status");
            entity.Property(e => e.Sha256).HasColumnName("sha256");
            entity.Property(e => e.StorageKey).HasColumnName("storage_key");
            entity.Property(e => e.UploadedBy).HasColumnName("uploaded_by");
            entity.Property(e => e.Visibility)
                .HasDefaultValueSql("'private'::text")
                .HasColumnName("visibility");

            entity.HasOne(d => d.UploadedByNavigation).WithMany(p => p.Files)
                .HasForeignKey(d => d.UploadedBy)
                .HasConstraintName("files_uploaded_by_fkey");
        });

        modelBuilder.Entity<Invoice>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("invoices_pkey");

            entity.ToTable("invoices", "smartrent", tb => tb.HasComment("Hóa đơn cùng chỉ số điện nước, lịch sử sửa số và toàn bộ dòng tính tiền."));

            entity.HasIndex(e => e.Code, "invoices_code_key").IsUnique();

            entity.HasIndex(e => new { e.Status, e.DueOn }, "invoices_due_idx");

            entity.HasIndex(e => e.IdempotencyKey, "invoices_idempotency_key_key").IsUnique();

            entity.HasIndex(e => e.ContractId, "invoices_one_final")
                .IsUnique()
                .HasFilter("((kind = 'final'::text) AND (status <> 'void'::text))");

            entity.HasIndex(e => new { e.ContractId, e.PeriodId }, "invoices_one_month")
                .IsUnique()
                .HasFilter("((kind = 'periodic'::text) AND (status <> 'void'::text))");

            entity.HasIndex(e => new { e.PeriodId, e.Status }, "invoices_period_idx");

            entity.Property(e => e.Id)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("id");
            entity.Property(e => e.AdjustsInvoiceId).HasColumnName("adjusts_invoice_id");
            entity.Property(e => e.Code).HasColumnName("code");
            entity.Property(e => e.ContractId).HasColumnName("contract_id");
            entity.Property(e => e.CorrectionReason).HasColumnName("correction_reason");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("now()").ValueGeneratedOnAdd().HasColumnName("created_at");
            entity.Property(e => e.CustomerSnapshot)
                .HasDefaultValueSql("'{}'::jsonb")
                .HasColumnType("jsonb")
                .HasColumnName("customer_snapshot");
            entity.Property(e => e.DueOn).HasColumnName("due_on");
            entity.Property(e => e.ElectricityEnd)
                .HasPrecision(16, 3)
                .HasColumnName("electricity_end");
            entity.Property(e => e.ElectricityFromAt).HasColumnName("electricity_from_at");
            entity.Property(e => e.ElectricityStart)
                .HasPrecision(16, 3)
                .HasColumnName("electricity_start");
            entity.Property(e => e.ElectricityToAt).HasColumnName("electricity_to_at");
            entity.Property(e => e.IdempotencyKey).HasColumnName("idempotency_key");
            entity.Property(e => e.IssuedAt).HasColumnName("issued_at");
            entity.Property(e => e.IssuedBy).HasColumnName("issued_by");
            entity.Property(e => e.IssuedOn).HasColumnName("issued_on");
            entity.Property(e => e.Kind)
                .HasDefaultValueSql("'periodic'::text")
                .HasColumnName("kind");
            entity.Property(e => e.Lines)
                .HasDefaultValueSql("'[]'::jsonb")
                .HasColumnType("jsonb")
                .HasColumnName("lines");
            entity.Property(e => e.MeteredOnly).HasColumnName("metered_only");
            entity.Property(e => e.Notes).HasColumnName("notes");
            entity.Property(e => e.PeriodId).HasColumnName("period_id");
            entity.Property(e => e.ReadingsHistory)
                .HasDefaultValueSql("'[]'::jsonb")
                .HasColumnType("jsonb")
                .HasColumnName("readings_history");
            entity.Property(e => e.RequestHash).HasColumnName("request_hash");
            entity.Property(e => e.ServiceFrom).HasColumnName("service_from");
            entity.Property(e => e.ServiceTo).HasColumnName("service_to");
            entity.Property(e => e.Status)
                .HasDefaultValueSql("'draft'::text")
                .HasColumnName("status");
            entity.Property(e => e.TotalAmount)
                .HasPrecision(16)
                .HasComputedColumnSql("smartrent.invoice_total(lines)", true)
                .HasColumnName("total_amount");
            entity.Property(e => e.VoidReason).HasColumnName("void_reason");
            entity.Property(e => e.VoidedAt).HasColumnName("voided_at");
            entity.Property(e => e.WaterEnd)
                .HasPrecision(16, 3)
                .HasColumnName("water_end");
            entity.Property(e => e.WaterFromAt).HasColumnName("water_from_at");
            entity.Property(e => e.WaterStart)
                .HasPrecision(16, 3)
                .HasColumnName("water_start");
            entity.Property(e => e.WaterToAt).HasColumnName("water_to_at");

            entity.HasOne(d => d.AdjustsInvoice).WithMany(p => p.InverseAdjustsInvoice)
                .HasForeignKey(d => d.AdjustsInvoiceId)
                .HasConstraintName("invoices_adjusts_invoice_id_fkey");

            entity.HasOne(d => d.Contract).WithOne(p => p.Invoice)
                .HasForeignKey<Invoice>(d => d.ContractId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("invoices_contract_id_fkey");

            entity.HasOne(d => d.IssuedByNavigation).WithMany(p => p.Invoices)
                .HasForeignKey(d => d.IssuedBy)
                .HasConstraintName("invoices_issued_by_fkey");

            entity.HasOne(d => d.Period).WithMany(p => p.Invoices)
                .HasForeignKey(d => d.PeriodId)
                .HasConstraintName("invoices_period_id_fkey");
        });

        modelBuilder.Entity<Notification>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("notifications_pkey");

            entity.ToTable("notifications", "smartrent", tb => tb.HasComment("Thông báo và trạng thái đọc theo tài khoản."));

            entity.HasIndex(e => new { e.RecipientId, e.EventKey }, "notifications_recipient_id_event_key_key").IsUnique();

            entity.HasIndex(e => new { e.RecipientId, e.CreatedAt }, "notifications_recipient_idx").IsDescending(false, true);

            entity.Property(e => e.Id)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("id");
            entity.Property(e => e.Body).HasColumnName("body");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("now()").ValueGeneratedOnAdd().HasColumnName("created_at");
            entity.Property(e => e.EventKey).HasColumnName("event_key");
            entity.Property(e => e.ReadAt).HasColumnName("read_at");
            entity.Property(e => e.RecipientId).HasColumnName("recipient_id");
            entity.Property(e => e.Title).HasColumnName("title");
            entity.Property(e => e.Url).HasColumnName("url");

            entity.HasOne(d => d.Recipient).WithMany(p => p.Notifications)
                .HasForeignKey(d => d.RecipientId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("notifications_recipient_id_fkey");
        });

        modelBuilder.Entity<Payment>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("payments_pkey");

            entity.ToTable("payments", "smartrent", tb => tb.HasComment("Sổ thanh toán và cọc; phân bổ vào hóa đơn nằm trong JSONB."));

            entity.HasIndex(e => e.Code, "payments_code_key").IsUnique();

            entity.HasIndex(e => new { e.ContractId, e.Kind }, "payments_contract_idx");

            entity.HasIndex(e => new { e.UserId, e.Status, e.ReceivedAt }, "payments_customer_idx");

            entity.HasIndex(e => e.ReversesId, "payments_reversal_idx");

            entity.HasIndex(e => new { e.UserId, e.IdempotencyKey }, "payments_user_id_idempotency_key_key").IsUnique();

            entity.Property(e => e.Id)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("id");
            entity.Property(e => e.Allocations)
                .HasDefaultValueSql("'[]'::jsonb")
                .HasColumnType("jsonb")
                .HasColumnName("allocations");
            entity.Property(e => e.Amount)
                .HasPrecision(16)
                .HasColumnName("amount");
            entity.Property(e => e.Code).HasColumnName("code");
            entity.Property(e => e.ConfirmedAt).HasColumnName("confirmed_at");
            entity.Property(e => e.ConfirmedBy).HasColumnName("confirmed_by");
            entity.Property(e => e.ContractId).HasColumnName("contract_id");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("now()").ValueGeneratedOnAdd().HasColumnName("created_at");
            entity.Property(e => e.ExternalReference).HasColumnName("external_reference");
            entity.Property(e => e.IdempotencyKey).HasColumnName("idempotency_key");
            entity.Property(e => e.IntendedInvoiceId).HasColumnName("intended_invoice_id");
            entity.Property(e => e.Kind)
                .HasDefaultValueSql("'receipt'::text")
                .HasColumnName("kind");
            entity.Property(e => e.Method).HasColumnName("method");
            entity.Property(e => e.Notes).HasColumnName("notes");
            entity.Property(e => e.ProofFileIds)
                .HasDefaultValueSql("'[]'::jsonb")
                .HasColumnType("jsonb")
                .HasColumnName("proof_file_ids");
            entity.Property(e => e.Reason).HasColumnName("reason");
            entity.Property(e => e.ReceivedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("received_at");
            entity.Property(e => e.RequestHash).HasColumnName("request_hash");
            entity.Property(e => e.ReversesId).HasColumnName("reverses_id");
            entity.Property(e => e.Status)
                .HasDefaultValueSql("'pending'::text")
                .HasColumnName("status");
            entity.Property(e => e.SubmittedBy).HasColumnName("submitted_by");
            entity.Property(e => e.UserId).HasColumnName("user_id");

            entity.HasOne(d => d.ConfirmedByNavigation).WithMany(p => p.PaymentConfirmedByNavigations)
                .HasForeignKey(d => d.ConfirmedBy)
                .HasConstraintName("payments_confirmed_by_fkey");

            entity.HasOne(d => d.Contract).WithMany(p => p.Payments)
                .HasForeignKey(d => d.ContractId)
                .HasConstraintName("payments_contract_id_fkey");

            entity.HasOne(d => d.IntendedInvoice).WithMany(p => p.Payments)
                .HasForeignKey(d => d.IntendedInvoiceId)
                .HasConstraintName("payments_intended_invoice_id_fkey");

            entity.HasOne(d => d.Reverses).WithMany(p => p.InverseReverses)
                .HasForeignKey(d => d.ReversesId)
                .HasConstraintName("payments_reverses_id_fkey");

            entity.HasOne(d => d.SubmittedByNavigation).WithMany(p => p.PaymentSubmittedByNavigations)
                .HasForeignKey(d => d.SubmittedBy)
                .HasConstraintName("payments_submitted_by_fkey");

            entity.HasOne(d => d.User).WithMany(p => p.PaymentUsers)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("payments_user_id_fkey");
        });

        modelBuilder.Entity<Property>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("properties_pkey");

            entity.ToTable("properties", "smartrent", tb => tb.HasComment("Cơ sở, danh mục tiện ích và bảng giá mặc định dạng JSONB."));

            entity.HasIndex(e => e.Code, "properties_code_key").IsUnique();

            entity.Property(e => e.Id)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("id");
            entity.Property(e => e.AddressLine).HasColumnName("address_line");
            entity.Property(e => e.AmenityOptions)
                .HasDefaultValueSql("'[]'::jsonb")
                .HasColumnType("jsonb")
                .HasColumnName("amenity_options");
            entity.Property(e => e.Code).HasColumnName("code");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("now()").ValueGeneratedOnAdd().HasColumnName("created_at");
            entity.Property(e => e.Description).HasColumnName("description");
            entity.Property(e => e.DueAfterDays)
                .HasDefaultValue((short)5)
                .HasColumnName("due_after_days");
            entity.Property(e => e.InactiveReason).HasColumnName("inactive_reason");
            entity.Property(e => e.InvoiceDay)
                .HasDefaultValue((short)1)
                .HasColumnName("invoice_day");
            entity.Property(e => e.IsActive)
                .HasDefaultValue(true)
                .HasColumnName("is_active");
            entity.Property(e => e.Locality).HasColumnName("locality");
            entity.Property(e => e.Name).HasColumnName("name");
            entity.Property(e => e.ProrationPolicy)
                .HasDefaultValueSql("'actual_days'::text")
                .HasColumnName("proration_policy");
            entity.Property(e => e.Province).HasColumnName("province");
            entity.Property(e => e.Rates)
                .HasDefaultValueSql("'[]'::jsonb")
                .HasColumnType("jsonb")
                .HasColumnName("rates");
            entity.Property(e => e.UpdatedAt)
                .HasDefaultValueSql("now()").ValueGeneratedOnAdd().HasColumnName("updated_at");
        });

        modelBuilder.Entity<Room>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("rooms_pkey");

            entity.ToTable("rooms", "smartrent", tb => tb.HasComment("Phòng cùng tin đăng, tiện ích, ảnh, giá riêng và lịch sử trạng thái."));

            entity.HasIndex(e => e.Amenities, "rooms_amenities_idx").HasMethod("gin");

            entity.HasIndex(e => e.ListingSlug, "rooms_listing_slug_key").IsUnique();

            entity.HasIndex(e => new { e.PropertyId, e.OperatingStatus, e.ListingStatus }, "rooms_search_idx");

            entity.Property(e => e.Id)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("id");
            entity.Property(e => e.Amenities)
                .HasDefaultValueSql("'[]'::jsonb")
                .HasColumnType("jsonb")
                .HasColumnName("amenities");
            entity.Property(e => e.AreaM2)
                .HasPrecision(7, 2)
                .HasColumnName("area_m2");
            entity.Property(e => e.Capacity).HasColumnName("capacity");
            entity.Property(e => e.Code).HasColumnName("code");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("now()").ValueGeneratedOnAdd().HasColumnName("created_at");
            entity.Property(e => e.Description).HasColumnName("description");
            entity.Property(e => e.FloorLabel).HasColumnName("floor_label");
            entity.Property(e => e.Images)
                .HasDefaultValueSql("'[]'::jsonb")
                .HasColumnType("jsonb")
                .HasColumnName("images");
            entity.Property(e => e.ListingDescription).HasColumnName("listing_description");
            entity.Property(e => e.ListingSlug).HasColumnName("listing_slug");
            entity.Property(e => e.ListingStatus)
                .HasDefaultValueSql("'hidden'::text")
                .HasColumnName("listing_status");
            entity.Property(e => e.ListingTitle).HasColumnName("listing_title");
            entity.Property(e => e.Name).HasColumnName("name");
            entity.Property(e => e.OperatingStatus)
                .HasDefaultValueSql("'available'::text")
                .HasColumnName("operating_status");
            entity.Property(e => e.PropertyId).HasColumnName("property_id");
            entity.Property(e => e.PublishedAt).HasColumnName("published_at");
            entity.Property(e => e.Rates)
                .HasDefaultValueSql("'[]'::jsonb")
                .HasColumnType("jsonb")
                .HasColumnName("rates");
            entity.Property(e => e.RequiredDeposit)
                .HasPrecision(16)
                .HasColumnName("required_deposit");
            entity.Property(e => e.RoomTypeCode)
                .HasDefaultValueSql("'STANDARD'::text")
                .HasColumnName("room_type_code");
            entity.Property(e => e.RoomTypeName)
                .HasDefaultValueSql("'Phòng tiêu chuẩn'::text")
                .HasColumnName("room_type_name");
            entity.Property(e => e.RulesText).HasColumnName("rules_text");
            entity.Property(e => e.StatusHistory)
                .HasDefaultValueSql("'[]'::jsonb")
                .HasColumnType("jsonb")
                .HasColumnName("status_history");
            entity.Property(e => e.StatusReason).HasColumnName("status_reason");
            entity.Property(e => e.UpdatedAt)
                .HasDefaultValueSql("now()").ValueGeneratedOnAdd().HasColumnName("updated_at");
            entity.Property(e => e.VideoUrl).HasColumnName("video_url");

            entity.HasOne(d => d.Property).WithMany(p => p.Rooms)
                .HasForeignKey(d => d.PropertyId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("rooms_property_id_fkey");
        });

        modelBuilder.Entity<Setting>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("settings_pkey");

            entity.ToTable("settings", "smartrent", tb => tb.HasComment("Cấu hình thương hiệu, lịch nhắc và ngân hàng mặc định."));

            entity.Property(e => e.Id)
                .HasDefaultValue((short)1)
                .HasColumnName("id");
            entity.Property(e => e.BankAccountName).HasColumnName("bank_account_name");
            entity.Property(e => e.BankAccountNumber).HasColumnName("bank_account_number");
            entity.Property(e => e.BankName).HasColumnName("bank_name");
            entity.Property(e => e.BusinessName)
                .HasDefaultValueSql("'SmartRent'::text")
                .HasColumnName("business_name");
            entity.Property(e => e.InvoiceCreateDay)
                .HasDefaultValue((short)28)
                .HasColumnName("invoice_create_day");
            entity.Property(e => e.MeterReadingDay)
                .HasDefaultValue((short)25)
                .HasColumnName("meter_reading_day");
            entity.Property(e => e.ReminderEnabled)
                .HasDefaultValue(true)
                .HasColumnName("reminder_enabled");
            entity.Property(e => e.UpdatedAt)
                .HasDefaultValueSql("now()").ValueGeneratedOnAdd().HasColumnName("updated_at");
            entity.Property(e => e.UpdatedBy).HasColumnName("updated_by");

            entity.HasOne(d => d.UpdatedByNavigation).WithMany(p => p.Settings)
                .HasForeignKey(d => d.UpdatedBy)
                .HasConstraintName("settings_updated_by_fkey");
        });

        modelBuilder.Entity<Ticket>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("tickets_pkey");

            entity.ToTable("tickets", "smartrent", tb => tb.HasComment("Sự cố cùng loại, tệp, hội thoại và tiến độ trong một bảng."));

            entity.HasIndex(e => e.Code, "tickets_code_key").IsUnique();

            entity.HasIndex(e => new { e.ReportedBy, e.ContractId }, "tickets_customer_idx");

            entity.HasIndex(e => new { e.Status, e.DueAt }, "tickets_inbox_idx");

            entity.Property(e => e.Id)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("id");
            entity.Property(e => e.AssignedTo).HasColumnName("assigned_to");
            entity.Property(e => e.AttachmentFileIds)
                .HasDefaultValueSql("'[]'::jsonb")
                .HasColumnType("jsonb")
                .HasColumnName("attachment_file_ids");
            entity.Property(e => e.CategoryCode).HasColumnName("category_code");
            entity.Property(e => e.ClosedAt).HasColumnName("closed_at");
            entity.Property(e => e.Code).HasColumnName("code");
            entity.Property(e => e.ContractId).HasColumnName("contract_id");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("now()").ValueGeneratedOnAdd().HasColumnName("created_at");
            entity.Property(e => e.Description).HasColumnName("description");
            entity.Property(e => e.DueAt).HasColumnName("due_at");
            entity.Property(e => e.History)
                .HasDefaultValueSql("'[]'::jsonb")
                .HasColumnType("jsonb")
                .HasColumnName("history");
            entity.Property(e => e.Messages)
                .HasDefaultValueSql("'[]'::jsonb")
                .HasColumnType("jsonb")
                .HasColumnName("messages");
            entity.Property(e => e.Priority)
                .HasDefaultValueSql("'normal'::text")
                .HasColumnName("priority");
            entity.Property(e => e.ReportedBy).HasColumnName("reported_by");
            entity.Property(e => e.ResolutionNotes).HasColumnName("resolution_notes");
            entity.Property(e => e.ResolvedAt).HasColumnName("resolved_at");
            entity.Property(e => e.RoomId).HasColumnName("room_id");
            entity.Property(e => e.Status)
                .HasDefaultValueSql("'new'::text")
                .HasColumnName("status");
            entity.Property(e => e.Title).HasColumnName("title");
            entity.Property(e => e.UpdatedAt)
                .HasDefaultValueSql("now()").ValueGeneratedOnAdd().HasColumnName("updated_at");
            entity.Property(e => e.WaitingReason).HasColumnName("waiting_reason");

            entity.HasOne(d => d.AssignedToNavigation).WithMany(p => p.TicketAssignedToNavigations)
                .HasForeignKey(d => d.AssignedTo)
                .HasConstraintName("tickets_assigned_to_fkey");

            entity.HasOne(d => d.Contract).WithMany(p => p.Tickets)
                .HasForeignKey(d => d.ContractId)
                .HasConstraintName("tickets_contract_id_fkey");

            entity.HasOne(d => d.ReportedByNavigation).WithMany(p => p.TicketReportedByNavigations)
                .HasForeignKey(d => d.ReportedBy)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("tickets_reported_by_fkey");

            entity.HasOne(d => d.Room).WithMany(p => p.Tickets)
                .HasForeignKey(d => d.RoomId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("tickets_room_id_fkey");
        });

        modelBuilder.Entity<User>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("users_pkey");

            entity.ToTable("users", "smartrent", tb => tb.HasComment("Tài khoản và toàn bộ hồ sơ khách, kể cả khách chưa kích hoạt đăng nhập."));

            entity.HasIndex(e => e.Code, "users_code_key").IsUnique();

            entity.HasIndex(e => e.Role, "users_one_admin")
                .IsUnique()
                .HasFilter("((role)::text = 'admin'::text)");

            entity.Property(e => e.Id)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("id");
            entity.Property(e => e.AcceptedTermsAt).HasColumnName("accepted_terms_at");
            entity.Property(e => e.AddressLine).HasColumnName("address_line");
            entity.Property(e => e.AvatarFileId).HasColumnName("avatar_file_id");
            entity.Property(e => e.Code).HasColumnName("code");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("now()").ValueGeneratedOnAdd().HasColumnName("created_at");
            entity.Property(e => e.DateOfBirth).HasColumnName("date_of_birth");
            entity.Property(e => e.DisplayName).HasColumnName("display_name");
            entity.Property(e => e.Email).HasColumnName("email");
            entity.Property(e => e.EmailVerifiedAt).HasColumnName("email_verified_at");
            entity.Property(e => e.EmergencyContactName).HasColumnName("emergency_contact_name");
            entity.Property(e => e.EmergencyContactPhone).HasColumnName("emergency_contact_phone");
            entity.Property(e => e.FailedLoginCount).ValueGeneratedOnAdd().HasColumnName("failed_login_count");
            entity.Property(e => e.IdentityDocuments)
                .HasDefaultValueSql("'[]'::jsonb")
                .HasColumnType("jsonb")
                .HasColumnName("identity_documents");
            entity.Property(e => e.IsActive)
                .HasDefaultValue(true)
                .HasColumnName("is_active");
            entity.Property(e => e.LastLoginAt).ValueGeneratedOnAdd().HasColumnName("last_login_at");
            entity.Property(e => e.Locality).HasColumnName("locality");
            entity.Property(e => e.LockedUntil).ValueGeneratedOnAdd().HasColumnName("locked_until");
            entity.Property(e => e.LoginEnabled).HasColumnName("login_enabled");
            entity.Property(e => e.Notes).HasColumnName("notes");
            entity.Property(e => e.PasswordHash).HasColumnName("password_hash");
            entity.Property(e => e.Phone).HasColumnName("phone");
            entity.Property(e => e.Province).HasColumnName("province");
            entity.Property(e => e.Role)
                .HasMaxLength(5)
                .HasDefaultValueSql("'user'::character varying").ValueGeneratedOnAdd().HasColumnName("role");
            entity.Property(e => e.SecurityStamp)
                .HasDefaultValueSql("gen_random_uuid()").ValueGeneratedOnAdd().HasColumnName("security_stamp");
            entity.Property(e => e.UpdatedAt)
                .HasDefaultValueSql("now()").ValueGeneratedOnAdd().HasColumnName("updated_at");

            entity.HasOne(d => d.AvatarFile).WithMany(p => p.Users)
                .HasForeignKey(d => d.AvatarFileId)
                .HasConstraintName("users_avatar_file_id_fkey");
        });

        modelBuilder.Entity<VDepositBalance>(entity =>
        {
            entity
                .HasNoKey()
                .ToView("v_deposit_balances", "smartrent");

            entity.Property(e => e.ContractId).HasColumnName("contract_id");
            entity.Property(e => e.Held)
                .HasPrecision(16)
                .HasColumnName("held");
            entity.Property(e => e.OffsetAmount)
                .HasPrecision(16)
                .HasColumnName("offset_amount");
            entity.Property(e => e.Received)
                .HasPrecision(16)
                .HasColumnName("received");
            entity.Property(e => e.Refunded)
                .HasPrecision(16)
                .HasColumnName("refunded");
        });

        modelBuilder.Entity<VInvoiceBalance>(entity =>
        {
            entity
                .HasNoKey()
                .ToView("v_invoice_balances", "smartrent");

            entity.Property(e => e.ContractId).HasColumnName("contract_id");
            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.IsOverdue).HasColumnName("is_overdue");
            entity.Property(e => e.OutstandingAmount)
                .HasPrecision(16)
                .HasColumnName("outstanding_amount");
            entity.Property(e => e.PaidAmount)
                .HasPrecision(16)
                .HasColumnName("paid_amount");
            entity.Property(e => e.PaymentStatus).HasColumnName("payment_status");
            entity.Property(e => e.ReceivableAmount)
                .HasPrecision(16)
                .HasColumnName("receivable_amount");
            entity.Property(e => e.Status).HasColumnName("status");
            entity.Property(e => e.TotalAmount)
                .HasPrecision(16)
                .HasColumnName("total_amount");
        });

        modelBuilder.Entity<VPublicRoom>(entity =>
        {
            entity
                .HasNoKey()
                .ToView("v_public_rooms", "smartrent");

            entity.Property(e => e.Amenities)
                .HasColumnType("jsonb")
                .HasColumnName("amenities");
            entity.Property(e => e.AreaM2)
                .HasPrecision(7, 2)
                .HasColumnName("area_m2");
            entity.Property(e => e.Capacity).HasColumnName("capacity");
            entity.Property(e => e.Code).HasColumnName("code");
            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.Images)
                .HasColumnType("jsonb")
                .HasColumnName("images");
            entity.Property(e => e.ListingDescription).HasColumnName("listing_description");
            entity.Property(e => e.ListingSlug).HasColumnName("listing_slug");
            entity.Property(e => e.ListingTitle).HasColumnName("listing_title");
            entity.Property(e => e.Name).HasColumnName("name");
            entity.Property(e => e.PropertyId).HasColumnName("property_id");
            entity.Property(e => e.Rates)
                .HasColumnType("jsonb")
                .HasColumnName("rates");
            entity.Property(e => e.RequiredDeposit)
                .HasPrecision(16)
                .HasColumnName("required_deposit");
            entity.Property(e => e.RoomTypeCode).HasColumnName("room_type_code");
            entity.Property(e => e.RoomTypeName).HasColumnName("room_type_name");
            entity.Property(e => e.RulesText).HasColumnName("rules_text");
            entity.Property(e => e.VideoUrl).HasColumnName("video_url");
        });

        modelBuilder.Entity<VRoomOccupancy>(entity =>
        {
            entity
                .HasNoKey()
                .ToView("v_room_occupancy", "smartrent");

            entity.Property(e => e.Amenities)
                .HasColumnType("jsonb")
                .HasColumnName("amenities");
            entity.Property(e => e.AreaM2)
                .HasPrecision(7, 2)
                .HasColumnName("area_m2");
            entity.Property(e => e.Capacity).HasColumnName("capacity");
            entity.Property(e => e.Code).HasColumnName("code");
            entity.Property(e => e.CreatedAt).HasColumnName("created_at");
            entity.Property(e => e.Description).HasColumnName("description");
            entity.Property(e => e.FloorLabel).HasColumnName("floor_label");
            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.Images)
                .HasColumnType("jsonb")
                .HasColumnName("images");
            entity.Property(e => e.ListingDescription).HasColumnName("listing_description");
            entity.Property(e => e.ListingSlug).HasColumnName("listing_slug");
            entity.Property(e => e.ListingStatus).HasColumnName("listing_status");
            entity.Property(e => e.ListingTitle).HasColumnName("listing_title");
            entity.Property(e => e.Name).HasColumnName("name");
            entity.Property(e => e.OccupancyStatus).HasColumnName("occupancy_status");
            entity.Property(e => e.OperatingStatus).HasColumnName("operating_status");
            entity.Property(e => e.PropertyId).HasColumnName("property_id");
            entity.Property(e => e.PublishedAt).HasColumnName("published_at");
            entity.Property(e => e.Rates)
                .HasColumnType("jsonb")
                .HasColumnName("rates");
            entity.Property(e => e.RequiredDeposit)
                .HasPrecision(16)
                .HasColumnName("required_deposit");
            entity.Property(e => e.RoomTypeCode).HasColumnName("room_type_code");
            entity.Property(e => e.RoomTypeName).HasColumnName("room_type_name");
            entity.Property(e => e.RulesText).HasColumnName("rules_text");
            entity.Property(e => e.StatusHistory)
                .HasColumnType("jsonb")
                .HasColumnName("status_history");
            entity.Property(e => e.StatusReason).HasColumnName("status_reason");
            entity.Property(e => e.UpdatedAt).HasColumnName("updated_at");
            entity.Property(e => e.VideoUrl).HasColumnName("video_url");
        });

        modelBuilder.Entity<VUserBooking>(entity =>
        {
            entity
                .HasNoKey()
                .ToView("v_user_bookings", "smartrent");

            entity.Property(e => e.Appointments)
                .HasColumnType("jsonb")
                .HasColumnName("appointments");
            entity.Property(e => e.Changes)
                .HasColumnType("jsonb")
                .HasColumnName("changes");
            entity.Property(e => e.Code).HasColumnName("code");
            entity.Property(e => e.ContactName).HasColumnName("contact_name");
            entity.Property(e => e.ContractId).HasColumnName("contract_id");
            entity.Property(e => e.CreatedAt).HasColumnName("created_at");
            entity.Property(e => e.DecisionNotes).HasColumnName("decision_notes");
            entity.Property(e => e.DesiredOn).HasColumnName("desired_on");
            entity.Property(e => e.Email).HasColumnName("email");
            entity.Property(e => e.History)
                .HasColumnType("jsonb")
                .HasColumnName("history");
            entity.Property(e => e.HoldExpiresAt).HasColumnName("hold_expires_at");
            entity.Property(e => e.HoldFrom).HasColumnName("hold_from");
            entity.Property(e => e.HoldReason).HasColumnName("hold_reason");
            entity.Property(e => e.HoldStatus).HasColumnName("hold_status");
            entity.Property(e => e.HoldTo).HasColumnName("hold_to");
            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.Kind).HasColumnName("kind");
            entity.Property(e => e.Message).HasColumnName("message");
            entity.Property(e => e.Occupants).HasColumnName("occupants");
            entity.Property(e => e.Phone).HasColumnName("phone");
            entity.Property(e => e.PreferredViewingAt).HasColumnName("preferred_viewing_at");
            entity.Property(e => e.ReviewedAt).HasColumnName("reviewed_at");
            entity.Property(e => e.ReviewedBy).HasColumnName("reviewed_by");
            entity.Property(e => e.RoomId).HasColumnName("room_id");
            entity.Property(e => e.Status).HasColumnName("status");
            entity.Property(e => e.UpdatedAt).HasColumnName("updated_at");
            entity.Property(e => e.UserId).HasColumnName("user_id");
        });

        modelBuilder.Entity<VUserContract>(entity =>
        {
            entity
                .HasNoKey()
                .ToView("v_user_contracts", "smartrent");

            entity.Property(e => e.Code).HasColumnName("code");
            entity.Property(e => e.EndsOn).HasColumnName("ends_on");
            entity.Property(e => e.FinanceVisible).HasColumnName("finance_visible");
            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.MoveInOn).HasColumnName("move_in_on");
            entity.Property(e => e.MoveOutOn).HasColumnName("move_out_on");
            entity.Property(e => e.RoomId).HasColumnName("room_id");
            entity.Property(e => e.StartsOn).HasColumnName("starts_on");
            entity.Property(e => e.Status).HasColumnName("status");
            entity.Property(e => e.UserId).HasColumnName("user_id");
        });

        modelBuilder.Entity<VUserInvoice>(entity =>
        {
            entity
                .HasNoKey()
                .ToView("v_user_invoices", "smartrent");

            entity.Property(e => e.AdjustsInvoiceId).HasColumnName("adjusts_invoice_id");
            entity.Property(e => e.Code).HasColumnName("code");
            entity.Property(e => e.ContractId).HasColumnName("contract_id");
            entity.Property(e => e.CorrectionReason).HasColumnName("correction_reason");
            entity.Property(e => e.CreatedAt).HasColumnName("created_at");
            entity.Property(e => e.CustomerSnapshot)
                .HasColumnType("jsonb")
                .HasColumnName("customer_snapshot");
            entity.Property(e => e.DueOn).HasColumnName("due_on");
            entity.Property(e => e.ElectricityEnd)
                .HasPrecision(16, 3)
                .HasColumnName("electricity_end");
            entity.Property(e => e.ElectricityFromAt).HasColumnName("electricity_from_at");
            entity.Property(e => e.ElectricityStart)
                .HasPrecision(16, 3)
                .HasColumnName("electricity_start");
            entity.Property(e => e.ElectricityToAt).HasColumnName("electricity_to_at");
            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.IdempotencyKey).HasColumnName("idempotency_key");
            entity.Property(e => e.IsOverdue).HasColumnName("is_overdue");
            entity.Property(e => e.IssuedAt).HasColumnName("issued_at");
            entity.Property(e => e.IssuedBy).HasColumnName("issued_by");
            entity.Property(e => e.IssuedOn).HasColumnName("issued_on");
            entity.Property(e => e.Kind).HasColumnName("kind");
            entity.Property(e => e.Lines)
                .HasColumnType("jsonb")
                .HasColumnName("lines");
            entity.Property(e => e.MeteredOnly).HasColumnName("metered_only");
            entity.Property(e => e.Notes).HasColumnName("notes");
            entity.Property(e => e.OutstandingAmount)
                .HasPrecision(16)
                .HasColumnName("outstanding_amount");
            entity.Property(e => e.PaidAmount)
                .HasPrecision(16)
                .HasColumnName("paid_amount");
            entity.Property(e => e.PaymentStatus).HasColumnName("payment_status");
            entity.Property(e => e.PeriodId).HasColumnName("period_id");
            entity.Property(e => e.ReadingsHistory)
                .HasColumnType("jsonb")
                .HasColumnName("readings_history");
            entity.Property(e => e.ReceivableAmount)
                .HasPrecision(16)
                .HasColumnName("receivable_amount");
            entity.Property(e => e.RequestHash).HasColumnName("request_hash");
            entity.Property(e => e.ServiceFrom).HasColumnName("service_from");
            entity.Property(e => e.ServiceTo).HasColumnName("service_to");
            entity.Property(e => e.Status).HasColumnName("status");
            entity.Property(e => e.TotalAmount)
                .HasPrecision(16)
                .HasColumnName("total_amount");
            entity.Property(e => e.VoidReason).HasColumnName("void_reason");
            entity.Property(e => e.VoidedAt).HasColumnName("voided_at");
            entity.Property(e => e.WaterEnd)
                .HasPrecision(16, 3)
                .HasColumnName("water_end");
            entity.Property(e => e.WaterFromAt).HasColumnName("water_from_at");
            entity.Property(e => e.WaterStart)
                .HasPrecision(16, 3)
                .HasColumnName("water_start");
            entity.Property(e => e.WaterToAt).HasColumnName("water_to_at");
        });

        modelBuilder.Entity<VUserNotification>(entity =>
        {
            entity
                .HasNoKey()
                .ToView("v_user_notifications", "smartrent");

            entity.Property(e => e.Body).HasColumnName("body");
            entity.Property(e => e.CreatedAt).HasColumnName("created_at");
            entity.Property(e => e.EventKey).HasColumnName("event_key");
            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.ReadAt).HasColumnName("read_at");
            entity.Property(e => e.RecipientId).HasColumnName("recipient_id");
            entity.Property(e => e.Title).HasColumnName("title");
            entity.Property(e => e.Url).HasColumnName("url");
        });

        modelBuilder.Entity<VUserTicket>(entity =>
        {
            entity
                .HasNoKey()
                .ToView("v_user_tickets", "smartrent");

            entity.Property(e => e.AttachmentFileIds)
                .HasColumnType("jsonb")
                .HasColumnName("attachment_file_ids");
            entity.Property(e => e.CategoryCode).HasColumnName("category_code");
            entity.Property(e => e.Code).HasColumnName("code");
            entity.Property(e => e.ContractId).HasColumnName("contract_id");
            entity.Property(e => e.CreatedAt).HasColumnName("created_at");
            entity.Property(e => e.Description).HasColumnName("description");
            entity.Property(e => e.DueAt).HasColumnName("due_at");
            entity.Property(e => e.History)
                .HasColumnType("jsonb")
                .HasColumnName("history");
            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.Messages)
                .HasColumnType("jsonb")
                .HasColumnName("messages");
            entity.Property(e => e.Priority).HasColumnName("priority");
            entity.Property(e => e.ReportedBy).HasColumnName("reported_by");
            entity.Property(e => e.ResolutionNotes).HasColumnName("resolution_notes");
            entity.Property(e => e.RoomId).HasColumnName("room_id");
            entity.Property(e => e.Status).HasColumnName("status");
            entity.Property(e => e.Title).HasColumnName("title");
            entity.Property(e => e.UpdatedAt).HasColumnName("updated_at");
        });
        modelBuilder.HasSequence("document_codes", "smartrent");

        OnModelCreatingPartial(modelBuilder);
    }

    partial void OnModelCreatingPartial(ModelBuilder modelBuilder);
}
