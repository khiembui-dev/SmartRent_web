using System;
using System.Collections.Generic;
using Microsoft.EntityFrameworkCore;
using SmartRent.Api.Data.Entities;

namespace SmartRent.Api.Data;

public partial class SmartRentDbContext : DbContext
{
    public SmartRentDbContext(DbContextOptions<SmartRentDbContext> options)
        : base(options)
    {
    }

    public virtual DbSet<Amenity> Amenities { get; set; }

    public virtual DbSet<ApiIdempotencyKey> ApiIdempotencyKeys { get; set; }

    public virtual DbSet<AuditLog> AuditLogs { get; set; }

    public virtual DbSet<BackupRun> BackupRuns { get; set; }

    public virtual DbSet<BankAccount> BankAccounts { get; set; }

    public virtual DbSet<BillingPeriod> BillingPeriods { get; set; }

    public virtual DbSet<BillingPeriodEvent> BillingPeriodEvents { get; set; }

    public virtual DbSet<BusinessRole> BusinessRoles { get; set; }

    public virtual DbSet<ChargeInstance> ChargeInstances { get; set; }

    public virtual DbSet<ChargeRate> ChargeRates { get; set; }

    public virtual DbSet<ChargeType> ChargeTypes { get; set; }

    public virtual DbSet<CheckoutSettlement> CheckoutSettlements { get; set; }

    public virtual DbSet<Contract> Contracts { get; set; }

    public virtual DbSet<ContractAttachment> ContractAttachments { get; set; }

    public virtual DbSet<ContractFile> ContractFiles { get; set; }

    public virtual DbSet<ContractParty> ContractParties { get; set; }

    public virtual DbSet<ContractVersion> ContractVersions { get; set; }

    public virtual DbSet<DepositEntry> DepositEntries { get; set; }

    public virtual DbSet<DocumentCounter> DocumentCounters { get; set; }

    public virtual DbSet<EmailOutbox> EmailOutboxes { get; set; }

    public virtual DbSet<Handover> Handovers { get; set; }

    public virtual DbSet<HandoverItem> HandoverItems { get; set; }

    public virtual DbSet<Invoice> Invoices { get; set; }

    public virtual DbSet<InvoiceChargeClaim> InvoiceChargeClaims { get; set; }

    public virtual DbSet<InvoiceLine> InvoiceLines { get; set; }

    public virtual DbSet<InvoiceMeterSegment> InvoiceMeterSegments { get; set; }

    public virtual DbSet<Meter> Meters { get; set; }

    public virtual DbSet<MeterReading> MeterReadings { get; set; }

    public virtual DbSet<Notification> Notifications { get; set; }

    public virtual DbSet<Organization> Organizations { get; set; }

    public virtual DbSet<OrganizationMembership> OrganizationMemberships { get; set; }

    public virtual DbSet<OrganizationSetting> OrganizationSettings { get; set; }

    public virtual DbSet<Payment> Payments { get; set; }

    public virtual DbSet<PaymentAllocation> PaymentAllocations { get; set; }

    public virtual DbSet<PaymentMethod> PaymentMethods { get; set; }

    public virtual DbSet<PaymentReversal> PaymentReversals { get; set; }

    public virtual DbSet<Permission> Permissions { get; set; }

    public virtual DbSet<Property> Properties { get; set; }

    public virtual DbSet<RentalInquiry> RentalInquiries { get; set; }

    public virtual DbSet<Role> Roles { get; set; }

    public virtual DbSet<RoleClaim> RoleClaims { get; set; }

    public virtual DbSet<Room> Rooms { get; set; }

    public virtual DbSet<RoomImage> RoomImages { get; set; }

    public virtual DbSet<RoomListing> RoomListings { get; set; }

    public virtual DbSet<RoomStatusEvent> RoomStatusEvents { get; set; }

    public virtual DbSet<RoomType> RoomTypes { get; set; }

    public virtual DbSet<RoomViewing> RoomViewings { get; set; }

    public virtual DbSet<SlaPolicy> SlaPolicies { get; set; }

    public virtual DbSet<StoredFile> StoredFiles { get; set; }

    public virtual DbSet<SupportAccessGrant> SupportAccessGrants { get; set; }

    public virtual DbSet<Tenancy> Tenancies { get; set; }

    public virtual DbSet<TenancyRequest> TenancyRequests { get; set; }

    public virtual DbSet<TenancyResident> TenancyResidents { get; set; }

    public virtual DbSet<Tenant> Tenants { get; set; }

    public virtual DbSet<TenantIdentityDocument> TenantIdentityDocuments { get; set; }

    public virtual DbSet<TenantProfileChangeRequest> TenantProfileChangeRequests { get; set; }

    public virtual DbSet<Ticket> Tickets { get; set; }

    public virtual DbSet<TicketCategory> TicketCategories { get; set; }

    public virtual DbSet<TicketEvent> TicketEvents { get; set; }

    public virtual DbSet<TicketFile> TicketFiles { get; set; }

    public virtual DbSet<TicketMessage> TicketMessages { get; set; }

    public virtual DbSet<User> Users { get; set; }

    public virtual DbSet<UserClaim> UserClaims { get; set; }

    public virtual DbSet<UserLogin> UserLogins { get; set; }

    public virtual DbSet<UserSession> UserSessions { get; set; }

    public virtual DbSet<UserToken> UserTokens { get; set; }

    public virtual DbSet<VAllocationMovement> VAllocationMovements { get; set; }

    public virtual DbSet<VCashMovement> VCashMovements { get; set; }

    public virtual DbSet<VContractStatus> VContractStatuses { get; set; }

    public virtual DbSet<VDepositBalance> VDepositBalances { get; set; }

    public virtual DbSet<VDepositMovement> VDepositMovements { get; set; }

    public virtual DbSet<VInvoiceBalance> VInvoiceBalances { get; set; }

    public virtual DbSet<VInvoiceTotal> VInvoiceTotals { get; set; }

    public virtual DbSet<VPaymentBalance> VPaymentBalances { get; set; }

    public virtual DbSet<VPublicRoom> VPublicRooms { get; set; }

    public virtual DbSet<VRoomStatus> VRoomStatuses { get; set; }

    public virtual DbSet<VTenantDebt> VTenantDebts { get; set; }

    public virtual DbSet<VTenantStatus> VTenantStatuses { get; set; }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder
            .HasPostgresExtension("btree_gist")
            .HasPostgresExtension("pg_trgm")
            .HasPostgresExtension("pgcrypto")
            .HasPostgresExtension("unaccent");

        modelBuilder.Entity<Amenity>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("amenities_pkey");

            entity.ToTable("amenities", "smartrent", tb => tb.HasComment("Tiện ích của đơn vị. Form phòng thêm được tiện ích mới ngay khi nhập."));

            entity.HasIndex(e => new { e.OrganizationId, e.Code }, "amenities_organization_id_code_key").IsUnique();

            entity.Property(e => e.Id)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("id");
            entity.Property(e => e.Code)
                .HasMaxLength(50)
                .HasColumnName("code");
            entity.Property(e => e.Icon)
                .HasMaxLength(50)
                .HasColumnName("icon");
            entity.Property(e => e.Name)
                .HasMaxLength(150)
                .HasColumnName("name");
            entity.Property(e => e.OrganizationId).HasColumnName("organization_id");

            entity.HasOne(d => d.Organization).WithMany(p => p.Amenities)
                .HasForeignKey(d => d.OrganizationId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("amenities_organization_id_fkey");
        });

        modelBuilder.Entity<ApiIdempotencyKey>(entity =>
        {
            entity.HasKey(e => new { e.UserId, e.Route, e.IdempotencyKey }).HasName("api_idempotency_keys_pkey");

            entity.ToTable("api_idempotency_keys", "smartrent", tb => tb.HasComment("Chống gửi trùng ở tầng API cho thao tác không có cột idempotency_key riêng: đặt lịch, tạo hợp đồng, trả phòng, gửi ticket. Xóa khi quá expires_at."));

            entity.HasIndex(e => e.ExpiresAt, "ix_idempotency_expiry");

            entity.Property(e => e.UserId).HasColumnName("user_id");
            entity.Property(e => e.Route)
                .HasMaxLength(200)
                .HasColumnName("route");
            entity.Property(e => e.IdempotencyKey).HasColumnName("idempotency_key");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("created_at");
            entity.Property(e => e.ExpiresAt).HasColumnName("expires_at");
            entity.Property(e => e.RequestHash)
                .HasMaxLength(64)
                .IsFixedLength()
                .HasColumnName("request_hash");
            entity.Property(e => e.ResponseBody)
                .HasColumnType("jsonb")
                .HasColumnName("response_body");
            entity.Property(e => e.ResponseStatus).HasColumnName("response_status");

            entity.HasOne(d => d.User).WithMany(p => p.ApiIdempotencyKeys)
                .HasForeignKey(d => d.UserId)
                .HasConstraintName("api_idempotency_keys_user_id_fkey");
        });

        modelBuilder.Entity<AuditLog>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("audit_logs_pkey");

            entity.ToTable("audit_logs", "smartrent", tb => tb.HasComment("Nhật ký tự động: ai, lúc nào, sửa gì, trước sau ra sao, lý do. Cũng ghi các lần xuất CSV. Chứa liên hệ khách nên phải bảo vệ như dữ liệu riêng tư."));

            entity.HasIndex(e => e.ActorId, "ix_audit_logs_actor_id");

            entity.HasIndex(e => e.OrganizationId, "ix_audit_logs_organization_id");

            entity.HasIndex(e => new { e.OrganizationId, e.OccurredAt }, "ix_audit_scope_time").IsDescending(false, true);

            entity.Property(e => e.Id)
                .UseIdentityAlwaysColumn()
                .HasColumnName("id");
            entity.Property(e => e.Action)
                .HasMaxLength(40)
                .HasColumnName("action");
            entity.Property(e => e.ActorId).HasColumnName("actor_id");
            entity.Property(e => e.CorrelationId).HasColumnName("correlation_id");
            entity.Property(e => e.NewData)
                .HasColumnType("jsonb")
                .HasColumnName("new_data");
            entity.Property(e => e.OccurredAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("occurred_at");
            entity.Property(e => e.OldData)
                .HasColumnType("jsonb")
                .HasColumnName("old_data");
            entity.Property(e => e.OrganizationId).HasColumnName("organization_id");
            entity.Property(e => e.Reason).HasColumnName("reason");
            entity.Property(e => e.RecordKey)
                .HasColumnType("jsonb")
                .HasColumnName("record_key");
            entity.Property(e => e.TableName)
                .HasMaxLength(100)
                .HasColumnName("table_name");

            entity.HasOne(d => d.Actor).WithMany(p => p.AuditLogs)
                .HasForeignKey(d => d.ActorId)
                .HasConstraintName("audit_logs_actor_id_fkey");

            entity.HasOne(d => d.Organization).WithMany(p => p.AuditLogs)
                .HasForeignKey(d => d.OrganizationId)
                .HasConstraintName("audit_logs_organization_id_fkey");
        });

        modelBuilder.Entity<BackupRun>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("backup_runs_pkey");

            entity.ToTable("backup_runs", "smartrent", tb => tb.HasComment("Nhật ký sao lưu và thử khôi phục ở trang Hỗ trợ và vận hành. Ghi dòng ở đây không tự tạo bản sao lưu."));

            entity.HasIndex(e => e.RequestedBy, "ix_backup_runs_requested_by");

            entity.Property(e => e.Id)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("id");
            entity.Property(e => e.ErrorMessage).HasColumnName("error_message");
            entity.Property(e => e.FinishedAt).HasColumnName("finished_at");
            entity.Property(e => e.Kind)
                .HasMaxLength(15)
                .HasColumnName("kind");
            entity.Property(e => e.Reference).HasColumnName("reference");
            entity.Property(e => e.RequestedBy).HasColumnName("requested_by");
            entity.Property(e => e.StartedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("started_at");
            entity.Property(e => e.Status)
                .HasMaxLength(10)
                .HasColumnName("status");

            entity.HasOne(d => d.RequestedByNavigation).WithMany(p => p.BackupRuns)
                .HasForeignKey(d => d.RequestedBy)
                .HasConstraintName("backup_runs_requested_by_fkey");
        });

        modelBuilder.Entity<BankAccount>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("bank_accounts_pkey");

            entity.ToTable("bank_accounts", "smartrent", tb => tb.HasComment("Tài khoản nhận tiền của đơn vị, hiện ở trang thanh toán hóa đơn của khách."));

            entity.HasIndex(e => new { e.OrganizationId, e.BankName, e.AccountNumber }, "bank_accounts_organization_id_bank_name_account_number_key").IsUnique();

            entity.HasIndex(e => e.OrganizationId, "ux_bank_default")
                .IsUnique()
                .HasFilter("is_default");

            entity.Property(e => e.Id)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("id");
            entity.Property(e => e.AccountHolder)
                .HasMaxLength(200)
                .HasColumnName("account_holder");
            entity.Property(e => e.AccountNumber)
                .HasMaxLength(100)
                .HasColumnName("account_number");
            entity.Property(e => e.BankName)
                .HasMaxLength(100)
                .HasColumnName("bank_name");
            entity.Property(e => e.IsActive)
                .HasDefaultValue(true)
                .HasColumnName("is_active");
            entity.Property(e => e.IsDefault).HasColumnName("is_default");
            entity.Property(e => e.OrganizationId).HasColumnName("organization_id");

            entity.HasOne(d => d.Organization).WithOne(p => p.BankAccount)
                .HasForeignKey<BankAccount>(d => d.OrganizationId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("bank_accounts_organization_id_fkey");
        });

        modelBuilder.Entity<BillingPeriod>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("billing_periods_pkey");

            entity.ToTable("billing_periods", "smartrent", tb => tb.HasComment("Tháng tính tiền của một cơ sở ở trang Tính tiền phòng. Khóa tháng chặn sửa chỉ số và hóa đơn của tháng đó."));

            entity.HasIndex(e => new { e.PropertyId, e.MonthStart }, "billing_periods_property_id_month_start_key").IsUnique();

            entity.HasIndex(e => e.LockedBy, "ix_billing_periods_locked_by");

            entity.Property(e => e.Id)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("id");
            entity.Property(e => e.LockedAt).HasColumnName("locked_at");
            entity.Property(e => e.LockedBy).HasColumnName("locked_by");
            entity.Property(e => e.MonthStart).HasColumnName("month_start");
            entity.Property(e => e.PropertyId).HasColumnName("property_id");
            entity.Property(e => e.Status)
                .HasMaxLength(8)
                .HasDefaultValueSql("'open'::character varying")
                .HasColumnName("status");

            entity.HasOne(d => d.LockedByNavigation).WithMany(p => p.BillingPeriods)
                .HasForeignKey(d => d.LockedBy)
                .HasConstraintName("billing_periods_locked_by_fkey");

            entity.HasOne(d => d.Property).WithMany(p => p.BillingPeriods)
                .HasForeignKey(d => d.PropertyId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("billing_periods_property_id_fkey");
        });

        modelBuilder.Entity<BillingPeriodEvent>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("billing_period_events_pkey");

            entity.ToTable("billing_period_events", "smartrent", tb => tb.HasComment("Lịch sử khóa và mở khóa tháng, bắt buộc có lý do."));

            entity.HasIndex(e => e.ActorId, "ix_billing_period_events_actor_id");

            entity.HasIndex(e => e.BillingPeriodId, "ix_billing_period_events_billing_period_id");

            entity.Property(e => e.Id)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("id");
            entity.Property(e => e.Action)
                .HasMaxLength(8)
                .HasColumnName("action");
            entity.Property(e => e.ActorId).HasColumnName("actor_id");
            entity.Property(e => e.BillingPeriodId).HasColumnName("billing_period_id");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("created_at");
            entity.Property(e => e.Reason).HasColumnName("reason");

            entity.HasOne(d => d.Actor).WithMany(p => p.BillingPeriodEvents)
                .HasForeignKey(d => d.ActorId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("billing_period_events_actor_id_fkey");

            entity.HasOne(d => d.BillingPeriod).WithMany(p => p.BillingPeriodEvents)
                .HasForeignKey(d => d.BillingPeriodId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("billing_period_events_billing_period_id_fkey");
        });

        modelBuilder.Entity<BusinessRole>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("business_roles_pkey");

            entity.ToTable("business_roles", "smartrent", tb => tb.HasComment("Vai trò trong một đơn vị. Mặc định có Chủ trọ, Quản lý, Nhân viên; đơn vị có thể tự tạo thêm."));

            entity.HasIndex(e => new { e.OrganizationId, e.Code }, "business_roles_organization_id_code_key").IsUnique();

            entity.Property(e => e.Id)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("id");
            entity.Property(e => e.Code)
                .HasMaxLength(50)
                .HasColumnName("code");
            entity.Property(e => e.IsSystem).HasColumnName("is_system");
            entity.Property(e => e.Name)
                .HasMaxLength(150)
                .HasColumnName("name");
            entity.Property(e => e.OrganizationId).HasColumnName("organization_id");

            entity.HasOne(d => d.Organization).WithMany(p => p.BusinessRoles)
                .HasForeignKey(d => d.OrganizationId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("business_roles_organization_id_fkey");

            entity.HasMany(d => d.PermissionCodes).WithMany(p => p.Roles)
                .UsingEntity<Dictionary<string, object>>(
                    "BusinessRolePermission",
                    r => r.HasOne<Permission>().WithMany()
                        .HasForeignKey("PermissionCode")
                        .OnDelete(DeleteBehavior.ClientSetNull)
                        .HasConstraintName("business_role_permissions_permission_code_fkey"),
                    l => l.HasOne<BusinessRole>().WithMany()
                        .HasForeignKey("RoleId")
                        .HasConstraintName("business_role_permissions_role_id_fkey"),
                    j =>
                    {
                        j.HasKey("RoleId", "PermissionCode").HasName("business_role_permissions_pkey");
                        j.ToTable("business_role_permissions", "smartrent", tb => tb.HasComment("Quyền của từng vai trò (N-N)."));
                        j.HasIndex(new[] { "PermissionCode" }, "ix_business_role_permissions_permission_code");
                        j.IndexerProperty<Guid>("RoleId").HasColumnName("role_id");
                        j.IndexerProperty<string>("PermissionCode")
                            .HasMaxLength(100)
                            .HasColumnName("permission_code");
                    });
        });

        modelBuilder.Entity<ChargeInstance>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("charge_instances_pkey");

            entity.ToTable("charge_instances", "smartrent", tb => tb.HasComment("Một lần phát sinh của khoản thu trong đợt thuê. Dùng lại đúng dòng này khi lập lại nên phí một lần không thể thu hai lần."));

            entity.HasIndex(e => new { e.TenancyId, e.ChargeTypeId, e.BillingPeriodId, e.OccurrenceKey }, "charge_instances_tenancy_id_charge_type_id_billing_period_i_key").IsUnique();

            entity.HasIndex(e => e.BillingPeriodId, "ix_charge_instances_billing_period_id");

            entity.HasIndex(e => e.ChargeTypeId, "ix_charge_instances_charge_type_id");

            entity.Property(e => e.Id)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("id");
            entity.Property(e => e.BillingPeriodId).HasColumnName("billing_period_id");
            entity.Property(e => e.ChargeTypeId).HasColumnName("charge_type_id");
            entity.Property(e => e.OccurrenceKey)
                .HasMaxLength(100)
                .HasDefaultValueSql("'default'::character varying")
                .HasColumnName("occurrence_key");
            entity.Property(e => e.TenancyId).HasColumnName("tenancy_id");

            entity.HasOne(d => d.BillingPeriod).WithMany(p => p.ChargeInstances)
                .HasForeignKey(d => d.BillingPeriodId)
                .HasConstraintName("charge_instances_billing_period_id_fkey");

            entity.HasOne(d => d.ChargeType).WithMany(p => p.ChargeInstances)
                .HasForeignKey(d => d.ChargeTypeId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("charge_instances_charge_type_id_fkey");

            entity.HasOne(d => d.Tenancy).WithMany(p => p.ChargeInstances)
                .HasForeignKey(d => d.TenancyId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("charge_instances_tenancy_id_fkey");
        });

        modelBuilder.Entity<ChargeRate>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("charge_rates_pkey");

            entity.ToTable("charge_rates", "smartrent", tb => tb.HasComment("Bảng giá có hiệu lực theo ngày, thuộc đúng một phạm vi: cơ sở, phòng, hoặc phiên bản hợp đồng. Giá 0 là giá hợp lệ. Đổi giá: đóng effective_to rồi thêm dòng mới, không sửa unit_price."));

            entity.HasIndex(e => e.ChargeTypeId, "ix_charge_rates_charge_type_id");

            entity.HasIndex(e => e.ContractVersionId, "ix_charge_rates_contract_version_id");

            entity.HasIndex(e => e.PropertyId, "ix_charge_rates_property_id");

            entity.HasIndex(e => e.RoomId, "ix_charge_rates_room_id");

            entity.Property(e => e.Id)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("id");
            entity.Property(e => e.BillingCycle)
                .HasMaxLength(10)
                .HasDefaultValueSql("'monthly'::character varying")
                .HasColumnName("billing_cycle");
            entity.Property(e => e.CalculationMethod)
                .HasMaxLength(15)
                .HasColumnName("calculation_method");
            entity.Property(e => e.ChargeTypeId).HasColumnName("charge_type_id");
            entity.Property(e => e.ContractVersionId).HasColumnName("contract_version_id");
            entity.Property(e => e.EffectiveFrom).HasColumnName("effective_from");
            entity.Property(e => e.EffectiveTo).HasColumnName("effective_to");
            entity.Property(e => e.PropertyId).HasColumnName("property_id");
            entity.Property(e => e.ProrationMode)
                .HasMaxLength(12)
                .HasDefaultValueSql("'full_period'::character varying")
                .HasColumnName("proration_mode");
            entity.Property(e => e.RoomId).HasColumnName("room_id");
            entity.Property(e => e.ScopeId)
                .HasComputedColumnSql("COALESCE(contract_version_id, room_id, property_id)", true)
                .HasColumnName("scope_id");
            entity.Property(e => e.UnitPrice)
                .HasPrecision(18, 4)
                .HasColumnName("unit_price");

            entity.HasOne(d => d.ChargeType).WithMany(p => p.ChargeRates)
                .HasForeignKey(d => d.ChargeTypeId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("charge_rates_charge_type_id_fkey");

            entity.HasOne(d => d.ContractVersion).WithMany(p => p.ChargeRates)
                .HasForeignKey(d => d.ContractVersionId)
                .OnDelete(DeleteBehavior.Cascade)
                .HasConstraintName("charge_rates_contract_version_id_fkey");

            entity.HasOne(d => d.Property).WithMany(p => p.ChargeRates)
                .HasForeignKey(d => d.PropertyId)
                .OnDelete(DeleteBehavior.Cascade)
                .HasConstraintName("charge_rates_property_id_fkey");

            entity.HasOne(d => d.Room).WithMany(p => p.ChargeRates)
                .HasForeignKey(d => d.RoomId)
                .OnDelete(DeleteBehavior.Cascade)
                .HasConstraintName("charge_rates_room_id_fkey");
        });

        modelBuilder.Entity<ChargeType>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("charge_types_pkey");

            entity.ToTable("charge_types", "smartrent", tb => tb.HasComment("Danh mục khoản thu: tiền thuê, điện, nước, dịch vụ, rác, internet, phí khác, bồi thường, số dư đầu kỳ."));

            entity.HasIndex(e => new { e.OrganizationId, e.Code }, "charge_types_organization_id_code_key").IsUnique();

            entity.Property(e => e.Id)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("id");
            entity.Property(e => e.Category)
                .HasMaxLength(20)
                .HasColumnName("category");
            entity.Property(e => e.Code)
                .HasMaxLength(50)
                .HasColumnName("code");
            entity.Property(e => e.IsActive)
                .HasDefaultValue(true)
                .HasColumnName("is_active");
            entity.Property(e => e.Name)
                .HasMaxLength(200)
                .HasColumnName("name");
            entity.Property(e => e.OrganizationId).HasColumnName("organization_id");
            entity.Property(e => e.UnitLabel)
                .HasMaxLength(30)
                .HasColumnName("unit_label");

            entity.HasOne(d => d.Organization).WithMany(p => p.ChargeTypes)
                .HasForeignKey(d => d.OrganizationId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("charge_types_organization_id_fkey");
        });

        modelBuilder.Entity<CheckoutSettlement>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("checkout_settlements_pkey");

            entity.ToTable("checkout_settlements", "smartrent", tb => tb.HasComment("Quyết toán khi trả phòng. Khách còn nợ phải có lý do; nợ vẫn được giữ sau khi đóng đợt thuê."));

            entity.HasIndex(e => e.TenancyId, "checkout_settlements_tenancy_id_key").IsUnique();

            entity.HasIndex(e => e.CheckoutHandoverId, "ix_checkout_settlements_checkout_handover_id");

            entity.HasIndex(e => e.ConfirmedBy, "ix_checkout_settlements_confirmed_by");

            entity.Property(e => e.Id)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("id");
            entity.Property(e => e.AllowRemainingDebt).HasColumnName("allow_remaining_debt");
            entity.Property(e => e.CheckoutHandoverId).HasColumnName("checkout_handover_id");
            entity.Property(e => e.ConfirmedAt).HasColumnName("confirmed_at");
            entity.Property(e => e.ConfirmedBy).HasColumnName("confirmed_by");
            entity.Property(e => e.Notes).HasColumnName("notes");
            entity.Property(e => e.RemainingDebtReason).HasColumnName("remaining_debt_reason");
            entity.Property(e => e.Status)
                .HasMaxLength(10)
                .HasDefaultValueSql("'draft'::character varying")
                .HasColumnName("status");
            entity.Property(e => e.TenancyId).HasColumnName("tenancy_id");

            entity.HasOne(d => d.CheckoutHandover).WithMany(p => p.CheckoutSettlements)
                .HasForeignKey(d => d.CheckoutHandoverId)
                .HasConstraintName("checkout_settlements_checkout_handover_id_fkey");

            entity.HasOne(d => d.ConfirmedByNavigation).WithMany(p => p.CheckoutSettlements)
                .HasForeignKey(d => d.ConfirmedBy)
                .HasConstraintName("checkout_settlements_confirmed_by_fkey");

            entity.HasOne(d => d.Tenancy).WithOne(p => p.CheckoutSettlement)
                .HasForeignKey<CheckoutSettlement>(d => d.TenancyId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("checkout_settlements_tenancy_id_fkey");
        });

        modelBuilder.Entity<Contract>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("contracts_pkey");

            entity.ToTable("contracts", "smartrent", tb => tb.HasComment("Hợp đồng có mã riêng, gắn với đợt thuê. Trạng thái hiển thị suy từ v_contract_status, không lưu."));

            entity.HasIndex(e => e.Code, "contracts_code_key").IsUnique();

            entity.HasIndex(e => e.CreatedBy, "ix_contracts_created_by");

            entity.HasIndex(e => e.PredecessorContractId, "ix_contracts_predecessor_contract_id");

            entity.HasIndex(e => e.TenancyId, "ix_contracts_tenancy_id");

            entity.HasIndex(e => e.TerminatedBy, "ix_contracts_terminated_by");

            entity.Property(e => e.Id)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("id");
            entity.Property(e => e.ArchivedAt).HasColumnName("archived_at");
            entity.Property(e => e.Code)
                .HasMaxLength(80)
                .HasColumnName("code");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("created_at");
            entity.Property(e => e.CreatedBy).HasColumnName("created_by");
            entity.Property(e => e.PredecessorContractId).HasColumnName("predecessor_contract_id");
            entity.Property(e => e.TenancyId).HasColumnName("tenancy_id");
            entity.Property(e => e.TerminatedAt).HasColumnName("terminated_at");
            entity.Property(e => e.TerminatedBy).HasColumnName("terminated_by");
            entity.Property(e => e.TerminatedOn).HasColumnName("terminated_on");
            entity.Property(e => e.TerminationReason).HasColumnName("termination_reason");

            entity.HasOne(d => d.CreatedByNavigation).WithMany(p => p.ContractCreatedByNavigations)
                .HasForeignKey(d => d.CreatedBy)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("contracts_created_by_fkey");

            entity.HasOne(d => d.PredecessorContract).WithMany(p => p.InversePredecessorContract)
                .HasForeignKey(d => d.PredecessorContractId)
                .HasConstraintName("contracts_predecessor_contract_id_fkey");

            entity.HasOne(d => d.Tenancy).WithMany(p => p.Contracts)
                .HasForeignKey(d => d.TenancyId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("contracts_tenancy_id_fkey");

            entity.HasOne(d => d.TerminatedByNavigation).WithMany(p => p.ContractTerminatedByNavigations)
                .HasForeignKey(d => d.TerminatedBy)
                .HasConstraintName("contracts_terminated_by_fkey");
        });

        modelBuilder.Entity<ContractAttachment>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("contract_attachments_pkey");

            entity.ToTable("contract_attachments", "smartrent", tb => tb.HasComment("Tệp bổ sung vào hồ sơ hợp đồng sau khi ký, tách khỏi tệp của phiên bản đã khóa."));

            entity.HasIndex(e => new { e.ContractId, e.FileId }, "contract_attachments_contract_id_file_id_key").IsUnique();

            entity.HasIndex(e => e.AddedBy, "ix_contract_attachments_added_by");

            entity.HasIndex(e => e.FileId, "ix_contract_attachments_file_id");

            entity.Property(e => e.Id)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("id");
            entity.Property(e => e.AddedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("added_at");
            entity.Property(e => e.AddedBy).HasColumnName("added_by");
            entity.Property(e => e.ContractId).HasColumnName("contract_id");
            entity.Property(e => e.FileId).HasColumnName("file_id");
            entity.Property(e => e.Note).HasColumnName("note");

            entity.HasOne(d => d.AddedByNavigation).WithMany(p => p.ContractAttachments)
                .HasForeignKey(d => d.AddedBy)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("contract_attachments_added_by_fkey");

            entity.HasOne(d => d.Contract).WithMany(p => p.ContractAttachments)
                .HasForeignKey(d => d.ContractId)
                .HasConstraintName("contract_attachments_contract_id_fkey");

            entity.HasOne(d => d.File).WithMany(p => p.ContractAttachments)
                .HasForeignKey(d => d.FileId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("contract_attachments_file_id_fkey");
        });

        modelBuilder.Entity<ContractFile>(entity =>
        {
            entity.HasKey(e => new { e.ContractVersionId, e.FileId }).HasName("contract_files_pkey");

            entity.ToTable("contract_files", "smartrent", tb => tb.HasComment("Tệp thuộc một phiên bản hợp đồng; bản ký là bắt buộc trước khi xác nhận ký và bị khóa sau đó."));

            entity.HasIndex(e => e.FileId, "ix_contract_files_file_id");

            entity.Property(e => e.ContractVersionId).HasColumnName("contract_version_id");
            entity.Property(e => e.FileId).HasColumnName("file_id");
            entity.Property(e => e.FileKind)
                .HasMaxLength(20)
                .HasColumnName("file_kind");

            entity.HasOne(d => d.ContractVersion).WithMany(p => p.ContractFiles)
                .HasForeignKey(d => d.ContractVersionId)
                .HasConstraintName("contract_files_contract_version_id_fkey");

            entity.HasOne(d => d.File).WithMany(p => p.ContractFiles)
                .HasForeignKey(d => d.FileId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("contract_files_file_id_fkey");
        });

        modelBuilder.Entity<ContractParty>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("contract_parties_pkey");

            entity.ToTable("contract_parties", "smartrent", tb => tb.HasComment("Các bên tại thời điểm ký. Là ảnh chụp lịch sử của chứng từ nên không đổi theo hồ sơ khách."));

            entity.HasIndex(e => e.ContractVersionId, "ix_contract_parties_contract_version_id");

            entity.HasIndex(e => e.TenantId, "ix_contract_parties_tenant_id");

            entity.Property(e => e.Id)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("id");
            entity.Property(e => e.AddressSnapshot).HasColumnName("address_snapshot");
            entity.Property(e => e.ContactSnapshot).HasColumnName("contact_snapshot");
            entity.Property(e => e.ContractVersionId).HasColumnName("contract_version_id");
            entity.Property(e => e.FullNameSnapshot)
                .HasMaxLength(250)
                .HasColumnName("full_name_snapshot");
            entity.Property(e => e.IdentityMasked)
                .HasMaxLength(40)
                .HasColumnName("identity_masked");
            entity.Property(e => e.PartyRole)
                .HasMaxLength(20)
                .HasColumnName("party_role");
            entity.Property(e => e.TenantId).HasColumnName("tenant_id");

            entity.HasOne(d => d.ContractVersion).WithMany(p => p.ContractParties)
                .HasForeignKey(d => d.ContractVersionId)
                .HasConstraintName("contract_parties_contract_version_id_fkey");

            entity.HasOne(d => d.Tenant).WithMany(p => p.ContractParties)
                .HasForeignKey(d => d.TenantId)
                .HasConstraintName("contract_parties_tenant_id_fkey");
        });

        modelBuilder.Entity<ContractVersion>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("contract_versions_pkey");

            entity.ToTable("contract_versions", "smartrent", tb => tb.HasComment("Phiên bản hợp đồng. Gia hạn tạo phiên bản mới; bản đã ký bị khóa. ends_on là ngày đầu tiên hết hiệu lực, ngày ghi trên hợp đồng là ends_on - 1."));

            entity.HasIndex(e => new { e.ContractId, e.EffectiveFrom }, "contract_versions_contract_id_effective_from_key").IsUnique();

            entity.HasIndex(e => new { e.ContractId, e.VersionNo }, "contract_versions_contract_id_version_no_key").IsUnique();

            entity.HasIndex(e => e.ConfirmedBy, "ix_contract_versions_confirmed_by");

            entity.Property(e => e.Id)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("id");
            entity.Property(e => e.ChangeReason).HasColumnName("change_reason");
            entity.Property(e => e.ConfirmedBy).HasColumnName("confirmed_by");
            entity.Property(e => e.ContractId).HasColumnName("contract_id");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("created_at");
            entity.Property(e => e.DueAfterDays).HasColumnName("due_after_days");
            entity.Property(e => e.EffectiveFrom).HasColumnName("effective_from");
            entity.Property(e => e.EndsOn).HasColumnName("ends_on");
            entity.Property(e => e.ExternalSignatureReference).HasColumnName("external_signature_reference");
            entity.Property(e => e.InvoiceDay).HasColumnName("invoice_day");
            entity.Property(e => e.ProrationPolicy)
                .HasMaxLength(20)
                .HasColumnName("proration_policy");
            entity.Property(e => e.RequiredDeposit)
                .HasPrecision(18)
                .HasColumnName("required_deposit");
            entity.Property(e => e.SignatureMethod)
                .HasMaxLength(15)
                .HasColumnName("signature_method");
            entity.Property(e => e.SignedAt).HasColumnName("signed_at");
            entity.Property(e => e.TermsText).HasColumnName("terms_text");
            entity.Property(e => e.VersionNo).HasColumnName("version_no");

            entity.HasOne(d => d.ConfirmedByNavigation).WithMany(p => p.ContractVersions)
                .HasForeignKey(d => d.ConfirmedBy)
                .HasConstraintName("contract_versions_confirmed_by_fkey");

            entity.HasOne(d => d.Contract).WithMany(p => p.ContractVersions)
                .HasForeignKey(d => d.ContractId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("contract_versions_contract_id_fkey");
        });

        modelBuilder.Entity<DepositEntry>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("deposit_entries_pkey");

            entity.ToTable("deposit_entries", "smartrent", tb => tb.HasComment("Sổ cọc chỉ ghi thêm: nhận, hoàn, bù trừ vào hóa đơn, đảo. Mỗi dòng giữ khoản thu gốc nên đối chiếu được từng đồng."));

            entity.HasIndex(e => e.IdempotencyKey, "deposit_entries_idempotency_key_key").IsUnique();

            entity.HasIndex(e => e.ConfirmedBy, "ix_deposit_entries_confirmed_by");

            entity.HasIndex(e => e.PaymentId, "ix_deposit_entries_payment_id");

            entity.HasIndex(e => e.PaymentReversalId, "ix_deposit_entries_payment_reversal_id");

            entity.HasIndex(e => e.RelatedEntryId, "ix_deposit_entries_related_entry_id");

            entity.HasIndex(e => e.SettlementId, "ix_deposit_entries_settlement_id");

            entity.HasIndex(e => e.TenancyId, "ix_deposit_entries_tenancy_id");

            entity.Property(e => e.Id)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("id");
            entity.Property(e => e.Amount)
                .HasPrecision(18)
                .HasColumnName("amount");
            entity.Property(e => e.ConfirmedBy).HasColumnName("confirmed_by");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("created_at");
            entity.Property(e => e.IdempotencyKey).HasColumnName("idempotency_key");
            entity.Property(e => e.Kind)
                .HasMaxLength(15)
                .HasColumnName("kind");
            entity.Property(e => e.OccurredAt).HasColumnName("occurred_at");
            entity.Property(e => e.PaymentId).HasColumnName("payment_id");
            entity.Property(e => e.PaymentReversalId).HasColumnName("payment_reversal_id");
            entity.Property(e => e.Reason).HasColumnName("reason");
            entity.Property(e => e.RelatedEntryId).HasColumnName("related_entry_id");
            entity.Property(e => e.SettlementId).HasColumnName("settlement_id");
            entity.Property(e => e.TenancyId).HasColumnName("tenancy_id");

            entity.HasOne(d => d.ConfirmedByNavigation).WithMany(p => p.DepositEntries)
                .HasForeignKey(d => d.ConfirmedBy)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("deposit_entries_confirmed_by_fkey");

            entity.HasOne(d => d.Payment).WithMany(p => p.DepositEntries)
                .HasForeignKey(d => d.PaymentId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("deposit_entries_payment_id_fkey");

            entity.HasOne(d => d.PaymentReversal).WithMany(p => p.DepositEntries)
                .HasForeignKey(d => d.PaymentReversalId)
                .HasConstraintName("deposit_entries_payment_reversal_id_fkey");

            entity.HasOne(d => d.RelatedEntry).WithMany(p => p.InverseRelatedEntry)
                .HasForeignKey(d => d.RelatedEntryId)
                .HasConstraintName("deposit_entries_related_entry_id_fkey");

            entity.HasOne(d => d.Settlement).WithMany(p => p.DepositEntries)
                .HasForeignKey(d => d.SettlementId)
                .HasConstraintName("deposit_entries_settlement_id_fkey");

            entity.HasOne(d => d.Tenancy).WithMany(p => p.DepositEntries)
                .HasForeignKey(d => d.TenancyId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("deposit_entries_tenancy_id_fkey");
        });

        modelBuilder.Entity<DocumentCounter>(entity =>
        {
            entity.HasKey(e => new { e.OrganizationId, e.Series }).HasName("document_counters_pkey");

            entity.ToTable("document_counters", "smartrent", tb => tb.HasComment("Bộ đếm cấp mã hóa đơn, hợp đồng, phiếu thu, ticket, yêu cầu xem phòng; an toàn khi nhiều người cùng thao tác."));

            entity.Property(e => e.OrganizationId).HasColumnName("organization_id");
            entity.Property(e => e.Series)
                .HasMaxLength(40)
                .HasColumnName("series");
            entity.Property(e => e.LastValue).HasColumnName("last_value");

            entity.HasOne(d => d.Organization).WithMany(p => p.DocumentCounters)
                .HasForeignKey(d => d.OrganizationId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("document_counters_organization_id_fkey");
        });

        modelBuilder.Entity<EmailOutbox>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("email_outbox_pkey");

            entity.ToTable("email_outbox", "smartrent", tb => tb.HasComment("Hàng đợi email ghi cùng transaction nghiệp vụ, tiến trình nền gửi và thử lại: đặt lại mật khẩu, hóa đơn, nhắc nợ. Lỗi email không làm mất hóa đơn."));

            entity.HasIndex(e => e.DedupeKey, "email_outbox_dedupe_key_key").IsUnique();

            entity.HasIndex(e => e.OrganizationId, "ix_email_outbox_organization_id");

            entity.HasIndex(e => e.RecipientUserId, "ix_email_outbox_recipient_user_id");

            entity.HasIndex(e => e.AvailableAt, "ix_outbox_pending").HasFilter("((status)::text = ANY ((ARRAY['pending'::character varying, 'failed'::character varying])::text[]))");

            entity.Property(e => e.Id)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("id");
            entity.Property(e => e.Attempts).HasColumnName("attempts");
            entity.Property(e => e.AvailableAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("available_at");
            entity.Property(e => e.Body).HasColumnName("body");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("created_at");
            entity.Property(e => e.DedupeKey)
                .HasMaxLength(300)
                .HasColumnName("dedupe_key");
            entity.Property(e => e.LastError).HasColumnName("last_error");
            entity.Property(e => e.LockedUntil).HasColumnName("locked_until");
            entity.Property(e => e.OrganizationId).HasColumnName("organization_id");
            entity.Property(e => e.RecipientUserId).HasColumnName("recipient_user_id");
            entity.Property(e => e.SentAt).HasColumnName("sent_at");
            entity.Property(e => e.Status)
                .HasMaxLength(10)
                .HasDefaultValueSql("'pending'::character varying")
                .HasColumnName("status");
            entity.Property(e => e.Subject).HasColumnName("subject");
            entity.Property(e => e.TemplateCode)
                .HasMaxLength(60)
                .HasColumnName("template_code");
            entity.Property(e => e.ToEmail)
                .HasMaxLength(256)
                .HasColumnName("to_email");

            entity.HasOne(d => d.Organization).WithMany(p => p.EmailOutboxes)
                .HasForeignKey(d => d.OrganizationId)
                .HasConstraintName("email_outbox_organization_id_fkey");

            entity.HasOne(d => d.RecipientUser).WithMany(p => p.EmailOutboxes)
                .HasForeignKey(d => d.RecipientUserId)
                .HasConstraintName("email_outbox_recipient_user_id_fkey");
        });

        modelBuilder.Entity<Handover>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("handovers_pkey");

            entity.ToTable("handovers", "smartrent", tb => tb.HasComment("Biên bản bàn giao lúc nhận và trả phòng. Khách xem lại ở trang Hợp đồng, kèm chỉ số điện nước."));

            entity.HasIndex(e => new { e.TenancyId, e.Kind }, "handovers_tenancy_id_kind_key").IsUnique();

            entity.HasIndex(e => e.LandlordConfirmedBy, "ix_handovers_landlord_confirmed_by");

            entity.HasIndex(e => e.TenantConfirmedBy, "ix_handovers_tenant_confirmed_by");

            entity.Property(e => e.Id)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("id");
            entity.Property(e => e.ConfirmedAt).HasColumnName("confirmed_at");
            entity.Property(e => e.Kind)
                .HasMaxLength(10)
                .HasColumnName("kind");
            entity.Property(e => e.LandlordConfirmedBy).HasColumnName("landlord_confirmed_by");
            entity.Property(e => e.Notes).HasColumnName("notes");
            entity.Property(e => e.OccurredAt).HasColumnName("occurred_at");
            entity.Property(e => e.RepresentativeConfirmationText).HasColumnName("representative_confirmation_text");
            entity.Property(e => e.TenancyId).HasColumnName("tenancy_id");
            entity.Property(e => e.TenantConfirmedBy).HasColumnName("tenant_confirmed_by");

            entity.HasOne(d => d.LandlordConfirmedByNavigation).WithMany(p => p.HandoverLandlordConfirmedByNavigations)
                .HasForeignKey(d => d.LandlordConfirmedBy)
                .HasConstraintName("handovers_landlord_confirmed_by_fkey");

            entity.HasOne(d => d.Tenancy).WithMany(p => p.Handovers)
                .HasForeignKey(d => d.TenancyId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("handovers_tenancy_id_fkey");

            entity.HasOne(d => d.TenantConfirmedByNavigation).WithMany(p => p.HandoverTenantConfirmedByNavigations)
                .HasForeignKey(d => d.TenantConfirmedBy)
                .HasConstraintName("handovers_tenant_confirmed_by_fkey");

            entity.HasMany(d => d.Files).WithMany(p => p.Handovers)
                .UsingEntity<Dictionary<string, object>>(
                    "HandoverFile",
                    r => r.HasOne<StoredFile>().WithMany()
                        .HasForeignKey("FileId")
                        .OnDelete(DeleteBehavior.ClientSetNull)
                        .HasConstraintName("handover_files_file_id_fkey"),
                    l => l.HasOne<Handover>().WithMany()
                        .HasForeignKey("HandoverId")
                        .HasConstraintName("handover_files_handover_id_fkey"),
                    j =>
                    {
                        j.HasKey("HandoverId", "FileId").HasName("handover_files_pkey");
                        j.ToTable("handover_files", "smartrent", tb => tb.HasComment("Ảnh hiện trạng kèm biên bản bàn giao."));
                        j.HasIndex(new[] { "FileId" }, "ix_handover_files_file_id");
                        j.IndexerProperty<Guid>("HandoverId").HasColumnName("handover_id");
                        j.IndexerProperty<Guid>("FileId").HasColumnName("file_id");
                    });
        });

        modelBuilder.Entity<HandoverItem>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("handover_items_pkey");

            entity.ToTable("handover_items", "smartrent", tb => tb.HasComment("Tài sản ghi trong biên bản bàn giao, là nội dung của biên bản nên không phụ thuộc danh mục nào."));

            entity.HasIndex(e => e.HandoverId, "ix_handover_items_handover_id");

            entity.Property(e => e.Id)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("id");
            entity.Property(e => e.ConditionNotes).HasColumnName("condition_notes");
            entity.Property(e => e.HandoverId).HasColumnName("handover_id");
            entity.Property(e => e.Name)
                .HasMaxLength(200)
                .HasColumnName("name");
            entity.Property(e => e.Quantity)
                .HasPrecision(12, 3)
                .HasDefaultValue(1m)
                .HasColumnName("quantity");

            entity.HasOne(d => d.Handover).WithMany(p => p.HandoverItems)
                .HasForeignKey(d => d.HandoverId)
                .HasConstraintName("handover_items_handover_id_fkey");
        });

        modelBuilder.Entity<Invoice>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("invoices_pkey");

            entity.ToTable("invoices", "smartrent", tb => tb.HasComment("Hóa đơn nội bộ: tháng, cuối đợt thuê, phát sinh, thay thế, điều chỉnh tăng giảm, số dư đầu kỳ. Phát hành rồi không sửa, chỉ điều chỉnh hoặc hủy có lý do."));

            entity.HasIndex(e => e.Code, "invoices_code_key").IsUnique();

            entity.HasIndex(e => e.IdempotencyKey, "invoices_idempotency_key_key").IsUnique();

            entity.HasIndex(e => e.DueOn, "ix_invoice_due").HasFilter("((status)::text = 'issued'::text)");

            entity.HasIndex(e => new { e.BillingPeriodId, e.Status }, "ix_invoice_period_status");

            entity.HasIndex(e => e.BillingPeriodId, "ix_invoices_billing_period_id");

            entity.HasIndex(e => e.CreatedBy, "ix_invoices_created_by");

            entity.HasIndex(e => e.IssuedBy, "ix_invoices_issued_by");

            entity.HasIndex(e => e.OriginalInvoiceId, "ix_invoices_original_invoice_id");

            entity.HasIndex(e => e.TenancyId, "ix_invoices_tenancy_id");

            entity.HasIndex(e => e.VoidedBy, "ix_invoices_voided_by");

            entity.HasIndex(e => new { e.TenancyId, e.BillingPeriodId }, "ux_invoice_periodic")
                .IsUnique()
                .HasFilter("(((kind)::text = 'periodic'::text) AND ((status)::text <> 'void'::text))");

            entity.HasIndex(e => e.OriginalInvoiceId, "ux_invoice_replacement")
                .IsUnique()
                .HasFilter("(((kind)::text = 'replacement'::text) AND ((status)::text <> 'void'::text))");

            entity.Property(e => e.Id)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("id");
            entity.Property(e => e.BillingPeriodId).HasColumnName("billing_period_id");
            entity.Property(e => e.Code)
                .HasMaxLength(80)
                .HasColumnName("code");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("created_at");
            entity.Property(e => e.CreatedBy).HasColumnName("created_by");
            entity.Property(e => e.DueOn).HasColumnName("due_on");
            entity.Property(e => e.IdempotencyKey).HasColumnName("idempotency_key");
            entity.Property(e => e.IssuedAt).HasColumnName("issued_at");
            entity.Property(e => e.IssuedBy).HasColumnName("issued_by");
            entity.Property(e => e.IssuedOn).HasColumnName("issued_on");
            entity.Property(e => e.Kind)
                .HasMaxLength(20)
                .HasColumnName("kind");
            entity.Property(e => e.NeedsRecompute)
                .HasComment("Hóa đơn nháp cần tính lại vì chỉ số hoặc giá vừa đổi.")
                .HasColumnName("needs_recompute");
            entity.Property(e => e.Notes).HasColumnName("notes");
            entity.Property(e => e.OriginalInvoiceId).HasColumnName("original_invoice_id");
            entity.Property(e => e.ServiceFrom).HasColumnName("service_from");
            entity.Property(e => e.ServiceTo).HasColumnName("service_to");
            entity.Property(e => e.Status)
                .HasMaxLength(8)
                .HasDefaultValueSql("'draft'::character varying")
                .HasColumnName("status");
            entity.Property(e => e.TenancyId).HasColumnName("tenancy_id");
            entity.Property(e => e.VoidReason).HasColumnName("void_reason");
            entity.Property(e => e.VoidedAt).HasColumnName("voided_at");
            entity.Property(e => e.VoidedBy).HasColumnName("voided_by");

            entity.HasOne(d => d.BillingPeriod).WithMany(p => p.Invoices)
                .HasForeignKey(d => d.BillingPeriodId)
                .HasConstraintName("invoices_billing_period_id_fkey");

            entity.HasOne(d => d.CreatedByNavigation).WithMany(p => p.InvoiceCreatedByNavigations)
                .HasForeignKey(d => d.CreatedBy)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("invoices_created_by_fkey");

            entity.HasOne(d => d.IssuedByNavigation).WithMany(p => p.InvoiceIssuedByNavigations)
                .HasForeignKey(d => d.IssuedBy)
                .HasConstraintName("invoices_issued_by_fkey");

            entity.HasOne(d => d.OriginalInvoice).WithOne(p => p.InverseOriginalInvoice)
                .HasForeignKey<Invoice>(d => d.OriginalInvoiceId)
                .HasConstraintName("invoices_original_invoice_id_fkey");

            entity.HasOne(d => d.Tenancy).WithMany(p => p.Invoices)
                .HasForeignKey(d => d.TenancyId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("invoices_tenancy_id_fkey");

            entity.HasOne(d => d.VoidedByNavigation).WithMany(p => p.InvoiceVoidedByNavigations)
                .HasForeignKey(d => d.VoidedBy)
                .HasConstraintName("invoices_voided_by_fkey");
        });

        modelBuilder.Entity<InvoiceChargeClaim>(entity =>
        {
            entity.HasKey(e => e.ChargeInstanceId).HasName("invoice_charge_claims_pkey");

            entity.ToTable("invoice_charge_claims", "smartrent", tb => tb.HasComment("Phát sinh đang được dòng hóa đơn nào sử dụng. Hóa đơn hủy thì nhả ra, khóa chính chặn thu trùng."));

            entity.HasIndex(e => e.InvoiceLineId, "invoice_charge_claims_invoice_line_id_key").IsUnique();

            entity.Property(e => e.ChargeInstanceId)
                .ValueGeneratedNever()
                .HasColumnName("charge_instance_id");
            entity.Property(e => e.InvoiceLineId).HasColumnName("invoice_line_id");

            entity.HasOne(d => d.ChargeInstance).WithOne(p => p.InvoiceChargeClaim)
                .HasForeignKey<InvoiceChargeClaim>(d => d.ChargeInstanceId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("invoice_charge_claims_charge_instance_id_fkey");

            entity.HasOne(d => d.InvoiceLine).WithOne(p => p.InvoiceChargeClaim)
                .HasForeignKey<InvoiceChargeClaim>(d => d.InvoiceLineId)
                .HasConstraintName("invoice_charge_claims_invoice_line_id_fkey");
        });

        modelBuilder.Entity<InvoiceLine>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("invoice_lines_pkey");

            entity.ToTable("invoice_lines", "smartrent", tb => tb.HasComment("Từng khoản trên hóa đơn, chụp giá và số lượng tại lúc lập. Đổi bảng giá không làm đổi hóa đơn cũ."));

            entity.HasIndex(e => new { e.InvoiceId, e.LineNo }, "invoice_lines_invoice_id_line_no_key").IsUnique();

            entity.HasIndex(e => e.ChargeInstanceId, "ix_invoice_lines_charge_instance_id");

            entity.HasIndex(e => e.ChargeTypeId, "ix_invoice_lines_charge_type_id");

            entity.HasIndex(e => e.SourceRateId, "ix_invoice_lines_source_rate_id");

            entity.Property(e => e.Id)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("id");
            entity.Property(e => e.ChargeInstanceId).HasColumnName("charge_instance_id");
            entity.Property(e => e.ChargeTypeId).HasColumnName("charge_type_id");
            entity.Property(e => e.DescriptionSnapshot).HasColumnName("description_snapshot");
            entity.Property(e => e.InvoiceId).HasColumnName("invoice_id");
            entity.Property(e => e.LineNo).HasColumnName("line_no");
            entity.Property(e => e.ProrationDenominator)
                .HasDefaultValue(1)
                .HasColumnName("proration_denominator");
            entity.Property(e => e.ProrationNumerator)
                .HasDefaultValue(1)
                .HasColumnName("proration_numerator");
            entity.Property(e => e.Quantity)
                .HasPrecision(18, 6)
                .HasColumnName("quantity");
            entity.Property(e => e.Sign)
                .HasDefaultValue((short)1)
                .HasColumnName("sign");
            entity.Property(e => e.SourceRateId).HasColumnName("source_rate_id");
            entity.Property(e => e.SourceScope)
                .HasMaxLength(10)
                .HasColumnName("source_scope");
            entity.Property(e => e.UnitPrice)
                .HasPrecision(18, 4)
                .HasColumnName("unit_price");
            entity.Property(e => e.UnitSnapshot)
                .HasMaxLength(30)
                .HasColumnName("unit_snapshot");

            entity.HasOne(d => d.ChargeInstance).WithMany(p => p.InvoiceLines)
                .HasForeignKey(d => d.ChargeInstanceId)
                .HasConstraintName("invoice_lines_charge_instance_id_fkey");

            entity.HasOne(d => d.ChargeType).WithMany(p => p.InvoiceLines)
                .HasForeignKey(d => d.ChargeTypeId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("invoice_lines_charge_type_id_fkey");

            entity.HasOne(d => d.Invoice).WithMany(p => p.InvoiceLines)
                .HasForeignKey(d => d.InvoiceId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("invoice_lines_invoice_id_fkey");

            entity.HasOne(d => d.SourceRate).WithMany(p => p.InvoiceLines)
                .HasForeignKey(d => d.SourceRateId)
                .HasConstraintName("invoice_lines_source_rate_id_fkey");
        });

        modelBuilder.Entity<InvoiceMeterSegment>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("invoice_meter_segments_pkey");

            entity.ToTable("invoice_meter_segments", "smartrent", tb => tb.HasComment("Chỉ số đầu và cuối làm căn cứ cho dòng điện, nước; có nhiều đoạn khi thay công tơ giữa tháng."));

            entity.HasIndex(e => new { e.InvoiceLineId, e.FromReadingId, e.ToReadingId }, "invoice_meter_segments_invoice_line_id_from_reading_id_to_r_key").IsUnique();

            entity.HasIndex(e => e.FromReadingId, "ix_invoice_meter_segments_from_reading_id");

            entity.HasIndex(e => e.ToReadingId, "ix_invoice_meter_segments_to_reading_id");

            entity.Property(e => e.Id)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("id");
            entity.Property(e => e.FromReadingId).HasColumnName("from_reading_id");
            entity.Property(e => e.InvoiceLineId).HasColumnName("invoice_line_id");
            entity.Property(e => e.ToReadingId).HasColumnName("to_reading_id");

            entity.HasOne(d => d.FromReading).WithMany(p => p.InvoiceMeterSegmentFromReadings)
                .HasForeignKey(d => d.FromReadingId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("invoice_meter_segments_from_reading_id_fkey");

            entity.HasOne(d => d.InvoiceLine).WithMany(p => p.InvoiceMeterSegments)
                .HasForeignKey(d => d.InvoiceLineId)
                .HasConstraintName("invoice_meter_segments_invoice_line_id_fkey");

            entity.HasOne(d => d.ToReading).WithMany(p => p.InvoiceMeterSegmentToReadings)
                .HasForeignKey(d => d.ToReadingId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("invoice_meter_segments_to_reading_id_fkey");
        });

        modelBuilder.Entity<Meter>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("meters_pkey");

            entity.ToTable("meters", "smartrent", tb => tb.HasComment("Công tơ điện, nước của phòng; mỗi phòng một công tơ đang dùng cho mỗi loại. Thay công tơ: chốt removed_at rồi thêm công tơ mới."));

            entity.Property(e => e.Id)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("id");
            entity.Property(e => e.InstalledAt).HasColumnName("installed_at");
            entity.Property(e => e.MeterKind)
                .HasMaxLength(12)
                .HasColumnName("meter_kind");
            entity.Property(e => e.RemovedAt).HasColumnName("removed_at");
            entity.Property(e => e.RoomId).HasColumnName("room_id");
            entity.Property(e => e.SerialNumber)
                .HasMaxLength(100)
                .HasColumnName("serial_number");

            entity.HasOne(d => d.Room).WithMany(p => p.Meters)
                .HasForeignKey(d => d.RoomId)
                .HasConstraintName("meters_room_id_fkey");
        });

        modelBuilder.Entity<MeterReading>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("meter_readings_pkey");

            entity.ToTable("meter_readings", "smartrent", tb => tb.HasComment("Chỉ số công tơ, không được giảm theo thời gian. Sửa số: hủy bản cũ có lý do rồi ghi bản mới; số đã lên hóa đơn phát hành thì không sửa được."));

            entity.HasIndex(e => new { e.MeterId, e.ObservedAt }, "ix_meter_history")
                .IsDescending(false, true)
                .HasFilter("((status)::text = 'valid'::text)");

            entity.HasIndex(e => e.BillingPeriodId, "ix_meter_readings_billing_period_id");

            entity.HasIndex(e => e.HandoverId, "ix_meter_readings_handover_id");

            entity.HasIndex(e => e.MeterId, "ix_meter_readings_meter_id");

            entity.HasIndex(e => e.RecordedBy, "ix_meter_readings_recorded_by");

            entity.HasIndex(e => e.TenancyId, "ix_meter_readings_tenancy_id");

            entity.HasIndex(e => e.SupersedesId, "meter_readings_supersedes_id_key").IsUnique();

            entity.HasIndex(e => new { e.MeterId, e.ObservedAt }, "ux_meter_observed")
                .IsUnique()
                .HasFilter("((status)::text = 'valid'::text)");

            entity.HasIndex(e => new { e.MeterId, e.BillingPeriodId }, "ux_reading_periodic")
                .IsUnique()
                .HasFilter("(((status)::text = 'valid'::text) AND ((reading_kind)::text = 'periodic'::text) AND (billing_period_id IS NOT NULL))");

            entity.Property(e => e.Id)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("id");
            entity.Property(e => e.BillingPeriodId).HasColumnName("billing_period_id");
            entity.Property(e => e.HandoverId).HasColumnName("handover_id");
            entity.Property(e => e.MeterId).HasColumnName("meter_id");
            entity.Property(e => e.Notes).HasColumnName("notes");
            entity.Property(e => e.ObservedAt).HasColumnName("observed_at");
            entity.Property(e => e.ReadingKind)
                .HasMaxLength(12)
                .HasColumnName("reading_kind");
            entity.Property(e => e.ReadingValue)
                .HasPrecision(18, 3)
                .HasColumnName("reading_value");
            entity.Property(e => e.RecordedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("recorded_at");
            entity.Property(e => e.RecordedBy).HasColumnName("recorded_by");
            entity.Property(e => e.Status)
                .HasMaxLength(8)
                .HasDefaultValueSql("'valid'::character varying")
                .HasColumnName("status");
            entity.Property(e => e.SupersedesId).HasColumnName("supersedes_id");
            entity.Property(e => e.TenancyId).HasColumnName("tenancy_id");
            entity.Property(e => e.VoidReason).HasColumnName("void_reason");

            entity.HasOne(d => d.BillingPeriod).WithMany(p => p.MeterReadings)
                .HasForeignKey(d => d.BillingPeriodId)
                .HasConstraintName("meter_readings_billing_period_id_fkey");

            entity.HasOne(d => d.Handover).WithMany(p => p.MeterReadings)
                .HasForeignKey(d => d.HandoverId)
                .HasConstraintName("meter_readings_handover_id_fkey");

            entity.HasOne(d => d.Meter).WithMany(p => p.MeterReadings)
                .HasForeignKey(d => d.MeterId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("meter_readings_meter_id_fkey");

            entity.HasOne(d => d.RecordedByNavigation).WithMany(p => p.MeterReadings)
                .HasForeignKey(d => d.RecordedBy)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("meter_readings_recorded_by_fkey");

            entity.HasOne(d => d.Supersedes).WithOne(p => p.InverseSupersedes)
                .HasForeignKey<MeterReading>(d => d.SupersedesId)
                .HasConstraintName("meter_readings_supersedes_id_fkey");

            entity.HasOne(d => d.Tenancy).WithMany(p => p.MeterReadings)
                .HasForeignKey(d => d.TenancyId)
                .HasConstraintName("meter_readings_tenancy_id_fkey");
        });

        modelBuilder.Entity<Notification>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("notifications_pkey");

            entity.ToTable("notifications", "smartrent", tb => tb.HasComment("Thông báo ở chuông trên đầu trang. event_key chống gửi trùng cùng một sự kiện."));

            entity.HasIndex(e => e.OrganizationId, "ix_notifications_organization_id");

            entity.HasIndex(e => new { e.RecipientId, e.CreatedAt }, "ix_notifications_unread")
                .IsDescending(false, true)
                .HasFilter("(read_at IS NULL)");

            entity.HasIndex(e => new { e.RecipientId, e.EventKey }, "notifications_recipient_id_event_key_key").IsUnique();

            entity.Property(e => e.Id)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("id");
            entity.Property(e => e.Body).HasColumnName("body");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("created_at");
            entity.Property(e => e.EventKey)
                .HasMaxLength(250)
                .HasColumnName("event_key");
            entity.Property(e => e.OrganizationId).HasColumnName("organization_id");
            entity.Property(e => e.ReadAt).HasColumnName("read_at");
            entity.Property(e => e.RecipientId).HasColumnName("recipient_id");
            entity.Property(e => e.RelativeUrl).HasColumnName("relative_url");
            entity.Property(e => e.Title).HasColumnName("title");

            entity.HasOne(d => d.Organization).WithMany(p => p.Notifications)
                .HasForeignKey(d => d.OrganizationId)
                .HasConstraintName("notifications_organization_id_fkey");

            entity.HasOne(d => d.Recipient).WithMany(p => p.Notifications)
                .HasForeignKey(d => d.RecipientId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("notifications_recipient_id_fkey");
        });

        modelBuilder.Entity<Organization>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("organizations_pkey");

            entity.ToTable("organizations", "smartrent", tb => tb.HasComment("Đơn vị chủ trọ. Quản trị hệ thống tạo, tạm ngưng hoặc mở lại đơn vị."));

            entity.HasIndex(e => e.Code, "organizations_code_key").IsUnique();

            entity.Property(e => e.Id)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("id");
            entity.Property(e => e.Code)
                .HasMaxLength(40)
                .HasColumnName("code");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("created_at");
            entity.Property(e => e.Email)
                .HasMaxLength(256)
                .HasColumnName("email");
            entity.Property(e => e.IsActive)
                .HasDefaultValue(true)
                .HasColumnName("is_active");
            entity.Property(e => e.LegalName)
                .HasMaxLength(250)
                .HasColumnName("legal_name");
            entity.Property(e => e.Name)
                .HasMaxLength(250)
                .HasColumnName("name");
            entity.Property(e => e.Phone)
                .HasMaxLength(30)
                .HasColumnName("phone");
            entity.Property(e => e.SuspendedReason).HasColumnName("suspended_reason");
            entity.Property(e => e.TaxCode)
                .HasMaxLength(30)
                .HasColumnName("tax_code");
        });

        modelBuilder.Entity<OrganizationMembership>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("organization_memberships_pkey");

            entity.ToTable("organization_memberships", "smartrent", tb => tb.HasComment("Nhân sự của đơn vị: chủ trọ, quản lý, nhân viên; property_scope quyết định xem mọi cơ sở hay chỉ cơ sở được giao."));

            entity.HasIndex(e => e.UserId, "ix_organization_memberships_user_id");

            entity.HasIndex(e => new { e.OrganizationId, e.UserId }, "organization_memberships_organization_id_user_id_key").IsUnique();

            entity.Property(e => e.Id)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("id");
            entity.Property(e => e.JoinedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("joined_at");
            entity.Property(e => e.OrganizationId).HasColumnName("organization_id");
            entity.Property(e => e.PropertyScope)
                .HasMaxLength(10)
                .HasDefaultValueSql("'assigned'::character varying")
                .HasColumnName("property_scope");
            entity.Property(e => e.Status)
                .HasMaxLength(20)
                .HasDefaultValueSql("'active'::character varying")
                .HasColumnName("status");
            entity.Property(e => e.UserId).HasColumnName("user_id");

            entity.HasOne(d => d.Organization).WithMany(p => p.OrganizationMemberships)
                .HasForeignKey(d => d.OrganizationId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("organization_memberships_organization_id_fkey");

            entity.HasOne(d => d.User).WithMany(p => p.OrganizationMemberships)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("organization_memberships_user_id_fkey");

            entity.HasMany(d => d.Properties).WithMany(p => p.Memberships)
                .UsingEntity<Dictionary<string, object>>(
                    "MembershipProperty",
                    r => r.HasOne<Property>().WithMany()
                        .HasForeignKey("PropertyId")
                        .OnDelete(DeleteBehavior.ClientSetNull)
                        .HasConstraintName("membership_properties_property_id_fkey"),
                    l => l.HasOne<OrganizationMembership>().WithMany()
                        .HasForeignKey("MembershipId")
                        .HasConstraintName("membership_properties_membership_id_fkey"),
                    j =>
                    {
                        j.HasKey("MembershipId", "PropertyId").HasName("membership_properties_pkey");
                        j.ToTable("membership_properties", "smartrent", tb => tb.HasComment("Cơ sở được giao cho nhân sự có property_scope = assigned (N-N)."));
                        j.HasIndex(new[] { "PropertyId" }, "ix_membership_properties_property_id");
                        j.IndexerProperty<Guid>("MembershipId").HasColumnName("membership_id");
                        j.IndexerProperty<Guid>("PropertyId").HasColumnName("property_id");
                    });

            entity.HasMany(d => d.Roles).WithMany(p => p.Memberships)
                .UsingEntity<Dictionary<string, object>>(
                    "MembershipRole",
                    r => r.HasOne<BusinessRole>().WithMany()
                        .HasForeignKey("RoleId")
                        .OnDelete(DeleteBehavior.ClientSetNull)
                        .HasConstraintName("membership_roles_role_id_fkey"),
                    l => l.HasOne<OrganizationMembership>().WithMany()
                        .HasForeignKey("MembershipId")
                        .HasConstraintName("membership_roles_membership_id_fkey"),
                    j =>
                    {
                        j.HasKey("MembershipId", "RoleId").HasName("membership_roles_pkey");
                        j.ToTable("membership_roles", "smartrent", tb => tb.HasComment("Vai trò của từng nhân sự (N-N)."));
                        j.HasIndex(new[] { "RoleId" }, "ix_membership_roles_role_id");
                        j.IndexerProperty<Guid>("MembershipId").HasColumnName("membership_id");
                        j.IndexerProperty<Guid>("RoleId").HasColumnName("role_id");
                    });
        });

        modelBuilder.Entity<OrganizationSetting>(entity =>
        {
            entity.HasKey(e => e.OrganizationId).HasName("organization_settings_pkey");

            entity.ToTable("organization_settings", "smartrent", tb => tb.HasComment("Lịch nhắc ở Cài đặt: ngày nhập số điện nước và ngày tạo hóa đơn hằng tháng."));

            entity.Property(e => e.OrganizationId)
                .ValueGeneratedNever()
                .HasColumnName("organization_id");
            entity.Property(e => e.BillingReminderEnabled)
                .HasDefaultValue(true)
                .HasColumnName("billing_reminder_enabled");
            entity.Property(e => e.InvoiceCreateDay)
                .HasDefaultValue((short)28)
                .HasColumnName("invoice_create_day");
            entity.Property(e => e.MeterReadingDay)
                .HasDefaultValue((short)25)
                .HasColumnName("meter_reading_day");
            entity.Property(e => e.Timezone)
                .HasMaxLength(60)
                .HasDefaultValueSql("'Asia/Ho_Chi_Minh'::character varying")
                .HasColumnName("timezone");

            entity.HasOne(d => d.Organization).WithOne(p => p.OrganizationSetting)
                .HasForeignKey<OrganizationSetting>(d => d.OrganizationId)
                .HasConstraintName("organization_settings_organization_id_fkey");
        });

        modelBuilder.Entity<Payment>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("payments_pkey");

            entity.ToTable("payments", "smartrent", tb => tb.HasComment("Tiền thực nhận hoặc khách báo đã chuyển. Báo chuyển khoản là pending, chưa tính đã thu; chỉ confirmed mới phân bổ được."));

            entity.HasIndex(e => e.BankAccountId, "ix_payments_bank_account_id");

            entity.HasIndex(e => e.ConfirmedBy, "ix_payments_confirmed_by");

            entity.HasIndex(e => e.MethodCode, "ix_payments_method_code");

            entity.HasIndex(e => e.CreatedAt, "ix_payments_pending")
                .IsDescending()
                .HasFilter("((status)::text = 'pending'::text)");

            entity.HasIndex(e => e.PropertyId, "ix_payments_property_id");

            entity.HasIndex(e => e.ReportedBy, "ix_payments_reported_by");

            entity.HasIndex(e => e.TenantId, "ix_payments_tenant_id");

            entity.HasIndex(e => e.Code, "payments_code_key").IsUnique();

            entity.HasIndex(e => e.IdempotencyKey, "payments_idempotency_key_key").IsUnique();

            entity.HasIndex(e => new { e.BankAccountId, e.ExternalReference }, "ux_bank_reference")
                .IsUnique()
                .HasFilter("((bank_account_id IS NOT NULL) AND (external_reference IS NOT NULL) AND ((status)::text <> 'rejected'::text))");

            entity.Property(e => e.Id)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("id");
            entity.Property(e => e.Amount)
                .HasPrecision(18)
                .HasColumnName("amount");
            entity.Property(e => e.BankAccountId).HasColumnName("bank_account_id");
            entity.Property(e => e.Code)
                .HasMaxLength(80)
                .HasColumnName("code");
            entity.Property(e => e.ConfirmedAt).HasColumnName("confirmed_at");
            entity.Property(e => e.ConfirmedBy).HasColumnName("confirmed_by");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("created_at");
            entity.Property(e => e.ExternalReference)
                .HasMaxLength(200)
                .HasColumnName("external_reference");
            entity.Property(e => e.IdempotencyKey).HasColumnName("idempotency_key");
            entity.Property(e => e.MethodCode)
                .HasMaxLength(30)
                .HasColumnName("method_code");
            entity.Property(e => e.Notes).HasColumnName("notes");
            entity.Property(e => e.PropertyId).HasColumnName("property_id");
            entity.Property(e => e.ReceivedAt).HasColumnName("received_at");
            entity.Property(e => e.RejectionReason).HasColumnName("rejection_reason");
            entity.Property(e => e.ReportedBy).HasColumnName("reported_by");
            entity.Property(e => e.Status)
                .HasMaxLength(10)
                .HasDefaultValueSql("'pending'::character varying")
                .HasColumnName("status");
            entity.Property(e => e.TenantId).HasColumnName("tenant_id");

            entity.HasOne(d => d.BankAccount).WithMany(p => p.Payments)
                .HasForeignKey(d => d.BankAccountId)
                .HasConstraintName("payments_bank_account_id_fkey");

            entity.HasOne(d => d.ConfirmedByNavigation).WithMany(p => p.PaymentConfirmedByNavigations)
                .HasForeignKey(d => d.ConfirmedBy)
                .HasConstraintName("payments_confirmed_by_fkey");

            entity.HasOne(d => d.MethodCodeNavigation).WithMany(p => p.Payments)
                .HasForeignKey(d => d.MethodCode)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("payments_method_code_fkey");

            entity.HasOne(d => d.Property).WithMany(p => p.Payments)
                .HasForeignKey(d => d.PropertyId)
                .HasConstraintName("payments_property_id_fkey");

            entity.HasOne(d => d.ReportedByNavigation).WithMany(p => p.PaymentReportedByNavigations)
                .HasForeignKey(d => d.ReportedBy)
                .HasConstraintName("payments_reported_by_fkey");

            entity.HasOne(d => d.Tenant).WithMany(p => p.Payments)
                .HasForeignKey(d => d.TenantId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("payments_tenant_id_fkey");

            entity.HasMany(d => d.Files).WithMany(p => p.Payments)
                .UsingEntity<Dictionary<string, object>>(
                    "PaymentFile",
                    r => r.HasOne<StoredFile>().WithMany()
                        .HasForeignKey("FileId")
                        .OnDelete(DeleteBehavior.ClientSetNull)
                        .HasConstraintName("payment_files_file_id_fkey"),
                    l => l.HasOne<Payment>().WithMany()
                        .HasForeignKey("PaymentId")
                        .OnDelete(DeleteBehavior.ClientSetNull)
                        .HasConstraintName("payment_files_payment_id_fkey"),
                    j =>
                    {
                        j.HasKey("PaymentId", "FileId").HasName("payment_files_pkey");
                        j.ToTable("payment_files", "smartrent", tb => tb.HasComment("Ảnh biên lai khách gửi kèm khi báo chuyển khoản."));
                        j.HasIndex(new[] { "FileId" }, "ix_payment_files_file_id");
                        j.IndexerProperty<Guid>("PaymentId").HasColumnName("payment_id");
                        j.IndexerProperty<Guid>("FileId").HasColumnName("file_id");
                    });

            entity.HasMany(d => d.Invoices).WithMany(p => p.Payments)
                .UsingEntity<Dictionary<string, object>>(
                    "PaymentIntendedInvoice",
                    r => r.HasOne<Invoice>().WithMany()
                        .HasForeignKey("InvoiceId")
                        .OnDelete(DeleteBehavior.ClientSetNull)
                        .HasConstraintName("payment_intended_invoices_invoice_id_fkey"),
                    l => l.HasOne<Payment>().WithMany()
                        .HasForeignKey("PaymentId")
                        .OnDelete(DeleteBehavior.ClientSetNull)
                        .HasConstraintName("payment_intended_invoices_payment_id_fkey"),
                    j =>
                    {
                        j.HasKey("PaymentId", "InvoiceId").HasName("payment_intended_invoices_pkey");
                        j.ToTable("payment_intended_invoices", "smartrent", tb => tb.HasComment("Hóa đơn khách chọn khi báo chuyển khoản. Chỉ là gợi ý cho quản lý, chưa phải phân bổ tiền."));
                        j.HasIndex(new[] { "InvoiceId" }, "ix_payment_intended_invoices_invoice_id");
                        j.IndexerProperty<Guid>("PaymentId").HasColumnName("payment_id");
                        j.IndexerProperty<Guid>("InvoiceId").HasColumnName("invoice_id");
                    });
        });

        modelBuilder.Entity<PaymentAllocation>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("payment_allocations_pkey");

            entity.ToTable("payment_allocations", "smartrent", tb => tb.HasComment("Phân bổ tiền vào hóa đơn, từ một khoản thu hoặc từ bù trừ cọc. Hoàn tác bằng dòng đảo liên kết, không sửa dòng cũ."));

            entity.HasIndex(e => e.AllocatedBy, "ix_payment_allocations_allocated_by");

            entity.HasIndex(e => e.DepositEntryId, "ix_payment_allocations_deposit_entry_id");

            entity.HasIndex(e => e.InvoiceId, "ix_payment_allocations_invoice_id");

            entity.HasIndex(e => e.PaymentId, "ix_payment_allocations_payment_id");

            entity.HasIndex(e => e.ReversesId, "ix_payment_allocations_reverses_id");

            entity.HasIndex(e => e.IdempotencyKey, "payment_allocations_idempotency_key_key").IsUnique();

            entity.Property(e => e.Id)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("id");
            entity.Property(e => e.AllocatedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("allocated_at");
            entity.Property(e => e.AllocatedBy).HasColumnName("allocated_by");
            entity.Property(e => e.Amount)
                .HasPrecision(18)
                .HasColumnName("amount");
            entity.Property(e => e.DepositEntryId).HasColumnName("deposit_entry_id");
            entity.Property(e => e.IdempotencyKey).HasColumnName("idempotency_key");
            entity.Property(e => e.InvoiceId).HasColumnName("invoice_id");
            entity.Property(e => e.Kind)
                .HasMaxLength(10)
                .HasColumnName("kind");
            entity.Property(e => e.PaymentId).HasColumnName("payment_id");
            entity.Property(e => e.Reason).HasColumnName("reason");
            entity.Property(e => e.ReversesId).HasColumnName("reverses_id");

            entity.HasOne(d => d.AllocatedByNavigation).WithMany(p => p.PaymentAllocations)
                .HasForeignKey(d => d.AllocatedBy)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("payment_allocations_allocated_by_fkey");

            entity.HasOne(d => d.DepositEntry).WithMany(p => p.PaymentAllocations)
                .HasForeignKey(d => d.DepositEntryId)
                .HasConstraintName("payment_allocations_deposit_entry_id_fkey");

            entity.HasOne(d => d.Invoice).WithMany(p => p.PaymentAllocations)
                .HasForeignKey(d => d.InvoiceId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("payment_allocations_invoice_id_fkey");

            entity.HasOne(d => d.Payment).WithMany(p => p.PaymentAllocations)
                .HasForeignKey(d => d.PaymentId)
                .HasConstraintName("payment_allocations_payment_id_fkey");

            entity.HasOne(d => d.Reverses).WithMany(p => p.InverseReverses)
                .HasForeignKey(d => d.ReversesId)
                .HasConstraintName("payment_allocations_reverses_id_fkey");
        });

        modelBuilder.Entity<PaymentMethod>(entity =>
        {
            entity.HasKey(e => e.Code).HasName("payment_methods_pkey");

            entity.ToTable("payment_methods", "smartrent", tb => tb.HasComment("Cách thanh toán: tiền mặt, chuyển khoản, khác."));

            entity.Property(e => e.Code)
                .HasMaxLength(30)
                .HasColumnName("code");
            entity.Property(e => e.IsActive)
                .HasDefaultValue(true)
                .HasColumnName("is_active");
            entity.Property(e => e.Name)
                .HasMaxLength(100)
                .HasColumnName("name");
        });

        modelBuilder.Entity<PaymentReversal>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("payment_reversals_pkey");

            entity.ToTable("payment_reversals", "smartrent", tb => tb.HasComment("Đảo khoản thu nhập sai hoặc hoàn tiền; giữ nguyên khoản thu gốc, không xóa dấu vết."));

            entity.HasIndex(e => e.ConfirmedBy, "ix_payment_reversals_confirmed_by");

            entity.HasIndex(e => e.EvidenceFileId, "ix_payment_reversals_evidence_file_id");

            entity.HasIndex(e => e.MethodCode, "ix_payment_reversals_method_code");

            entity.HasIndex(e => e.PaymentId, "ix_payment_reversals_payment_id");

            entity.HasIndex(e => e.IdempotencyKey, "payment_reversals_idempotency_key_key").IsUnique();

            entity.Property(e => e.Id)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("id");
            entity.Property(e => e.Amount)
                .HasPrecision(18)
                .HasColumnName("amount");
            entity.Property(e => e.ConfirmedBy).HasColumnName("confirmed_by");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("created_at");
            entity.Property(e => e.EvidenceFileId).HasColumnName("evidence_file_id");
            entity.Property(e => e.ExternalReference)
                .HasMaxLength(200)
                .HasColumnName("external_reference");
            entity.Property(e => e.IdempotencyKey).HasColumnName("idempotency_key");
            entity.Property(e => e.Kind)
                .HasMaxLength(10)
                .HasColumnName("kind");
            entity.Property(e => e.MethodCode)
                .HasMaxLength(30)
                .HasColumnName("method_code");
            entity.Property(e => e.OccurredAt).HasColumnName("occurred_at");
            entity.Property(e => e.PaymentId).HasColumnName("payment_id");
            entity.Property(e => e.Reason).HasColumnName("reason");

            entity.HasOne(d => d.ConfirmedByNavigation).WithMany(p => p.PaymentReversals)
                .HasForeignKey(d => d.ConfirmedBy)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("payment_reversals_confirmed_by_fkey");

            entity.HasOne(d => d.EvidenceFile).WithMany(p => p.PaymentReversals)
                .HasForeignKey(d => d.EvidenceFileId)
                .HasConstraintName("payment_reversals_evidence_file_id_fkey");

            entity.HasOne(d => d.MethodCodeNavigation).WithMany(p => p.PaymentReversals)
                .HasForeignKey(d => d.MethodCode)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("payment_reversals_method_code_fkey");

            entity.HasOne(d => d.Payment).WithMany(p => p.PaymentReversals)
                .HasForeignKey(d => d.PaymentId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("payment_reversals_payment_id_fkey");
        });

        modelBuilder.Entity<Permission>(entity =>
        {
            entity.HasKey(e => e.Code).HasName("permissions_pkey");

            entity.ToTable("permissions", "smartrent", tb => tb.HasComment("Danh mục quyền nhỏ mà router và API đang kiểm tra, ví dụ invoices.issue, payments.confirm."));

            entity.Property(e => e.Code)
                .HasMaxLength(100)
                .HasColumnName("code");
            entity.Property(e => e.Description).HasColumnName("description");
        });

        modelBuilder.Entity<Property>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("properties_pkey");

            entity.ToTable("properties", "smartrent", tb => tb.HasComment("Cơ sở (nhà trọ). Địa chỉ nhập tay; invoice_day và due_after_days là mặc định khi lập hóa đơn. Giá điện nước, phí nằm ở charge_rates."));

            entity.HasIndex(e => new { e.OrganizationId, e.Code }, "properties_organization_id_code_key").IsUnique();

            entity.Property(e => e.Id)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("id");
            entity.Property(e => e.AddressLine).HasColumnName("address_line");
            entity.Property(e => e.Code)
                .HasMaxLength(40)
                .HasColumnName("code");
            entity.Property(e => e.ContactName)
                .HasMaxLength(200)
                .HasColumnName("contact_name");
            entity.Property(e => e.ContractWarningDays)
                .HasDefaultValue((short)30)
                .HasColumnName("contract_warning_days");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("created_at");
            entity.Property(e => e.Description).HasColumnName("description");
            entity.Property(e => e.DueAfterDays)
                .HasDefaultValue((short)7)
                .HasColumnName("due_after_days");
            entity.Property(e => e.Email)
                .HasMaxLength(256)
                .HasColumnName("email");
            entity.Property(e => e.InvoiceDay)
                .HasDefaultValue((short)28)
                .HasColumnName("invoice_day");
            entity.Property(e => e.IsActive)
                .HasDefaultValue(true)
                .HasColumnName("is_active");
            entity.Property(e => e.Latitude)
                .HasPrecision(10, 7)
                .HasColumnName("latitude");
            entity.Property(e => e.Locality)
                .HasMaxLength(150)
                .HasColumnName("locality");
            entity.Property(e => e.Longitude)
                .HasPrecision(10, 7)
                .HasColumnName("longitude");
            entity.Property(e => e.Name)
                .HasMaxLength(200)
                .HasColumnName("name");
            entity.Property(e => e.OrganizationId).HasColumnName("organization_id");
            entity.Property(e => e.Phone)
                .HasMaxLength(30)
                .HasColumnName("phone");
            entity.Property(e => e.ProrationPolicy)
                .HasMaxLength(20)
                .HasDefaultValueSql("'actual_days'::character varying")
                .HasColumnName("proration_policy");
            entity.Property(e => e.Province)
                .HasMaxLength(100)
                .HasColumnName("province");

            entity.HasOne(d => d.Organization).WithMany(p => p.Properties)
                .HasForeignKey(d => d.OrganizationId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("properties_organization_id_fkey");
        });

        modelBuilder.Entity<RentalInquiry>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("rental_inquiries_pkey");

            entity.ToTable("rental_inquiries", "smartrent", tb => tb.HasComment("Yêu cầu xem phòng khách đặt ở trang phòng, xử lý ở Lịch xem phòng của admin. Không giữ chỗ, không đổi trạng thái phòng."));

            entity.HasIndex(e => new { e.Status, e.CreatedAt }, "ix_inquiries_queue").IsDescending(false, true);

            entity.HasIndex(e => e.AssignedTo, "ix_rental_inquiries_assigned_to");

            entity.HasIndex(e => e.RoomId, "ix_rental_inquiries_room_id");

            entity.HasIndex(e => e.TenantId, "ix_rental_inquiries_tenant_id");

            entity.HasIndex(e => e.Code, "rental_inquiries_code_key").IsUnique();

            entity.HasIndex(e => new { e.TenantId, e.RoomId }, "ux_inquiry_open")
                .IsUnique()
                .HasFilter("((tenant_id IS NOT NULL) AND ((status)::text = ANY ((ARRAY['new'::character varying, 'accepted'::character varying, 'consulting'::character varying, 'viewing'::character varying, 'approved'::character varying])::text[])))");

            entity.Property(e => e.Id)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("id");
            entity.Property(e => e.AssignedTo).HasColumnName("assigned_to");
            entity.Property(e => e.ClosedReason).HasColumnName("closed_reason");
            entity.Property(e => e.Code)
                .HasMaxLength(80)
                .HasColumnName("code");
            entity.Property(e => e.ContactName)
                .HasMaxLength(200)
                .HasColumnName("contact_name");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("created_at");
            entity.Property(e => e.DesiredMoveIn).HasColumnName("desired_move_in");
            entity.Property(e => e.Email)
                .HasMaxLength(256)
                .HasColumnName("email");
            entity.Property(e => e.Message).HasColumnName("message");
            entity.Property(e => e.Occupants)
                .HasDefaultValue((short)1)
                .HasColumnName("occupants");
            entity.Property(e => e.Phone)
                .HasMaxLength(30)
                .HasColumnName("phone");
            entity.Property(e => e.PreferredViewingAt).HasColumnName("preferred_viewing_at");
            entity.Property(e => e.RoomId).HasColumnName("room_id");
            entity.Property(e => e.Source)
                .HasMaxLength(10)
                .HasDefaultValueSql("'public'::character varying")
                .HasColumnName("source");
            entity.Property(e => e.Status)
                .HasMaxLength(15)
                .HasDefaultValueSql("'new'::character varying")
                .HasColumnName("status");
            entity.Property(e => e.TenantId).HasColumnName("tenant_id");

            entity.HasOne(d => d.AssignedToNavigation).WithMany(p => p.RentalInquiries)
                .HasForeignKey(d => d.AssignedTo)
                .HasConstraintName("rental_inquiries_assigned_to_fkey");

            entity.HasOne(d => d.Room).WithMany(p => p.RentalInquiries)
                .HasForeignKey(d => d.RoomId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("rental_inquiries_room_id_fkey");

            entity.HasOne(d => d.Tenant).WithMany(p => p.RentalInquiries)
                .HasForeignKey(d => d.TenantId)
                .HasConstraintName("rental_inquiries_tenant_id_fkey");
        });

        modelBuilder.Entity<Role>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("roles_pkey");

            entity.ToTable("roles", "smartrent", tb => tb.HasComment("Vai trò toàn hệ thống của Identity, hiện chỉ có SystemAdmin. Không dùng để cấp quyền trong đơn vị."));

            entity.HasIndex(e => e.NormalizedName, "ux_roles_name")
                .IsUnique()
                .HasFilter("(normalized_name IS NOT NULL)");

            entity.Property(e => e.Id)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("id");
            entity.Property(e => e.ConcurrencyStamp).HasColumnName("concurrency_stamp");
            entity.Property(e => e.Name)
                .HasMaxLength(256)
                .HasColumnName("name");
            entity.Property(e => e.NormalizedName)
                .HasMaxLength(256)
                .HasColumnName("normalized_name");
        });

        modelBuilder.Entity<RoleClaim>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("role_claims_pkey");

            entity.ToTable("role_claims", "smartrent", tb => tb.HasComment("Claim của vai trò toàn hệ thống, bảng chuẩn của Identity."));

            entity.HasIndex(e => e.RoleId, "ix_role_claims_role_id");

            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.ClaimType).HasColumnName("claim_type");
            entity.Property(e => e.ClaimValue).HasColumnName("claim_value");
            entity.Property(e => e.RoleId).HasColumnName("role_id");

            entity.HasOne(d => d.Role).WithMany(p => p.RoleClaims)
                .HasForeignKey(d => d.RoleId)
                .HasConstraintName("role_claims_role_id_fkey");
        });

        modelBuilder.Entity<Room>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("rooms_pkey");

            entity.ToTable("rooms", "smartrent", tb => tb.HasComment("Phòng. operating_status chỉ nói phòng được khai thác hay không; Đã thuê suy từ tenancies qua v_room_status, không lưu ở đây."));

            entity.HasIndex(e => e.RoomTypeId, "ix_rooms_room_type_id");

            entity.HasIndex(e => new { e.PropertyId, e.Code }, "rooms_property_id_code_key").IsUnique();

            entity.Property(e => e.Id)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("id");
            entity.Property(e => e.AreaM2)
                .HasPrecision(8, 2)
                .HasColumnName("area_m2");
            entity.Property(e => e.Capacity).HasColumnName("capacity");
            entity.Property(e => e.Code)
                .HasMaxLength(40)
                .HasColumnName("code");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("created_at");
            entity.Property(e => e.Description).HasColumnName("description");
            entity.Property(e => e.FloorLabel)
                .HasMaxLength(30)
                .HasColumnName("floor_label");
            entity.Property(e => e.Name)
                .HasMaxLength(150)
                .HasColumnName("name");
            entity.Property(e => e.OperatingStatus)
                .HasMaxLength(15)
                .HasDefaultValueSql("'available'::character varying")
                .HasColumnName("operating_status");
            entity.Property(e => e.PropertyId).HasColumnName("property_id");
            entity.Property(e => e.RequiredDeposit)
                .HasPrecision(18)
                .HasComment("Tiền cọc đề xuất khi chào thuê. Cọc đã thỏa thuận ở contract_versions, cọc thực thu ở deposit_entries.")
                .HasColumnName("required_deposit");
            entity.Property(e => e.RoomTypeId).HasColumnName("room_type_id");
            entity.Property(e => e.RulesText).HasColumnName("rules_text");

            entity.HasOne(d => d.Property).WithMany(p => p.Rooms)
                .HasForeignKey(d => d.PropertyId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("rooms_property_id_fkey");

            entity.HasOne(d => d.RoomType).WithMany(p => p.Rooms)
                .HasForeignKey(d => d.RoomTypeId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("rooms_room_type_id_fkey");

            entity.HasMany(d => d.Amenities).WithMany(p => p.Rooms)
                .UsingEntity<Dictionary<string, object>>(
                    "RoomAmenity",
                    r => r.HasOne<Amenity>().WithMany()
                        .HasForeignKey("AmenityId")
                        .OnDelete(DeleteBehavior.ClientSetNull)
                        .HasConstraintName("room_amenities_amenity_id_fkey"),
                    l => l.HasOne<Room>().WithMany()
                        .HasForeignKey("RoomId")
                        .HasConstraintName("room_amenities_room_id_fkey"),
                    j =>
                    {
                        j.HasKey("RoomId", "AmenityId").HasName("room_amenities_pkey");
                        j.ToTable("room_amenities", "smartrent", tb => tb.HasComment("Tiện ích của từng phòng (N-N)."));
                        j.HasIndex(new[] { "AmenityId" }, "ix_room_amenities_amenity_id");
                        j.IndexerProperty<Guid>("RoomId").HasColumnName("room_id");
                        j.IndexerProperty<Guid>("AmenityId").HasColumnName("amenity_id");
                    });
        });

        modelBuilder.Entity<RoomImage>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("room_images_pkey");

            entity.ToTable("room_images", "smartrent", tb => tb.HasComment("Ảnh phòng, thứ tự và ảnh bìa; mỗi phòng tối đa một ảnh bìa."));

            entity.HasIndex(e => e.FileId, "ix_room_images_file_id");

            entity.HasIndex(e => new { e.RoomId, e.FileId }, "room_images_room_id_file_id_key").IsUnique();

            entity.HasIndex(e => e.RoomId, "ux_room_cover")
                .IsUnique()
                .HasFilter("is_cover");

            entity.Property(e => e.Id)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("id");
            entity.Property(e => e.Caption).HasColumnName("caption");
            entity.Property(e => e.FileId).HasColumnName("file_id");
            entity.Property(e => e.IsCover).HasColumnName("is_cover");
            entity.Property(e => e.RoomId).HasColumnName("room_id");
            entity.Property(e => e.SortOrder).HasColumnName("sort_order");

            entity.HasOne(d => d.File).WithMany(p => p.RoomImages)
                .HasForeignKey(d => d.FileId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("room_images_file_id_fkey");

            entity.HasOne(d => d.Room).WithOne(p => p.RoomImage)
                .HasForeignKey<RoomImage>(d => d.RoomId)
                .HasConstraintName("room_images_room_id_fkey");
        });

        modelBuilder.Entity<RoomListing>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("room_listings_pkey");

            entity.ToTable("room_listings", "smartrent", tb => tb.HasComment("Tin đăng ở trang Thuê phòng, độc lập với việc có người ở; slug là đường dẫn /rooms/:slug."));

            entity.HasIndex(e => new { e.Status, e.PublishedAt }, "ix_listing_published").IsDescending(false, true);

            entity.HasIndex(e => e.RoomId, "room_listings_room_id_key").IsUnique();

            entity.HasIndex(e => e.Slug, "room_listings_slug_key").IsUnique();

            entity.Property(e => e.Id)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("id");
            entity.Property(e => e.Description).HasColumnName("description");
            entity.Property(e => e.PublishedAt).HasColumnName("published_at");
            entity.Property(e => e.RoomId).HasColumnName("room_id");
            entity.Property(e => e.Slug)
                .HasMaxLength(250)
                .HasColumnName("slug");
            entity.Property(e => e.Status)
                .HasMaxLength(10)
                .HasDefaultValueSql("'draft'::character varying")
                .HasColumnName("status");
            entity.Property(e => e.Title)
                .HasMaxLength(250)
                .HasColumnName("title");
            entity.Property(e => e.UpdatedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("updated_at");
            entity.Property(e => e.VideoUrl).HasColumnName("video_url");

            entity.HasOne(d => d.Room).WithOne(p => p.RoomListing)
                .HasForeignKey<RoomListing>(d => d.RoomId)
                .HasConstraintName("room_listings_room_id_fkey");
        });

        modelBuilder.Entity<RoomStatusEvent>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("room_status_events_pkey");

            entity.ToTable("room_status_events", "smartrent", tb => tb.HasComment("Lịch sử đưa phòng vào bảo trì, ngừng khai thác hoặc khai thác lại, có lý do."));

            entity.HasIndex(e => e.ChangedBy, "ix_room_status_events_changed_by");

            entity.HasIndex(e => e.RoomId, "ix_room_status_events_room_id");

            entity.Property(e => e.Id)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("id");
            entity.Property(e => e.ChangedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("changed_at");
            entity.Property(e => e.ChangedBy).HasColumnName("changed_by");
            entity.Property(e => e.NewStatus)
                .HasMaxLength(15)
                .HasColumnName("new_status");
            entity.Property(e => e.OldStatus)
                .HasMaxLength(15)
                .HasColumnName("old_status");
            entity.Property(e => e.Reason).HasColumnName("reason");
            entity.Property(e => e.RoomId).HasColumnName("room_id");

            entity.HasOne(d => d.ChangedByNavigation).WithMany(p => p.RoomStatusEvents)
                .HasForeignKey(d => d.ChangedBy)
                .HasConstraintName("room_status_events_changed_by_fkey");

            entity.HasOne(d => d.Room).WithMany(p => p.RoomStatusEvents)
                .HasForeignKey(d => d.RoomId)
                .HasConstraintName("room_status_events_room_id_fkey");
        });

        modelBuilder.Entity<RoomType>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("room_types_pkey");

            entity.ToTable("room_types", "smartrent", tb => tb.HasComment("Loại phòng, dùng để lọc ở trang Thuê phòng. Form admin không hỏi loại nên phòng mới nhận loại STANDARD của đơn vị."));

            entity.HasIndex(e => new { e.OrganizationId, e.Code }, "room_types_organization_id_code_key").IsUnique();

            entity.Property(e => e.Id)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("id");
            entity.Property(e => e.Code)
                .HasMaxLength(40)
                .HasColumnName("code");
            entity.Property(e => e.Description).HasColumnName("description");
            entity.Property(e => e.Name)
                .HasMaxLength(100)
                .HasColumnName("name");
            entity.Property(e => e.OrganizationId).HasColumnName("organization_id");

            entity.HasOne(d => d.Organization).WithMany(p => p.RoomTypes)
                .HasForeignKey(d => d.OrganizationId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("room_types_organization_id_fkey");
        });

        modelBuilder.Entity<RoomViewing>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("room_viewings_pkey");

            entity.ToTable("room_viewings", "smartrent", tb => tb.HasComment("Lịch hẹn xem phòng admin xếp và kết quả sau khi xem."));

            entity.HasIndex(e => e.HostUserId, "ix_room_viewings_host_user_id");

            entity.HasIndex(e => e.InquiryId, "ix_room_viewings_inquiry_id");

            entity.Property(e => e.Id)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("id");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("created_at");
            entity.Property(e => e.EndsAt).HasColumnName("ends_at");
            entity.Property(e => e.HostUserId).HasColumnName("host_user_id");
            entity.Property(e => e.InquiryId).HasColumnName("inquiry_id");
            entity.Property(e => e.ResultNotes).HasColumnName("result_notes");
            entity.Property(e => e.StartsAt).HasColumnName("starts_at");
            entity.Property(e => e.Status)
                .HasMaxLength(12)
                .HasDefaultValueSql("'scheduled'::character varying")
                .HasColumnName("status");

            entity.HasOne(d => d.HostUser).WithMany(p => p.RoomViewings)
                .HasForeignKey(d => d.HostUserId)
                .HasConstraintName("room_viewings_host_user_id_fkey");

            entity.HasOne(d => d.Inquiry).WithMany(p => p.RoomViewings)
                .HasForeignKey(d => d.InquiryId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("room_viewings_inquiry_id_fkey");
        });

        modelBuilder.Entity<SlaPolicy>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("sla_policies_pkey");

            entity.ToTable("sla_policies", "smartrent", tb => tb.HasComment("Số giờ xử lý theo mức ưu tiên, tính liên tục 24/7: 4, 12, 48, 96 giờ."));

            entity.HasIndex(e => new { e.OrganizationId, e.Priority }, "sla_policies_organization_id_priority_key").IsUnique();

            entity.Property(e => e.Id)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("id");
            entity.Property(e => e.OrganizationId).HasColumnName("organization_id");
            entity.Property(e => e.Priority)
                .HasMaxLength(10)
                .HasColumnName("priority");
            entity.Property(e => e.TargetHours).HasColumnName("target_hours");

            entity.HasOne(d => d.Organization).WithMany(p => p.SlaPolicies)
                .HasForeignKey(d => d.OrganizationId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("sla_policies_organization_id_fkey");
        });

        modelBuilder.Entity<StoredFile>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("stored_files_pkey");

            entity.ToTable("stored_files", "smartrent", tb => tb.HasComment("Thông tin tệp; nội dung tệp nằm ở kho lưu trữ. Tệp private chỉ tải qua đường dẫn có hạn sau khi kiểm tra quyền."));

            entity.HasIndex(e => e.OrganizationId, "ix_stored_files_organization_id");

            entity.HasIndex(e => e.UploadedBy, "ix_stored_files_uploaded_by");

            entity.HasIndex(e => e.StorageKey, "stored_files_storage_key_key").IsUnique();

            entity.Property(e => e.Id)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("id");
            entity.Property(e => e.ByteSize).HasColumnName("byte_size");
            entity.Property(e => e.ContentType)
                .HasMaxLength(150)
                .HasColumnName("content_type");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("created_at");
            entity.Property(e => e.OrganizationId).HasColumnName("organization_id");
            entity.Property(e => e.OriginalName).HasColumnName("original_name");
            entity.Property(e => e.Purpose)
                .HasMaxLength(30)
                .HasDefaultValueSql("'other'::character varying")
                .HasColumnName("purpose");
            entity.Property(e => e.ScanStatus)
                .HasMaxLength(15)
                .HasDefaultValueSql("'pending'::character varying")
                .HasColumnName("scan_status");
            entity.Property(e => e.Sha256)
                .HasMaxLength(64)
                .IsFixedLength()
                .HasColumnName("sha256");
            entity.Property(e => e.StorageKey).HasColumnName("storage_key");
            entity.Property(e => e.UploadedBy).HasColumnName("uploaded_by");
            entity.Property(e => e.Visibility)
                .HasMaxLength(10)
                .HasDefaultValueSql("'private'::character varying")
                .HasColumnName("visibility");

            entity.HasOne(d => d.Organization).WithMany(p => p.StoredFiles)
                .HasForeignKey(d => d.OrganizationId)
                .HasConstraintName("stored_files_organization_id_fkey");

            entity.HasOne(d => d.UploadedByNavigation).WithMany(p => p.StoredFiles)
                .HasForeignKey(d => d.UploadedBy)
                .HasConstraintName("stored_files_uploaded_by_fkey");
        });

        modelBuilder.Entity<SupportAccessGrant>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("support_access_grants_pkey");

            entity.ToTable("support_access_grants", "smartrent", tb => tb.HasComment("Quyền hỗ trợ có lý do, có hạn do chủ trọ cấp cho quản trị hệ thống. Hiện ở trang Hỗ trợ và vận hành."));

            entity.HasIndex(e => e.GrantedBy, "ix_support_access_grants_granted_by");

            entity.HasIndex(e => e.OrganizationId, "ix_support_access_grants_organization_id");

            entity.HasIndex(e => e.UserId, "ix_support_access_grants_user_id");

            entity.Property(e => e.Id)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("id");
            entity.Property(e => e.ExpiresAt).HasColumnName("expires_at");
            entity.Property(e => e.GrantedBy).HasColumnName("granted_by");
            entity.Property(e => e.OrganizationId).HasColumnName("organization_id");
            entity.Property(e => e.Reason).HasColumnName("reason");
            entity.Property(e => e.RevokedAt).HasColumnName("revoked_at");
            entity.Property(e => e.StartsAt).HasColumnName("starts_at");
            entity.Property(e => e.UserId).HasColumnName("user_id");

            entity.HasOne(d => d.GrantedByNavigation).WithMany(p => p.SupportAccessGrantGrantedByNavigations)
                .HasForeignKey(d => d.GrantedBy)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("support_access_grants_granted_by_fkey");

            entity.HasOne(d => d.Organization).WithMany(p => p.SupportAccessGrants)
                .HasForeignKey(d => d.OrganizationId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("support_access_grants_organization_id_fkey");

            entity.HasOne(d => d.User).WithMany(p => p.SupportAccessGrantUsers)
                .HasForeignKey(d => d.UserId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("support_access_grants_user_id_fkey");
        });

        modelBuilder.Entity<Tenancy>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("tenancies_pkey");

            entity.ToTable("tenancies", "smartrent", tb => tb.HasComment("Một đợt ở của khách đại diện trong một phòng, là lịch sử thuê của phòng. onboarding_mode = import là khách đang ở được nhập từ form phòng hoặc từ dữ liệu cũ, chưa có hợp đồng."));

            entity.HasIndex(e => e.CreatedBy, "ix_tenancies_created_by");

            entity.HasIndex(e => e.EndedBy, "ix_tenancies_ended_by");

            entity.HasIndex(e => e.InquiryId, "ix_tenancies_inquiry_id");

            entity.HasIndex(e => e.RepresentativeTenantId, "ix_tenancies_representative_tenant_id");

            entity.HasIndex(e => e.RoomId, "ix_tenancies_room_id");

            entity.HasIndex(e => new { e.RoomId, e.Stay }, "tenancies_room_id_stay_excl")
                .HasFilter("((status)::text <> 'cancelled'::text)")
                .HasMethod("gist");

            entity.HasIndex(e => e.RepresentativeTenantId, "ux_representative_active")
                .IsUnique()
                .HasFilter("((status)::text = ANY ((ARRAY['planned'::character varying, 'active'::character varying])::text[]))");

            entity.Property(e => e.Id)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("id");
            entity.Property(e => e.ActualMoveIn).HasColumnName("actual_move_in");
            entity.Property(e => e.ActualMoveOut).HasColumnName("actual_move_out");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("created_at");
            entity.Property(e => e.CreatedBy).HasColumnName("created_by");
            entity.Property(e => e.EndReason).HasColumnName("end_reason");
            entity.Property(e => e.EndedBy).HasColumnName("ended_by");
            entity.Property(e => e.InquiryId).HasColumnName("inquiry_id");
            entity.Property(e => e.OnboardingMode)
                .HasMaxLength(10)
                .HasDefaultValueSql("'normal'::character varying")
                .HasColumnName("onboarding_mode");
            entity.Property(e => e.PlannedMoveIn).HasColumnName("planned_move_in");
            entity.Property(e => e.RepresentativeTenantId).HasColumnName("representative_tenant_id");
            entity.Property(e => e.RoomId).HasColumnName("room_id");
            entity.Property(e => e.Status)
                .HasMaxLength(12)
                .HasDefaultValueSql("'planned'::character varying")
                .HasColumnName("status");
            entity.Property(e => e.Stay)
                .HasComputedColumnSql("daterange(COALESCE(actual_move_in, planned_move_in), actual_move_out, '[)'::text)", true)
                .HasComment("Khoảng ở [ngày vào, ngày trả), tính tự động. Đang ở thì chưa có cận trên.")
                .HasColumnName("stay");

            entity.HasOne(d => d.CreatedByNavigation).WithMany(p => p.TenancyCreatedByNavigations)
                .HasForeignKey(d => d.CreatedBy)
                .HasConstraintName("tenancies_created_by_fkey");

            entity.HasOne(d => d.EndedByNavigation).WithMany(p => p.TenancyEndedByNavigations)
                .HasForeignKey(d => d.EndedBy)
                .HasConstraintName("tenancies_ended_by_fkey");

            entity.HasOne(d => d.Inquiry).WithMany(p => p.Tenancies)
                .HasForeignKey(d => d.InquiryId)
                .HasConstraintName("tenancies_inquiry_id_fkey");

            entity.HasOne(d => d.RepresentativeTenant).WithOne(p => p.Tenancy)
                .HasForeignKey<Tenancy>(d => d.RepresentativeTenantId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("tenancies_representative_tenant_id_fkey");

            entity.HasOne(d => d.Room).WithMany(p => p.Tenancies)
                .HasForeignKey(d => d.RoomId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("tenancies_room_id_fkey");
        });

        modelBuilder.Entity<TenancyRequest>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("tenancy_requests_pkey");

            entity.ToTable("tenancy_requests", "smartrent", tb => tb.HasComment("Đề nghị gia hạn hoặc trả phòng khách gửi từ trang Hợp đồng; gửi chưa làm thay đổi hợp đồng."));

            entity.HasIndex(e => e.RequestedBy, "ix_tenancy_requests_requested_by");

            entity.HasIndex(e => e.ReviewedBy, "ix_tenancy_requests_reviewed_by");

            entity.HasIndex(e => e.TenancyId, "ix_tenancy_requests_tenancy_id");

            entity.HasIndex(e => new { e.TenancyId, e.RequestType }, "ux_tenancy_request_pending")
                .IsUnique()
                .HasFilter("((status)::text = 'pending'::text)");

            entity.Property(e => e.Id)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("id");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("created_at");
            entity.Property(e => e.DecisionNotes).HasColumnName("decision_notes");
            entity.Property(e => e.DesiredOn).HasColumnName("desired_on");
            entity.Property(e => e.Message).HasColumnName("message");
            entity.Property(e => e.RequestType)
                .HasMaxLength(12)
                .HasColumnName("request_type");
            entity.Property(e => e.RequestedBy).HasColumnName("requested_by");
            entity.Property(e => e.ReviewedAt).HasColumnName("reviewed_at");
            entity.Property(e => e.ReviewedBy).HasColumnName("reviewed_by");
            entity.Property(e => e.Status)
                .HasMaxLength(12)
                .HasDefaultValueSql("'pending'::character varying")
                .HasColumnName("status");
            entity.Property(e => e.TenancyId).HasColumnName("tenancy_id");

            entity.HasOne(d => d.RequestedByNavigation).WithMany(p => p.TenancyRequestRequestedByNavigations)
                .HasForeignKey(d => d.RequestedBy)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("tenancy_requests_requested_by_fkey");

            entity.HasOne(d => d.ReviewedByNavigation).WithMany(p => p.TenancyRequestReviewedByNavigations)
                .HasForeignKey(d => d.ReviewedBy)
                .HasConstraintName("tenancy_requests_reviewed_by_fkey");

            entity.HasOne(d => d.Tenancy).WithMany(p => p.TenancyRequests)
                .HasForeignKey(d => d.TenancyId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("tenancy_requests_tenancy_id_fkey");
        });

        modelBuilder.Entity<TenancyResident>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("tenancy_residents_pkey");

            entity.ToTable("tenancy_residents", "smartrent", tb => tb.HasComment("Người ở cùng. Họ xem được phòng và điều khoản, không có nghĩa vụ thanh toán và không xem công nợ của người đại diện."));

            entity.HasIndex(e => e.TenantId, "ix_tenancy_residents_tenant_id");

            entity.Property(e => e.Id)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("id");
            entity.Property(e => e.JoinedOn).HasColumnName("joined_on");
            entity.Property(e => e.LeftOn).HasColumnName("left_on");
            entity.Property(e => e.Relationship)
                .HasMaxLength(100)
                .HasColumnName("relationship");
            entity.Property(e => e.TenancyId).HasColumnName("tenancy_id");
            entity.Property(e => e.TenantId).HasColumnName("tenant_id");

            entity.HasOne(d => d.Tenancy).WithMany(p => p.TenancyResidents)
                .HasForeignKey(d => d.TenancyId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("tenancy_residents_tenancy_id_fkey");

            entity.HasOne(d => d.Tenant).WithMany(p => p.TenancyResidents)
                .HasForeignKey(d => d.TenantId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("tenancy_residents_tenant_id_fkey");
        });

        modelBuilder.Entity<Tenant>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("tenants_pkey");

            entity.ToTable("tenants", "smartrent", tb => tb.HasComment("Hồ sơ khách theo từng đơn vị, hiện ở mục Khách thuê của admin. Khách tự đăng ký có user_id; khách nhập tay có thể chưa có tài khoản. Điện thoại không bắt buộc duy nhất vì người thân có thể dùng chung số."));

            entity.HasIndex(e => new { e.OrganizationId, e.Phone }, "ix_tenant_phone");

            entity.HasIndex(e => e.UserId, "ix_tenants_user_id");

            entity.HasIndex(e => new { e.OrganizationId, e.Code }, "tenants_organization_id_code_key").IsUnique();

            entity.HasIndex(e => new { e.OrganizationId, e.UserId }, "ux_tenant_account")
                .IsUnique()
                .HasFilter("(user_id IS NOT NULL)");

            entity.Property(e => e.Id)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("id");
            entity.Property(e => e.AddressLine).HasColumnName("address_line");
            entity.Property(e => e.Code)
                .HasMaxLength(40)
                .HasColumnName("code");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("created_at");
            entity.Property(e => e.DateOfBirth).HasColumnName("date_of_birth");
            entity.Property(e => e.Email)
                .HasMaxLength(256)
                .HasColumnName("email");
            entity.Property(e => e.EmergencyContactName)
                .HasMaxLength(200)
                .HasColumnName("emergency_contact_name");
            entity.Property(e => e.EmergencyContactPhone)
                .HasMaxLength(30)
                .HasColumnName("emergency_contact_phone");
            entity.Property(e => e.FullName)
                .HasMaxLength(200)
                .HasColumnName("full_name");
            entity.Property(e => e.Notes).HasColumnName("notes");
            entity.Property(e => e.OrganizationId).HasColumnName("organization_id");
            entity.Property(e => e.Phone)
                .HasMaxLength(30)
                .HasColumnName("phone");
            entity.Property(e => e.UserId).HasColumnName("user_id");

            entity.HasOne(d => d.Organization).WithMany(p => p.Tenants)
                .HasForeignKey(d => d.OrganizationId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("tenants_organization_id_fkey");

            entity.HasOne(d => d.User).WithMany(p => p.Tenants)
                .HasForeignKey(d => d.UserId)
                .HasConstraintName("tenants_user_id_fkey");
        });

        modelBuilder.Entity<TenantIdentityDocument>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("tenant_identity_documents_pkey");

            entity.ToTable("tenant_identity_documents", "smartrent", tb => tb.HasComment("Giấy tờ tùy thân. Số giấy tờ chỉ lưu dạng mã hóa, fingerprint để tra trùng, number_last4 để hiển thị che số. Ảnh giấy tờ bắt buộc là tệp private."));

            entity.HasIndex(e => e.BackFileId, "ix_tenant_identity_documents_back_file_id");

            entity.HasIndex(e => e.FrontFileId, "ix_tenant_identity_documents_front_file_id");

            entity.HasIndex(e => e.VerifiedBy, "ix_tenant_identity_documents_verified_by");

            entity.HasIndex(e => new { e.TenantId, e.DocumentType, e.NumberFingerprint }, "tenant_identity_documents_tenant_id_document_type_number_fi_key").IsUnique();

            entity.Property(e => e.Id)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("id");
            entity.Property(e => e.BackFileId).HasColumnName("back_file_id");
            entity.Property(e => e.DocumentType)
                .HasMaxLength(30)
                .HasColumnName("document_type");
            entity.Property(e => e.ExpiresOn).HasColumnName("expires_on");
            entity.Property(e => e.FrontFileId).HasColumnName("front_file_id");
            entity.Property(e => e.IssuedOn).HasColumnName("issued_on");
            entity.Property(e => e.IssuingAuthority).HasColumnName("issuing_authority");
            entity.Property(e => e.NumberCiphertext).HasColumnName("number_ciphertext");
            entity.Property(e => e.NumberFingerprint)
                .HasMaxLength(128)
                .HasColumnName("number_fingerprint");
            entity.Property(e => e.NumberLast4)
                .HasMaxLength(4)
                .HasColumnName("number_last4");
            entity.Property(e => e.TenantId).HasColumnName("tenant_id");
            entity.Property(e => e.VerifiedAt).HasColumnName("verified_at");
            entity.Property(e => e.VerifiedBy).HasColumnName("verified_by");

            entity.HasOne(d => d.BackFile).WithMany(p => p.TenantIdentityDocumentBackFiles)
                .HasForeignKey(d => d.BackFileId)
                .HasConstraintName("tenant_identity_documents_back_file_id_fkey");

            entity.HasOne(d => d.FrontFile).WithMany(p => p.TenantIdentityDocumentFrontFiles)
                .HasForeignKey(d => d.FrontFileId)
                .HasConstraintName("tenant_identity_documents_front_file_id_fkey");

            entity.HasOne(d => d.Tenant).WithMany(p => p.TenantIdentityDocuments)
                .HasForeignKey(d => d.TenantId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("tenant_identity_documents_tenant_id_fkey");

            entity.HasOne(d => d.VerifiedByNavigation).WithMany(p => p.TenantIdentityDocuments)
                .HasForeignKey(d => d.VerifiedBy)
                .HasConstraintName("tenant_identity_documents_verified_by_fkey");
        });

        modelBuilder.Entity<TenantProfileChangeRequest>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("tenant_profile_change_requests_pkey");

            entity.ToTable("tenant_profile_change_requests", "smartrent", tb => tb.HasComment("Khách đề nghị đổi liên hệ ở trang Tài khoản, admin duyệt ở hồ sơ khách. Họ tên và giấy tờ phải đối chiếu trực tiếp nên không có ở đây."));

            entity.HasIndex(e => e.RequestedBy, "ix_tenant_profile_change_requests_requested_by");

            entity.HasIndex(e => e.ReviewedBy, "ix_tenant_profile_change_requests_reviewed_by");

            entity.HasIndex(e => e.TenantId, "ix_tenant_profile_change_requests_tenant_id");

            entity.HasIndex(e => e.TenantId, "ux_profile_request_pending")
                .IsUnique()
                .HasFilter("((status)::text = 'pending'::text)");

            entity.Property(e => e.Id)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("id");
            entity.Property(e => e.ProposedEmail)
                .HasMaxLength(256)
                .HasColumnName("proposed_email");
            entity.Property(e => e.ProposedEmergencyContactName)
                .HasMaxLength(200)
                .HasColumnName("proposed_emergency_contact_name");
            entity.Property(e => e.ProposedEmergencyContactPhone)
                .HasMaxLength(30)
                .HasColumnName("proposed_emergency_contact_phone");
            entity.Property(e => e.ProposedPhone)
                .HasMaxLength(30)
                .HasColumnName("proposed_phone");
            entity.Property(e => e.Reason).HasColumnName("reason");
            entity.Property(e => e.RequestedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("requested_at");
            entity.Property(e => e.RequestedBy).HasColumnName("requested_by");
            entity.Property(e => e.ReviewNotes).HasColumnName("review_notes");
            entity.Property(e => e.ReviewedAt).HasColumnName("reviewed_at");
            entity.Property(e => e.ReviewedBy).HasColumnName("reviewed_by");
            entity.Property(e => e.Status)
                .HasMaxLength(12)
                .HasDefaultValueSql("'pending'::character varying")
                .HasColumnName("status");
            entity.Property(e => e.TenantId).HasColumnName("tenant_id");

            entity.HasOne(d => d.RequestedByNavigation).WithMany(p => p.TenantProfileChangeRequestRequestedByNavigations)
                .HasForeignKey(d => d.RequestedBy)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("tenant_profile_change_requests_requested_by_fkey");

            entity.HasOne(d => d.ReviewedByNavigation).WithMany(p => p.TenantProfileChangeRequestReviewedByNavigations)
                .HasForeignKey(d => d.ReviewedBy)
                .HasConstraintName("tenant_profile_change_requests_reviewed_by_fkey");

            entity.HasOne(d => d.Tenant).WithOne(p => p.TenantProfileChangeRequest)
                .HasForeignKey<TenantProfileChangeRequest>(d => d.TenantId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("tenant_profile_change_requests_tenant_id_fkey");
        });

        modelBuilder.Entity<Ticket>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("tickets_pkey");

            entity.ToTable("tickets", "smartrent", tb => tb.HasComment("Yêu cầu hỗ trợ theo phòng, dùng chung giữa trang Hỗ trợ của khách và Ticket của admin."));

            entity.HasIndex(e => e.AssignedTo, "ix_tickets_assigned_to");

            entity.HasIndex(e => e.CategoryId, "ix_tickets_category_id");

            entity.HasIndex(e => new { e.Status, e.Priority, e.DueAt }, "ix_tickets_queue");

            entity.HasIndex(e => e.ReportedBy, "ix_tickets_reported_by");

            entity.HasIndex(e => e.RoomId, "ix_tickets_room_id");

            entity.HasIndex(e => e.SlaPolicyId, "ix_tickets_sla_policy_id");

            entity.HasIndex(e => e.TenancyId, "ix_tickets_tenancy_id");

            entity.HasIndex(e => e.Code, "tickets_code_key").IsUnique();

            entity.Property(e => e.Id)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("id");
            entity.Property(e => e.AssignedTo).HasColumnName("assigned_to");
            entity.Property(e => e.CategoryId).HasColumnName("category_id");
            entity.Property(e => e.ClosedAt).HasColumnName("closed_at");
            entity.Property(e => e.Code)
                .HasMaxLength(80)
                .HasColumnName("code");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("created_at");
            entity.Property(e => e.Description).HasColumnName("description");
            entity.Property(e => e.DueAt).HasColumnName("due_at");
            entity.Property(e => e.Priority)
                .HasMaxLength(10)
                .HasDefaultValueSql("'normal'::character varying")
                .HasColumnName("priority");
            entity.Property(e => e.ReportedBy).HasColumnName("reported_by");
            entity.Property(e => e.ResolutionNotes).HasColumnName("resolution_notes");
            entity.Property(e => e.ResolvedAt).HasColumnName("resolved_at");
            entity.Property(e => e.RoomId).HasColumnName("room_id");
            entity.Property(e => e.SlaPolicyId).HasColumnName("sla_policy_id");
            entity.Property(e => e.Status)
                .HasMaxLength(15)
                .HasDefaultValueSql("'new'::character varying")
                .HasColumnName("status");
            entity.Property(e => e.TenancyId).HasColumnName("tenancy_id");
            entity.Property(e => e.Title)
                .HasMaxLength(250)
                .HasColumnName("title");

            entity.HasOne(d => d.AssignedToNavigation).WithMany(p => p.TicketAssignedToNavigations)
                .HasForeignKey(d => d.AssignedTo)
                .HasConstraintName("tickets_assigned_to_fkey");

            entity.HasOne(d => d.Category).WithMany(p => p.Tickets)
                .HasForeignKey(d => d.CategoryId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("tickets_category_id_fkey");

            entity.HasOne(d => d.ReportedByNavigation).WithMany(p => p.TicketReportedByNavigations)
                .HasForeignKey(d => d.ReportedBy)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("tickets_reported_by_fkey");

            entity.HasOne(d => d.Room).WithMany(p => p.Tickets)
                .HasForeignKey(d => d.RoomId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("tickets_room_id_fkey");

            entity.HasOne(d => d.SlaPolicy).WithMany(p => p.Tickets)
                .HasForeignKey(d => d.SlaPolicyId)
                .HasConstraintName("tickets_sla_policy_id_fkey");

            entity.HasOne(d => d.Tenancy).WithMany(p => p.Tickets)
                .HasForeignKey(d => d.TenancyId)
                .HasConstraintName("tickets_tenancy_id_fkey");
        });

        modelBuilder.Entity<TicketCategory>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("ticket_categories_pkey");

            entity.ToTable("ticket_categories", "smartrent", tb => tb.HasComment("Loại sự cố khách chọn khi gửi yêu cầu hỗ trợ."));

            entity.HasIndex(e => new { e.OrganizationId, e.Code }, "ticket_categories_organization_id_code_key").IsUnique();

            entity.Property(e => e.Id)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("id");
            entity.Property(e => e.Code)
                .HasMaxLength(40)
                .HasColumnName("code");
            entity.Property(e => e.Name)
                .HasMaxLength(100)
                .HasColumnName("name");
            entity.Property(e => e.OrganizationId).HasColumnName("organization_id");

            entity.HasOne(d => d.Organization).WithMany(p => p.TicketCategories)
                .HasForeignKey(d => d.OrganizationId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("ticket_categories_organization_id_fkey");
        });

        modelBuilder.Entity<TicketEvent>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("ticket_events_pkey");

            entity.ToTable("ticket_events", "smartrent", tb => tb.HasComment("Lịch sử đổi trạng thái, phân công, mở lại của ticket; chỉ ghi thêm."));

            entity.HasIndex(e => e.ActorId, "ix_ticket_events_actor_id");

            entity.HasIndex(e => e.NewAssigneeId, "ix_ticket_events_new_assignee_id");

            entity.HasIndex(e => e.OldAssigneeId, "ix_ticket_events_old_assignee_id");

            entity.HasIndex(e => e.TicketId, "ix_ticket_events_ticket_id");

            entity.Property(e => e.Id)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("id");
            entity.Property(e => e.ActorId).HasColumnName("actor_id");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("created_at");
            entity.Property(e => e.EventType)
                .HasMaxLength(30)
                .HasColumnName("event_type");
            entity.Property(e => e.NewAssigneeId).HasColumnName("new_assignee_id");
            entity.Property(e => e.NewStatus)
                .HasMaxLength(15)
                .HasColumnName("new_status");
            entity.Property(e => e.OldAssigneeId).HasColumnName("old_assignee_id");
            entity.Property(e => e.OldStatus)
                .HasMaxLength(15)
                .HasColumnName("old_status");
            entity.Property(e => e.Reason).HasColumnName("reason");
            entity.Property(e => e.TicketId).HasColumnName("ticket_id");

            entity.HasOne(d => d.Actor).WithMany(p => p.TicketEventActors)
                .HasForeignKey(d => d.ActorId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("ticket_events_actor_id_fkey");

            entity.HasOne(d => d.NewAssignee).WithMany(p => p.TicketEventNewAssignees)
                .HasForeignKey(d => d.NewAssigneeId)
                .HasConstraintName("ticket_events_new_assignee_id_fkey");

            entity.HasOne(d => d.OldAssignee).WithMany(p => p.TicketEventOldAssignees)
                .HasForeignKey(d => d.OldAssigneeId)
                .HasConstraintName("ticket_events_old_assignee_id_fkey");

            entity.HasOne(d => d.Ticket).WithMany(p => p.TicketEvents)
                .HasForeignKey(d => d.TicketId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("ticket_events_ticket_id_fkey");
        });

        modelBuilder.Entity<TicketFile>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("ticket_files_pkey");

            entity.ToTable("ticket_files", "smartrent", tb => tb.HasComment("Ảnh đính kèm ticket hoặc một tin nhắn trong ticket."));

            entity.HasIndex(e => e.FileId, "ix_ticket_files_file_id");

            entity.HasIndex(e => e.MessageId, "ix_ticket_files_message_id");

            entity.HasIndex(e => new { e.TicketId, e.FileId }, "ticket_files_ticket_id_file_id_key").IsUnique();

            entity.Property(e => e.Id)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("id");
            entity.Property(e => e.FileId).HasColumnName("file_id");
            entity.Property(e => e.MessageId).HasColumnName("message_id");
            entity.Property(e => e.TicketId).HasColumnName("ticket_id");

            entity.HasOne(d => d.File).WithMany(p => p.TicketFiles)
                .HasForeignKey(d => d.FileId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("ticket_files_file_id_fkey");

            entity.HasOne(d => d.Message).WithMany(p => p.TicketFiles)
                .HasForeignKey(d => d.MessageId)
                .HasConstraintName("ticket_files_message_id_fkey");

            entity.HasOne(d => d.Ticket).WithMany(p => p.TicketFiles)
                .HasForeignKey(d => d.TicketId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("ticket_files_ticket_id_fkey");
        });

        modelBuilder.Entity<TicketMessage>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("ticket_messages_pkey");

            entity.ToTable("ticket_messages", "smartrent", tb => tb.HasComment("Hội thoại của ticket. Ghi chú nội bộ (is_internal) không bao giờ trả cho khách."));

            entity.HasIndex(e => e.AuthorId, "ix_ticket_messages_author_id");

            entity.HasIndex(e => e.TicketId, "ix_ticket_messages_ticket_id");

            entity.Property(e => e.Id)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("id");
            entity.Property(e => e.AuthorId).HasColumnName("author_id");
            entity.Property(e => e.Body).HasColumnName("body");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("created_at");
            entity.Property(e => e.IsInternal).HasColumnName("is_internal");
            entity.Property(e => e.TicketId).HasColumnName("ticket_id");

            entity.HasOne(d => d.Author).WithMany(p => p.TicketMessages)
                .HasForeignKey(d => d.AuthorId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("ticket_messages_author_id_fkey");

            entity.HasOne(d => d.Ticket).WithMany(p => p.TicketMessages)
                .HasForeignKey(d => d.TicketId)
                .OnDelete(DeleteBehavior.ClientSetNull)
                .HasConstraintName("ticket_messages_ticket_id_fkey");
        });

        modelBuilder.Entity<User>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("users_pkey");

            entity.ToTable("users", "smartrent", tb => tb.HasComment("Tài khoản đăng nhập của cả nhân sự và khách. Mật khẩu chỉ lưu dạng băm. Chủ trọ sửa email, điện thoại ở Cài đặt và các số này hiện ở trang Liên hệ."));

            entity.HasIndex(e => e.AvatarFileId, "ix_users_avatar_file_id");

            entity.HasIndex(e => e.NormalizedEmail, "ux_users_email")
                .IsUnique()
                .HasFilter("(normalized_email IS NOT NULL)");

            entity.HasIndex(e => e.NormalizedUserName, "ux_users_name")
                .IsUnique()
                .HasFilter("(normalized_user_name IS NOT NULL)");

            entity.Property(e => e.Id)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("id");
            entity.Property(e => e.AccessFailedCount).HasColumnName("access_failed_count");
            entity.Property(e => e.AvatarFileId).HasColumnName("avatar_file_id");
            entity.Property(e => e.ConcurrencyStamp).HasColumnName("concurrency_stamp");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("created_at");
            entity.Property(e => e.DisplayName)
                .HasMaxLength(200)
                .HasColumnName("display_name");
            entity.Property(e => e.Email)
                .HasMaxLength(256)
                .HasColumnName("email");
            entity.Property(e => e.EmailConfirmed).HasColumnName("email_confirmed");
            entity.Property(e => e.IsActive)
                .HasDefaultValue(true)
                .HasColumnName("is_active");
            entity.Property(e => e.LastLoginAt).HasColumnName("last_login_at");
            entity.Property(e => e.LockoutEnabled)
                .HasDefaultValue(true)
                .HasColumnName("lockout_enabled");
            entity.Property(e => e.LockoutEnd).HasColumnName("lockout_end");
            entity.Property(e => e.NormalizedEmail)
                .HasMaxLength(256)
                .HasColumnName("normalized_email");
            entity.Property(e => e.NormalizedUserName)
                .HasMaxLength(256)
                .HasColumnName("normalized_user_name");
            entity.Property(e => e.PasswordHash).HasColumnName("password_hash");
            entity.Property(e => e.PhoneNumber).HasColumnName("phone_number");
            entity.Property(e => e.PhoneNumberConfirmed).HasColumnName("phone_number_confirmed");
            entity.Property(e => e.SecurityStamp).HasColumnName("security_stamp");
            entity.Property(e => e.TwoFactorEnabled).HasColumnName("two_factor_enabled");
            entity.Property(e => e.UserName)
                .HasMaxLength(256)
                .HasColumnName("user_name");

            entity.HasOne(d => d.AvatarFile).WithMany(p => p.Users)
                .HasForeignKey(d => d.AvatarFileId)
                .HasConstraintName("users_avatar_file_fk");

            entity.HasMany(d => d.Roles).WithMany(p => p.Users)
                .UsingEntity<Dictionary<string, object>>(
                    "UserRole",
                    r => r.HasOne<Role>().WithMany()
                        .HasForeignKey("RoleId")
                        .HasConstraintName("user_roles_role_id_fkey"),
                    l => l.HasOne<User>().WithMany()
                        .HasForeignKey("UserId")
                        .HasConstraintName("user_roles_user_id_fkey"),
                    j =>
                    {
                        j.HasKey("UserId", "RoleId").HasName("user_roles_pkey");
                        j.ToTable("user_roles", "smartrent", tb => tb.HasComment("Gán vai trò toàn hệ thống cho tài khoản (N-N users, roles)."));
                        j.HasIndex(new[] { "RoleId" }, "ix_user_roles_role_id");
                        j.IndexerProperty<Guid>("UserId").HasColumnName("user_id");
                        j.IndexerProperty<Guid>("RoleId").HasColumnName("role_id");
                    });
        });

        modelBuilder.Entity<UserClaim>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("user_claims_pkey");

            entity.ToTable("user_claims", "smartrent", tb => tb.HasComment("Claim của tài khoản, bảng chuẩn của Identity."));

            entity.HasIndex(e => e.UserId, "ix_user_claims_user_id");

            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.ClaimType).HasColumnName("claim_type");
            entity.Property(e => e.ClaimValue).HasColumnName("claim_value");
            entity.Property(e => e.UserId).HasColumnName("user_id");

            entity.HasOne(d => d.User).WithMany(p => p.UserClaims)
                .HasForeignKey(d => d.UserId)
                .HasConstraintName("user_claims_user_id_fkey");
        });

        modelBuilder.Entity<UserLogin>(entity =>
        {
            entity.HasKey(e => new { e.LoginProvider, e.ProviderKey }).HasName("user_logins_pkey");

            entity.ToTable("user_logins", "smartrent", tb => tb.HasComment("Đăng nhập qua nhà cung cấp ngoài, bảng chuẩn của Identity."));

            entity.HasIndex(e => e.UserId, "ix_user_logins_user_id");

            entity.Property(e => e.LoginProvider)
                .HasMaxLength(128)
                .HasColumnName("login_provider");
            entity.Property(e => e.ProviderKey)
                .HasMaxLength(128)
                .HasColumnName("provider_key");
            entity.Property(e => e.ProviderDisplayName).HasColumnName("provider_display_name");
            entity.Property(e => e.UserId).HasColumnName("user_id");

            entity.HasOne(d => d.User).WithMany(p => p.UserLogins)
                .HasForeignKey(d => d.UserId)
                .HasConstraintName("user_logins_user_id_fkey");
        });

        modelBuilder.Entity<UserSession>(entity =>
        {
            entity.HasKey(e => e.Id).HasName("user_sessions_pkey");

            entity.ToTable("user_sessions", "smartrent", tb => tb.HasComment("Phiên đăng nhập, refresh token chỉ lưu băm. Trang tài khoản liệt kê và thu hồi phiên từ bảng này."));

            entity.HasIndex(e => e.ReplacedById, "ix_user_sessions_replaced_by_id");

            entity.HasIndex(e => e.UserId, "ix_user_sessions_user_id");

            entity.HasIndex(e => e.RefreshTokenHash, "user_sessions_refresh_token_hash_key").IsUnique();

            entity.Property(e => e.Id)
                .HasDefaultValueSql("gen_random_uuid()")
                .HasColumnName("id");
            entity.Property(e => e.CreatedAt)
                .HasDefaultValueSql("now()")
                .HasColumnName("created_at");
            entity.Property(e => e.ExpiresAt).HasColumnName("expires_at");
            entity.Property(e => e.IpAddress).HasColumnName("ip_address");
            entity.Property(e => e.LastSeenAt).HasColumnName("last_seen_at");
            entity.Property(e => e.RefreshTokenHash)
                .HasMaxLength(128)
                .HasColumnName("refresh_token_hash");
            entity.Property(e => e.ReplacedById).HasColumnName("replaced_by_id");
            entity.Property(e => e.RevokedAt).HasColumnName("revoked_at");
            entity.Property(e => e.UserAgent).HasColumnName("user_agent");
            entity.Property(e => e.UserId).HasColumnName("user_id");

            entity.HasOne(d => d.ReplacedBy).WithMany(p => p.InverseReplacedBy)
                .HasForeignKey(d => d.ReplacedById)
                .HasConstraintName("user_sessions_replaced_by_id_fkey");

            entity.HasOne(d => d.User).WithMany(p => p.UserSessions)
                .HasForeignKey(d => d.UserId)
                .HasConstraintName("user_sessions_user_id_fkey");
        });

        modelBuilder.Entity<UserToken>(entity =>
        {
            entity.HasKey(e => new { e.UserId, e.LoginProvider, e.Name }).HasName("user_tokens_pkey");

            entity.ToTable("user_tokens", "smartrent", tb => tb.HasComment("Token của Identity, gồm token đặt lại mật khẩu."));

            entity.Property(e => e.UserId).HasColumnName("user_id");
            entity.Property(e => e.LoginProvider)
                .HasMaxLength(128)
                .HasColumnName("login_provider");
            entity.Property(e => e.Name)
                .HasMaxLength(128)
                .HasColumnName("name");
            entity.Property(e => e.Value).HasColumnName("value");

            entity.HasOne(d => d.User).WithMany(p => p.UserTokens)
                .HasForeignKey(d => d.UserId)
                .HasConstraintName("user_tokens_user_id_fkey");
        });

        modelBuilder.Entity<VAllocationMovement>(entity =>
        {
            entity
                .HasNoKey()
                .ToView("v_allocation_movements", "smartrent");

            entity.Property(e => e.AllocatedAt).HasColumnName("allocated_at");
            entity.Property(e => e.AllocatedBy).HasColumnName("allocated_by");
            entity.Property(e => e.Amount)
                .HasPrecision(18)
                .HasColumnName("amount");
            entity.Property(e => e.DepositEntryId).HasColumnName("deposit_entry_id");
            entity.Property(e => e.FundingPaymentId).HasColumnName("funding_payment_id");
            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.IdempotencyKey).HasColumnName("idempotency_key");
            entity.Property(e => e.InvoiceId).HasColumnName("invoice_id");
            entity.Property(e => e.Kind)
                .HasMaxLength(10)
                .HasColumnName("kind");
            entity.Property(e => e.PaymentId).HasColumnName("payment_id");
            entity.Property(e => e.Reason).HasColumnName("reason");
            entity.Property(e => e.ReversesId).HasColumnName("reverses_id");
            entity.Property(e => e.SignedAmount).HasColumnName("signed_amount");
        });

        modelBuilder.Entity<VCashMovement>(entity =>
        {
            entity
                .HasNoKey()
                .ToView("v_cash_movements", "smartrent");

            entity.Property(e => e.Kind).HasColumnName("kind");
            entity.Property(e => e.MethodCode)
                .HasMaxLength(30)
                .HasColumnName("method_code");
            entity.Property(e => e.OccurredAt).HasColumnName("occurred_at");
            entity.Property(e => e.SignedAmount).HasColumnName("signed_amount");
            entity.Property(e => e.TenantId).HasColumnName("tenant_id");
            entity.Property(e => e.TransactionId).HasColumnName("transaction_id");
        });

        modelBuilder.Entity<VContractStatus>(entity =>
        {
            entity
                .HasNoKey()
                .ToView("v_contract_status", "smartrent");

            entity.Property(e => e.Code)
                .HasMaxLength(80)
                .HasColumnName("code");
            entity.Property(e => e.ContractId).HasColumnName("contract_id");
            entity.Property(e => e.DaysLeft).HasColumnName("days_left");
            entity.Property(e => e.DisplayEndOn).HasColumnName("display_end_on");
            entity.Property(e => e.EndsOn).HasColumnName("ends_on");
            entity.Property(e => e.Expiring).HasColumnName("expiring");
            entity.Property(e => e.HasDraftVersion).HasColumnName("has_draft_version");
            entity.Property(e => e.PredecessorContractId).HasColumnName("predecessor_contract_id");
            entity.Property(e => e.Status).HasColumnName("status");
            entity.Property(e => e.StillOccupiedAfterExpiry).HasColumnName("still_occupied_after_expiry");
            entity.Property(e => e.TenancyId).HasColumnName("tenancy_id");
            entity.Property(e => e.VersionCount).HasColumnName("version_count");
        });

        modelBuilder.Entity<VDepositBalance>(entity =>
        {
            entity
                .HasNoKey()
                .ToView("v_deposit_balances", "smartrent");

            entity.Property(e => e.HeldAmount)
                .HasPrecision(18)
                .HasColumnName("held_amount");
            entity.Property(e => e.TenancyId).HasColumnName("tenancy_id");
        });

        modelBuilder.Entity<VDepositMovement>(entity =>
        {
            entity
                .HasNoKey()
                .ToView("v_deposit_movements", "smartrent");

            entity.Property(e => e.Amount)
                .HasPrecision(18)
                .HasColumnName("amount");
            entity.Property(e => e.ConfirmedBy).HasColumnName("confirmed_by");
            entity.Property(e => e.CreatedAt).HasColumnName("created_at");
            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.IdempotencyKey).HasColumnName("idempotency_key");
            entity.Property(e => e.Kind)
                .HasMaxLength(15)
                .HasColumnName("kind");
            entity.Property(e => e.OccurredAt).HasColumnName("occurred_at");
            entity.Property(e => e.PaymentId).HasColumnName("payment_id");
            entity.Property(e => e.PaymentReversalId).HasColumnName("payment_reversal_id");
            entity.Property(e => e.Reason).HasColumnName("reason");
            entity.Property(e => e.RelatedEntryId).HasColumnName("related_entry_id");
            entity.Property(e => e.SettlementId).HasColumnName("settlement_id");
            entity.Property(e => e.SignedAmount)
                .HasPrecision(18)
                .HasColumnName("signed_amount");
            entity.Property(e => e.TenancyId).HasColumnName("tenancy_id");
        });

        modelBuilder.Entity<VInvoiceBalance>(entity =>
        {
            entity
                .HasNoKey()
                .ToView("v_invoice_balances", "smartrent");

            entity.Property(e => e.AdjustmentAmount)
                .HasPrecision(18)
                .HasColumnName("adjustment_amount");
            entity.Property(e => e.BillingPeriodId).HasColumnName("billing_period_id");
            entity.Property(e => e.Code)
                .HasMaxLength(80)
                .HasColumnName("code");
            entity.Property(e => e.DueOn).HasColumnName("due_on");
            entity.Property(e => e.InvoiceId).HasColumnName("invoice_id");
            entity.Property(e => e.IsOverdue).HasColumnName("is_overdue");
            entity.Property(e => e.IssuedOn).HasColumnName("issued_on");
            entity.Property(e => e.Kind)
                .HasMaxLength(20)
                .HasColumnName("kind");
            entity.Property(e => e.OriginalAmount)
                .HasPrecision(18)
                .HasColumnName("original_amount");
            entity.Property(e => e.OutstandingAmount)
                .HasPrecision(18)
                .HasColumnName("outstanding_amount");
            entity.Property(e => e.PaidAmount)
                .HasPrecision(18)
                .HasColumnName("paid_amount");
            entity.Property(e => e.PaymentStatus).HasColumnName("payment_status");
            entity.Property(e => e.ReceivableAmount)
                .HasPrecision(18)
                .HasColumnName("receivable_amount");
            entity.Property(e => e.Status)
                .HasMaxLength(8)
                .HasColumnName("status");
            entity.Property(e => e.TenancyId).HasColumnName("tenancy_id");
        });

        modelBuilder.Entity<VInvoiceTotal>(entity =>
        {
            entity
                .HasNoKey()
                .ToView("v_invoice_totals", "smartrent");

            entity.Property(e => e.Amount)
                .HasPrecision(18)
                .HasColumnName("amount");
            entity.Property(e => e.InvoiceId).HasColumnName("invoice_id");
        });

        modelBuilder.Entity<VPaymentBalance>(entity =>
        {
            entity
                .HasNoKey()
                .ToView("v_payment_balances", "smartrent");

            entity.Property(e => e.Amount)
                .HasPrecision(18)
                .HasColumnName("amount");
            entity.Property(e => e.DepositHeldAmount)
                .HasPrecision(18)
                .HasColumnName("deposit_held_amount");
            entity.Property(e => e.InvoiceAllocatedAmount)
                .HasPrecision(18)
                .HasColumnName("invoice_allocated_amount");
            entity.Property(e => e.PaymentId).HasColumnName("payment_id");
            entity.Property(e => e.ReversedAmount)
                .HasPrecision(18)
                .HasColumnName("reversed_amount");
            entity.Property(e => e.Status)
                .HasMaxLength(10)
                .HasColumnName("status");
            entity.Property(e => e.TenantId).HasColumnName("tenant_id");
            entity.Property(e => e.UnappliedAmount)
                .HasPrecision(18)
                .HasColumnName("unapplied_amount");
        });

        modelBuilder.Entity<VPublicRoom>(entity =>
        {
            entity
                .HasNoKey()
                .ToView("v_public_rooms", "smartrent");

            entity.Property(e => e.AddressLine).HasColumnName("address_line");
            entity.Property(e => e.AreaM2)
                .HasPrecision(8, 2)
                .HasColumnName("area_m2");
            entity.Property(e => e.Capacity).HasColumnName("capacity");
            entity.Property(e => e.Description).HasColumnName("description");
            entity.Property(e => e.FloorLabel)
                .HasMaxLength(30)
                .HasColumnName("floor_label");
            entity.Property(e => e.Latitude)
                .HasPrecision(10, 7)
                .HasColumnName("latitude");
            entity.Property(e => e.ListingDescription).HasColumnName("listing_description");
            entity.Property(e => e.ListingId).HasColumnName("listing_id");
            entity.Property(e => e.Locality)
                .HasMaxLength(150)
                .HasColumnName("locality");
            entity.Property(e => e.Longitude)
                .HasPrecision(10, 7)
                .HasColumnName("longitude");
            entity.Property(e => e.OrganizationId).HasColumnName("organization_id");
            entity.Property(e => e.PropertyId).HasColumnName("property_id");
            entity.Property(e => e.PropertyName)
                .HasMaxLength(200)
                .HasColumnName("property_name");
            entity.Property(e => e.Province)
                .HasMaxLength(100)
                .HasColumnName("province");
            entity.Property(e => e.PublishedAt).HasColumnName("published_at");
            entity.Property(e => e.Rent).HasColumnName("rent");
            entity.Property(e => e.RequiredDeposit)
                .HasPrecision(18)
                .HasColumnName("required_deposit");
            entity.Property(e => e.RoomCode)
                .HasMaxLength(40)
                .HasColumnName("room_code");
            entity.Property(e => e.RoomId).HasColumnName("room_id");
            entity.Property(e => e.RoomName)
                .HasMaxLength(150)
                .HasColumnName("room_name");
            entity.Property(e => e.RoomTypeId).HasColumnName("room_type_id");
            entity.Property(e => e.RulesText).HasColumnName("rules_text");
            entity.Property(e => e.Slug)
                .HasMaxLength(250)
                .HasColumnName("slug");
            entity.Property(e => e.Title)
                .HasMaxLength(250)
                .HasColumnName("title");
            entity.Property(e => e.VideoUrl).HasColumnName("video_url");
        });

        modelBuilder.Entity<VRoomStatus>(entity =>
        {
            entity
                .HasNoKey()
                .ToView("v_room_status", "smartrent");

            entity.Property(e => e.ActiveTenancyId).HasColumnName("active_tenancy_id");
            entity.Property(e => e.ActiveTenantId).HasColumnName("active_tenant_id");
            entity.Property(e => e.AreaM2)
                .HasPrecision(8, 2)
                .HasColumnName("area_m2");
            entity.Property(e => e.Capacity).HasColumnName("capacity");
            entity.Property(e => e.Code)
                .HasMaxLength(40)
                .HasColumnName("code");
            entity.Property(e => e.CreatedAt).HasColumnName("created_at");
            entity.Property(e => e.Description).HasColumnName("description");
            entity.Property(e => e.FloorLabel)
                .HasMaxLength(30)
                .HasColumnName("floor_label");
            entity.Property(e => e.HasPlannedTenancy).HasColumnName("has_planned_tenancy");
            entity.Property(e => e.Id).HasColumnName("id");
            entity.Property(e => e.Name)
                .HasMaxLength(150)
                .HasColumnName("name");
            entity.Property(e => e.OccupancyStatus)
                .HasColumnType("character varying")
                .HasColumnName("occupancy_status");
            entity.Property(e => e.OccupiedSince).HasColumnName("occupied_since");
            entity.Property(e => e.OperatingStatus)
                .HasMaxLength(15)
                .HasColumnName("operating_status");
            entity.Property(e => e.PropertyId).HasColumnName("property_id");
            entity.Property(e => e.RequiredDeposit)
                .HasPrecision(18)
                .HasColumnName("required_deposit");
            entity.Property(e => e.RoomTypeId).HasColumnName("room_type_id");
            entity.Property(e => e.RulesText).HasColumnName("rules_text");
        });

        modelBuilder.Entity<VTenantDebt>(entity =>
        {
            entity
                .HasNoKey()
                .ToView("v_tenant_debts", "smartrent");

            entity.Property(e => e.OrganizationId).HasColumnName("organization_id");
            entity.Property(e => e.OutstandingAmount)
                .HasPrecision(18)
                .HasColumnName("outstanding_amount");
            entity.Property(e => e.OverdueAmount)
                .HasPrecision(18)
                .HasColumnName("overdue_amount");
            entity.Property(e => e.OverdueCount).HasColumnName("overdue_count");
            entity.Property(e => e.TenantId).HasColumnName("tenant_id");
        });

        modelBuilder.Entity<VTenantStatus>(entity =>
        {
            entity
                .HasNoKey()
                .ToView("v_tenant_status", "smartrent");

            entity.Property(e => e.HasPortalAccount).HasColumnName("has_portal_account");
            entity.Property(e => e.OrganizationId).HasColumnName("organization_id");
            entity.Property(e => e.ResidenceStatus).HasColumnName("residence_status");
            entity.Property(e => e.TenantId).HasColumnName("tenant_id");
        });

        OnModelCreatingPartial(modelBuilder);
    }

    partial void OnModelCreatingPartial(ModelBuilder modelBuilder);
}
