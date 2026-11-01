// Sinh database/06_du_lieu_mau.sql từ bộ dữ liệu mock của frontend.
// Hai mục đích: cho team backend một database đầy đủ để phát triển, và chứng minh lược đồ khớp website:
// mọi dòng do engine của website tạo ra phải qua được toàn bộ trigger và ràng buộc.
// Chạy: node database/tools/mock_seed_to_sql.mjs
import { writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const { buildSeed } = await import(pathToFileURL(resolve(here, '../../frontend/src/mocks/seed.js')).href);
const db = buildSeed();

const out = [];
const q = (value) => {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return `'${String(value).replace(/'/g, "''")}'`;
};
const row = (values) => `(${values.map(q).join(', ')})`;
const raw = (text) => ({ raw: text });
const cell = (value) => (value && value.raw ? value.raw : q(value));
const insert = (table, columns, rows) => {
  if (!rows.length) return;
  out.push(`INSERT INTO ${table}(${columns.join(', ')}) VALUES\n  ${rows.map((r) => `(${r.map(cell).join(', ')})`).join(',\n  ')};`);
};
const section = (title) => out.push(`\n-- ${title}`);
const find = (rows, id) => rows.find((r) => r.id === id);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const key = (value) => (UUID.test(value || '') ? value : raw('gen_random_uuid()'));
const byTime = (field) => (a, b) => String(a[field]).localeCompare(String(b[field]));
const owner = db.users.find((u) => u.key === 'owner');
const ownerOf = (organizationId) => {
  const m = db.memberships.find((x) => x.organizationId === organizationId && db.businessRoles.some((r) => x.roleIds.includes(r.id) && r.code === 'owner'));
  return m?.userId || owner.id;
};

const PURPOSE = {
  identity_front: 'identity_front', identity_back: 'identity_back', contract_signed: 'contract_signed', contract: 'contract_signed',
  payment_proof: 'payment_proof', handover: 'handover', ticket: 'ticket', room_image: 'room_image', avatar: 'avatar',
};

section('Tài khoản, đơn vị, phân quyền');
insert('users', ['id', 'user_name', 'normalized_user_name', 'email', 'normalized_email', 'email_confirmed', 'security_stamp', 'concurrency_stamp', 'phone_number', 'display_name', 'is_active', 'created_at'],
  db.users.map((u) => [u.id, u.email, u.email.toUpperCase(), u.email, u.email.toUpperCase(), u.emailConfirmed, raw('gen_random_uuid()::text'), raw('gen_random_uuid()::text'), u.phone, u.displayName, u.isActive, u.createdAt]));
insert('user_roles', ['user_id', 'role_id'], db.users.filter((u) => u.systemRoles?.includes('SystemAdmin')).map((u) => [u.id, '00000000-0000-0000-0000-000000000001']));
insert('organizations', ['id', 'code', 'name', 'legal_name', 'tax_code', 'phone', 'email', 'is_active', 'created_at'],
  db.organizations.map((o) => [o.id, o.code, o.name, o.legalName, o.taxCode, o.phone, o.email, o.isActive, o.createdAt]));
insert('organization_settings', ['organization_id', 'timezone', 'meter_reading_day', 'invoice_create_day', 'billing_reminder_enabled'],
  db.orgSettings.map((s) => [s.organizationId, s.timezone, s.meterReadingDay, s.invoiceCreateDay, s.reminderEnabled]));
insert('organization_memberships', ['id', 'organization_id', 'user_id', 'status', 'property_scope', 'joined_at'],
  db.memberships.map((m) => [m.id, m.organizationId, m.userId, m.status, m.propertyScope, m.joinedAt]));
insert('business_roles', ['id', 'organization_id', 'code', 'name', 'is_system'], db.businessRoles.map((r) => [r.id, r.organizationId, r.code, r.name, r.isSystem]));
for (const role of db.businessRoles) {
  out.push(`INSERT INTO business_role_permissions SELECT ${q(role.id)}, code FROM permissions WHERE code IN (${role.permissions.map(q).join(', ')});`);
}
insert('membership_roles', ['membership_id', 'role_id'], db.memberships.flatMap((m) => m.roleIds.map((r) => [m.id, r])));
insert('support_access_grants', ['id', 'organization_id', 'user_id', 'granted_by', 'reason', 'starts_at', 'expires_at', 'revoked_at'],
  db.supportGrants.map((g) => [g.id, g.organizationId, g.grantedTo, g.grantedBy, g.reason, g.startsAt, g.expiresAt, g.revokedAt]));

section('Tệp');
insert('stored_files', ['id', 'organization_id', 'storage_key', 'original_name', 'content_type', 'byte_size', 'purpose', 'visibility', 'scan_status', 'uploaded_by', 'created_at'],
  db.files.map((f) => [f.id, f.organizationId, `seed/${f.id}/${f.fileName}`, f.fileName, f.contentType, f.sizeBytes, PURPOSE[f.kind] || 'other', f.visibility, f.scanStatus, f.uploadedBy, f.createdAt]));

section('Cơ sở, phòng, tin đăng');
const billing = (id) => db.billingSettings.find((s) => s.propertyId === id);
insert('properties', ['id', 'organization_id', 'code', 'name', 'address_line', 'locality', 'province', 'latitude', 'longitude', 'description', 'contact_name', 'phone', 'email', 'invoice_day', 'due_after_days', 'contract_warning_days', 'proration_policy', 'is_active', 'created_at'],
  db.properties.map((p) => {
    const s = billing(p.id);
    return [p.id, p.organizationId, p.code, p.name, p.address.line, p.address.locality, p.address.province, p.address.latitude, p.address.longitude, p.description, p.contactName, p.phone, p.email, s.invoiceDay, s.dueAfterDays, s.contractWarningDays, s.prorationPolicy, p.isActive, p.createdAt];
  }));
insert('membership_properties', ['membership_id', 'property_id'], db.memberships.flatMap((m) => m.propertyIds.map((p) => [m.id, p])));
insert('room_types', ['id', 'organization_id', 'code', 'name', 'description'], db.roomTypes.map((t) => [t.id, t.organizationId, t.code, t.name, t.description]));
// Phòng tạo ở trạng thái khai thác rồi mới đổi ở cuối file, đúng thứ tự thời gian: có khách trước, bảo trì sau.
insert('rooms', ['id', 'property_id', 'room_type_id', 'code', 'name', 'floor_label', 'area_m2', 'capacity', 'description', 'rules_text', 'required_deposit', 'created_at'],
  db.rooms.map((r) => [r.id, r.propertyId, r.roomTypeId, r.code, r.name, r.floorLabel, r.areaM2, r.capacity, r.description, r.rulesText, r.requiredDeposit, r.createdAt]));
insert('amenities', ['id', 'organization_id', 'code', 'name', 'icon'], db.amenities.map((a) => [a.id, a.organizationId, a.code, a.name, a.icon]));
insert('room_amenities', ['room_id', 'amenity_id'], db.rooms.flatMap((r) => r.amenityIds.map((a) => [r.id, a])));
const imageFiles = new Map();
const imageRows = [];
for (const room of db.rooms) {
  const organizationId = find(db.properties, room.propertyId).organizationId;
  const seen = new Set();
  for (const image of room.images) {
    if (seen.has(image.url)) continue;
    seen.add(image.url);
    const fileKey = `${organizationId}:${image.url}`;
    if (!imageFiles.has(fileKey)) {
      imageFiles.set(fileKey, { id: raw(`'${String(imageFiles.size + 1).padStart(8, '0')}-0000-4000-8000-000000000000'`), url: image.url, organizationId });
    }
    imageRows.push([image.id, room.id, imageFiles.get(fileKey).id, image.sortOrder, image.isCover, image.caption]);
  }
}
insert('stored_files', ['id', 'organization_id', 'storage_key', 'original_name', 'content_type', 'purpose', 'visibility', 'scan_status'],
  [...imageFiles.values()].map((f) => [f.id, f.organizationId, `${f.organizationId}${f.url}`, f.url.split('/').pop(), f.url.endsWith('.png') ? 'image/png' : 'image/jpeg', 'room_image', 'public', 'clean']));
insert('room_images', ['id', 'room_id', 'file_id', 'sort_order', 'is_cover', 'caption'], imageRows);
insert('room_listings', ['id', 'room_id', 'slug', 'title', 'description', 'video_url', 'status', 'published_at', 'updated_at'],
  db.roomListings.map((l) => [l.id, l.roomId, l.slug, l.title, l.description, l.videoUrl, l.status, l.publishedAt, l.updatedAt]));

section('Khoản thu, giá cơ sở và phòng');
const OPENING = db.organizations.map((o) => [raw('gen_random_uuid()'), o.id, 'OPENING_BALANCE', 'Số dư đầu kỳ', 'other', 'lần', true]);
insert('charge_types', ['id', 'organization_id', 'code', 'name', 'category', 'unit_label', 'is_active'],
  [...db.chargeTypes.map((c) => [c.id, c.organizationId, c.code, c.name, c.category, c.unitLabel, c.isActive]), ...OPENING]);
const rateRow = (r) => {
  const plan = find(db.ratePlans, r.ratePlanId);
  return [r.id, plan.propertyId, plan.roomId, plan.contractVersionId, r.chargeTypeId, r.effectiveFrom, r.effectiveTo, r.unitPrice, r.calculationMethod, r.billingCycle, r.prorationMode];
};
const rateColumns = ['id', 'property_id', 'room_id', 'contract_version_id', 'charge_type_id', 'effective_from', 'effective_to', 'unit_price', 'calculation_method', 'billing_cycle', 'proration_mode'];
const isContractRate = (r) => Boolean(find(db.ratePlans, r.ratePlanId).contractVersionId);
insert('charge_rates', rateColumns, db.chargeRates.filter((r) => !isContractRate(r)).map(rateRow));

section('Khách, yêu cầu xem phòng');
const addressText = (a) => (a && typeof a === 'object' ? [a.line, a.locality, a.province].filter(Boolean).join(', ') : a);
insert('tenants', ['id', 'organization_id', 'user_id', 'code', 'full_name', 'email', 'phone', 'date_of_birth', 'address_line', 'emergency_contact_name', 'emergency_contact_phone', 'notes', 'created_at'],
  db.tenants.map((t) => [t.id, t.organizationId, t.userId, t.code, t.fullName, t.email, t.phone, t.dateOfBirth, addressText(t.address), t.emergencyContactName, t.emergencyContactPhone, t.notes, t.createdAt]));
insert('tenant_identity_documents', ['id', 'tenant_id', 'document_type', 'number_ciphertext', 'number_fingerprint', 'number_last4', 'issued_on', 'issuing_authority', 'expires_on', 'front_file_id', 'back_file_id', 'verified_by', 'verified_at'],
  db.identityDocuments.map((d) => [d.id, d.tenantId, ['cccd', 'cmnd', 'passport'].includes(d.documentType) ? d.documentType : (d.documentType === 'CCCD' ? 'cccd' : 'other'),
    raw(`pgp_sym_encrypt(${q(d.numberMasked)}, 'du-lieu-mau')`), raw(`md5(${q(d.id)})`), String(d.numberMasked).replace(/\D/g, '').slice(-4).padStart(4, '0'),
    d.issuedOn, d.issuingAuthority, d.expiresOn, d.frontFileId, d.backFileId, d.verifiedBy, d.verifiedAt]));
const change = (r, field) => r.changes?.[field]?.to ?? null;
insert('tenant_profile_change_requests', ['id', 'tenant_id', 'requested_by', 'requested_at', 'status', 'proposed_phone', 'proposed_email', 'proposed_emergency_contact_name', 'proposed_emergency_contact_phone', 'reason', 'review_notes', 'reviewed_by', 'reviewed_at'],
  db.profileChangeRequests.map((r) => [r.id, r.tenantId, r.requestedBy, r.createdAt, r.status, change(r, 'phone'), change(r, 'email'), change(r, 'emergencyContactName'), change(r, 'emergencyContactPhone'), r.reason, r.reviewNotes, r.reviewedBy, r.reviewedAt]));
insert('rental_inquiries', ['id', 'code', 'room_id', 'tenant_id', 'source', 'contact_name', 'phone', 'email', 'desired_move_in', 'occupants', 'message', 'status', 'assigned_to', 'closed_reason', 'created_at'],
  db.inquiries.map((q2) => [q2.id, q2.code, q2.roomId, q2.tenantId, q2.source || 'public', q2.contactName, q2.phone, q2.email, q2.desiredMoveIn, q2.occupants, q2.message, q2.status, q2.assignedTo, q2.closedReason, q2.createdAt]));
insert('room_viewings', ['id', 'inquiry_id', 'starts_at', 'ends_at', 'host_user_id', 'status', 'result_notes'],
  db.viewings.map((v) => [v.id, v.inquiryId, v.startsAt, v.endsAt, v.hostUserId, v.status, v.resultNotes]));

section('Đợt thuê, hợp đồng, bàn giao');
const inquiryOf = (t) => {
  const reservation = t.reservationId ? find(db.reservations, t.reservationId) : null;
  return reservation?.inquiryId || null;
};
insert('tenancies', ['id', 'room_id', 'representative_tenant_id', 'inquiry_id', 'status', 'planned_move_in', 'actual_move_in', 'actual_move_out', 'onboarding_mode', 'end_reason', 'ended_by', 'created_at'],
  db.tenancies.map((t) => [t.id, find(db.roomAllocations, t.allocationId).roomId, t.representativeTenantId, inquiryOf(t), t.status, t.plannedMoveIn, t.actualMoveIn, t.actualMoveOut, t.onboardingMode, t.endReason, t.endedBy, t.createdAt]));
insert('tenancy_residents', ['id', 'tenancy_id', 'tenant_id', 'joined_on', 'left_on', 'relationship'],
  db.residents.map((r) => [r.id, r.tenancyId, r.tenantId, r.joinedOn, r.leftOn, r.relationship]));
const terminationOf = (id) => db.contractTerminations.find((t) => t.contractId === id);
insert('contracts', ['id', 'tenancy_id', 'code', 'predecessor_contract_id', 'terminated_on', 'termination_reason', 'terminated_by', 'terminated_at', 'archived_at', 'created_by', 'created_at'],
  [...db.contracts].sort((a, b) => Number(Boolean(a.predecessorContractId)) - Number(Boolean(b.predecessorContractId))).map((k) => {
    const end = terminationOf(k.id);
    return [k.id, k.tenancyId, k.code, k.predecessorContractId, end?.terminatedOn, end?.reason, end?.confirmedBy, end?.createdAt, k.archivedAt, k.createdBy, k.createdAt];
  }));
// Đúng thứ tự ở website: soạn phiên bản, thêm các bên, tệp, giá, rồi mới xác nhận ký.
insert('contract_versions', ['id', 'contract_id', 'version_no', 'effective_from', 'ends_on', 'required_deposit', 'invoice_day', 'due_after_days', 'proration_policy', 'terms_text', 'change_reason', 'created_at'],
  db.contractVersions.map((v) => [v.id, v.contractId, v.versionNo, v.effectiveFrom, v.endsOn, v.requiredDeposit, v.invoiceDay, v.dueAfterDays, v.prorationPolicy, v.termsText, v.changeReason, v.createdAt]));
insert('contract_parties', ['contract_version_id', 'party_role', 'full_name_snapshot', 'address_snapshot', 'identity_masked', 'tenant_id'],
  db.contractVersions.flatMap((v) => v.parties.map((p) => [v.id, p.role, p.fullNameSnapshot, p.addressSnapshot || 'Chưa ghi', p.identitySnapshot, p.tenantId])));
insert('contract_files', ['contract_version_id', 'file_id', 'file_kind'], db.contractVersions.flatMap((v) => v.files.map((f) => [v.id, f.fileId, f.fileKind])));
insert('charge_rates', rateColumns, db.chargeRates.filter(isContractRate).map(rateRow));
for (const v of db.contractVersions.filter((x) => x.signedAt)) {
  out.push(`UPDATE contract_versions SET signed_at = ${q(v.signedAt)}, confirmed_by = ${q(v.confirmedBy)}, signature_method = ${q(v.signatureMethod)}, external_signature_reference = ${q(v.externalSignatureReference)} WHERE id = ${q(v.id)};`);
}
const handoverKind = { transfer_in: 'checkin', transfer_out: 'checkout' };
insert('handovers', ['id', 'tenancy_id', 'kind', 'occurred_at', 'notes', 'landlord_confirmed_by', 'tenant_confirmed_by', 'confirmed_at', 'representative_confirmation_text'],
  db.handovers.map((h) => [h.id, h.tenancyId, handoverKind[h.kind] || h.kind, h.occurredAt, h.notes, h.landlordConfirmedBy, h.tenantConfirmedBy, h.confirmedAt, h.representativeConfirmationText]));
insert('handover_items', ['handover_id', 'name', 'quantity', 'condition_notes'], db.handovers.flatMap((h) => (h.assets || []).map((a) => [h.id, a.name || a.nameSnapshot, a.quantity ?? 1, a.conditionNotes])));
insert('handover_files', ['handover_id', 'file_id'], db.handovers.flatMap((h) => (h.fileIds || []).map((f) => [h.id, f])));
insert('tenancy_requests', ['id', 'tenancy_id', 'request_type', 'desired_on', 'message', 'status', 'requested_by', 'reviewed_by', 'decision_notes', 'created_at', 'reviewed_at'],
  db.tenancyRequests.filter((r) => r.requestType !== 'transfer').map((r) => [r.id, r.tenancyId, r.requestType, r.desiredOn, r.message, r.status, r.requestedBy, r.reviewedBy, r.decisionNotes, r.createdAt, r.reviewedAt]));

section('Kỳ tính tiền, công tơ, chỉ số');
insert('billing_periods', ['id', 'property_id', 'month_start'], db.billingPeriods.map((p) => [p.id, p.propertyId, p.monthStart]));
insert('meters', ['id', 'room_id', 'meter_kind', 'serial_number', 'installed_at', 'removed_at'], db.meters.map((m) => [m.id, m.roomId, m.meterKind, m.serialNumber, m.installedAt, m.removedAt]));
const readingColumns = ['id', 'meter_id', 'observed_at', 'reading_value', 'billing_period_id', 'tenancy_id', 'handover_id', 'reading_kind', 'status', 'supersedes_id', 'void_reason', 'notes', 'recorded_by', 'recorded_at'];
const readingRow = (r) => [r.id, r.meterId, r.observedAt, r.readingValue, r.billingPeriodId, r.tenancyId, r.handoverId, r.readingKind, r.status, r.supersedesId, r.voidReason, r.notes, r.recordedBy, r.recordedAt];
insert('meter_readings', readingColumns, db.readings.filter((r) => r.status === 'void').map(readingRow));
insert('meter_readings', readingColumns, db.readings.filter((r) => r.status !== 'void').sort(byTime('observedAt')).map(readingRow));

section('Hóa đơn: tạo nháp, thêm dòng, rồi mới phát hành như website');
insert('charge_instances', ['id', 'tenancy_id', 'charge_type_id', 'billing_period_id', 'occurrence_key'],
  db.chargeInstances.map((c) => [c.id, c.tenancyId, c.chargeTypeId, c.billingPeriodId, c.occurrenceKey]));
const invoices = [...db.invoices].sort(byTime('serviceFrom'));
insert('invoices', ['id', 'tenancy_id', 'billing_period_id', 'kind', 'original_invoice_id', 'code', 'service_from', 'service_to', 'notes', 'needs_recompute', 'idempotency_key', 'created_by', 'created_at'],
  invoices.map((i) => [i.id, i.tenancyId, i.billingPeriodId, i.kind, i.originalInvoiceId, i.code, i.serviceFrom, i.serviceTo, i.notes, Boolean(i.stale), key(i.idempotencyKey), i.createdBy, i.createdAt]));
const lineIds = new Map();
insert('invoice_lines', ['id', 'invoice_id', 'line_no', 'charge_type_id', 'charge_instance_id', 'source_rate_id', 'source_scope', 'description_snapshot', 'unit_snapshot', 'quantity', 'unit_price', 'sign', 'proration_numerator', 'proration_denominator'],
  invoices.flatMap((i) => i.lines.map((l, index) => {
    lineIds.set(l.id, true);
    return [l.id, i.id, l.lineNo || index + 1, l.chargeTypeId, l.chargeInstanceId, l.sourceRateId, l.sourceScope, l.descriptionSnapshot, l.unitSnapshot, l.quantity, l.unitPrice, l.sign ?? 1, l.prorationNumerator ?? 1, l.prorationDenominator ?? 1];
  })));
insert('invoice_meter_segments', ['invoice_line_id', 'from_reading_id', 'to_reading_id'],
  invoices.flatMap((i) => i.segments.map((s) => [s.lineId, s.startReadingId, s.endReadingId])));
for (const i of invoices.filter((x) => x.status === 'issued')) {
  out.push(`UPDATE invoices SET status = 'issued', issued_on = ${q(i.issuedOn)}, due_on = ${q(i.dueOn)}, issued_at = ${q(i.issuedAt)}, issued_by = ${q(i.issuedBy)} WHERE id = ${q(i.id)};`);
}

section('Thu tiền, sổ cọc, phân bổ, quyết toán');
insert('bank_accounts', ['id', 'organization_id', 'bank_name', 'account_number', 'account_holder', 'is_default'],
  db.bankAccounts.map((b) => [b.id, b.organizationId, b.bankName, b.accountNumberMasked, b.accountName, b.isDefault]));
insert('payments', ['id', 'code', 'tenant_id', 'property_id', 'amount', 'received_at', 'method_code', 'bank_account_id', 'external_reference', 'status', 'confirmed_by', 'confirmed_at', 'rejection_reason', 'reported_by', 'notes', 'idempotency_key', 'created_at'],
  db.payments.map((p) => [p.id, p.code, p.tenantId, p.collectedAtPropertyId, p.amount, p.receivedAt, p.methodCode, p.bankAccountId, p.externalReference, p.status, p.confirmedBy, p.confirmedAt, p.rejectionReason, p.reportedBy, p.notes, key(p.idempotencyKey), p.createdAt]));
insert('payment_files', ['payment_id', 'file_id'], db.payments.flatMap((p) => (p.fileIds || []).map((f) => [p.id, f])));
insert('payment_intended_invoices', ['payment_id', 'invoice_id'], db.payments.flatMap((p) => (p.intendedInvoiceIds || []).map((i) => [p.id, i])));
insert('checkout_settlements', ['id', 'tenancy_id', 'checkout_handover_id', 'status', 'allow_remaining_debt', 'remaining_debt_reason', 'confirmed_by', 'confirmed_at', 'notes'],
  db.settlements.map((s) => [s.id, s.tenancyId, s.checkoutHandoverId, s.status, s.allowRemainingDebt, s.remainingDebtReason, s.confirmedBy, s.confirmedAt, s.notes]));

// Website không còn chuyển phòng: cọc đợt cũ được hoàn, đợt mới thu cọc mới, đúng như khi kết thúc hợp đồng rồi tạo hợp đồng mới.
const entries = [...db.depositEntries].sort(byTime('occurredAt'));
const depositColumns = ['id', 'tenancy_id', 'payment_id', 'kind', 'amount', 'related_entry_id', 'payment_reversal_id', 'settlement_id', 'occurred_at', 'reason', 'confirmed_by', 'idempotency_key', 'created_at'];
for (const e of entries) {
  if (e.kind === 'transfer_out') {
    const reversal = `${e.id.slice(0, -4)}aaaa`;
    insert('payment_reversals', ['id', 'payment_id', 'amount', 'kind', 'occurred_at', 'method_code', 'reason', 'confirmed_by', 'idempotency_key'],
      [[reversal, e.paymentId, e.amount, 'refund', e.occurredAt, 'cash', `Hoàn cọc khi đổi phòng: ${e.reason}`, e.confirmedBy, raw('gen_random_uuid()')]]);
    insert('deposit_entries', depositColumns, [[e.id, e.tenancyId, e.paymentId, 'refund', e.amount, null, reversal, e.settlementId, e.occurredAt, e.reason, e.confirmedBy, key(e.idempotencyKey), e.createdAt]]);
  } else if (e.kind === 'transfer_in') {
    const source = find(db.payments, e.paymentId);
    const payment = `${e.id.slice(0, -4)}bbbb`;
    insert('payments', ['id', 'code', 'tenant_id', 'property_id', 'amount', 'received_at', 'method_code', 'status', 'confirmed_by', 'confirmed_at', 'notes', 'idempotency_key'],
      [[payment, `${source.code}-M`, source.tenantId, source.collectedAtPropertyId, e.amount, e.occurredAt, 'cash', 'confirmed', e.confirmedBy, e.occurredAt, 'Thu cọc hợp đồng mới khi đổi phòng', raw('gen_random_uuid()')]]);
    insert('deposit_entries', depositColumns, [[e.id, e.tenancyId, payment, 'receipt', e.amount, null, null, e.settlementId, e.occurredAt, e.reason, e.confirmedBy, key(e.idempotencyKey), e.createdAt]]);
  } else if (e.kind === 'refund') {
    const reversal = `${e.id.slice(0, -4)}cccc`;
    const known = e.paymentReversalId && find(db.paymentReversals, e.paymentReversalId);
    insert('payment_reversals', ['id', 'payment_id', 'amount', 'kind', 'occurred_at', 'method_code', 'reason', 'confirmed_by', 'idempotency_key'],
      [[known ? e.paymentReversalId : reversal, e.paymentId, e.amount, 'refund', e.occurredAt, 'cash', e.reason, e.confirmedBy, raw('gen_random_uuid()')]]);
    insert('deposit_entries', depositColumns, [[e.id, e.tenancyId, e.paymentId, 'refund', e.amount, null, known ? e.paymentReversalId : reversal, e.settlementId, e.occurredAt, e.reason, e.confirmedBy, key(e.idempotencyKey), e.createdAt]]);
  } else {
    insert('deposit_entries', depositColumns, [[e.id, e.tenancyId, e.paymentId, e.kind, e.amount, e.relatedEntryId, e.paymentReversalId, e.settlementId, e.occurredAt, e.reason, e.confirmedBy, key(e.idempotencyKey), e.createdAt]]);
  }
}
insert('payment_allocations', ['id', 'invoice_id', 'payment_id', 'deposit_entry_id', 'kind', 'amount', 'reverses_id', 'allocated_by', 'allocated_at', 'reason', 'idempotency_key'],
  [...db.paymentAllocations].sort(byTime('allocatedAt')).map((a) => [a.id, a.invoiceId, a.paymentId, a.depositEntryId, a.kind, a.amount, a.reversesId, a.allocatedBy, a.allocatedAt, a.reason, key(a.idempotencyKey)]));

section('Ticket');
insert('ticket_categories', ['id', 'organization_id', 'code', 'name'], db.ticketCategories.map((c) => [c.id, c.organizationId, c.code, c.name]));
insert('sla_policies', ['id', 'organization_id', 'priority', 'target_hours'], db.slaPolicies.map((s) => [s.id, s.organizationId, s.priority, s.targetHours]));
insert('tickets', ['id', 'code', 'room_id', 'tenancy_id', 'category_id', 'title', 'description', 'priority', 'status', 'reported_by', 'assigned_to', 'sla_policy_id', 'due_at', 'resolved_at', 'closed_at', 'resolution_notes', 'created_at'],
  db.tickets.map((t) => [t.id, t.code, t.roomId, t.tenancyId, t.categoryId, t.title, t.description, t.priority, t.status, t.reportedBy, t.assignedTo, t.slaPolicyId, t.dueAt, t.resolvedAt, t.closedAt, t.resolutionNotes, t.createdAt]));
insert('ticket_messages', ['id', 'ticket_id', 'author_id', 'body', 'is_internal', 'created_at'], db.ticketMessages.map((m) => [m.id, m.ticketId, m.authorId, m.body, m.isInternal, m.createdAt]));
insert('ticket_files', ['ticket_id', 'message_id', 'file_id'], [
  ...db.tickets.flatMap((t) => (t.fileIds || []).map((f) => [t.id, null, f])),
  ...db.ticketMessages.flatMap((m) => (m.fileIds || []).map((f) => [m.ticketId, m.id, f])),
]);
insert('ticket_events', ['id', 'ticket_id', 'event_type', 'old_status', 'new_status', 'new_assignee_id', 'reason', 'actor_id', 'created_at'],
  db.ticketEvents.map((e) => [e.id, e.ticketId, e.kind, e.fromStatus, e.toStatus, e.assignedTo, e.reason, e.actorId, e.occurredAt]));

section('Thông báo, email, vận hành');
insert('notifications', ['id', 'organization_id', 'recipient_id', 'event_key', 'title', 'body', 'relative_url', 'read_at', 'created_at'],
  db.notifications.map((n) => [n.id, n.organizationId, n.recipientId, n.eventKey, n.title, n.body, n.relativeUrl, n.readAt, n.createdAt]));
insert('email_outbox', ['id', 'organization_id', 'recipient_user_id', 'to_email', 'template_code', 'subject', 'body', 'dedupe_key', 'status', 'attempts', 'created_at'],
  db.deliveries.filter((d) => d.toEmail).map((d) => [d.id, d.organizationId, d.recipientUserId, d.toEmail, d.templateCode, d.subject, d.subject, d.dedupeKey, d.status, d.attempts?.length || 0, d.createdAt]));
insert('backup_runs', ['id', 'kind', 'status', 'reference', 'started_at', 'finished_at'], db.backupRuns.map((b) => [b.id, b.kind, b.status, b.reference, b.startedAt, b.finishedAt]));

section('Trạng thái sau cùng: phòng bảo trì, tháng đã khóa');
for (const r of db.rooms.filter((x) => x.operatingStatus !== 'available')) {
  out.push(`UPDATE rooms SET operating_status = ${q(r.operatingStatus)} WHERE id = ${q(r.id)};`);
}
insert('room_status_events', ['id', 'room_id', 'old_status', 'new_status', 'reason', 'changed_by', 'changed_at'],
  db.roomStatusEvents.map((e) => [e.id, e.roomId, e.fromStatus, e.toStatus, e.reason, e.actorId, e.occurredAt]));
for (const p of db.billingPeriods.filter((x) => x.status === 'locked')) {
  out.push(`UPDATE billing_periods SET status = 'locked', locked_at = ${q(p.lockedAt)}, locked_by = ${q(p.lockedBy)} WHERE id = ${q(p.id)};`);
}
insert('billing_period_events', ['id', 'billing_period_id', 'action', 'reason', 'actor_id', 'created_at'],
  db.periodEvents.map((e) => [e.id, e.periodId, e.action, e.reason, e.actorId, e.occurredAt]));

const header = `-- DỮ LIỆU MẪU, sinh tự động từ dữ liệu mock của frontend bằng database/tools/mock_seed_to_sql.mjs. Không sửa tay.
-- Tên, số điện thoại, email, giấy tờ đều là dữ liệu giả. Dùng cho team backend phát triển và kiểm thử.
-- KHÔNG chạy file này trên database đang chứa dữ liệu thật. Tài khoản mẫu chưa có mật khẩu.
-- Cả file là một giao dịch: mọi dòng phải qua toàn bộ ràng buộc và trigger, sai một dòng là rollback hết.
BEGIN;
SET LOCAL search_path = smartrent, public;
`;
writeFileSync(resolve(here, '../06_du_lieu_mau.sql'), `${header}${out.join('\n')}\n\nCOMMIT;\n`, 'utf8');
console.log(`Đã sinh 06_du_lieu_mau.sql: ${db.rooms.length} phòng, ${db.invoices.length} hóa đơn, ${db.payments.length} khoản thu, ${db.readings.length} chỉ số.`);
