import { mapUrlError } from '../../utils/maps.js';
// Cơ sở, phòng, giá, tin đăng, ảnh, tài sản và danh mục.
import { uuid } from '../../utils/ids.js';
import { compareIso, isIsoDate, vnDateTimeToInstant } from '../../utils/date.js';
import { foldVietnamese, slugify } from '../../utils/format.js';
import { asBool, conflict, fail, listResponse, rule, validator } from '../respond.js';
import {
  activeTenancyOfRoom, allocationConflicts, audit, changeRate, ensureRatePlan, find, metersOfRoom, must, roomOccupancy, roomRates,
  setPlanPrice, tenancyContext, validReadings,
} from '../engine.js';
import { fileDto, planPrices, planRates, propertyRef, propertySummary, rateDto, roomSummary, tenantRef } from '../dto.js';
import { orgProperties, propertyFilter, propertyInScope, roomInScope } from '../scope.js';
import { registerExistingTenancy } from './tenancies.js';

/** Mã cơ sở tự sinh từ chữ cái đầu của tên (Nhà trọ Bình Thạnh → NTBT), thêm số khi trùng. */
function generatePropertyCode(ctx, name) {
  const letters = foldVietnamese(name).toUpperCase().split(/[^A-Z0-9]+/).filter(Boolean).map((word) => word[0]).join('').slice(0, 8);
  const base = letters.length >= 2 ? letters : 'CS';
  const taken = new Set(ctx.db.properties.filter((p) => p.organizationId === ctx.organizationId).map((p) => p.code));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}${n}`)) n += 1;
  return `${base}${n}`;
}

/** Áp bảng giá từ form: [{ chargeTypeId, unitPrice }]. Giá 0 hợp lệ. */
function validateRates(ctx, rates) {
  const v = validator();
  (rates || []).forEach((rate, index) => v.number(`rates.${index}.unitPrice`, rate.unitPrice, 'Đơn giá', { min: 0, decimals: 4 }));
  v.check();
  return (rates || []).map((rate, index) => {
    const type = find(ctx.db.chargeTypes, rate.chargeTypeId);
    if (!type || type.organizationId !== ctx.organizationId) fail(422, 'validation_failed', 'Khoản thu không thuộc đơn vị.', { [`rates.${index}.chargeTypeId`]: ['Khoản thu không hợp lệ.'] });
    return { type, unitPrice: rate.unitPrice };
  });
}

/** Giá phòng trùng giá cơ sở thì đóng giá riêng để phòng tiếp tục kế thừa; khác giá thì ghi giá riêng. */
function syncRoomRates(ctx, room, rates) {
  const { db, today } = ctx;
  const plan = ensureRatePlan(db, { roomId: room.id });
  const propertyPlan = db.ratePlans.find((p) => p.propertyId === room.propertyId);
  const inherited = planPrices(db, propertyPlan, today);
  for (const { type, unitPrice } of validateRates(ctx, rates)) {
    if (type.category !== 'rent' && inherited[type.code] === unitPrice) {
      const open = db.chargeRates.find((r) => r.ratePlanId === plan.id && r.chargeTypeId === type.id && !r.effectiveTo);
      if (open && open.effectiveFrom >= today) db.chargeRates.splice(db.chargeRates.indexOf(open), 1);
      else if (open) open.effectiveTo = today;
    } else {
      setPlanPrice(db, plan, type, unitPrice, today);
    }
  }
}

// Có đợt thuê hiệu lực/sắp vào ở: tin tự tạm ẩn (xem hideListing/republishListing trong tenancies.js).
function roomHasCurrentTenancy(db, room) {
  return db.tenancies.some((t) => ['active', 'planned'].includes(t.status) && find(db.roomAllocations, t.allocationId)?.roomId === room.id);
}
function roomCanChangeProperty(db, room) {
  return !db.tenancies.some((t) => t.status !== 'cancelled' && find(db.roomAllocations, t.allocationId)?.roomId === room.id);
}

function syncListing(ctx, room) {
  const b = ctx.body.listing;
  if (!b) return;
  if (!['draft', 'hidden', 'published'].includes(b.status)) fail(422, 'validation_failed', 'Trạng thái tin không hợp lệ.');
  let listing = ctx.db.roomListings.find((l) => l.roomId === room.id);
  if (!listing) {
    listing = { id: uuid(), roomId: room.id, slug: `${slugify(room.code)}-${room.id.slice(0,8)}`, createdAt: ctx.now };
    ctx.db.roomListings.push(listing);
  }
  if (b.status === 'published' && ![...roomRates(ctx.db, room.id, ctx.today).values()].some(({ rate }) => rate.unitPrice > 0 && find(ctx.db.chargeTypes, rate.chargeTypeId)?.category === 'rent')) fail(422, 'validation_failed', 'Cần giá phòng trước khi đăng tin.');
  if (b.status === 'published' && listing.status !== 'published' && roomHasCurrentTenancy(ctx.db, room)) {
    fail(422, 'validation_failed', 'Phòng đang có người thuê hoặc có hợp đồng sắp vào ở nên tin tạm ẩn. Tin sẽ tự công khai lại khi trả phòng.');
  }
  Object.assign(listing, { title: b.title?.trim() || `${room.name} – ${find(ctx.db.properties, room.propertyId).name}`, description: b.description || null, status: b.status, updatedAt: ctx.now });
  if (b.status === 'published') listing.publishedAt ||= ctx.now;
}

function addRoomImage(ctx, room, fileId, caption) {
  const file = must(ctx.db.files, fileId, 'tệp');
  if (file.visibility !== 'public') rule('file_not_public', 'Ảnh phòng phải là tệp công khai.');
  if (file.scanStatus !== 'clean') rule('file_not_clean', 'Tệp chưa qua kiểm tra an toàn.');
  room.images.push({ id: uuid(), fileId: file.id, url: file.dataUrl || null, caption: caption || null, sortOrder: room.images.length + 1, isCover: room.images.length === 0 });
}

function validateProperty(ctx, b, existing) {
  const v = validator();
  v.required('name', b.name, 'Tên cơ sở');
  v.required('address.line', b.address?.line, 'Địa chỉ');
  v.required('address.province', b.address?.province, 'Tỉnh/thành phố');
  v.email('email', b.email);
  v.phone('phone', b.phone);
  if (existing && !b.code) v.add('code', 'Mã cơ sở là bắt buộc.');
  if (b.code && !/^[A-Z0-9-]{2,20}$/.test(b.code)) v.add('code', 'Mã gồm chữ in hoa, số hoặc gạch ngang, 2–20 ký tự.');
  if (b.billingSettings) {
    v.number('billingSettings.invoiceDay', b.billingSettings.invoiceDay, 'Ngày lập hóa đơn', { min: 1, max: 31 });
    v.number('billingSettings.dueAfterDays', b.billingSettings.dueAfterDays, 'Số ngày đến hạn', { min: 0, max: 365 });
    v.number('billingSettings.contractWarningDays', b.billingSettings.contractWarningDays, 'Mốc cảnh báo hợp đồng', { min: 0, max: 365 });
  }
  for (const key of ['mapUrl', 'mapEmbedUrl']) { const error = mapUrlError(b[key], key === 'mapEmbedUrl'); if (error) v.add(key, error); }
  v.check();
  if (b.code && ctx.db.properties.some((p) => p.organizationId === ctx.organizationId && p.code === b.code && p.id !== existing?.id)) {
    conflict('property_code_taken', `Mã cơ sở ${b.code} đã được dùng trong đơn vị.`, { code: ['Mã đã tồn tại.'] });
  }
}

function propertyDetail(ctx, p) {
  const { db } = ctx;
  const plan = db.ratePlans.find((x) => x.propertyId === p.id);
  return {
    ...propertySummary(db, p, ctx.today),
    description: p.description, email: p.email, mapUrl: p.mapUrl || null, mapEmbedUrl: p.mapEmbedUrl || null,
    billingSettings: db.billingSettings.find((s) => s.propertyId === p.id),
    rates: planRates(db, plan, 'property'),
    periods: db.billingPeriods.filter((x) => x.propertyId === p.id).sort((a, b) => compareIso(b.monthStart, a.monthStart)).slice(0, 6),
    activeTenancyCount: db.tenancies.filter((t) => t.status === 'active' && find(db.rooms, find(db.roomAllocations, t.allocationId).roomId).propertyId === p.id).length,
  };
}

function roomDetail(ctx, room) {
  const { db, today } = ctx;
  const summary = roomSummary(db, room, today);
  const effective = [...roomRates(db, room.id, today).values()].map(({ rate, scope }) => rateDto(db, rate, scope))
    .sort((a, b) => ['rent', 'electricity', 'water', 'service', 'other', 'compensation'].indexOf(a.chargeType.category) - ['rent', 'electricity', 'water', 'service', 'other', 'compensation'].indexOf(b.chargeType.category));
  const allocations = db.roomAllocations.filter((a) => a.roomId === room.id).sort((a, b) => compareIso(b.startsOn, a.startsOn));
  return {
    ...summary,
    description: room.description, rulesText: room.rulesText, address: find(db.properties, room.propertyId).address, mapUrl: find(db.properties, room.propertyId).mapUrl || null, mapEmbedUrl: find(db.properties, room.propertyId).mapEmbedUrl || null,
    amenities: room.amenityIds.map((id) => find(db.amenities, id)).filter(Boolean).map((a) => ({ id: a.id, code: a.code, name: a.name, icon: a.icon })),
    images: [...room.images].sort((a, b) => a.sortOrder - b.sortOrder).map((i) => ({ ...i, file: i.fileId ? fileDto(db, i.fileId) : null })),
    assets: db.roomAssets.filter((a) => a.roomId === room.id),
    listing: (() => {
      const listing = db.roomListings.find((l) => l.roomId === room.id);
      return listing ? { ...listing, lockedByContract: roomHasCurrentTenancy(db, room) } : null;
    })(),
    canChangeProperty: roomCanChangeProperty(db, room),
    rates: {
      effective,
      room: planRates(db, db.ratePlans.find((p) => p.roomId === room.id), 'room'),
      property: planRates(db, db.ratePlans.find((p) => p.propertyId === room.propertyId), 'property'),
    },
    meters: metersOfRoom(db, room.id).map((m) => {
      const last = validReadings(db, m.id).pop();
      return { id: m.id, meterKind: m.meterKind, serialNumber: m.serialNumber, installedAt: m.installedAt, removedAt: m.removedAt, lastReading: last ? { value: last.readingValue, observedAt: last.observedAt, kind: last.readingKind } : null };
    }),
    statusEvents: db.roomStatusEvents.filter((e) => e.roomId === room.id).sort((a, b) => compareIso(b.occurredAt, a.occurredAt)),
    calendar: allocations.map((a) => {
      const tenancy = db.tenancies.find((t) => t.allocationId === a.id);
      const reservation = db.reservations.find((r) => r.allocationId === a.id);
      return {
        id: a.id, state: a.state, startsOn: a.startsOn, endsOn: a.endsOn, holdExpiresAt: a.holdExpiresAt,
        tenancy: tenancy ? { id: tenancy.id, status: tenancy.status, representative: tenantRef(find(db.tenants, tenancy.representativeTenantId)), actualMoveIn: tenancy.actualMoveIn, actualMoveOut: tenancy.actualMoveOut } : null,
        reservation: reservation ? { id: reservation.id, code: reservation.code, status: reservation.status, tenant: tenantRef(find(db.tenants, reservation.tenantId)) } : null,
      };
    }),
    tickets: db.tickets.filter((t) => t.roomId === room.id).sort((a, b) => compareIso(b.createdAt, a.createdAt)).slice(0, 5)
      .map((t) => ({ id: t.id, code: t.code, title: t.title, status: t.status, priority: t.priority, createdAt: t.createdAt })),
  };
}

/**
 * Form phòng không còn chọn loại phòng nhưng database bắt buộc room_type_id. Dùng một loại trung tính riêng
 * thay vì loại đầu danh sách, để phòng mới không bị gắn nhầm "Phòng đơn" trên trang tìm phòng công khai.
 */
function defaultRoomType(ctx) {
  const own = ctx.db.roomTypes.find((t) => t.organizationId === ctx.organizationId && t.code === 'STANDARD');
  if (own) return own;
  const type = { id: uuid(), organizationId: ctx.organizationId, code: 'STANDARD', name: 'Phòng tiêu chuẩn', description: null };
  ctx.db.roomTypes.push(type);
  return type;
}

function validateRoom(ctx, b, existing) {
  const v = validator();
  if (!existing) v.required('propertyId', b.propertyId, 'Cơ sở');
  v.required('code', b.code, 'Mã phòng');
  v.required('name', b.name, 'Tên phòng');
  v.number('areaM2', b.areaM2, 'Diện tích', { min: 1, max: 500, decimals: 2 });
  v.number('capacity', b.capacity, 'Sức chứa', { min: 1, max: 20 });
  v.money('requiredDeposit', b.requiredDeposit, 'Mức cọc chào thuê');
  if (!existing) v.money('rent', b.rent, 'Giá thuê', { positive: true });
  if (b.code && !/^[A-Za-z0-9-]{1,20}$/.test(b.code)) v.add('code', 'Mã phòng chỉ gồm chữ, số, gạch ngang.');
  v.check();
  const propertyId = b.propertyId || existing?.propertyId;
  if (ctx.db.rooms.some((r) => r.propertyId === propertyId && r.code.toLowerCase() === b.code.toLowerCase() && r.id !== existing?.id)) {
    conflict('room_code_taken', `Mã phòng ${b.code} đã có trong cơ sở này.`, { code: ['Mã phòng trùng trong cơ sở.'] });
  }
  if (b.roomTypeId && find(ctx.db.roomTypes, b.roomTypeId)?.organizationId !== ctx.organizationId) {
    fail(422, 'validation_failed', 'Loại phòng không thuộc đơn vị.', { roomTypeId: ['Loại phòng không hợp lệ.'] });
  }
}

function validateRate(ctx, b) {
  const v = validator();
  v.required('chargeTypeId', b.chargeTypeId, 'Khoản thu');
  v.date('effectiveFrom', b.effectiveFrom, 'Ngày hiệu lực');
  v.number('unitPrice', b.unitPrice, 'Đơn giá', { min: 0, decimals: 4 });
  v.oneOf('calculationMethod', b.calculationMethod, ['fixed', 'metered', 'per_person', 'per_quantity'], 'Cách tính');
  v.oneOf('billingCycle', b.billingCycle, ['monthly', 'once'], 'Chu kỳ');
  v.oneOf('prorationMode', b.prorationMode || 'full_period', ['full_period', 'actual_days'], 'Cách chia ngày');
  v.check();
  const type = find(ctx.db.chargeTypes, b.chargeTypeId);
  if (!type || type.organizationId !== ctx.organizationId) fail(422, 'validation_failed', 'Khoản thu không hợp lệ.', { chargeTypeId: ['Khoản thu không thuộc đơn vị.'] });
  if (['electricity', 'water'].includes(type.category) && b.calculationMethod !== 'metered') {
    fail(422, 'validation_failed', 'Điện/nước tính theo chỉ số công tơ.', { calculationMethod: ['Điện/nước phải là "theo chỉ số".'] });
  }
  return type;
}

function affectedTenancies(ctx, { propertyId, roomId, chargeTypeId }) {
  const { db } = ctx;
  return db.tenancies.filter((t) => ['active', 'planned'].includes(t.status)).filter((t) => {
    const c = tenancyContext(db, t);
    if (propertyId && c.property.id !== propertyId) return false;
    if (roomId && c.room.id !== roomId) return false;
    // Hợp đồng đã chốt giá cho khoản này thì không bị ảnh hưởng.
    const versionIds = db.contractVersions.filter((v) => db.contracts.some((k) => k.id === v.contractId && k.tenancyId === t.id) && v.signedAt).map((v) => v.id);
    const fixed = db.ratePlans.filter((p) => versionIds.includes(p.contractVersionId)).some((p) => db.chargeRates.some((r) => r.ratePlanId === p.id && r.chargeTypeId === chargeTypeId));
    if (fixed) return false;
    if (propertyId && db.ratePlans.some((p) => p.roomId === c.room.id && db.chargeRates.some((r) => r.ratePlanId === p.id && r.chargeTypeId === chargeTypeId && !r.effectiveTo))) return false;
    return true;
  }).map((t) => {
    const c = tenancyContext(db, t);
    return { tenancyId: t.id, roomCode: c.room.code, representative: c.tenant.fullName };
  });
}

export default function register(r) {
  // ---------------------------------------------------------------- cơ sở
  r.get('/api/v1/properties', (ctx) => {
    const all = orgProperties(ctx).map((p) => propertySummary(ctx.db, p, ctx.today));
    return listResponse(all, ctx.query, {
      filter: (p) => ctx.query.isActive == null || ctx.query.isActive === '' || p.isActive === asBool(ctx.query.isActive),
      search: (p) => [p.code, p.name, p.address.line, p.address.locality, p.address.province],
      sortable: ['code', 'name', 'roomCount', 'occupiedCount', 'availableCount', 'createdAt'],
      defaultSort: 'code',
    });
  }, { perm: 'properties.read' });

  r.post('/api/v1/properties', (ctx) => {
    const b = ctx.body;
    validateProperty(ctx, b);
    const rates = validateRates(ctx, b.rates);
    const p = {
      id: uuid(), organizationId: ctx.organizationId, code: b.code || generatePropertyCode(ctx, b.name), name: b.name.trim(),
      address: { line: b.address.line, locality: b.address.locality || null, province: b.address.province, latitude: null, longitude: null },
      mapUrl: b.mapUrl || null, mapEmbedUrl: b.mapEmbedUrl || null, description: b.description || null, contactName: b.contactName || null, phone: b.phone || null, email: b.email || null, isActive: true, createdAt: ctx.now,
    };
    ctx.db.properties.push(p);
    ctx.db.billingSettings.push({ propertyId: p.id, invoiceDay: 28, dueAfterDays: 7, contractWarningDays: 30, prorationPolicy: 'actual_days', timezone: 'Asia/Ho_Chi_Minh', ...(b.billingSettings || {}) });
    const plan = ensureRatePlan(ctx.db, { propertyId: p.id });
    rates.forEach(({ type, unitPrice }) => setPlanPrice(ctx.db, plan, type, unitPrice, ctx.today));
    if (ctx.membership.propertyScope === 'assigned') ctx.membership.propertyIds.push(p.id);
    audit(ctx.db, ctx, { action: 'INSERT', tableName: 'properties', recordId: p.id, after: { code: p.code, name: p.name } });
    return propertyDetail(ctx, p);
  }, { perm: 'properties.write' });

  r.get('/api/v1/properties/:id', (ctx) => propertyDetail(ctx, propertyInScope(ctx, ctx.params.id)), { perm: 'properties.read' });

  r.put('/api/v1/properties/:id', (ctx) => {
    const p = propertyInScope(ctx, ctx.params.id);
    validateProperty(ctx, ctx.body, p);
    const rates = validateRates(ctx, ctx.body.rates);
    for (const key of ['mapUrl', 'mapEmbedUrl']) if (Object.hasOwn(ctx.body, key)) p[key] = ctx.body[key] || null;
    const before = { code: p.code, name: p.name, address: p.address };
    Object.assign(p, {
      code: ctx.body.code, name: ctx.body.name.trim(), description: ctx.body.description || null, contactName: ctx.body.contactName || null,
      phone: ctx.body.phone || null, email: ctx.body.email || null, address: { ...p.address, ...ctx.body.address },
    });
    if (ctx.body.billingSettings) Object.assign(ctx.db.billingSettings.find((s) => s.propertyId === p.id), ctx.body.billingSettings);
    const plan = ensureRatePlan(ctx.db, { propertyId: p.id });
    rates.forEach(({ type, unitPrice }) => setPlanPrice(ctx.db, plan, type, unitPrice, ctx.today));
    audit(ctx.db, ctx, { action: 'UPDATE', tableName: 'properties', recordId: p.id, before, after: { code: p.code, name: p.name, address: p.address } });
    return propertyDetail(ctx, p);
  }, { perm: 'properties.write' });

  r.post('/api/v1/properties/:id/deactivate', (ctx) => {
    const p = propertyInScope(ctx, ctx.params.id);
    const v = validator();
    v.reason('reason', ctx.body.reason);
    v.check();
    const active = ctx.db.tenancies.filter((t) => ['active', 'planned'].includes(t.status) && tenancyContext(ctx.db, t).property.id === p.id);
    if (active.length) conflict('property_has_active_tenancies', `Cơ sở còn ${active.length} đợt thuê đang ở/dự kiến. Hoàn tất trả phòng hoặc chuyển phòng trước khi ngừng hoạt động.`);
    p.isActive = false;
    audit(ctx.db, ctx, { action: 'property.deactivate', tableName: 'properties', recordId: p.id, after: { isActive: false }, reason: ctx.body.reason });
    return propertyDetail(ctx, p);
  }, { perm: 'properties.write' });

  r.post('/api/v1/properties/:id/activate', (ctx) => {
    const p = propertyInScope(ctx, ctx.params.id);
    p.isActive = true;
    audit(ctx.db, ctx, { action: 'property.activate', tableName: 'properties', recordId: p.id, after: { isActive: true } });
    return propertyDetail(ctx, p);
  }, { perm: 'properties.write' });

  r.delete('/api/v1/properties/:id', (ctx) => {
    const p = propertyInScope(ctx, ctx.params.id);
    const count = ctx.db.rooms.filter((room) => room.propertyId === p.id).length;
    if (count) conflict('property_has_rooms', `Không xóa được cơ sở còn ${count} phòng. Có thể ngừng hoạt động cơ sở thay vì xóa.`);
    ctx.db.properties = ctx.db.properties.filter((x) => x.id !== p.id);
    ctx.db.billingSettings = ctx.db.billingSettings.filter((x) => x.propertyId !== p.id);
    audit(ctx.db, ctx, { action: 'DELETE', tableName: 'properties', recordId: p.id, before: { code: p.code, name: p.name } });
    return null;
  }, { perm: 'properties.write' });

  r.post('/api/v1/properties/:id/rates', (ctx) => {
    const p = propertyInScope(ctx, ctx.params.id);
    const type = validateRate(ctx, ctx.body);
    const plan = ensureRatePlan(ctx.db, { propertyId: p.id });
    const affected = affectedTenancies(ctx, { propertyId: p.id, chargeTypeId: type.id });
    const rate = changeRate(ctx.db, plan.id, { ...ctx.body, prorationMode: ctx.body.prorationMode || 'full_period' });
    audit(ctx.db, ctx, { action: 'charge_rate.change', tableName: 'charge_rates', recordId: rate.id, after: { property: p.code, chargeType: type.code, unitPrice: rate.unitPrice, effectiveFrom: rate.effectiveFrom }, reason: ctx.body.reason });
    return { rate: rateDto(ctx.db, rate, 'property'), affectedTenancies: affected };
  }, { perm: 'properties.write' });

  r.post('/api/v1/properties/:id/rates/preview', (ctx) => {
    const p = propertyInScope(ctx, ctx.params.id);
    return { affectedTenancies: affectedTenancies(ctx, { propertyId: p.id, chargeTypeId: ctx.body.chargeTypeId }) };
  }, { perm: 'properties.read' });

  // ---------------------------------------------------------------- phòng
  r.get('/api/v1/rooms', (ctx) => {
    const q = ctx.query;
    const allowed = propertyFilter(ctx);
    const all = ctx.db.rooms.filter((room) => allowed.has(room.propertyId)).map((room) => roomSummary(ctx.db, room, ctx.today));
    return listResponse(all, q, {
      filter: (room) => (!q.status || room.occupancyStatus === q.status)
        && (!q.roomTypeId || room.roomType?.id === q.roomTypeId)
        && (!q.listingStatus || (q.listingStatus === 'none' ? !room.listingStatus : room.listingStatus === q.listingStatus))
        && (!q.priceMin || (room.currentRent ?? 0) >= Number(q.priceMin))
        && (!q.priceMax || (room.currentRent ?? 0) <= Number(q.priceMax))
        && (!q.areaMin || room.areaM2 >= Number(q.areaMin))
        && (!q.upcoming || Boolean(room.upcoming) === asBool(q.upcoming))
        && (q.contract !== 'missing' || (room.currentTenancy && !room.currentTenancy.hasContract)),
      search: (room) => [room.code, room.name, room.property.name, room.currentTenancy?.representative?.fullName],
      sortable: ['code', 'name', 'property.code', 'areaM2', 'capacity', 'currentRent', 'occupancyStatus'],
      defaultSort: 'code',
    });
  }, { perm: 'rooms.read' });

  r.post('/api/v1/rooms', (ctx) => {
    const b = ctx.body;
    const property = propertyInScope(ctx, b.propertyId);
    validateRoom(ctx, b);
    if (b.operatingStatus) {
      const v = validator();
      v.oneOf('operatingStatus', b.operatingStatus, ['available', 'maintenance', 'inactive'], 'Trạng thái phòng');
      v.check();
    }
    const room = {
      id: uuid(), propertyId: b.propertyId, roomTypeId: b.roomTypeId || defaultRoomType(ctx).id, code: b.code.trim().toUpperCase(), name: b.name.trim(), floorLabel: b.floorLabel || null,
      areaM2: b.areaM2, capacity: b.capacity, description: b.description || null, rulesText: b.rulesText || null, requiredDeposit: b.requiredDeposit,
      operatingStatus: b.operatingStatus || 'available', createdAt: ctx.now, amenityIds: (b.amenityIds || []).filter((id) => find(ctx.db.amenities, id)?.organizationId === ctx.organizationId), images: [],
    };
    ctx.db.rooms.push(room);
    const plan = ensureRatePlan(ctx.db, { roomId: room.id });
    const rentType = ctx.db.chargeTypes.find((c) => c.organizationId === ctx.organizationId && c.category === 'rent');
    ctx.db.chargeRates.push({ id: uuid(), ratePlanId: plan.id, chargeTypeId: rentType.id, effectiveFrom: b.rentEffectiveFrom || ctx.today, effectiveTo: null, unitPrice: b.rent, calculationMethod: 'fixed', billingCycle: 'monthly', prorationMode: 'actual_days' });
    // Phòng mới luôn có công tơ điện/nước để vào được kỳ tính tiền; số serial có thể bổ sung sau.
    const installedOn = b.occupant?.moveInOn && b.occupant.moveInOn < ctx.today ? b.occupant.moveInOn : ctx.today;
    for (const kind of ['electricity', 'water']) {
      const serial = b.meters?.[kind] || `${property.code}-${room.code}-${kind === 'electricity' ? 'D' : 'N'}`;
      ctx.db.meters.push({ id: uuid(), roomId: room.id, meterKind: kind, serialNumber: serial, installedAt: vnDateTimeToInstant(installedOn), removedAt: null });
    }
    syncRoomRates(ctx, room, b.rates);
    (b.imageFileIds || []).forEach((fileId) => addRoomImage(ctx, room, fileId));
    // Phòng trống phải hiện ngay ở trang Thuê phòng; admin vẫn ẩn được ở chi tiết phòng.
    ctx.db.roomListings.push({
      id: uuid(), roomId: room.id, slug: slugify(`${property.code}-${room.code}`).slice(0, 80), title: `${room.name} – ${property.name}`, description: room.description,
      status: room.operatingStatus === 'inactive' ? 'draft' : 'published', publishedAt: ctx.now, updatedAt: ctx.now, videoUrl: null,
    });
    if (b.occupant) registerExistingTenancy(ctx, room, b.occupant);
    audit(ctx.db, ctx, { action: 'INSERT', tableName: 'rooms', recordId: room.id, after: { code: room.code, propertyId: room.propertyId } });
    syncListing(ctx, room);
    return roomDetail(ctx, room);
  }, { perm: 'rooms.write' });

  r.get('/api/v1/rooms/:id', (ctx) => roomDetail(ctx, roomInScope(ctx, ctx.params.id)), { perm: 'rooms.read' });

  r.put('/api/v1/rooms/:id', (ctx) => {
    const room = roomInScope(ctx, ctx.params.id);
    const b = ctx.body;
    // Giống backend: chuyển cơ sở chỉ khi phòng chưa từng có đợt thuê (hóa đơn, kỳ tính tiền gắn với cơ sở cũ).
    if (b.propertyId && b.propertyId !== room.propertyId) {
      if (!roomCanChangeProperty(ctx.db, room)) {
        conflict('room_property_locked_by_contracts', 'Phòng đã có hợp đồng nên không chuyển sang cơ sở khác được: hóa đơn và kỳ tính tiền đã gắn với cơ sở cũ.');
      }
      must(ctx.db.properties, b.propertyId, 'cơ sở');
    }
    validateRoom(ctx, b, room);
    if (b.propertyId && b.propertyId !== room.propertyId) room.propertyId = b.propertyId;
    const before = { code: room.code, areaM2: room.areaM2, capacity: room.capacity, requiredDeposit: room.requiredDeposit };
    Object.assign(room, {
      roomTypeId: b.roomTypeId || room.roomTypeId, code: b.code.trim().toUpperCase(), name: b.name.trim(), floorLabel: b.floorLabel || null, areaM2: b.areaM2, capacity: b.capacity,
      description: b.description || null, rulesText: b.rulesText || null, requiredDeposit: b.requiredDeposit,
      amenityIds: (b.amenityIds || []).filter((id) => find(ctx.db.amenities, id)?.organizationId === ctx.organizationId),
    });
    if (b.rent != null) {
      const v = validator();
      v.money('rent', b.rent, 'Giá thuê', { positive: true });
      v.check();
      const rentType = ctx.db.chargeTypes.find((c) => c.organizationId === ctx.organizationId && c.category === 'rent');
      setPlanPrice(ctx.db, ensureRatePlan(ctx.db, { roomId: room.id }), rentType, b.rent, ctx.today);
    }
    syncRoomRates(ctx, room, b.rates);
    (b.imageFileIds || []).forEach((fileId) => addRoomImage(ctx, room, fileId));
    if (b.occupant) registerExistingTenancy(ctx, room, b.occupant);
    audit(ctx.db, ctx, { action: 'UPDATE', tableName: 'rooms', recordId: room.id, before, after: { code: room.code, areaM2: room.areaM2, capacity: room.capacity, requiredDeposit: room.requiredDeposit } });
    syncListing(ctx, room);
    return roomDetail(ctx, room);
  }, { perm: 'rooms.write' });

  r.delete('/api/v1/rooms/:id', (ctx) => {
    const room = roomInScope(ctx, ctx.params.id);
    const history = ctx.db.roomAllocations.some((a) => a.roomId === room.id) || ctx.db.inquiries.some((q) => q.roomId === room.id) || ctx.db.tickets.some((t) => t.roomId === room.id);
    if (history) conflict('room_has_history', 'Phòng đã có lịch sử thuê/yêu cầu/ticket nên không xóa được. Dùng "Ngừng khai thác" để giữ lịch sử.');
    ctx.db.rooms = ctx.db.rooms.filter((x) => x.id !== room.id);
    ctx.db.meters = ctx.db.meters.filter((m) => m.roomId !== room.id);
    ctx.db.roomListings = ctx.db.roomListings.filter((l) => l.roomId !== room.id);
    audit(ctx.db, ctx, { action: 'DELETE', tableName: 'rooms', recordId: room.id, before: { code: room.code } });
    return null;
  }, { perm: 'rooms.write' });

  r.post('/api/v1/rooms/:id/status', (ctx) => {
    const room = roomInScope(ctx, ctx.params.id);
    const { status, reason } = ctx.body;
    const v = validator();
    v.oneOf('status', status, ['available', 'maintenance', 'inactive'], 'Trạng thái khai thác');
    v.reason('reason', reason);
    v.check();
    if (status === room.operatingStatus) conflict('status_unchanged', 'Phòng đã ở trạng thái này.');
    const active = activeTenancyOfRoom(ctx.db, room.id);
    if (status === 'inactive' && active) {
      conflict('room_occupied', 'Phòng đang có người ở. Không đổi trạng thái để gỡ khách; hãy dùng luồng trả phòng hoặc chuyển phòng.');
    }
    if (status === 'inactive' && allocationConflicts(ctx.db, room.id, ctx.today, null).some((a) => ['held', 'reserved'].includes(a.state))) {
      conflict('room_has_upcoming', 'Phòng có giữ chỗ hoặc đợt thuê dự kiến. Hủy/giải phóng lịch trước khi ngừng khai thác.');
    }
    ctx.db.roomStatusEvents.push({ id: uuid(), roomId: room.id, fromStatus: room.operatingStatus, toStatus: status, reason, actorId: ctx.user.id, occurredAt: ctx.now });
    audit(ctx.db, ctx, { action: 'room.status', tableName: 'rooms', recordId: room.id, before: { operatingStatus: room.operatingStatus }, after: { operatingStatus: status }, reason });
    room.operatingStatus = status;
    if (status === 'inactive') {
      const listing = ctx.db.roomListings.find((l) => l.roomId === room.id);
      if (listing?.status === 'published') listing.status = 'hidden';
    }
    syncListing(ctx, room);
    return roomDetail(ctx, room);
  }, { perm: 'rooms.write' });

  r.put('/api/v1/rooms/:id/listing', (ctx) => {
    const room = roomInScope(ctx, ctx.params.id);
    const b = ctx.body;
    const v = validator();
    v.required('title', b.title, 'Tiêu đề tin');
    v.oneOf('status', b.status, ['draft', 'published', 'hidden'], 'Trạng thái tin');
    v.check();
    if (b.status === 'published' && room.operatingStatus === 'inactive') rule('room_inactive', 'Phòng đang ngừng khai thác, không thể công khai tin.');
    if (b.status === 'published' && !room.images.length) rule('listing_needs_image', 'Thêm ít nhất một ảnh phòng trước khi công khai tin.');
    let listing = ctx.db.roomListings.find((l) => l.roomId === room.id);
    const slug = slugify(b.slug || `${find(ctx.db.properties, room.propertyId).code}-${room.code}-${b.title}`).slice(0, 80);
    if (ctx.db.roomListings.some((l) => l.slug === slug && l.roomId !== room.id)) conflict('slug_taken', 'Đường dẫn tin đã được dùng.', { slug: ['Đã tồn tại.'] });
    if (!listing) {
      listing = { id: uuid(), roomId: room.id, slug, title: b.title, description: b.description || null, status: b.status, publishedAt: null, updatedAt: ctx.now };
      ctx.db.roomListings.push(listing);
    }
    Object.assign(listing, { slug, title: b.title, description: b.description || null, status: b.status, updatedAt: ctx.now });
    if (b.status === 'published' && !listing.publishedAt) listing.publishedAt = ctx.now;
    return listing;
  }, { perm: 'rooms.write' });

  r.post('/api/v1/rooms/:id/images', (ctx) => {
    const room = roomInScope(ctx, ctx.params.id);
    addRoomImage(ctx, room, ctx.body.fileId, ctx.body.caption);
    return roomDetail(ctx, room).images;
  }, { perm: 'rooms.write' });

  r.patch('/api/v1/rooms/:id/images', (ctx) => {
    const room = roomInScope(ctx, ctx.params.id);
    const { order, coverImageId } = ctx.body;
    if (order) {
      if (order.length !== room.images.length || order.some((id) => !room.images.some((i) => i.id === id))) fail(422, 'validation_failed', 'Danh sách thứ tự ảnh không khớp.');
      order.forEach((id, index) => { room.images.find((i) => i.id === id).sortOrder = index + 1; });
    }
    if (coverImageId) {
      if (!room.images.some((i) => i.id === coverImageId)) fail(422, 'validation_failed', 'Ảnh bìa không thuộc phòng.');
      room.images.forEach((i) => { i.isCover = i.id === coverImageId; });
    }
    return roomDetail(ctx, room).images;
  }, { perm: 'rooms.write' });

  r.delete('/api/v1/rooms/:id/images/:imageId', (ctx) => {
    const room = roomInScope(ctx, ctx.params.id);
    const image = room.images.find((i) => i.id === ctx.params.imageId);
    if (!image) fail(404, 'not_found', 'Không tìm thấy ảnh.');
    const listing = ctx.db.roomListings.find((l) => l.roomId === room.id);
    if (room.images.length === 1 && listing?.status === 'published') rule('listing_needs_image', 'Tin đang công khai cần ít nhất một ảnh. Ẩn tin trước khi xóa ảnh cuối.');
    room.images = room.images.filter((i) => i.id !== image.id);
    if (image.isCover && room.images[0]) room.images[0].isCover = true;
    room.images.forEach((i, index) => { i.sortOrder = index + 1; });
    return roomDetail(ctx, room).images;
  }, { perm: 'rooms.write' });

  r.post('/api/v1/rooms/:id/assets', (ctx) => {
    const room = roomInScope(ctx, ctx.params.id);
    const b = ctx.body;
    const v = validator();
    v.required('code', b.code, 'Mã tài sản');
    v.required('name', b.name, 'Tên tài sản');
    v.number('quantity', b.quantity, 'Số lượng', { min: 0.001, decimals: 3 });
    v.check();
    if (ctx.db.roomAssets.some((a) => a.roomId === room.id && a.code === b.code)) conflict('asset_code_taken', 'Mã tài sản đã có trong phòng.', { code: ['Trùng mã.'] });
    const asset = { id: uuid(), roomId: room.id, code: b.code, name: b.name, quantity: b.quantity, conditionNotes: b.conditionNotes || null, acquiredOn: b.acquiredOn || null, retiredOn: null };
    ctx.db.roomAssets.push(asset);
    return asset;
  }, { perm: 'rooms.write' });

  r.put('/api/v1/rooms/:id/assets/:assetId', (ctx) => {
    const room = roomInScope(ctx, ctx.params.id);
    const asset = ctx.db.roomAssets.find((a) => a.id === ctx.params.assetId && a.roomId === room.id);
    if (!asset) fail(404, 'not_found', 'Không tìm thấy tài sản.');
    const b = ctx.body;
    if (b.retiredOn && !isIsoDate(b.retiredOn)) fail(422, 'validation_failed', 'Ngày thanh lý chưa hợp lệ.', { retiredOn: ['Ngày chưa hợp lệ.'] });
    Object.assign(asset, { name: b.name ?? asset.name, quantity: b.quantity ?? asset.quantity, conditionNotes: b.conditionNotes ?? asset.conditionNotes, retiredOn: b.retiredOn ?? asset.retiredOn });
    return asset;
  }, { perm: 'rooms.write' });

  r.post('/api/v1/rooms/:id/rates', (ctx) => {
    const room = roomInScope(ctx, ctx.params.id);
    const type = validateRate(ctx, ctx.body);
    const plan = ensureRatePlan(ctx.db, { roomId: room.id });
    const affected = affectedTenancies(ctx, { roomId: room.id, chargeTypeId: type.id });
    const rate = changeRate(ctx.db, plan.id, { ...ctx.body, prorationMode: ctx.body.prorationMode || (type.category === 'rent' ? 'actual_days' : 'full_period') });
    audit(ctx.db, ctx, { action: 'charge_rate.change', tableName: 'charge_rates', recordId: rate.id, after: { room: room.code, chargeType: type.code, unitPrice: rate.unitPrice, effectiveFrom: rate.effectiveFrom }, reason: ctx.body.reason });
    return { rate: rateDto(ctx.db, rate, 'room'), affectedTenancies: affected };
  }, { perm: 'rooms.write' });

  r.post('/api/v1/rooms/:id/rates/:rateId/end', (ctx) => {
    const room = roomInScope(ctx, ctx.params.id);
    const plan = ctx.db.ratePlans.find((p) => p.roomId === room.id);
    const rate = ctx.db.chargeRates.find((x) => x.id === ctx.params.rateId && x.ratePlanId === plan?.id);
    if (!rate) fail(404, 'not_found', 'Không tìm thấy giá riêng.');
    const v = validator();
    v.date('effectiveTo', ctx.body.effectiveTo, 'Ngày kết thúc');
    v.check();
    if (ctx.body.effectiveTo <= rate.effectiveFrom) fail(422, 'validation_failed', 'Ngày kết thúc phải sau ngày bắt đầu.', { effectiveTo: ['Phải sau ngày bắt đầu.'] });
    if (find(ctx.db.chargeTypes, rate.chargeTypeId).category === 'rent') rule('rent_required', 'Phòng luôn cần giá thuê riêng. Hãy thêm mức giá mới thay vì kết thúc.');
    rate.effectiveTo = ctx.body.effectiveTo;
    return rateDto(ctx.db, rate, 'room');
  }, { perm: 'rooms.write' });

  r.get('/api/v1/rooms/:id/availability', (ctx) => {
    const room = roomInScope(ctx, ctx.params.id);
    const from = ctx.query.from || ctx.today;
    const to = ctx.query.to || null;
    const conflicts = allocationConflicts(ctx.db, room.id, from, to, ctx.query.ignoreAllocationId ? [ctx.query.ignoreAllocationId] : []);
    const occ = roomOccupancy(ctx.db, room, ctx.today);
    return {
      roomId: room.id, from, to, operatingStatus: room.operatingStatus, occupancyStatus: occ.occupancyStatus,
      available: !conflicts.length && room.operatingStatus === 'available',
      conflicts: conflicts.map((a) => ({ state: a.state, startsOn: a.startsOn, endsOn: a.endsOn, holdExpiresAt: a.holdExpiresAt })),
    };
  }, { perm: 'rooms.read' });

  // ---------------------------------------------------------------- danh mục
  r.get('/api/v1/catalog', (ctx) => {
    const org = ctx.organizationId;
    const { db } = ctx;
    return {
      properties: orgProperties(ctx).map(propertyRef),
      roomTypes: db.roomTypes.filter((x) => x.organizationId === org),
      amenities: db.amenities.filter((x) => x.organizationId === org),
      chargeTypes: db.chargeTypes.filter((x) => x.organizationId === org),
      ticketCategories: db.ticketCategories.filter((x) => x.organizationId === org),
      expenseCategories: db.expenseCategories.filter((x) => x.organizationId === org),
      slaPolicies: db.slaPolicies.filter((x) => x.organizationId === org),
      paymentMethods: db.paymentMethods,
      bankAccounts: db.bankAccounts.filter((x) => x.organizationId === org),
      staff: db.memberships.filter((m) => m.organizationId === org && m.status === 'active').map((m) => ({ id: m.userId, displayName: find(db.users, m.userId).displayName })),
    };
  }, { perm: 'properties.read' });

  const catalogCrud = (path, table, label, extraValidate) => {
    r.post(`/api/v1/catalog/${path}`, (ctx) => {
      const b = ctx.body;
      const v = validator();
      v.required('code', b.code, 'Mã');
      v.required('name', b.name, 'Tên');
      extraValidate?.(v, b);
      v.check();
      if (ctx.db[table].some((x) => x.organizationId === ctx.organizationId && x.code === b.code)) conflict('code_taken', `Mã ${label} đã tồn tại.`, { code: ['Trùng mã.'] });
      const row = { id: uuid(), organizationId: ctx.organizationId, ...b, isActive: true };
      ctx.db[table].push(row);
      return row;
    }, { perm: 'settings.manage' });
    r.put(`/api/v1/catalog/${path}/:id`, (ctx) => {
      const row = ctx.db[table].find((x) => x.id === ctx.params.id && x.organizationId === ctx.organizationId);
      if (!row) fail(404, 'not_found', `Không tìm thấy ${label}.`);
      const v = validator();
      v.required('name', ctx.body.name, 'Tên');
      extraValidate?.(v, { ...row, ...ctx.body });
      v.check();
      Object.assign(row, { ...ctx.body, code: row.code, organizationId: row.organizationId });
      return row;
    }, { perm: 'settings.manage' });
  };
  catalogCrud('room-types', 'roomTypes', 'loại phòng');
  catalogCrud('amenities', 'amenities', 'tiện nghi');
  catalogCrud('charge-types', 'chargeTypes', 'khoản thu', (v, b) => {
    v.oneOf('category', b.category, ['rent', 'electricity', 'water', 'service', 'other', 'compensation'], 'Nhóm khoản thu');
    v.required('unitLabel', b.unitLabel, 'Đơn vị tính');
  });
}
