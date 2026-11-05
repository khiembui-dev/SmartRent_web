// API công khai: chỉ trả trường được phép hiển thị, không trả entity đầy đủ.
import { asArray, fail, listResponse } from '../respond.js';
import { contractStatus, find, roomOccupancy, roomRates } from '../engine.js';

export function availability(db, room, today) {
  const occ = roomOccupancy(db, room, today);
  if (occ.occupancyStatus === 'occupied') {
    const tenancy = find(db.tenancies, occ.activeTenancyId);
    const alloc = find(db.roomAllocations, tenancy.allocationId);
    const contract = db.contracts.filter((k) => k.tenancyId === tenancy.id).map((k) => contractStatus(db, k, today)).find((cs) => cs.status === 'active');
    return { status: 'occupied', availableFrom: alloc.endsOn || contract?.endsOn || null, basis: alloc.endsOn ? 'move_out' : contract ? 'contract_end' : null };
  }
  if (['maintenance', 'inactive'].includes(occ.occupancyStatus)) return { status: 'unavailable', availableFrom: null };
  if (occ.upcoming && occ.upcoming.startsOn <= addMonthsLoose(today)) {
    return { status: occ.upcoming.state === 'held' ? 'on_hold' : 'reserved', availableFrom: null, holdExpiresAt: occ.upcoming.holdExpiresAt };
  }
  return { status: 'available', availableFrom: today };
}

function addMonthsLoose(today) {
  const [y, m, d] = today.split('-').map(Number);
  const next = new Date(Date.UTC(y, m + 1, d));
  return next.toISOString().slice(0, 10);
}

function fees(db, room, today) {
  return [...roomRates(db, room.id, today).values()]
    .map(({ rate }) => ({ rate, type: find(db.chargeTypes, rate.chargeTypeId) }))
    .filter(({ type }) => type && type.category !== 'compensation')
    .sort((a, b) => ['rent', 'electricity', 'water', 'service', 'other'].indexOf(a.type.category) - ['rent', 'electricity', 'water', 'service', 'other'].indexOf(b.type.category))
    .map(({ rate, type }) => ({ code: type.code, name: type.name, category: type.category, unitPrice: rate.unitPrice, unitLabel: type.unitLabel, calculationMethod: rate.calculationMethod, billingCycle: rate.billingCycle }));
}

function card(db, listing, today) {
  const room = find(db.rooms, listing.roomId);
  const property = find(db.properties, room.propertyId);
  const org = find(db.organizations, property.organizationId);
  const type = find(db.roomTypes, room.roomTypeId);
  const rent = fees(db, room, today).find((f) => f.category === 'rent');
  return {
    slug: listing.slug, title: listing.title, propertyName: property.name, locality: property.address.locality, province: property.address.province,
    roomCode: room.code, roomType: { code: type.code, name: type.name }, areaM2: room.areaM2, capacity: room.capacity, rent: rent?.unitPrice ?? null,
    requiredDeposit: room.requiredDeposit, coverImageUrl: room.images.find((i) => i.isCover)?.url || room.images[0]?.url || null,
    amenities: room.amenityIds.map((id) => find(db.amenities, id)).filter(Boolean).map((a) => ({ code: a.code, name: a.name, icon: a.icon })),
    availability: availability(db, room, today), organizationName: org.name, publishedAt: listing.publishedAt, hasVideo: Boolean(listing.videoUrl),
  };
}

const publishedListings = (db) => db.roomListings.filter((l) => {
  if (l.status !== 'published') return false;
  const room = find(db.rooms, l.roomId);
  const property = find(db.properties, room.propertyId);
  return property.isActive && find(db.organizations, property.organizationId).isActive;
});

/** Trang Thuê phòng chỉ có phòng đang trống ở admin và không bị admin ẩn tin. */
const vacantListings = (db, today) => publishedListings(db).filter((l) => availability(db, find(db.rooms, l.roomId), today).status === 'available');

export const findPublishedListing = (db, slug) => publishedListings(db).find((l) => l.slug === slug);

export default function register(r) {
  r.get('/api/v1/public/filters', (ctx) => {
    const listings = vacantListings(ctx.db, ctx.today);
    const cards = listings.map((l) => card(ctx.db, l, ctx.today));
    const listedRooms = listings.map((l) => find(ctx.db.rooms, l.roomId));
    const provinces = {};
    cards.forEach((c) => {
      provinces[c.province] ||= new Set();
      provinces[c.province].add(c.locality);
    });
    const amenities = new Map();
    cards.forEach((c) => c.amenities.forEach((a) => amenities.set(a.code, a)));
    const types = new Map(cards.map((c) => [c.roomType.code, c.roomType]));
    const rents = cards.map((c) => c.rent).filter((x) => x != null);
    // Khoảng giá theo bảng giá đang áp dụng của các phòng đang đăng: trang chủ không tự ghi giá.
    const feeSummary = new Map();
    listedRooms.flatMap((room) => fees(ctx.db, room, ctx.today)).filter((f) => f.category !== 'rent').forEach((f) => {
      const row = feeSummary.get(f.code) || { code: f.code, name: f.name, category: f.category, unitLabel: f.unitLabel, min: f.unitPrice, max: f.unitPrice };
      feeSummary.set(f.code, { ...row, min: Math.min(row.min, f.unitPrice), max: Math.max(row.max, f.unitPrice) });
    });
    const deposits = cards.map((c) => c.requiredDeposit).filter((x) => x != null);
    const properties = new Map(listedRooms.map((room) => [room.propertyId, find(ctx.db.properties, room.propertyId)]));
    return {
      provinces: Object.entries(provinces).map(([name, set]) => ({ name, localities: [...set].sort() })),
      roomTypes: [...types.values()],
      amenities: [...amenities.values()].sort((a, b) => a.name.localeCompare(b.name, 'vi')),
      priceRange: { min: Math.min(...rents), max: Math.max(...rents) },
      totalListings: cards.length,
      availableNow: cards.filter((c) => c.availability.status === 'available').length,
      propertyCount: new Set(cards.map((c) => c.propertyName)).size,
      feeSummary: [...feeSummary.values()],
      depositRange: deposits.length ? { min: Math.min(...deposits), max: Math.max(...deposits) } : { min: null, max: null },
      properties: [...properties.values()].map((p) => ({ name: p.name, addressLine: p.address.line, locality: p.address.locality, province: p.address.province, phone: p.phone })),
    };
  }, { auth: 'public' });

  r.get('/api/v1/public/rooms', (ctx) => {
    const q = ctx.query;
    const all = vacantListings(ctx.db, ctx.today).map((l) => card(ctx.db, l, ctx.today));
    const amenityCodes = asArray(q.amenities);
    const priceMin = q.priceMin ? Number(q.priceMin) : null;
    const priceMax = q.priceMax ? Number(q.priceMax) : null;
    const sortMap = { price: 'rent', '-price': '-rent', area: 'areaM2', '-area': '-areaM2', newest: '-publishedAt' };
    return listResponse(all, { ...q, sort: sortMap[q.sort] || '-publishedAt' }, {
      filter: (c) => (!q.province || c.province === q.province)
        && (!q.locality || c.locality === q.locality)
        && (priceMin == null || (c.rent ?? 0) >= priceMin)
        && (priceMax == null || (c.rent ?? 0) <= priceMax)
        && (!q.areaMin || c.areaM2 >= Number(q.areaMin))
        && (!q.roomType || c.roomType.code === q.roomType)
        && (!q.occupants || c.capacity >= Number(q.occupants))
        && amenityCodes.every((code) => c.amenities.some((a) => a.code === code)),
      search: (c) => [c.title, c.propertyName, c.locality, c.province, c.roomCode],
    });
  }, { auth: 'public' });

  r.get('/api/v1/public/rooms/:slug', (ctx) => {
    const listing = publishedListings(ctx.db).find((l) => l.slug === ctx.params.slug);
    if (!listing) fail(404, 'not_found', 'Tin đăng không tồn tại hoặc đã được ẩn.');
    const db = ctx.db;
    const room = find(db.rooms, listing.roomId);
    const property = find(db.properties, room.propertyId);
    const base = card(db, listing, ctx.today);
    const siblings = vacantListings(db, ctx.today).filter((l) => l.id !== listing.id && find(db.rooms, l.roomId).propertyId === property.id).slice(0, 3).map((l) => card(db, l, ctx.today));
    return {
      ...base,
      description: listing.description, rulesText: room.rulesText, floorLabel: room.floorLabel, videoUrl: listing.videoUrl || null,
      images: [...room.images].sort((a, b) => a.sortOrder - b.sortOrder).map((i) => ({ url: i.url, caption: i.caption, isCover: i.isCover })),
      fees: fees(db, room, ctx.today),
      property: { name: property.name, addressLine: property.address.line, locality: property.address.locality, province: property.address.province, description: property.description, contactName: property.contactName, phone: property.phone },
      otherRooms: siblings,
    };
  }, { auth: 'public' });

  // Trang Liên hệ: điện thoại và email lấy từ tài khoản chủ trọ (admin sửa ở Cài đặt).
  r.get('/api/v1/public/contact-info', (ctx) => {
    const { db } = ctx;
    return {
      organizations: db.organizations.filter((org) => org.isActive).map((org) => {
        const membership = db.memberships.find((m) => m.organizationId === org.id && m.status === 'active' && db.users.some((u) => u.id === m.userId && u.role === 'admin'));
        const owner = membership ? find(db.users, membership.userId) : null;
        return {
          name: org.name, contactName: owner?.displayName || null, phone: owner?.phone || org.phone || null, email: owner?.email || org.email || null,
          properties: db.properties.filter((x) => x.organizationId === org.id && x.isActive).map((x) => ({ name: x.name, addressLine: x.address.line, locality: x.address.locality, province: x.address.province, phone: x.phone })),
        };
      }),
    };
  }, { auth: 'public' });
}
