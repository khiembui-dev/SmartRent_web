using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.EntityFrameworkCore;
using SmartRent.Api.Data;
using SmartRent.Api.Data.Entities;

namespace SmartRent.Api.Features.Payments;

public sealed class PaymentsService
{
	private readonly SmartRentDbContext _db;

	public PaymentsService(SmartRentDbContext db)
	{
		_db = db;
	}

	public async Task<(bool Success, int StatusCode, string? Error, PaymentDto? Result)> CreatePaymentAsync(
		CreatePaymentRequest request,
		CancellationToken cancellationToken = default)
	{
		if (request.Amount <= 0)
		{
			return (false, 422, "Số tiền thực nhận phải lớn hơn 0.", null);
		}

		if (request.ReceivedAt > DateTime.UtcNow.AddMinutes(5))
		{
			return (false, 422, "Thời điểm nhận không được ở tương lai.", null);
		}

		if (string.IsNullOrWhiteSpace(request.MethodCode))
		{
			return (false, 422, "Phương thức thanh toán là bắt buộc.", null);
		}

		if (request.MethodCode == "bank_transfer" && string.IsNullOrWhiteSpace(request.ExternalReference))
		{
			return (false, 422, "Mã giao dịch ngân hàng là bắt buộc khi chuyển khoản.", null);
		}

		var tenant = await _db.Tenants.FirstOrDefaultAsync(t => t.Id == request.TenantId, cancellationToken);
		if (tenant == null)
		{
			return (false, 404, "Không tìm thấy khách thuê.", null);
		}

		var totalAllocated = request.Allocations?.Sum(a => a.Amount) ?? 0m;
		if (totalAllocated > request.Amount)
		{
			return (false, 422, $"Tổng phân bổ ({totalAllocated:N0} đ) vượt số tiền nhận ({request.Amount:N0} đ).", null);
		}

		var actorUserId = await GetActorUserIdAsync(cancellationToken);
		var ym = request.ReceivedAt.ToString("yyMM");
		var seq = await GetNextDocumentNoAsync(tenant.OrganizationId, $"PT-{ym}", cancellationToken);
		var code = $"PT-{ym}-{seq:D4}";

		var payment = new Payment
		{
			Id = Guid.NewGuid(),
			Code = code,
			TenantId = tenant.Id,
			PropertyId = request.PropertyId,
			Amount = request.Amount,
			ReceivedAt = request.ReceivedAt.ToUniversalTime(),
			MethodCode = request.MethodCode,
			ExternalReference = request.ExternalReference,
			Notes = request.Notes,
			Status = request.ConfirmNow ? "confirmed" : "pending",
			ReportedBy = actorUserId,
			ConfirmedBy = request.ConfirmNow ? actorUserId : null,
			ConfirmedAt = request.ConfirmNow ? DateTime.UtcNow : null,
			IdempotencyKey = Guid.NewGuid(),
			CreatedAt = DateTime.UtcNow
		};

		_db.Payments.Add(payment);

		if (request.ConfirmNow)
		{
			if (request.Allocations != null)
			{
				foreach (var item in request.Allocations.Where(a => a.Amount > 0))
				{
					var inv = await _db.Invoices.FirstOrDefaultAsync(i => i.Id == item.InvoiceId, cancellationToken);
					if (inv != null)
					{
						var allocation = new PaymentAllocation
						{
							Id = Guid.NewGuid(),
							InvoiceId = inv.Id,
							PaymentId = payment.Id,
							Kind = "apply",
							Amount = item.Amount,
							AllocatedAt = DateTime.UtcNow,
							AllocatedBy = actorUserId,
							IdempotencyKey = Guid.NewGuid()
						};
						_db.PaymentAllocations.Add(allocation);
					}
				}
			}
		}
		else
		{
			if (request.Allocations != null)
			{
				foreach (var item in request.Allocations)
				{
					var inv = await _db.Invoices.FirstOrDefaultAsync(i => i.Id == item.InvoiceId, cancellationToken);
					if (inv != null)
					{
						payment.Invoices.Add(inv);
					}
				}
			}
		}

		await _db.SaveChangesAsync(cancellationToken);

		var result = await GetPaymentByIdAsync(payment.Id, cancellationToken);
		return (true, 200, null, result);
	}

	public async Task<(bool Success, int StatusCode, string? Error, PaymentDto? Result)> ConfirmPaymentAsync(
		Guid paymentId,
		ConfirmPaymentRequest request,
		CancellationToken cancellationToken = default)
	{
		var payment = await _db.Payments
			.FirstOrDefaultAsync(p => p.Id == paymentId, cancellationToken);

		if (payment == null)
		{
			return (false, 404, "Không tìm thấy phiếu thu.", null);
		}

		if (payment.Status == "confirmed")
		{
			return (false, 409, $"Khoản thu {payment.Code} đã được xác nhận trước đó; không ghi nhận lần hai.", null);
		}

		if (payment.Status == "rejected")
		{
			return (false, 409, "Khoản thu đã bị từ chối. Tạo khoản thu mới nếu khách gửi lại chứng từ.", null);
		}

		var totalAllocated = request.Allocations?.Sum(a => a.Amount) ?? 0m;
		if (totalAllocated > payment.Amount)
		{
			return (false, 422, $"Tổng phân bổ ({totalAllocated:N0} đ) vượt số tiền ({payment.Amount:N0} đ).", null);
		}

		var actorUserId = await GetActorUserIdAsync(cancellationToken);

		payment.Status = "confirmed";
		payment.ConfirmedBy = actorUserId;
		payment.ConfirmedAt = DateTime.UtcNow;

		if (!string.IsNullOrWhiteSpace(request.ExternalReference))
		{
			payment.ExternalReference = request.ExternalReference;
		}

		if (request.Allocations != null)
		{
			foreach (var item in request.Allocations.Where(a => a.Amount > 0))
			{
				var inv = await _db.Invoices.FirstOrDefaultAsync(i => i.Id == item.InvoiceId, cancellationToken);
				if (inv != null)
				{
					var allocation = new PaymentAllocation
					{
						Id = Guid.NewGuid(),
						InvoiceId = inv.Id,
						PaymentId = payment.Id,
						Kind = "apply",
						Amount = item.Amount,
						AllocatedAt = DateTime.UtcNow,
						AllocatedBy = actorUserId,
						IdempotencyKey = Guid.NewGuid()
					};
					_db.PaymentAllocations.Add(allocation);
				}
			}
		}

		await _db.SaveChangesAsync(cancellationToken);

		var result = await GetPaymentByIdAsync(payment.Id, cancellationToken);
		return (true, 200, null, result);
	}

	public async Task<(bool Success, int StatusCode, string? Error, PaymentDto? Result)> RejectPaymentAsync(
		Guid paymentId,
		RejectPaymentRequest request,
		CancellationToken cancellationToken = default)
	{
		var payment = await _db.Payments.FirstOrDefaultAsync(p => p.Id == paymentId, cancellationToken);
		if (payment == null)
		{
			return (false, 404, "Không tìm thấy phiếu thu.", null);
		}

		if (payment.Status != "pending")
		{
			return (false, 409, "Chỉ từ chối khoản thu đang chờ xác minh.", null);
		}

		if (string.IsNullOrWhiteSpace(request.Reason))
		{
			return (false, 422, "Lý do từ chối là bắt buộc.", null);
		}

		payment.Status = "rejected";
		payment.RejectionReason = request.Reason;

		await _db.SaveChangesAsync(cancellationToken);

		var result = await GetPaymentByIdAsync(payment.Id, cancellationToken);
		return (true, 200, null, result);
	}

	public async Task<(bool Success, int StatusCode, string? Error, PaymentDto? Result)> ReverseAllocationAsync(
		Guid allocationId,
		ReverseAllocationRequest request,
		CancellationToken cancellationToken = default)
	{
		var allocation = await _db.PaymentAllocations
			.Include(a => a.InverseReverses)
			.Include(a => a.Payment)
			.Include(a => a.DepositEntry)
			.FirstOrDefaultAsync(a => a.Id == allocationId, cancellationToken);

		if (allocation == null)
		{
			return (false, 404, "Không tìm thấy phân bổ thanh toán.", null);
		}

		if (allocation.Kind != "apply")
		{
			return (false, 409, "Chỉ có thể đảo phân bổ thanh toán gốc (apply).", null);
		}

		if (string.IsNullOrWhiteSpace(request.Reason))
		{
			return (false, 422, "Lý do hoàn tác là bắt buộc.", null);
		}

		var alreadyReversed = allocation.InverseReverses.Sum(r => r.Amount);
		var remaining = allocation.Amount - alreadyReversed;
		if (request.Amount <= 0 || request.Amount > remaining)
		{
			return (false, 422, $"Số tiền hoàn tác không hợp lệ. Tối đa có thể hoàn tác là {remaining:N0} đ.", null);
		}

		var actorUserId = await GetActorUserIdAsync(cancellationToken);

		var reverseAlloc = new PaymentAllocation
		{
			Id = Guid.NewGuid(),
			InvoiceId = allocation.InvoiceId,
			PaymentId = allocation.PaymentId,
			DepositEntryId = allocation.DepositEntryId,
			Kind = "reverse",
			Amount = request.Amount,
			ReversesId = allocation.Id,
			Reason = request.Reason,
			AllocatedAt = DateTime.UtcNow,
			AllocatedBy = actorUserId,
			IdempotencyKey = Guid.NewGuid()
		};
		_db.PaymentAllocations.Add(reverseAlloc);

		if (request.ReversePayment && allocation.PaymentId.HasValue)
		{
			var reversal = new PaymentReversal
			{
				Id = Guid.NewGuid(),
				PaymentId = allocation.PaymentId.Value,
				Amount = request.Amount,
				Kind = "correction",
				OccurredAt = DateTime.UtcNow,
				MethodCode = allocation.Payment?.MethodCode ?? "cash",
				Reason = request.Reason,
				ConfirmedBy = actorUserId,
				IdempotencyKey = Guid.NewGuid(),
				CreatedAt = DateTime.UtcNow
			};
			_db.PaymentReversals.Add(reversal);
		}

		await _db.SaveChangesAsync(cancellationToken);

		var targetPaymentId = allocation.PaymentId ?? allocation.DepositEntry?.PaymentId;
		PaymentDto? result = null;
		if (targetPaymentId.HasValue)
		{
			result = await GetPaymentByIdAsync(targetPaymentId.Value, cancellationToken);
		}

		return (true, 200, null, result);
	}

	public async Task<PaymentDto?> GetPaymentByIdAsync(
		Guid paymentId,
		CancellationToken cancellationToken = default)
	{
		var payment = await _db.Payments
			.Include(p => p.Tenant)
			.Include(p => p.Property)
			.Include(p => p.ReportedByNavigation)
			.Include(p => p.ConfirmedByNavigation)
			.Include(p => p.Invoices)
			.Include(p => p.PaymentReversals)
				.ThenInclude(r => r.ConfirmedByNavigation)
			.Include(p => p.DepositEntries)
			.Include(p => p.Files)
			.FirstOrDefaultAsync(p => p.Id == paymentId, cancellationToken);

		if (payment == null) return null;

		var allocations = await _db.PaymentAllocations
			.Include(a => a.AllocatedByNavigation)
			.Include(a => a.Invoice)
			.Include(a => a.InverseReverses)
			.Include(a => a.DepositEntry)
			.Where(a => a.PaymentId == paymentId || (a.DepositEntry != null && a.DepositEntry.PaymentId == paymentId))
			.OrderBy(a => a.AllocatedAt)
			.ToListAsync(cancellationToken);

		var tenancy = await _db.Tenancies
			.Include(t => t.Room)
				.ThenInclude(r => r.Property)
			.Where(t => t.RepresentativeTenantId == payment.TenantId && (t.Status == "active" || t.Status == "planned"))
			.OrderByDescending(t => t.CreatedAt)
			.FirstOrDefaultAsync(cancellationToken);

		RoomRefDto? roomDto = null;
		if (tenancy?.Room?.Property != null)
		{
			var r = tenancy.Room;
			roomDto = new RoomRefDto(r.Id, r.Code, r.Code, r.PropertyId, r.Property.Code, r.Property.Name);
		}

		var balance = await _db.VPaymentBalances
			.FirstOrDefaultAsync(b => b.PaymentId == paymentId, cancellationToken);

		var reversedAmount = balance?.ReversedAmount ?? 0m;
		var invoiceAllocatedAmount = balance?.InvoiceAllocatedAmount ?? 0m;
		var depositHeldAmount = balance?.DepositHeldAmount ?? 0m;
		var unappliedAmount = balance?.UnappliedAmount ?? 0m;
		var directInvoiceAmount = allocations
			.Where(a => a.PaymentId == paymentId)
			.Sum(a => a.Kind == "apply" ? a.Amount : -a.Amount);

		var tenantDto = new TenantRefDto(
			payment.Tenant.Id,
			payment.Tenant.Code,
			payment.Tenant.FullName,
			payment.Tenant.Phone ?? string.Empty
		);

		var fileDtos = payment.Files.Select(f => new FileRefDto(
			f.Id,
			f.OriginalName,
			f.ContentType,
			f.ByteSize,
			f.ScanStatus,
			f.Visibility,
			f.CreatedAt
		)).ToList();

		var reversalDtos = payment.PaymentReversals.Select(r => new PaymentReversalDto(
			r.Id,
			r.PaymentId,
			r.Amount,
			r.Kind,
			r.OccurredAt,
			r.MethodCode,
			r.EvidenceFileId,
			r.ExternalReference,
			r.Reason,
			r.ConfirmedByNavigation != null ? new UserRefDto(r.ConfirmedByNavigation.Id, r.ConfirmedByNavigation.DisplayName) : null
		)).ToList();

		var depositDtos = payment.DepositEntries.Select(d => new PaymentDepositEntryDto(
			d.Id,
			d.TenancyId,
			d.Kind,
			d.Amount,
			d.Kind switch { "receipt" => d.Amount, "refund" => -d.Amount, "offset" => -d.Amount, "reversal" => -d.Amount, _ => d.Amount },
			d.RelatedEntryId,
			d.OccurredAt,
			d.Reason
		)).ToList();

		var allocDtos = new List<PaymentAllocationItemDto>();
		foreach (var a in allocations)
		{
			var b = await _db.VInvoiceBalances.FirstOrDefaultAsync(x => x.InvoiceId == a.InvoiceId, cancellationToken);
			var tot = await _db.VInvoiceTotals.FirstOrDefaultAsync(x => x.InvoiceId == a.InvoiceId, cancellationToken);
			var invBrief = a.Invoice != null
				? new InvoiceSummaryBriefDto(
					a.Invoice.Id,
					a.Invoice.Code,
					a.Invoice.Kind,
					a.Invoice.Status,
					tot?.Amount ?? 0m,
					b?.PaidAmount ?? 0m,
					b?.OutstandingAmount ?? 0m,
					a.Invoice.DueOn)
				: null;

			allocDtos.Add(new PaymentAllocationItemDto(
				a.Id,
				a.Kind,
				a.Amount,
				a.PaymentId.HasValue ? "payment" : "deposit_offset",
				a.ReversesId,
				a.InverseReverses.Sum(x => x.Amount),
				invBrief,
				a.AllocatedAt,
				a.AllocatedByNavigation != null ? new UserRefDto(a.AllocatedByNavigation.Id, a.AllocatedByNavigation.DisplayName) : null,
				a.Reason
			));
		}

		var intendedInvoices = new List<InvoiceSummaryBriefDto>();
		foreach (var inv in payment.Invoices)
		{
			var b = await _db.VInvoiceBalances.FirstOrDefaultAsync(x => x.InvoiceId == inv.Id, cancellationToken);
			var tot = await _db.VInvoiceTotals.FirstOrDefaultAsync(x => x.InvoiceId == inv.Id, cancellationToken);
			intendedInvoices.Add(new InvoiceSummaryBriefDto(
				inv.Id,
				inv.Code,
				inv.Kind,
				inv.Status,
				tot?.Amount ?? 0m,
				b?.PaidAmount ?? 0m,
				b?.OutstandingAmount ?? 0m,
				inv.DueOn
			));
		}

		var openInvoices = new List<InvoiceSummaryBriefDto>();
		var tenantInvoices = await _db.Invoices
			.Include(i => i.Tenancy)
			.Where(i => i.Tenancy.RepresentativeTenantId == payment.TenantId && i.Status == "issued" && i.Kind != "debit_adjustment" && i.Kind != "credit_adjustment")
			.ToListAsync(cancellationToken);

		foreach (var inv in tenantInvoices)
		{
			var b = await _db.VInvoiceBalances.FirstOrDefaultAsync(x => x.InvoiceId == inv.Id, cancellationToken);
			var tot = await _db.VInvoiceTotals.FirstOrDefaultAsync(x => x.InvoiceId == inv.Id, cancellationToken);
			var outstanding = b?.OutstandingAmount ?? 0m;
			if (outstanding > 0)
			{
				openInvoices.Add(new InvoiceSummaryBriefDto(
					inv.Id,
					inv.Code,
					inv.Kind,
					inv.Status,
					tot?.Amount ?? 0m,
					b?.PaidAmount ?? 0m,
					outstanding,
					inv.DueOn
				));
			}
		}

		var tenancies = await _db.Tenancies
			.Include(t => t.Room)
			.Where(t => t.RepresentativeTenantId == payment.TenantId && (t.Status == "active" || t.Status == "planned"))
			.Select(t => new PaymentTenancyBriefDto(t.Id, t.Status, t.Room.Code))
			.ToListAsync(cancellationToken);

		var isTenantReported = payment.ReportedBy.HasValue
			&& payment.Tenant.UserId.HasValue
			&& payment.ReportedBy == payment.Tenant.UserId;

		return new PaymentDto(
			payment.Id,
			payment.Code,
			payment.Status,
			tenantDto,
			roomDto,
			payment.Amount,
			payment.ReceivedAt,
			payment.MethodCode,
			payment.ExternalReference,
			payment.Notes,
			payment.ReportedByNavigation != null ? new UserRefDto(payment.ReportedByNavigation.Id, payment.ReportedByNavigation.DisplayName) : null,
			payment.ConfirmedByNavigation != null ? new UserRefDto(payment.ConfirmedByNavigation.Id, payment.ConfirmedByNavigation.DisplayName) : null,
			payment.ConfirmedAt,
			payment.RejectionReason,
			isTenantReported,
			reversedAmount,
			invoiceAllocatedAmount,
			directInvoiceAmount,
			depositHeldAmount,
			unappliedAmount,
			payment.CreatedAt,
			fileDtos,
			allocDtos,
			reversalDtos,
			depositDtos,
			intendedInvoices,
			openInvoices,
			tenancies
		);
	}

	private async Task<Guid> GetActorUserIdAsync(CancellationToken cancellationToken)
	{
		var user = await _db.Users.FirstOrDefaultAsync(u => u.IsActive, cancellationToken);
		return user?.Id ?? Guid.Parse("e77fda90-312b-481f-b250-1502a80e7995");
	}

	private async Task<long> GetNextDocumentNoAsync(Guid organizationId, string series, CancellationToken cancellationToken)
	{
		var connection = _db.Database.GetDbConnection();
		await using var command = connection.CreateCommand();
		command.CommandText = "SELECT smartrent.next_document_no(@organizationId, @series)";

		var pOrg = command.CreateParameter();
		pOrg.ParameterName = "@organizationId";
		pOrg.Value = organizationId;
		command.Parameters.Add(pOrg);

		var pSeries = command.CreateParameter();
		pSeries.ParameterName = "@series";
		pSeries.Value = series;
		command.Parameters.Add(pSeries);

		if (connection.State != System.Data.ConnectionState.Open)
		{
			await connection.OpenAsync(cancellationToken);
		}

		var result = await command.ExecuteScalarAsync(cancellationToken);
		return Convert.ToInt64(result);
	}
}