// Bộ dữ liệu demo tất định, mốc 21/10/2026. Tên, số điện thoại, email, giấy tờ đều là dữ liệu giả
// (email @example.com, điện thoại dạng 0900 000 xxx). Không chứa thông tin cá nhân thật.
// Chứng từ được tạo qua engine.js nên tổng tiền, công nợ, cọc khớp nhau ở mọi màn hình.

import { singleBusiness } from './single-business.js';
import { stableUuid } from '../utils/ids.js';
import { addDays, addMonths, vnDateTimeToInstant } from '../utils/date.js';
import {
  applyAllocation, audit, createAllocation, createDraftInvoice, createPayment, depositHeld, depositOffset, depositReceipt,
  depositTransfer, ensureRatePlan, invoiceBalance, invoiceTotal, issueInvoice, notify, recordReading, tenancyContext,
} from './engine.js';

export const SEED_VERSION = 'v9-admin-user-single-business';
export const REFERENCE_TODAY = '2026-10-21';
export const DEMO_PASSWORD = 'demo1234';

const id = (key) => stableUuid(key);
const at = (date, hour = 9, minute = 0) => vnDateTimeToInstant(date, hour, minute);

export const PERMISSIONS = [
  ['properties.read', 'Xem cơ sở'], ['properties.write', 'Tạo/sửa cơ sở'], ['rooms.read', 'Xem phòng'],
  ['rooms.write', 'Quản lý phòng/giá/tin đăng'], ['inquiries.read', 'Xem yêu cầu thuê'], ['inquiries.write', 'Xử lý yêu cầu/lịch xem/giữ chỗ'],
  ['tenants.read', 'Xem khách'], ['tenants.write', 'Quản lý hồ sơ khách'], ['tenants.identity.read', 'Xem giấy tờ riêng tư'],
  ['contracts.read', 'Xem hợp đồng'], ['contracts.write', 'Soạn/gia hạn hợp đồng'], ['contracts.sign', 'Xác nhận bản ký'],
  ['tenancies.checkin', 'Nhận phòng'], ['tenancies.transfer', 'Chuyển phòng'], ['tenancies.checkout', 'Trả phòng'],
  ['tenancies.close_with_debt', 'Đóng đợt thuê còn nợ'], ['meters.read', 'Xem công tơ/chỉ số'], ['meters.write', 'Ghi/chỉnh chỉ số'],
  ['meters.replace', 'Thay công tơ'], ['billing.read', 'Xem kỳ tính tiền'], ['billing.lock', 'Khóa kỳ'], ['billing.unlock', 'Mở khóa kỳ có lý do'],
  ['invoices.read', 'Xem hóa đơn'], ['invoices.write', 'Lập hóa đơn nháp'], ['invoices.issue', 'Phát hành hóa đơn'],
  ['invoices.adjust', 'Lập chứng từ điều chỉnh'], ['invoices.void', 'Hủy hóa đơn'], ['payments.read', 'Xem thu tiền'],
  ['payments.report', 'Báo thanh toán'], ['payments.confirm', 'Xác nhận tiền thực thu'], ['payments.reverse', 'Đảo/hoàn tiền'],
  ['payments.allocate', 'Phân bổ tiền'], ['deposits.read', 'Xem sổ cọc'], ['deposits.receive', 'Thu/bổ sung cọc'],
  ['deposits.refund', 'Hoàn cọc'], ['deposits.offset', 'Bù trừ cọc'], ['deposits.transfer', 'Chuyển cọc giữa đợt thuê'],
  ['tickets.read', 'Xem ticket'], ['tickets.write', 'Tạo/trao đổi ticket'], ['tickets.assign', 'Phân công ticket'],
  ['tickets.close', 'Giải quyết/đóng/mở lại ticket'], ['expenses.read', 'Xem chi phí'], ['expenses.write', 'Ghi/đảo chi phí'],
  ['reports.read', 'Xem báo cáo'], ['reports.export', 'Xuất dữ liệu đúng phạm vi'],
  ['settings.manage', 'Quản lý cấu hình'], ['audit.read', 'Xem nhật ký'],
  ['ai.read', 'Hỏi AI trong phạm vi được phép'], ['integrations.manage', 'Cấu hình tích hợp'],
].map(([code, description]) => ({ code, description }));

function emptyDb() {
  const tables = ['organizations', 'users', 'memberships', 'permissions', 'properties', 'billingSettings', 'roomTypes',
    'amenities', 'rooms', 'roomAssets', 'roomListings', 'roomStatusEvents', 'tenants', 'identityDocuments', 'profileChangeRequests',
    'inquiries', 'inquiryEvents', 'viewings', 'roomAllocations', 'reservations', 'tenancies', 'residents', 'onboardingGaps', 'contracts',
    'contractVersions', 'contractTerminations', 'tenancyRequests', 'roomTransfers', 'handovers', 'settlements', 'chargeTypes', 'ratePlans',
    'chargeRates', 'billingPeriods', 'periodEvents', 'meters', 'readings', 'meterReplacements', 'invoices', 'chargeInstances',
    'issueBatches', 'paymentMethods', 'bankAccounts', 'payments', 'paymentReversals', 'depositEntries', 'paymentAllocations',
    'ticketCategories', 'slaPolicies', 'tickets', 'ticketMessages', 'ticketEvents', 'expenseCategories', 'expenses', 'orgSettings',
    'emailConfigs', 'messageTemplates', 'reminderRules', 'notifications', 'deliveries', 'jobRuns', 'exportJobs', 'backupRuns',
    'auditLogs', 'aiConversations', 'aiMessages', 'integrations', 'files', 'sessions'];
  const db = Object.fromEntries(tables.map((t) => [t, []]));
  db.counters = {};
  db.idempotency = {};
  db.meta = { seedVersion: SEED_VERSION, referenceToday: REFERENCE_TODAY, seededAt: new Date().toISOString() };
  return db;
}

export function buildSeed() {
  const db = emptyDb();
  db.permissions = PERMISSIONS;
  db.paymentMethods = [
    { code: 'cash', name: 'Tiền mặt' }, { code: 'bank_transfer', name: 'Chuyển khoản' }, { code: 'other', name: 'Khác' },
  ];

  // ------------------------------------------------------------ tài khoản
  const user = (key, displayName, email, extra = {}) => {
    const u = {
      id: id(`user:${key}`), key, email, displayName, phone: extra.phone || null, isActive: extra.isActive ?? true,
      role: extra.role || 'user', mockPassword: DEMO_PASSWORD, emailConfirmed: true, twoFactorEnabled: false,
      createdAt: extra.createdAt || at('2025-06-01'), lastLoginAt: null,
    };
    db.users.push(u);
    return u;
  };
  const owner = user('owner', 'Trần Thu Hà', 'ha.chutro@example.com', { phone: '0900000001', role: 'admin' });
  const tenantUser = user('tenant', 'Nguyễn Văn An', 'an.khachthue@example.com', { phone: '0900000101' });
  const residentUser = user('resident', 'Đỗ Thị Bích', 'bich.oghep@example.com', { phone: '0900000102' });

  // Các cơ sở đều do một tài khoản admin quản lý.
  const org = { id: id('org:ancu'), code: 'ANCU', name: 'Nhà trọ An Cư', legalName: 'Hộ kinh doanh Nhà trọ An Cư (demo)', taxCode: '0000000000-demo', phone: '0900000001', email: 'lienhe@ancu.example.com', isActive: true, createdAt: at('2025-06-01') };
  const org2 = { id: id('org:hoabinh'), code: 'HOABINH', name: 'Phòng trọ Hòa Bình', legalName: 'Phòng trọ Hòa Bình (demo)', taxCode: null, phone: '0900000201', email: 'lienhe@hoabinh.example.com', isActive: true, createdAt: at('2026-02-10') };
  db.organizations.push(org, org2);

  const property = (key, o, code, name, line, locality, province, extra = {}) => {
    const p = {
      id: id(`property:${key}`), organizationId: o.id, code, name, address: { line, locality, province, latitude: extra.lat || null, longitude: extra.lng || null },
      description: extra.description || null, contactName: extra.contactName || null, phone: extra.phone || null, email: extra.email || null,
      isActive: true, createdAt: at('2025-06-01'),
    };
    db.properties.push(p);
    db.billingSettings.push({ propertyId: p.id, invoiceDay: extra.invoiceDay || 28, dueAfterDays: extra.dueAfterDays || 7, contractWarningDays: 30, timezone: 'Asia/Ho_Chi_Minh', prorationPolicy: 'actual_days' });
    return p;
  };
  const BT = property('bt', org, 'BT', 'An Cư Bình Thạnh', 'Hẻm 48 Nguyễn Xí', 'Bình Thạnh', 'TP. Hồ Chí Minh', {
    description: 'Dãy trọ 3 tầng trong hẻm xe hơi, cách chợ và trạm xe buýt khoảng 5 phút đi bộ. Có camera cổng và chỗ để xe trong nhà.',
    contactName: 'Lê Minh Quân', phone: '0900000002', email: 'binhthanh@ancu.example.com', lat: 10.8131, lng: 106.7106,
  });
  const TD = property('td', org, 'TD', 'An Cư Thủ Đức', 'Đường số 12, khu phố 3', 'Thủ Đức', 'TP. Hồ Chí Minh', {
    description: 'Gần các trường đại học, có sân phơi chung và máy giặt chung ở tầng thượng.', contactName: 'Lê Minh Quân', phone: '0900000002', email: 'thuduc@ancu.example.com', lat: 10.8507, lng: 106.7719,
  });
  const CG = property('cg', org, 'CG', 'An Cư Cầu Giấy', 'Ngõ 165 Xuân Thủy', 'Cầu Giấy', 'Hà Nội', {
    description: 'Nhà 4 tầng có thang máy, phù hợp người đi làm. Giờ giấc tự do, khóa vân tay cổng.', contactName: 'Trần Thu Hà', phone: '0900000001', email: 'caugiay@ancu.example.com', dueAfterDays: 10, lat: 21.0368, lng: 105.7826,
  });
  const HB = property('hb', org2, 'HB', 'Hòa Bình Gò Vấp', 'Hẻm 120 Quang Trung', 'Gò Vấp', 'TP. Hồ Chí Minh', {
    description: 'Phòng mới sơn sửa, gần công viên Làng Hoa.', contactName: 'Võ Thanh Tùng', phone: '0900000201',
  });

  // ------------------------------------------------------------ nhân sự
  for (const o of db.organizations) {
    db.memberships.push({ id: id(`membership:${o.code}:owner`), organizationId: o.id, userId: owner.id,
      status: 'active', propertyScope: 'all', propertyIds: [], joinedAt: at('2025-06-01') });
  }

  for (const o of [org, org2]) {
    const ct = (code, name, category, unitLabel) => db.chargeTypes.push({ id: id(`charge:${o.code}:${code}`), organizationId: o.id, code, name, category, unitLabel, isActive: true });
    ct('RENT', 'Tiền thuê', 'rent', 'tháng');
    ct('ELECTRICITY', 'Điện', 'electricity', 'kWh');
    ct('WATER', 'Nước', 'water', 'm³');
    ct('SERVICE', 'Dịch vụ', 'service', 'phòng');
    ct('INTERNET', 'Internet', 'service', 'phòng');
    ct('GARBAGE', 'Rác', 'service', 'phòng');
    ct('OTHER', 'Phí khác', 'other', 'lần');
    ct('COMPENSATION', 'Bồi thường', 'compensation', 'lần');
    const cat = (code, name) => db.ticketCategories.push({ id: id(`tcat:${o.code}:${code}`), organizationId: o.id, code, name });
    cat('ELECTRICAL', 'Điện'); cat('PLUMBING', 'Nước'); cat('REPAIR', 'Sửa chữa'); cat('OTHER', 'Khác');
    [['urgent', 4], ['high', 12], ['normal', 48], ['low', 96]].forEach(([priority, hours]) => db.slaPolicies.push({ id: id(`sla:${o.code}:${priority}`), organizationId: o.id, priority, targetHours: hours, clockMode: 'continuous' }));
    [['REPAIR', 'Sửa chữa'], ['UTILITY', 'Điện nước đầu vào'], ['OPERATION', 'Vận hành'], ['OTHER', 'Khác']].forEach(([code, name]) => db.expenseCategories.push({ id: id(`ecat:${o.code}:${code}`), organizationId: o.id, code, name }));
    db.orgSettings.push({ organizationId: o.id, timezone: 'Asia/Ho_Chi_Minh', dailyJobTime: '08:00', retentionDays: 365, contractWarningDays: 30, meterReadingDay: 25, invoiceCreateDay: 28, reminderEnabled: true });
  }
  db.chargeTypes.push({ id: id('charge:ANCU:KEYCARD'), organizationId: org.id, code: 'KEYCARD', name: 'Phí làm thẻ từ', category: 'other', unitLabel: 'lần', isActive: true });
  const charge = (code, o = org) => db.chargeTypes.find((c) => c.organizationId === o.id && c.code === code);

  db.bankAccounts.push({ id: id('bank:ancu'), organizationId: org.id, bankName: 'Ngân hàng demo', accountNumberMasked: '•••• 6789', accountName: 'TRAN THU HA', isDefault: true });

  // ------------------------------------------------------------ loại phòng, tiện nghi
  const roomType = (o, code, name, description) => {
    const t = { id: id(`rtype:${o.code}:${code}`), organizationId: o.id, code, name, description };
    db.roomTypes.push(t);
    return t;
  };
  const SINGLE = roomType(org, 'SINGLE', 'Phòng đơn', 'Phòng một không gian, WC riêng.');
  const LOFT = roomType(org, 'LOFT', 'Phòng có gác', 'Có gác lửng để ngủ hoặc để đồ.');
  const FAMILY = roomType(org, 'FAMILY', 'Căn hộ mini', 'Phòng rộng có bếp riêng, phù hợp gia đình nhỏ.');
  const HB_SINGLE = roomType(org2, 'SINGLE', 'Phòng đơn', 'Phòng một không gian.');
  const amenity = (o, code, name, icon) => {
    const a = { id: id(`amenity:${o.code}:${code}`), organizationId: o.id, code, name, icon };
    db.amenities.push(a);
    return a;
  };
  const AM = {};
  [['AC', 'Máy lạnh', 'snow'], ['HEATER', 'Nóng lạnh', 'thermometer-sun'], ['WC', 'WC riêng', 'droplet'], ['LOFT', 'Gác lửng', 'ladder'],
    ['WINDOW', 'Cửa sổ thoáng', 'window'], ['BALCONY', 'Ban công', 'flower1'], ['KITCHEN', 'Bếp riêng', 'fire'], ['WASHER', 'Máy giặt chung', 'basket'],
    ['PARKING', 'Chỗ để xe', 'bicycle'], ['WIFI', 'Wi-Fi', 'wifi'], ['CAMERA', 'Camera an ninh', 'camera-video'], ['FREE_HOURS', 'Giờ giấc tự do', 'clock'],
    ['ELEVATOR', 'Thang máy', 'building-up'], ['FURNITURE', 'Nội thất cơ bản', 'lamp']].forEach(([code, name, icon]) => {
    AM[code] = amenity(org, code, name, icon);
  });
  const HB_WIFI = amenity(org2, 'WIFI', 'Wi-Fi', 'wifi');
  const HB_PARK = amenity(org2, 'PARKING', 'Chỗ để xe', 'bicycle');

  // ------------------------------------------------------------ giá cơ sở
  const propertyRates = (p, rates, o = org) => {
    const plan = ensureRatePlan(db, { propertyId: p.id });
    for (const [code, price, method, cycle = 'monthly', from = '2025-06-01', to = null] of rates) {
      db.chargeRates.push({ id: id(`rate:${p.code}:${code}:${from}`), ratePlanId: plan.id, chargeTypeId: charge(code, o).id, effectiveFrom: from, effectiveTo: to, unitPrice: price, calculationMethod: method, billingCycle: cycle, prorationMode: method === 'fixed' ? 'actual_days' : 'full_period' });
    }
  };
  propertyRates(BT, [['ELECTRICITY', 4000, 'metered'], ['WATER', 22000, 'metered', 'monthly', '2025-06-01', '2026-09-01'], ['SERVICE', 100000, 'fixed'], ['INTERNET', 50000, 'fixed'], ['GARBAGE', 20000, 'fixed']]);
  propertyRates(TD, [['ELECTRICITY', 3800, 'metered'], ['WATER', 20000, 'metered'], ['SERVICE', 80000, 'fixed'], ['INTERNET', 0, 'fixed'], ['GARBAGE', 15000, 'fixed']]);
  propertyRates(CG, [['ELECTRICITY', 3500, 'metered'], ['WATER', 30000, 'metered'], ['SERVICE', 150000, 'fixed'], ['INTERNET', 100000, 'fixed']]);
  propertyRates(HB, [['ELECTRICITY', 3800, 'metered'], ['WATER', 18000, 'metered'], ['SERVICE', 70000, 'fixed']], org2);
  // Đổi giá nước Bình Thạnh từ 01/09/2026: đóng dòng cũ, thêm dòng mới; hóa đơn tháng 8 giữ giá cũ.
  const btPlan = db.ratePlans.find((p) => p.propertyId === BT.id);
  db.chargeRates.push({ id: id('rate:BT:WATER:2026-09-01'), ratePlanId: btPlan.id, chargeTypeId: charge('WATER').id, effectiveFrom: '2026-09-01', effectiveTo: null, unitPrice: 25000, calculationMethod: 'metered', billingCycle: 'monthly', prorationMode: 'full_period' });

  // ------------------------------------------------------------ phòng
  const IMAGES = [
    { url: '/images/rooms/bed-kitchen.png', caption: 'Giường và khu bếp' },
    { url: '/images/rooms/studio-bright.jpg', caption: 'Không gian phòng' },
    { url: '/images/rooms/desk-wardrobe.png', caption: 'Bàn làm việc và tủ quần áo' },
  ];
  // Ảnh bìa khớp đặc điểm phòng để tin đăng không tả sai.
  const LOFT_PHOTO = { url: '/images/rooms/mezzanine.png', caption: 'Gác lửng' };
  const BALCONY_PHOTO = { url: '/images/rooms/balcony-sunset.png', caption: 'Ban công' };
  const SHARED_PHOTO = { url: '/images/rooms/bunk-bed.png', caption: 'Góc ở ghép' };
  const LOCK_PHOTO = { url: '/images/rooms/smart-lock.png', caption: 'Khóa cửa' };
  const rooms = {};
  let imageCursor = 0;
  const room = (p, code, type, area, capacity, rent, opts = {}) => {
    const r = {
      id: id(`room:${p.code}:${code}`), propertyId: p.id, roomTypeId: type.id, code, name: opts.name || `Phòng ${code}`, floorLabel: `Tầng ${code[1]}`,
      areaM2: area, capacity, description: opts.description || `${type.name} ${area} m², ${capacity > 1 ? `ở tối đa ${capacity} người` : 'phù hợp 1 người'}. ${opts.note || ''}`.trim(),
      rulesText: 'Không hút thuốc trong phòng. Giữ yên lặng sau 22:00. Khách ở lại qua đêm báo trước cho quản lý.',
      requiredDeposit: opts.deposit ?? rent, operatingStatus: opts.status || 'available', createdAt: at('2025-06-01'),
      amenityIds: (opts.amenities || []).map((a) => a.id),
      images: [
        ...(type.code === 'LOFT' ? [LOFT_PHOTO] : []),
        ...((opts.amenities || []).includes(AM.BALCONY) ? [BALCONY_PHOTO] : []),
        ...(capacity >= 3 && type.code !== 'LOFT' ? [SHARED_PHOTO] : []),
        IMAGES[imageCursor % IMAGES.length],
        IMAGES[(imageCursor + 1) % IMAGES.length],
        LOCK_PHOTO,
      ].slice(0, opts.imageCount || 3).map(({ url, caption }, i) => ({ id: id(`img:${p.code}:${code}:${i}`), fileId: null, url, caption, sortOrder: i + 1, isCover: i === 0 })),
    };
    imageCursor += 1;
    db.rooms.push(r);
    rooms[code] = r;
    const plan = ensureRatePlan(db, { roomId: r.id });
    db.chargeRates.push({ id: id(`rate:${code}:RENT`), ratePlanId: plan.id, chargeTypeId: charge('RENT', p.organizationId === org.id ? org : org2).id, effectiveFrom: '2025-06-01', effectiveTo: null, unitPrice: rent, calculationMethod: 'fixed', billingCycle: 'monthly', prorationMode: 'actual_days' });
    {
      const listingStatus = opts.listing || 'published';
      db.roomListings.push({
        id: id(`listing:${code}`), roomId: r.id, slug: `${p.code.toLowerCase()}-${code.toLowerCase()}-${type.code === 'FAMILY' ? 'can-ho-mini' : type.code === 'LOFT' ? 'phong-co-gac' : 'phong-don'}`,
        title: opts.title || `${type.name} ${area} m² ${opts.highlight || ''} – ${p.address.locality}`.replace(/\s+/g, ' ').trim(),
        description: opts.listingText || `${r.description} Điện ${p.code === 'CG' ? '3.500' : p.code === 'TD' ? '3.800' : '4.000'} đ/kWh, nước tính theo đồng hồ.`,
        status: listingStatus, publishedAt: listingStatus === 'published' ? at('2026-10-01') : null, updatedAt: at('2026-10-01'), videoUrl: opts.videoUrl || null,
      });
    }
    for (const kind of ['electricity', 'water']) {
      db.meters.push({ id: id(`meter:${code}:${kind}`), roomId: r.id, meterKind: kind, serialNumber: `${kind === 'electricity' ? 'DT' : 'DN'}-${p.code}${code}-01`, installedAt: at('2025-06-01', 8) });
    }
    db.roomAssets.push(
      { id: id(`asset:${code}:bed`), roomId: r.id, code: 'GIUONG', name: 'Giường 1m6', quantity: 1, conditionNotes: 'Tốt', acquiredOn: '2025-06-01', retiredOn: null },
      { id: id(`asset:${code}:wardrobe`), roomId: r.id, code: 'TUQUANAO', name: 'Tủ quần áo', quantity: 1, conditionNotes: 'Tốt', acquiredOn: '2025-06-01', retiredOn: null },
    );
    if (r.amenityIds.includes(AM.AC.id)) db.roomAssets.push({ id: id(`asset:${code}:ac`), roomId: r.id, code: 'MAYLANH', name: 'Máy lạnh 1 HP', quantity: 1, conditionNotes: 'Vệ sinh 08/2026', acquiredOn: '2025-06-01', retiredOn: null });
    return r;
  };
  const base = [AM.WC, AM.WIFI, AM.PARKING, AM.CAMERA];
  room(BT, 'A101', SINGLE, 18, 2, 3000000, { amenities: [...base, AM.AC, AM.HEATER, AM.WINDOW] });
  room(BT, 'A102', SINGLE, 16, 1, 2800000, { amenities: [...base, AM.AC] });
  room(BT, 'A103', LOFT, 22, 3, 3500000, { amenities: [...base, AM.AC, AM.LOFT, AM.HEATER] });
  room(BT, 'A104', SINGLE, 16, 1, 2800000, { amenities: base, status: 'maintenance' });
  room(BT, 'A201', LOFT, 24, 3, 3600000, { amenities: [...base, AM.AC, AM.LOFT, AM.WINDOW] });
  room(BT, 'A202', FAMILY, 30, 4, 4200000, { amenities: [...base, AM.AC, AM.KITCHEN, AM.BALCONY, AM.HEATER] });
  room(BT, 'A203', SINGLE, 18, 2, 3000000, { amenities: [...base, AM.WINDOW], listing: 'published', highlight: 'cửa sổ, sắp trống' });
  room(BT, 'A204', SINGLE, 18, 2, 3100000, { amenities: [...base, AM.AC, AM.WINDOW, AM.HEATER, AM.FURNITURE], listing: 'published', highlight: 'có máy lạnh, cửa sổ lớn', videoUrl: '/videos/room-tour.mp4' });
  room(BT, 'A301', LOFT, 24, 3, 3500000, { amenities: [...base, AM.AC, AM.LOFT] });
  room(BT, 'A302', FAMILY, 32, 4, 4500000, { amenities: [...base, AM.AC, AM.KITCHEN, AM.BALCONY] });
  room(BT, 'A303', SINGLE, 20, 2, 3200000, { amenities: [...base, AM.AC, AM.BALCONY, AM.FURNITURE], listing: 'published', highlight: 'ban công, nội thất cơ bản' });
  room(BT, 'A304', SINGLE, 15, 1, 2600000, { amenities: base, status: 'inactive', listing: 'hidden' });
  room(TD, 'B101', SINGLE, 18, 2, 2600000, { amenities: [AM.WC, AM.WIFI, AM.PARKING, AM.WASHER], listing: 'published', highlight: 'gần trường đại học' });
  room(TD, 'B102', LOFT, 22, 3, 3000000, { amenities: [AM.WC, AM.WIFI, AM.PARKING, AM.LOFT, AM.WASHER] });
  room(TD, 'B103', FAMILY, 28, 4, 3400000, { amenities: [AM.WC, AM.WIFI, AM.PARKING, AM.KITCHEN, AM.WASHER, AM.AC] });
  room(TD, 'B104', SINGLE, 18, 2, 2600000, { amenities: [AM.WC, AM.WIFI, AM.PARKING, AM.WASHER, AM.WINDOW], listing: 'published', highlight: 'cửa sổ thoáng' });
  room(TD, 'B105', SINGLE, 16, 1, 2400000, { amenities: [AM.WC, AM.WIFI, AM.PARKING] });
  room(TD, 'B201', LOFT, 22, 3, 3000000, { amenities: [AM.WC, AM.WIFI, AM.PARKING, AM.LOFT] });
  room(TD, 'B202', LOFT, 22, 3, 3000000, { amenities: [AM.WC, AM.WIFI, AM.PARKING, AM.LOFT, AM.AC] });
  room(TD, 'B203', SINGLE, 18, 2, 2700000, { amenities: [AM.WC, AM.WIFI, AM.PARKING, AM.AC], listing: 'published', highlight: 'có máy lạnh' });
  room(TD, 'B204', SINGLE, 18, 2, 2600000, { amenities: [AM.WC, AM.WIFI, AM.PARKING], listing: 'published' });
  room(TD, 'B205', FAMILY, 30, 4, 3800000, { amenities: [AM.WC, AM.WIFI, AM.PARKING, AM.KITCHEN, AM.BALCONY, AM.AC] });
  const cgBase = [AM.WC, AM.WIFI, AM.ELEVATOR, AM.FREE_HOURS, AM.CAMERA];
  room(CG, 'C101', SINGLE, 20, 2, 3300000, { amenities: [...cgBase, AM.AC, AM.HEATER] });
  room(CG, 'C102', SINGLE, 20, 2, 3300000, { amenities: [...cgBase, AM.AC, AM.HEATER], listing: 'published', highlight: 'nóng lạnh' });
  room(CG, 'C103', SINGLE, 18, 1, 3100000, { amenities: [...cgBase, AM.AC], listing: 'published', highlight: 'thang máy, giờ tự do' });
  room(CG, 'C104', LOFT, 25, 3, 3800000, { amenities: [...cgBase, AM.AC, AM.LOFT, AM.HEATER, AM.WINDOW], listing: 'published', highlight: 'gác lửng cao' });
  room(CG, 'C201', SINGLE, 20, 2, 3300000, { amenities: [...cgBase, AM.AC] });
  room(CG, 'C202', FAMILY, 32, 4, 4800000, { amenities: [...cgBase, AM.AC, AM.KITCHEN, AM.BALCONY, AM.HEATER] });
  room(CG, 'C203', SINGLE, 18, 1, 3100000, { amenities: cgBase, status: 'maintenance' });
  room(CG, 'C204', LOFT, 25, 3, 3800000, { amenities: [...cgBase, AM.AC, AM.LOFT], listing: 'hidden' });
  ['H101', 'H102', 'H103', 'H104'].forEach((code, i) => {
    const r = {
      id: id(`room:HB:${code}`), propertyId: HB.id, roomTypeId: HB_SINGLE.id, code, name: `Phòng ${code}`, floorLabel: 'Tầng 1', areaM2: 16 + i, capacity: 2,
      description: `Phòng đơn ${16 + i} m², mới sơn sửa.`, rulesText: 'Giữ vệ sinh chung.', requiredDeposit: 2500000, operatingStatus: 'available', createdAt: at('2026-02-10'),
      amenityIds: [HB_WIFI.id, HB_PARK.id], images: [{ id: id(`img:HB:${code}`), fileId: null, ...IMAGES[(i + 2) % IMAGES.length], sortOrder: 1, isCover: true }],
    };
    db.rooms.push(r);
    rooms[code] = r;
    const plan = ensureRatePlan(db, { roomId: r.id });
    db.chargeRates.push({ id: id(`rate:${code}:RENT`), ratePlanId: plan.id, chargeTypeId: charge('RENT', org2).id, effectiveFrom: '2026-02-10', effectiveTo: null, unitPrice: 2500000, calculationMethod: 'fixed', billingCycle: 'monthly', prorationMode: 'actual_days' });
    for (const kind of ['electricity', 'water']) db.meters.push({ id: id(`meter:${code}:${kind}`), roomId: r.id, meterKind: kind, serialNumber: `${kind === 'electricity' ? 'DT' : 'DN'}-HB${code}`, installedAt: at('2026-02-10', 8) });
    db.roomListings.push({ id: id(`listing:${code}`), roomId: r.id, slug: `hb-${code.toLowerCase()}-phong-don`, title: `Phòng đơn ${16 + i} m² mới sơn – Gò Vấp`, description: r.description, status: 'published', publishedAt: at('2026-09-20'), updatedAt: at('2026-09-20') });
  });
  // Giá riêng phòng A101: rác 0 đ — giá 0 vẫn là giá hợp lệ và được ưu tiên hơn giá cơ sở.
  db.chargeRates.push({ id: id('rate:A101:GARBAGE'), ratePlanId: ensureRatePlan(db, { roomId: rooms.A101.id }).id, chargeTypeId: charge('GARBAGE').id, effectiveFrom: '2025-06-01', effectiveTo: null, unitPrice: 0, calculationMethod: 'fixed', billingCycle: 'monthly', prorationMode: 'actual_days' });
  db.roomStatusEvents.push(
    { id: id('rse:A104'), roomId: rooms.A104.id, fromStatus: 'available', toStatus: 'maintenance', reason: 'Trần thấm nước sau mưa lớn, cần chống thấm (ticket SC-0001).', actorId: owner.id, occurredAt: at('2026-10-12', 10) },
    { id: id('rse:A304'), roomId: rooms.A304.id, fromStatus: 'available', toStatus: 'inactive', reason: 'Tạm ngừng khai thác để cải tạo thành phòng có gác.', actorId: owner.id, occurredAt: at('2026-08-15', 10) },
    { id: id('rse:C203'), roomId: rooms.C203.id, fromStatus: 'available', toStatus: 'maintenance', reason: 'Sơn lại tường và thay rèm sau khi khách trả phòng.', actorId: owner.id, occurredAt: at('2026-10-05', 15) },
  );

  // ------------------------------------------------------------ file riêng tư mô phỏng
  const privateFile = (key, organizationId, fileName, kind, contentType = 'application/pdf') => {
    const f = { id: id(`file:${key}`), organizationId, fileName, contentType, sizeBytes: 182000, visibility: 'private', scanStatus: 'clean', kind, generated: kind, createdAt: at('2026-08-28'), uploadedBy: owner.id, dataUrl: null };
    db.files.push(f);
    return f;
  };

  // ------------------------------------------------------------ khách
  const tenants = {};
  let tenantSeq = 0;
  const tenant = (key, fullName, extra = {}) => {
    tenantSeq += 1;
    const t = {
      id: id(`tenant:${key}`), organizationId: extra.org?.id || org.id, userId: extra.user?.id || null, code: `KH-${String(tenantSeq).padStart(4, '0')}`, fullName,
      email: extra.email === undefined ? `${key}@example.com` : extra.email, phone: extra.phone || `0900000${String(100 + tenantSeq).padStart(3, '0')}`,
      dateOfBirth: extra.dob || null, address: { line: extra.hometown ? `Thường trú tại ${extra.hometown} (demo)` : null, locality: extra.hometown || null },
      emergencyContactName: extra.emergencyName || null, emergencyContactPhone: extra.emergencyPhone || null, notes: extra.notes || null, createdAt: extra.createdAt || at('2026-01-01'),
    };
    db.tenants.push(t);
    tenants[key] = t;
    if (extra.idDoc !== false) {
      const front = privateFile(`id-front:${key}`, t.organizationId, `cccd-mat-truoc-${t.code}.jpg`, 'identity_front', 'image/jpeg');
      const back = privateFile(`id-back:${key}`, t.organizationId, `cccd-mat-sau-${t.code}.jpg`, 'identity_back', 'image/jpeg');
      db.identityDocuments.push({
        id: id(`iddoc:${key}`), tenantId: t.id, documentType: 'cccd', numberMasked: `•••• •••• ${String(1000 + tenantSeq * 37).slice(-4)}`,
        issuedOn: '2021-06-15', issuingAuthority: 'Cục Cảnh sát QLHC về TTXH (demo)', expiresOn: '2036-06-15', frontFileId: front.id, backFileId: back.id,
        verifiedBy: extra.verified === false ? null : owner.id, verifiedAt: extra.verified === false ? null : at('2026-01-02'),
      });
    }
    return t;
  };
  tenant('an', 'Nguyễn Văn An', { user: tenantUser, email: tenantUser.email, phone: '0900000101', dob: '1998-04-12', hometown: 'Quảng Ngãi', emergencyName: 'Nguyễn Văn Bình (cha)', emergencyPhone: '0900000901', createdAt: at('2026-08-20') });
  tenant('bich', 'Đỗ Thị Bích', { user: residentUser, email: residentUser.email, phone: '0900000102', dob: '1999-09-02', hometown: 'Bình Định', createdAt: at('2026-08-20') });
  tenant('khoa', 'Trần Minh Khoa', { dob: '1996-01-20', hometown: 'Long An' });
  tenant('nhung', 'Lê Thị Hồng Nhung', { dob: '1995-07-08', hometown: 'Tiền Giang' });
  tenant('bao', 'Phạm Quốc Bảo', { dob: '1993-11-30', hometown: 'Đồng Nai' });
  tenant('huong', 'Vũ Thị Thanh Hương', { dob: '1990-03-14', hometown: 'Nam Định' });
  tenant('nam', 'Hoàng Văn Nam', { dob: '2002-05-05', hometown: 'Nghệ An', notes: 'Sinh viên năm cuối, gia đình bảo lãnh.' });
  tenant('trang', 'Đặng Thu Trang', { dob: '1997-12-25', hometown: 'Huế' });
  tenant('dung', 'Bùi Thế Dũng', { dob: '1988-08-18', hometown: 'Thái Bình' });
  tenant('maianh', 'Ngô Thị Mai Anh', { dob: '2000-02-29', hometown: 'Cần Thơ', verified: false, createdAt: at('2026-10-14') });
  tenant('huy', 'Trương Gia Huy', { dob: '1994-10-10', hometown: 'Vũng Tàu' });
  tenant('mai', 'Lý Thị Mai', { dob: '1999-06-06', hometown: 'Bến Tre' });
  tenant('loc', 'Phan Văn Lộc', { dob: '1991-04-04', hometown: 'Quảng Nam' });
  tenant('yen', 'Đinh Thị Yến', { dob: '2001-01-15', hometown: 'Phú Yên' });
  tenant('vinh', 'Hồ Quang Vinh', { dob: '1992-09-09', hometown: 'Khánh Hòa' });
  tenant('lanchi', 'Mai Thị Lan Chi', { dob: '1996-12-01', hometown: 'Lâm Đồng', createdAt: at('2026-10-08') });
  tenant('hung', 'Tạ Văn Hùng', { dob: '1989-03-03', hometown: 'Hưng Yên' });
  tenant('linh', 'Cao Thị Thùy Linh', { dob: '1998-08-08', hometown: 'Hải Dương' });
  tenant('son', 'Lương Văn Sơn', { email: null, dob: '1985-05-20', hometown: 'Thanh Hóa', idDoc: false, notes: 'Khách đang ở từ trước khi dùng SmartRent; còn thiếu hợp đồng gốc và giấy tờ.' });
  tenant('han', 'Châu Ngọc Hân', { dob: '1994-06-21', hometown: 'Hà Nam' });
  tenant('dieu', 'Quách Thị Diệu', { dob: '1996-02-11', hometown: 'Hà Nam' });
  tenant('tuan', 'Kiều Minh Tuấn', { dob: '2001-07-07', hometown: 'Bắc Ninh', verified: false, createdAt: at('2026-10-09') });
  db.counters[`tenant:${org.id}`] = tenantSeq;

  // ------------------------------------------------------------ kỳ tính tiền
  const periods = {};
  for (const p of [BT, TD, CG, HB]) {
    for (const month of ['2026-08-01', '2026-09-01', '2026-10-01']) {
      const period = { id: id(`period:${p.code}:${month}`), propertyId: p.id, monthStart: month, status: 'open', lockedAt: null, lockedBy: null };
      db.billingPeriods.push(period);
      periods[`${p.code}:${month.slice(0, 7)}`] = period;
    }
  }

  // ------------------------------------------------------------ đợt thuê + hợp đồng + bàn giao + cọc
  const ctxAt = (instant, actor = owner) => ({ user: actor, now: instant, today: REFERENCE_TODAY, organizationId: org.id });
  const tenancies = {};

  function seedTenancy(key, spec) {
    const r = rooms[spec.room];
    const p = db.properties.find((x) => x.id === r.propertyId);
    const t = tenants[spec.tenant];
    const months = spec.months || 12;
    const endsOn = addMonths(spec.moveIn, months);
    const status = spec.status || 'active';
    const allocation = createAllocation(db, { roomId: r.id, startsOn: spec.moveIn, endsOn: status === 'planned' ? endsOn : (spec.moveOut || null), state: status === 'planned' ? 'reserved' : spec.moveOut ? 'completed' : 'occupied' });
    const tenancy = {
      id: id(`tenancy:${key}`), allocationId: allocation.id, representativeTenantId: t.id, reservationId: null, status: spec.moveOut ? 'ended' : status,
      plannedMoveIn: spec.moveIn, actualMoveIn: status === 'planned' ? null : spec.moveIn, actualMoveOut: spec.moveOut || null,
      onboardingMode: spec.import ? 'import' : 'normal', endReason: spec.endReason || null, endedBy: spec.moveOut ? owner.id : null, createdAt: at(spec.signedOn || spec.moveIn),
    };
    db.tenancies.push(tenancy);
    tenancies[key] = tenancy;
    for (const res of spec.residents || []) {
      db.residents.push({ id: id(`resident:${key}:${res.tenant}`), tenancyId: tenancy.id, tenantId: tenants[res.tenant].id, joinedOn: spec.moveIn, leftOn: null, relationship: res.relationship });
    }
    if (spec.import) {
      ['Hợp đồng đã ký', 'Giấy tờ tùy thân', 'Biên bản bàn giao ban đầu'].forEach((item) => db.onboardingGaps.push({ id: id(`gap:${key}:${item}`), tenancyId: tenancy.id, missingItem: item, sourceReference: 'Sổ tay quản lý cũ, trang 12', notes: null, resolvedAt: null, resolvedBy: null }));
    } else {
      const year = (spec.signedOn || spec.moveIn).slice(0, 4);
      const contract = { id: id(`contract:${key}`), tenancyId: tenancy.id, code: `HDT-${year}-${String((db.counters[`contract:${year}`] = (db.counters[`contract:${year}`] || 0) + 1)).padStart(4, '0')}`, predecessorContractId: spec.predecessor ? id(`contract:${spec.predecessor}`) : null, archivedAt: null, createdBy: owner.id, createdAt: at(addDays(spec.signedOn || spec.moveIn, -2)) };
      db.contracts.push(contract);
      const signedFile = privateFile(`contract:${key}`, org.id, `${contract.code}-ban-ky.pdf`, 'contract_signed');
      const version = {
        id: id(`cversion:${key}:1`), contractId: contract.id, versionNo: 1, effectiveFrom: spec.moveIn, endsOn, requiredDeposit: spec.requiredDeposit ?? r.requiredDeposit,
        invoiceDay: 28, dueAfterDays: p.code === 'CG' ? 10 : 7, prorationPolicy: 'actual_days',
        termsText: spec.copyAll
          ? 'Giá thuê, điện, nước, dịch vụ, internet, rác và phí làm thẻ từ ghi trong bảng giá kèm theo, cố định trong thời hạn hợp đồng. Thanh toán trước ngày đến hạn ghi trên hóa đơn. Báo trước 30 ngày nếu trả phòng.'
          : 'Giá thuê cố định trong thời hạn hợp đồng. Điện, nước, dịch vụ tính theo bảng giá cơ sở hiện hành, thông báo trước khi thay đổi. Báo trước 30 ngày nếu trả phòng.',
        changeReason: null, signedAt: at(spec.signedOn || addDays(spec.moveIn, -3), 16), confirmedBy: owner.id, signatureMethod: 'paper', externalSignatureReference: null, createdAt: contract.createdAt,
        parties: [
          { role: 'landlord', userId: owner.id, tenantId: null, fullNameSnapshot: owner.displayName, addressSnapshot: `${p.address.line}, ${p.address.locality}, ${p.address.province}`, identitySnapshot: null },
          { role: 'representative', userId: null, tenantId: t.id, fullNameSnapshot: t.fullName, addressSnapshot: t.address.line, identitySnapshot: 'CCCD •••• (đã đối chiếu bản gốc)' },
        ],
        files: [{ fileId: signedFile.id, fileKind: 'signed' }],
      };
      db.contractVersions.push(version);
      const plan = ensureRatePlan(db, { contractVersionId: version.id });
      const rent = spec.rent ?? db.chargeRates.find((x) => x.id === id(`rate:${spec.room}:RENT`)).unitPrice;
      const cRate = (code, price, method = 'fixed', cycle = 'monthly') => db.chargeRates.push({ id: id(`crate:${key}:1:${code}`), ratePlanId: plan.id, chargeTypeId: charge(code).id, effectiveFrom: spec.moveIn, effectiveTo: null, unitPrice: price, calculationMethod: method, billingCycle: cycle, prorationMode: method === 'fixed' ? 'actual_days' : 'full_period' });
      cRate('RENT', rent);
      if (spec.copyAll) {
        cRate('ELECTRICITY', 4000, 'metered'); cRate('WATER', 25000, 'metered'); cRate('SERVICE', 100000); cRate('INTERNET', 50000); cRate('GARBAGE', 0); cRate('KEYCARD', 30000, 'fixed', 'once');
      }
      // Bàn giao nhận phòng + chỉ số đầu (không mặc định 0).
      const handover = {
        id: id(`handover:${key}:in`), tenancyId: tenancy.id, kind: spec.transferIn ? 'transfer_in' : 'checkin', occurredAt: at(spec.moveIn, 9), notes: spec.handoverNotes || 'Phòng sạch, khóa cửa hoạt động tốt.',
        landlordConfirmedBy: owner.id, tenantConfirmedBy: t.userId, confirmedAt: at(spec.moveIn, 9, 30), representativeConfirmationText: `${t.fullName} đã kiểm tra và đồng ý hiện trạng.`,
        assets: db.roomAssets.filter((a) => a.roomId === r.id).map((a) => ({ roomAssetId: a.id, nameSnapshot: a.name, quantity: a.quantity, condition: 'Tốt' })), fileIds: [],
      };
      if (status !== 'planned') {
        db.handovers.push(handover);
        const [e0, w0] = spec.readingsIn;
        recordReading(db, ctxAt(at(spec.moveIn, 9)), { meterId: id(`meter:${spec.room}:electricity`), observedAt: at(spec.moveIn, 9), readingValue: e0, tenancyId: tenancy.id, handoverId: handover.id, readingKind: 'checkin', recordedBy: owner.id });
        recordReading(db, ctxAt(at(spec.moveIn, 9)), { meterId: id(`meter:${spec.room}:water`), observedAt: at(spec.moveIn, 9), readingValue: w0, tenancyId: tenancy.id, handoverId: handover.id, readingKind: 'checkin', recordedBy: owner.id });
      }
    }
    // Cọc thực thu — có thể khác mức cọc yêu cầu trên hợp đồng.
    if (spec.depositPaid) {
      const paidAt = at(spec.signedOn || addDays(spec.moveIn, -3), 16, 30);
      const payment = createPayment(db, ctxAt(paidAt), { tenantId: t.id, amount: spec.depositPaid, receivedAt: paidAt, methodCode: spec.depositMethod || 'cash', status: 'confirmed', propertyId: p.id, notes: 'Tiền cọc khi ký hợp đồng', externalReference: spec.depositRef });
      depositReceipt(db, ctxAt(paidAt), { tenancyId: tenancy.id, paymentId: payment.id, amount: spec.depositPaid, reason: 'Nhận cọc khi ký hợp đồng' });
    }
    return tenancy;
  }

  // Bình Thạnh
  seedTenancy('an', { room: 'A101', tenant: 'an', moveIn: '2026-09-01', signedOn: '2026-08-28', copyAll: true, readingsIn: [100, 10], depositPaid: 3000000, residents: [{ tenant: 'bich', relationship: 'Bạn cùng phòng' }] });
  seedTenancy('khoa', { room: 'A102', tenant: 'khoa', moveIn: '2026-03-01', readingsIn: [1520, 210], depositPaid: 2800000 });
  seedTenancy('nhung', { room: 'A103', tenant: 'nhung', moveIn: '2025-12-01', readingsIn: [880, 96], depositPaid: 3500000 });
  seedTenancy('bao', { room: 'A201', tenant: 'bao', moveIn: '2025-11-01', readingsIn: [2410, 330], depositPaid: 3600000 });
  seedTenancy('huong', { room: 'A202', tenant: 'huong', moveIn: '2025-10-01', readingsIn: [640, 72], depositPaid: 4200000 });
  seedTenancy('nam', { room: 'A203', tenant: 'nam', moveIn: '2026-06-01', months: 6, readingsIn: [3120, 405], depositPaid: 1500000, requiredDeposit: 3000000 });
  seedTenancy('trang', { room: 'A301', tenant: 'trang', moveIn: '2025-10-01', readingsIn: [1990, 260], depositPaid: 3500000 });
  seedTenancy('dung', { room: 'A302', tenant: 'dung', moveIn: '2026-04-01', readingsIn: [450, 51], depositPaid: 4500000, depositMethod: 'bank_transfer', depositRef: 'FT-DEMO-260328-01' });
  // Thủ Đức
  seedTenancy('huy_old', { room: 'B101', tenant: 'huy', moveIn: '2026-02-01', readingsIn: [700, 80], depositPaid: 2600000 });
  seedTenancy('mai', { room: 'B102', tenant: 'mai', moveIn: '2026-02-01', readingsIn: [1210, 140], depositPaid: 3000000 });
  seedTenancy('loc', { room: 'B201', tenant: 'loc', moveIn: '2026-01-01', readingsIn: [980, 111], depositPaid: 3000000 });
  seedTenancy('yen', { room: 'B202', tenant: 'yen', moveIn: '2026-07-01', readingsIn: [2205, 260], depositPaid: 3000000 });
  seedTenancy('vinh', { room: 'B204', tenant: 'vinh', moveIn: '2026-05-01', readingsIn: [300, 40], depositPaid: 2600000 });
  seedTenancy('lanchi', { room: 'B205', tenant: 'lanchi', moveIn: '2026-11-01', signedOn: '2026-10-15', status: 'planned', depositPaid: 3800000, depositMethod: 'bank_transfer', depositRef: 'FT-DEMO-261015-07' });
  // Cầu Giấy
  seedTenancy('hung', { room: 'C101', tenant: 'hung', moveIn: '2026-01-01', readingsIn: [510, 60], depositPaid: 3300000 });
  seedTenancy('linh', { room: 'C102', tenant: 'linh', moveIn: '2026-04-01', readingsIn: [1440, 170], depositPaid: 3300000 });
  seedTenancy('son', { room: 'C201', tenant: 'son', moveIn: '2025-06-01', import: true, readingsIn: [0, 0] });
  seedTenancy('han', { room: 'C202', tenant: 'han', moveIn: '2026-08-01', readingsIn: [820, 95], depositPaid: 4800000, residents: [{ tenant: 'dieu', relationship: 'Em gái' }] });

  // Chỉ số chốt khi chuyển sang SmartRent (cuối tháng 7) cho các đợt thuê bắt đầu trước tháng 8.
  const usage = { A102: [110, 4], A103: [150, 6], A201: [180, 5], A202: [220, 8], A203: [95, 3], A301: [160, 5], A302: [240, 9], B101: [120, 4], B102: [130, 5], B201: [140, 5], B202: [210, 7], B204: [125, 5], C101: [100, 4], C102: [115, 4], C201: [105, 4], C202: [230, 9], A101: [100, 3] };
  const meterValue = {};
  const reading = (tenancyKey, roomCode, kind, value, date, periodKey, readingKind = 'periodic', actor = owner) => recordReading(db, ctxAt(at(date, 18), actor), {
    meterId: id(`meter:${roomCode}:${kind}`), observedAt: at(date, 18), readingValue: value, billingPeriodId: periodKey ? periods[periodKey].id : null,
    tenancyId: tenancies[tenancyKey].id, readingKind, recordedBy: actor.id,
  });
  const baselineSpecs = [['khoa', 'A102'], ['nhung', 'A103'], ['bao', 'A201'], ['huong', 'A202'], ['nam', 'A203'], ['trang', 'A301'], ['dung', 'A302'], ['huy_old', 'B101'], ['mai', 'B102'], ['loc', 'B201'], ['yen', 'B202'], ['vinh', 'B204'], ['hung', 'C101'], ['linh', 'C102'], ['son', 'C201']];
  for (const [key, code] of baselineSpecs) {
    const checkinE = db.readings.find((x) => x.tenancyId === tenancies[key].id && x.meterId === id(`meter:${code}:electricity`));
    const checkinW = db.readings.find((x) => x.tenancyId === tenancies[key].id && x.meterId === id(`meter:${code}:water`));
    const e = (checkinE?.readingValue ?? 0) + usage[code][0] * 2 + 37;
    const w = (checkinW?.readingValue ?? 0) + usage[code][1] * 2 + 1;
    reading(key, code, 'electricity', e, '2026-07-27', null, 'baseline', owner);
    reading(key, code, 'water', w, '2026-07-27', null, 'baseline', owner);
    meterValue[code] = { e, w };
  }
  meterValue.C202 = { e: 820, w: 95 };
  meterValue.A101 = { e: 100, w: 10 };

  const periodic = (key, code, month, date, actor) => {
    const [du, dw] = usage[code];
    const jitter = (month.charCodeAt(6) + code.charCodeAt(3)) % 17;
    meterValue[code].e += du + jitter;
    meterValue[code].w += dw + (jitter % 2);
    reading(key, code, 'electricity', meterValue[code].e, date, `${db.properties.find((p) => p.id === rooms[code].propertyId).code}:${month}`, 'periodic', actor);
    reading(key, code, 'water', meterValue[code].w, date, `${db.properties.find((p) => p.id === rooms[code].propertyId).code}:${month}`, 'periodic', actor);
  };
  const augRooms = [['khoa', 'A102'], ['nhung', 'A103'], ['bao', 'A201'], ['huong', 'A202'], ['nam', 'A203'], ['trang', 'A301'], ['dung', 'A302'], ['huy_old', 'B101'], ['mai', 'B102'], ['loc', 'B201'], ['yen', 'B202'], ['vinh', 'B204'], ['hung', 'C101'], ['linh', 'C102'], ['son', 'C201']];
  augRooms.forEach(([key, code]) => periodic(key, code, '2026-08', '2026-08-27', code.startsWith('A') ? owner : owner));
  // C202 nhận phòng 01/08: kỳ 8 dùng chỉ số nhận phòng làm đầu kỳ.
  meterValue.C202 = { e: 820, w: 95 };
  periodic('han', 'C202', '2026-08', '2026-08-27', owner);

  // Kỳ 9: A101 theo đúng ví dụ đặc tả (điện 100 → 200, nước 10 → 13).
  reading('an', 'A101', 'electricity', 200, '2026-09-27', 'BT:2026-09', 'periodic', owner);
  reading('an', 'A101', 'water', 13, '2026-09-27', 'BT:2026-09', 'periodic', owner);
  meterValue.A101 = { e: 200, w: 13 };
  augRooms.filter(([key]) => key !== 'huy_old').forEach(([key, code]) => periodic(key, code, '2026-09', '2026-09-27', code.startsWith('A') ? owner : owner));
  periodic('han', 'C202', '2026-09', '2026-09-27', owner);

  // ------------------------------------------------------------ chuyển phòng B101 → B103 ngày 15/09
  {
    const old = tenancies.huy_old;
    const transferOn = '2026-09-15';
    const outHandover = { id: id('handover:huy_old:out'), tenancyId: old.id, kind: 'transfer_out', occurredAt: at(transferOn, 8), notes: 'Bàn giao phòng cũ khi chuyển sang B103.', landlordConfirmedBy: owner.id, tenantConfirmedBy: null, confirmedAt: at(transferOn, 8, 30), representativeConfirmationText: 'Khách xác nhận trên biên bản giấy.', assets: [], fileIds: [] };
    db.handovers.push(outHandover);
    meterValue.B101.e += 55;
    meterValue.B101.w += 2;
    const outE = recordReading(db, ctxAt(at(transferOn, 8), owner), { meterId: id('meter:B101:electricity'), observedAt: at(transferOn, 8), readingValue: meterValue.B101.e, tenancyId: old.id, handoverId: outHandover.id, readingKind: 'checkout', recordedBy: owner.id });
    const outW = recordReading(db, ctxAt(at(transferOn, 8), owner), { meterId: id('meter:B101:water'), observedAt: at(transferOn, 8), readingValue: meterValue.B101.w, tenancyId: old.id, handoverId: outHandover.id, readingKind: 'checkout', recordedBy: owner.id });
    old.status = 'ended';
    old.actualMoveOut = transferOn;
    old.endReason = 'Chuyển sang phòng B103 rộng hơn';
    old.endedBy = owner.id;
    db.roomAllocations.find((a) => a.id === old.allocationId).state = 'completed';
    db.roomAllocations.find((a) => a.id === old.allocationId).endsOn = transferOn;
    seedTenancy('huy', { room: 'B103', tenant: 'huy', moveIn: transferOn, signedOn: '2026-09-13', predecessor: 'huy_old', readingsIn: [1400, 150], transferIn: true, handoverNotes: 'Nhận phòng B103 khi chuyển từ B101.' });
    db.contractTerminations.push({ id: id('termination:huy_old'), contractId: id('contract:huy_old'), terminatedOn: transferOn, reason: 'Chấm dứt do chuyển sang phòng B103 (hợp đồng kế tiếp HDT mới).', confirmedBy: owner.id, createdAt: at(transferOn, 8) });
    db.roomTransfers.push({ id: id('transfer:huy'), oldTenancyId: old.id, newTenancyId: tenancies.huy.id, transferOn, reason: 'Khách cần phòng rộng hơn cho gia đình.', confirmedBy: owner.id, createdAt: at(transferOn, 8) });
    depositTransfer(db, ctxAt(at(transferOn, 8, 40), owner), { fromTenancyId: old.id, toTenancyId: tenancies.huy.id, amount: 2600000, reason: 'Chuyển cọc từ B101 sang B103' });
    usage.B103 = [160, 6];
    meterValue.B103 = { e: 1400, w: 150 };
    db._transferEndReadings = { electricity: outE.id, water: outW.id };
    periodic('huy', 'B103', '2026-09', '2026-09-27', owner);
  }

  // Kỳ 10: đã ghi một phần (Thủ Đức ghi sớm, Bình Thạnh còn thiếu nhiều phòng, Cầu Giấy chưa ghi).
  [['khoa', 'A102'], ['nhung', 'A103'], ['huong', 'A202']].forEach(([key, code]) => periodic(key, code, '2026-10', '2026-10-20', owner));
  [['mai', 'B102'], ['loc', 'B201'], ['yen', 'B202'], ['huy', 'B103']].forEach(([key, code]) => periodic(key, code, '2026-10', '2026-10-20', owner));

  // ------------------------------------------------------------ gia hạn A202: phụ lục v2 từ 01/10/2026 giá mới
  {
    const contract = db.contracts.find((c) => c.id === id('contract:huong'));
    const v1 = db.contractVersions.find((v) => v.contractId === contract.id && v.versionNo === 1);
    const v2 = { ...structuredClone(v1), id: id('cversion:huong:2'), versionNo: 2, effectiveFrom: '2026-10-01', endsOn: '2027-10-01', changeReason: 'Gia hạn 12 tháng, điều chỉnh giá thuê theo thỏa thuận.', signedAt: at('2026-09-20', 17), createdAt: at('2026-09-18'), files: [{ fileId: privateFile('contract:huong:v2', org.id, `${contract.code}-phu-luc-01.pdf`, 'contract_signed').id, fileKind: 'appendix' }] };
    db.contractVersions.push(v2);
    const plan = ensureRatePlan(db, { contractVersionId: v2.id });
    db.chargeRates.push({ id: id('crate:huong:2:RENT'), ratePlanId: plan.id, chargeTypeId: charge('RENT').id, effectiveFrom: '2026-10-01', effectiveTo: null, unitPrice: 4400000, calculationMethod: 'fixed', billingCycle: 'monthly', prorationMode: 'actual_days' });
    db.tenancyRequests.push({ id: id('treq:huong'), tenancyId: tenancies.huong.id, requestType: 'renewal', desiredOn: '2026-10-01', targetRoomId: null, message: 'Em muốn gia hạn thêm 1 năm.', status: 'completed', requestedBy: owner.id, reviewedBy: owner.id, decisionNotes: 'Đã ký phụ lục 01, giá mới 4.400.000 đ từ 01/10/2026.', createdAt: at('2026-09-05'), reviewedAt: at('2026-09-20', 17) });
  }

  // ------------------------------------------------------------ hóa đơn + thu tiền
  const pay = (tenantKey, amount, date, method = 'bank_transfer', ref = null, actor = owner, notes = null) => createPayment(db, ctxAt(at(date, 10), actor), {
    tenantId: tenants[tenantKey].id, amount, receivedAt: at(date, 10), methodCode: method, status: 'confirmed', externalReference: ref, notes,
  });
  const settle = (inv, tenantKey, amount, date, method = 'bank_transfer', ref = null) => {
    const ctx = ctxAt(at(date, 10), owner);
    const value = amount === 'full' ? invoiceTotal(inv) : amount;
    const payment = pay(tenantKey, value, date, method, ref);
    applyAllocation(db, ctx, { paymentId: payment.id, invoiceId: inv.id, amount: value });
    return payment;
  };
  const issueFor = (tenancyKey, periodKey, issueDate, actor = owner) => {
    const ctx = ctxAt(at(issueDate, 19), actor);
    const draft = createDraftInvoice(db, ctx, { tenancyId: tenancies[tenancyKey].id, periodId: periods[periodKey].id });
    issueInvoice(db, ctx, draft.id, {});
    return draft;
  };
  const keyOfTenant = (tenancyKey) => Object.keys(tenants).find((k) => tenants[k].id === tenancies[tenancyKey].representativeTenantId);

  // Tháng 8 (đã thu đủ trừ B204 thu một phần; C201 không phát hành được vì chưa có hợp đồng ký)
  const augPaid = ['khoa', 'nhung', 'bao', 'huong', 'nam', 'trang', 'dung', 'huy_old', 'mai', 'loc', 'yen', 'hung', 'linh', 'han'];
  augPaid.forEach((k, i) => {
    const inv = issueFor(k, `${db.properties.find((p) => p.id === tenancyContext(db, tenancies[k]).property.id).code}:2026-08`, '2026-08-28');
    settle(inv, keyOfTenant(k), 'full', addDays('2026-08-29', i % 6), i % 3 === 0 ? 'cash' : 'bank_transfer', i % 3 === 0 ? null : `FT-DEMO-2608-${String(i + 10).padStart(3, '0')}`);
  });
  const vinhAug = issueFor('vinh', 'TD:2026-08', '2026-08-28');
  settle(vinhAug, 'vinh', 1500000, '2026-09-06', 'cash');
  // Khóa kỳ tháng 8 sau đối soát.
  for (const code of ['BT', 'TD', 'CG']) {
    const period = periods[`${code}:2026-08`];
    period.status = 'locked';
    period.lockedAt = at('2026-09-10', 17);
    period.lockedBy = owner.id;
    db.periodEvents.push({ id: id(`pevent:${code}:lock`), periodId: period.id, action: 'lock', reason: 'Đã đối soát thu tiền tháng 8.', actorId: owner.id, occurredAt: period.lockedAt });
  }
  db.periodEvents.push(
    { id: id('pevent:TD:unlock'), periodId: periods['TD:2026-08'].id, action: 'unlock', reason: 'Mở lại để kiểm tra chỉ số nước B204 theo phản ánh của khách.', actorId: owner.id, occurredAt: at('2026-09-12', 9) },
    { id: id('pevent:TD:relock'), periodId: periods['TD:2026-08'].id, action: 'lock', reason: 'Chỉ số đúng, khóa lại; không thay đổi hóa đơn.', actorId: owner.id, occurredAt: at('2026-09-12', 11) },
  );

  // Hóa đơn cuối B101 (đến ngày chuyển 15/09) — ngày chuyển thuộc đợt thuê mới.
  {
    const ctx = ctxAt(at('2026-09-15', 10), owner);
    const final = createDraftInvoice(db, ctx, { tenancyId: tenancies.huy_old.id, kind: 'final', from: '2026-09-01', to: '2026-09-15', endReadings: db._transferEndReadings });
    issueInvoice(db, ctx, final.id, { issuedOn: '2026-09-15', dueOn: '2026-09-22' });
    settle(final, 'huy', 'full', '2026-09-16', 'bank_transfer', 'FT-DEMO-260916-02');
    delete db._transferEndReadings;
  }

  // Tháng 9
  const sep = {};
  ['an', 'khoa', 'nhung', 'bao', 'huong', 'nam', 'trang', 'dung', 'huy', 'mai', 'loc', 'yen', 'vinh', 'hung', 'linh', 'han'].forEach((k) => {
    sep[k] = issueFor(k, `${tenancyContext(db, tenancies[k]).property.code}:2026-09`, '2026-09-28');
  });
  // Ví dụ đặc tả: 3.655.000 đ, thu 2.000.000 → còn 1.655.000 (vẫn quá hạn sau 05/10).
  const anPayment = settle(sep.an, 'an', 2000000, '2026-10-02', 'bank_transfer', 'FT-DEMO-261002-05');
  ['khoa', 'nhung', 'huong', 'trang', 'dung', 'huy', 'mai', 'yen', 'hung', 'linh'].forEach((k, i) => settle(sep[k], keyOfTenant(k), 'full', addDays('2026-09-29', i % 6), i % 2 ? 'cash' : 'bank_transfer', i % 2 ? null : `FT-DEMO-2609-${String(i + 40).padStart(3, '0')}`));
  settle(sep.nam, 'nam', 1000000, '2026-10-04', 'cash');
  settle(sep.han, 'han', 3000000, '2026-10-06', 'bank_transfer', 'FT-DEMO-261006-11');
  // Thu dư/ứng trước: khách C101 chuyển dư 500.000 → số dư chưa phân bổ, không tự thành doanh thu.
  pay('hung', 500000, '2026-10-01', 'bank_transfer', 'FT-DEMO-261001-03', owner, 'Khách chuyển dư, chờ phân bổ cho kỳ sau.');

  // Báo chuyển khoản từ cổng khách: chờ xác minh, CHƯA cộng vào đã thu.
  db.payments.push({
    id: id('payment:an:pending'), code: 'PT-2610-9001', tenantId: tenants.an.id, reservationId: null, collectedAtPropertyId: BT.id, amount: 1655000,
    receivedAt: at('2026-10-20', 20, 15), methodCode: 'bank_transfer', bankAccountId: id('bank:ancu'), externalReference: 'FT-DEMO-261020-88', status: 'pending',
    confirmedBy: null, confirmedAt: null, rejectionReason: null, reportedBy: tenantUser.id, notes: 'Em chuyển nốt tiền hóa đơn tháng 9 ạ.', idempotencyKey: id('idem:an:pending'),
    createdAt: at('2026-10-20', 20, 16), fileIds: [privateFile('payment:an:proof', org.id, 'anh-chuyen-khoan-20-10.jpg', 'payment_proof', 'image/jpeg').id], intendedInvoiceIds: [sep.an.id],
  });
  db.payments.push({
    id: id('payment:bao:rejected'), code: 'PT-2610-9002', tenantId: tenants.bao.id, reservationId: null, collectedAtPropertyId: BT.id, amount: 3000000,
    receivedAt: at('2026-10-07', 21), methodCode: 'bank_transfer', bankAccountId: id('bank:ancu'), externalReference: 'FT-DEMO-261007-19', status: 'rejected',
    confirmedBy: null, confirmedAt: null, rejectionReason: 'Không tìm thấy giao dịch trong sao kê ngày 07–09/10; nhờ khách gửi lại ảnh có mã giao dịch.', reportedBy: owner.id,
    notes: 'Khách báo qua điện thoại.', idempotencyKey: id('idem:bao:rejected'), createdAt: at('2026-10-08', 9), fileIds: [],
  });

  // ------------------------------------------------------------ trả phòng còn nợ B204 (10/10/2026)
  {
    const t = tenancies.vinh;
    const moveOut = '2026-10-10';
    const outHandover = { id: id('handover:vinh:out'), tenancyId: t.id, kind: 'checkout', occurredAt: at(moveOut, 9), notes: 'Khóa cửa bị hư, đã thay ổ khóa mới. Phòng cần vệ sinh.', landlordConfirmedBy: owner.id, tenantConfirmedBy: null, confirmedAt: at(moveOut, 9, 30), representativeConfirmationText: 'Khách ký biên bản giấy.', assets: db.roomAssets.filter((a) => a.roomId === rooms.B204.id).map((a) => ({ roomAssetId: a.id, nameSnapshot: a.name, quantity: a.quantity, condition: a.code === 'GIUONG' ? 'Tốt' : 'Trầy xước nhẹ' })), fileIds: [] };
    db.handovers.push(outHandover);
    meterValue.B204.e += 48;
    meterValue.B204.w += 2;
    const ctx = ctxAt(at(moveOut, 9), owner);
    const outE = recordReading(db, ctx, { meterId: id('meter:B204:electricity'), observedAt: at(moveOut, 9), readingValue: meterValue.B204.e, tenancyId: t.id, handoverId: outHandover.id, readingKind: 'checkout', recordedBy: owner.id });
    const outW = recordReading(db, ctx, { meterId: id('meter:B204:water'), observedAt: at(moveOut, 9), readingValue: meterValue.B204.w, tenancyId: t.id, handoverId: outHandover.id, readingKind: 'checkout', recordedBy: owner.id });
    t.actualMoveOut = moveOut;
    const final = createDraftInvoice(db, ctx, { tenancyId: t.id, kind: 'final', from: '2026-10-01', to: moveOut, endReadings: { electricity: outE.id, water: outW.id } });
    final.lines.push({ id: id('line:vinh:comp'), lineNo: final.lines.length + 1, chargeTypeId: charge('COMPENSATION').id, chargeInstanceId: null, sourceRateId: null, sourceScope: 'manual', descriptionSnapshot: 'Bồi thường thay ổ khóa cửa (có biên bản)', unitSnapshot: 'lần', quantity: 1, unitPrice: 150000, sign: 1, prorationNumerator: 1, prorationDenominator: 1 });
    issueInvoice(db, ctx, final.id, { issuedOn: moveOut, dueOn: '2026-10-17' });
    const settlement = { id: id('settlement:vinh'), tenancyId: t.id, checkoutHandoverId: outHandover.id, status: 'confirmed', allowRemainingDebt: true, remainingDebtReason: 'Khách xin trả phần còn lại trước 31/10/2026, đã ký giấy cam kết.', confirmedBy: owner.id, confirmedAt: at(moveOut, 11), notes: 'Bù trừ toàn bộ cọc vào nợ cũ theo thứ tự hạn.', invoiceIds: [vinhAug.id, sep.vinh.id, final.id] };
    db.settlements.push(settlement);
    // Bù trừ toàn bộ cọc vào các hóa đơn theo thứ tự hạn; phần nợ còn lại vẫn theo dõi trên khách.
    let depositLeft = depositHeld(db, t.id);
    for (const inv of [vinhAug, sep.vinh, final]) {
      const take = Math.min(depositLeft, invoiceBalance(db, inv, REFERENCE_TODAY).outstandingAmount);
      if (take <= 0) continue;
      depositOffset(db, ctxAt(at(moveOut, 11), owner), { tenancyId: t.id, invoiceId: inv.id, amount: take, reason: 'Bù trừ cọc khi trả phòng', settlementId: settlement.id });
      depositLeft -= take;
    }
    t.status = 'ended';
    t.endReason = 'Khách trả phòng, còn nợ theo cam kết';
    t.endedBy = owner.id;
    const alloc = db.roomAllocations.find((a) => a.id === t.allocationId);
    alloc.state = 'completed';
    alloc.endsOn = moveOut;
    db.contractTerminations.push({ id: id('termination:vinh'), contractId: id('contract:vinh'), terminatedOn: moveOut, reason: 'Khách trả phòng trước hạn, đã báo trước 30 ngày.', confirmedBy: owner.id, createdAt: at(moveOut, 11) });
  }

  // Hóa đơn nháp kỳ 10 cho các phòng đã có chỉ số (A202 dùng giá phụ lục mới 4.400.000).
  [['khoa', 'BT'], ['nhung', 'BT'], ['huong', 'BT'], ['mai', 'TD'], ['loc', 'TD']].forEach(([k, code]) => createDraftInvoice(db, ctxAt(at('2026-10-20', 20), owner), { tenancyId: tenancies[k].id, periodId: periods[`${code}:2026-10`].id }));

  // ------------------------------------------------------------ giữ chỗ, yêu cầu thuê, lịch xem
  const inquiry = (n, roomCode, contactName, status, createdAt, extra = {}) => {
    const q = {
      id: id(`inquiry:${n}`), code: `YC-${String(n).padStart(4, '0')}`, roomId: rooms[roomCode].id, contactName, phone: extra.phone || `0900000${String(700 + n)}`,
      email: extra.email || null, desiredMoveIn: extra.desiredMoveIn || '2026-11-01', occupants: extra.occupants || 1, message: extra.message || null, status,
      assignedTo: extra.assignedTo?.id || null, tenantId: extra.tenant ? tenants[extra.tenant].id : null, closedReason: extra.closedReason || null,
      source: extra.source || 'public', createdAt,
    };
    db.inquiries.push(q);
    db.inquiryEvents.push({ id: id(`ievent:${n}:0`), inquiryId: q.id, kind: 'created', body: q.source === 'public' ? 'Khách gửi yêu cầu từ trang công khai.' : 'Nhân viên tạo yêu cầu từ cuộc gọi.', fromStatus: null, toStatus: 'new', actorId: null, occurredAt: createdAt });
    (extra.events || []).forEach(([kind, body, toStatus, actor, when], i) => db.inquiryEvents.push({ id: id(`ievent:${n}:${i + 1}`), inquiryId: q.id, kind, body, fromStatus: null, toStatus: toStatus || null, actorId: actor.id, occurredAt: when }));
    return q;
  };
  inquiry(1, 'A204', 'Chị Hạnh', 'new', '2026-10-21T02:40:00.000Z', { email: 'hanh.timphong@example.com', occupants: 2, message: 'Phòng còn không ạ? Em muốn xem phòng cuối tuần này, ở 2 người.' });
  inquiry(2, 'B104', 'Anh Phúc', 'new', at('2026-10-20', 21, 10), { message: 'Cho em hỏi có chỗ để xe máy không?', desiredMoveIn: '2026-11-05' });
  inquiry(3, 'A204', 'Bạn Thịnh', 'accepted', at('2026-10-18', 10), { assignedTo: owner, events: [['status', 'Tiếp nhận, hẹn gọi lại chiều nay.', 'accepted', owner, at('2026-10-18', 11)]] });
  inquiry(4, 'C104', 'Chị Ngân', 'consulting', at('2026-10-16', 14), { assignedTo: owner, occupants: 2, events: [['status', 'Tư vấn giá và phí dịch vụ qua điện thoại.', 'consulting', owner, at('2026-10-16', 15)], ['call', 'Khách cân nhắc thêm, hẹn trả lời trong tuần.', null, owner, at('2026-10-17', 9)]] });
  const q5 = inquiry(5, 'B203', 'Anh Toàn', 'viewing', at('2026-10-19', 9), { assignedTo: owner, events: [['status', 'Hẹn xem phòng ngày mai lúc 18:00.', 'viewing', owner, at('2026-10-19', 10)]] });
  const q6 = inquiry(6, 'A303', 'Ngô Thị Mai Anh', 'approved', at('2026-10-12', 9), { assignedTo: owner, tenant: 'maianh', occupants: 1, events: [['status', 'Khách đồng ý thuê, chờ giữ chỗ.', 'approved', owner, at('2026-10-14', 16)]] });
  inquiry(7, 'B205', 'Mai Thị Lan Chi', 'converted', at('2026-10-05', 9), { assignedTo: owner, tenant: 'lanchi', occupants: 3, events: [['status', 'Đã ký hợp đồng, nhận phòng dự kiến 01/11.', 'converted', owner, at('2026-10-15', 17)]] });
  const q8 = inquiry(8, 'C103', 'Kiều Minh Tuấn', 'approved', at('2026-10-07', 9), { assignedTo: owner, tenant: 'tuan', events: [['status', 'Đồng ý thuê, giữ chỗ đến 15/10.', 'approved', owner, at('2026-10-08', 9)]] });
  inquiry(9, 'B104', 'Chị Thơ', 'rejected', at('2026-10-10', 9), { occupants: 4, closedReason: 'Khách cần phòng cho 4 người, vượt sức chứa 2 người của phòng.', assignedTo: owner, events: [['status', 'Từ chối: vượt sức chứa.', 'rejected', owner, at('2026-10-10', 10)]] });
  inquiry(10, 'A204', 'Anh Kiên', 'cancelled', at('2026-10-09', 9), { closedReason: 'Khách đã tìm được phòng khác.', assignedTo: owner, events: [['status', 'Khách báo hủy.', 'cancelled', owner, at('2026-10-11', 9)]] });
  db.viewings.push(
    { id: id('viewing:5'), inquiryId: q5.id, startsAt: at('2026-10-22', 18), endsAt: at('2026-10-22', 18, 30), hostUserId: owner.id, status: 'scheduled', resultNotes: null },
    { id: id('viewing:6'), inquiryId: q6.id, startsAt: at('2026-10-13', 17), endsAt: at('2026-10-13', 17, 30), hostUserId: owner.id, status: 'completed', resultNotes: 'Khách thích ban công, hỏi về giờ giấc.' },
    { id: id('viewing:4'), inquiryId: id('inquiry:4'), startsAt: at('2026-10-17', 10), endsAt: at('2026-10-17', 10, 30), hostUserId: owner.id, status: 'completed', resultNotes: 'Khách xem cùng bạn, cân nhắc giá.' },
    { id: id('viewing:3'), inquiryId: id('inquiry:3'), startsAt: at('2026-10-19', 17), endsAt: at('2026-10-19', 17, 30), hostUserId: owner.id, status: 'no_show', resultNotes: 'Khách không đến, không nghe máy.' },
  );
  {
    const held = createAllocation(db, { roomId: rooms.A303.id, startsOn: '2026-11-01', endsOn: '2027-11-01', state: 'held', holdExpiresAt: at('2026-10-25', 20) });
    db.reservations.push({ id: id('reservation:1'), code: 'GC-0001', inquiryId: q6.id, allocationId: held.id, tenantId: tenants.maianh.id, status: 'holding', cancellationTerms: 'Giữ chỗ miễn phí đến 20:00 ngày 25/10/2026. Quá hạn chưa ký hợp đồng thì phòng được mở lại cho khách khác. (Chính sách thu tiền giữ chỗ chưa chốt — xem tài liệu bàn giao.)', cancelledReason: null, handledBy: owner.id, createdAt: at('2026-10-14', 17) });
    const expired = createAllocation(db, { roomId: rooms.C103.id, startsOn: '2026-10-20', endsOn: '2027-10-20', state: 'held', holdExpiresAt: at('2026-10-15', 20) });
    expired.state = 'released';
    db.reservations.push({ id: id('reservation:2'), code: 'GC-0002', inquiryId: q8.id, allocationId: expired.id, tenantId: tenants.tuan.id, status: 'expired', cancellationTerms: 'Giữ chỗ miễn phí đến 20:00 ngày 15/10/2026.', cancelledReason: null, handledBy: owner.id, createdAt: at('2026-10-08', 9) });
    db.counters.reservation = 2;
    db.counters.inquiry = 10;
  }

  // ------------------------------------------------------------ yêu cầu từ khách, hồ sơ
  db.tenancyRequests.push(
    { id: id('treq:linh'), tenancyId: tenancies.linh.id, requestType: 'checkout', desiredOn: '2026-10-31', targetRoomId: null, message: 'Em chuyển công tác, muốn trả phòng cuối tháng 10.', status: 'pending', requestedBy: owner.id, reviewedBy: null, decisionNotes: null, createdAt: at('2026-10-01', 20), reviewedAt: null },
    { id: id('treq:mai'), tenancyId: tenancies.mai.id, requestType: 'transfer', desiredOn: '2026-11-01', targetRoomId: rooms.B104.id, message: 'Em muốn chuyển sang phòng có cửa sổ.', status: 'pending', requestedBy: owner.id, reviewedBy: null, decisionNotes: null, createdAt: at('2026-10-17', 21), reviewedAt: null },
  );
  db.profileChangeRequests.push(
    { id: id('pcr:an'), tenantId: tenants.an.id, requestedBy: tenantUser.id, changes: { phone: { from: '0900000101', to: '0900000111' } }, reason: 'Em đổi sang số mới.', status: 'pending', reviewNotes: null, reviewedBy: null, reviewedAt: null, createdAt: at('2026-10-19', 21) },
    { id: id('pcr:khoa'), tenantId: tenants.khoa.id, requestedBy: owner.id, changes: { email: { from: 'khoa@example.com', to: 'khoa.tran@example.com' } }, reason: 'Khách báo email mới.', status: 'approved', reviewNotes: 'Đã gọi xác nhận với khách.', reviewedBy: owner.id, reviewedAt: at('2026-09-10'), createdAt: at('2026-09-09') },
  );

  // ------------------------------------------------------------ ticket
  let ticketSeq = 0;
  const ticket = (roomCode, tenancyKey, category, title, description, priority, status, createdAt, extra = {}) => {
    ticketSeq += 1;
    const r = rooms[roomCode];
    const p = db.properties.find((x) => x.id === r.propertyId);
    const policy = db.slaPolicies.find((s) => s.organizationId === p.organizationId && s.priority === priority);
    const t = {
      id: id(`ticket:${ticketSeq}`), code: `SC-${String(ticketSeq).padStart(4, '0')}`, roomId: r.id, tenancyId: tenancyKey ? tenancies[tenancyKey].id : null,
      categoryId: id(`tcat:${p.organizationId === org.id ? 'ANCU' : 'HOABINH'}:${category}`), title, description, priority, status, reportedBy: (extra.reporter || owner).id,
      assignedTo: extra.assignee?.id || null, slaPolicyId: policy.id, dueAt: extra.dueAt || new Date(new Date(createdAt).getTime() + policy.targetHours * 3600000).toISOString(),
      resolvedAt: extra.resolvedAt || null, closedAt: extra.closedAt || null, resolutionNotes: extra.resolution || null, createdAt, fileIds: [],
    };
    db.tickets.push(t);
    db.ticketEvents.push({ id: id(`tevent:${t.code}:0`), ticketId: t.id, kind: 'created', fromStatus: null, toStatus: 'new', assignedTo: null, reason: null, actorId: t.reportedBy, occurredAt: createdAt });
    (extra.events || []).forEach(([kind, from, to, actor, when, reason, assignee], i) => db.ticketEvents.push({ id: id(`tevent:${t.code}:${i + 1}`), ticketId: t.id, kind, fromStatus: from, toStatus: to, assignedTo: assignee?.id || null, reason: reason || null, actorId: actor.id, occurredAt: when }));
    (extra.messages || []).forEach(([author, body, internal, when], i) => db.ticketMessages.push({ id: id(`tmsg:${t.code}:${i}`), ticketId: t.id, authorId: author.id, body, isInternal: Boolean(internal), createdAt: when, fileIds: [] }));
    return t;
  };
  ticket('A104', null, 'REPAIR', 'Trần phòng A104 thấm nước khi mưa', 'Vệt ố lớn ở góc trần gần cửa sổ, nước nhỏ giọt khi mưa to.', 'high', 'in_progress', at('2026-10-12', 8), {
    assignee: owner, events: [['assign', 'new', 'accepted', owner, at('2026-10-12', 9), null, owner], ['status', 'accepted', 'in_progress', owner, at('2026-10-13', 8)]],
    messages: [[owner, 'Đã kiểm tra, cần chống thấm mái tôn phía trên. Dự kiến xong trong 3 ngày.', false, at('2026-10-13', 9)], [owner, 'Báo giá thợ 1.200.000 đ, đã duyệt.', true, at('2026-10-13', 11)]],
    dueAt: at('2026-10-12', 20),
  });
  ticket('A101', 'an', 'PLUMBING', 'Vòi sen bị rỉ nước', 'Vòi sen trong nhà tắm rỉ nước liên tục kể cả khi khóa chặt.', 'normal', 'new', at('2026-10-20', 21, 30), { reporter: tenantUser, messages: [[tenantUser, 'Em gửi ảnh vòi sen ạ, nước rỉ cả đêm.', false, at('2026-10-20', 21, 31)]] });
  ticket('A203', 'nam', 'ELECTRICAL', 'Ổ cắm gần bàn học mất điện', 'Ổ cắm đôi gần bàn học không có điện, các ổ khác bình thường.', 'urgent', 'accepted', at('2026-10-20', 7), { assignee: owner, events: [['assign', 'new', 'accepted', owner, at('2026-10-20', 8), null, owner]] });
  ticket('B102', 'mai', 'OTHER', 'Wi-Fi chập chờn buổi tối', 'Từ 20:00 đến 23:00 mạng rất chậm, hay mất kết nối.', 'normal', 'waiting', at('2026-10-15', 20), { assignee: owner, events: [['assign', 'new', 'accepted', owner, at('2026-10-16', 8), null, owner], ['status', 'accepted', 'in_progress', owner, at('2026-10-16', 9)], ['status', 'in_progress', 'waiting', owner, at('2026-10-17', 9), 'Chờ nhà mạng đến kiểm tra đường truyền.']], messages: [[owner, 'Đã gọi nhà mạng, hẹn thứ Năm đến kiểm tra.', false, at('2026-10-17', 9)]] });
  ticket('B201', 'loc', 'REPAIR', 'Cửa sổ bị kẹt không mở được', 'Bản lề cửa sổ bị gỉ, rất khó mở.', 'low', 'resolved', at('2026-10-08', 10), { assignee: owner, resolvedAt: at('2026-10-10', 15), resolution: 'Đã thay bản lề mới và tra dầu.', events: [['assign', 'new', 'accepted', owner, at('2026-10-08', 11), null, owner], ['status', 'accepted', 'resolved', owner, at('2026-10-10', 15)]] });
  ticket('C101', 'hung', 'ELECTRICAL', 'Bóng đèn hành lang tầng 1 hỏng', 'Hành lang tối vào buổi tối.', 'normal', 'closed', at('2026-10-02', 19), { assignee: owner, resolvedAt: at('2026-10-03', 10), closedAt: at('2026-10-03', 18), resolution: 'Đã thay bóng LED 18W.', events: [['assign', 'new', 'accepted', owner, at('2026-10-02', 20), null, owner], ['status', 'accepted', 'resolved', owner, at('2026-10-03', 10)], ['status', 'resolved', 'closed', owner, at('2026-10-03', 18)]] });
  ticket('A102', 'khoa', 'REPAIR', 'Máy lạnh không mát', 'Máy lạnh chạy nhưng không mát, có tiếng kêu.', 'high', 'accepted', at('2026-10-06', 9), {
    assignee: owner, resolvedAt: null, events: [['assign', 'new', 'accepted', owner, at('2026-10-06', 10), null, owner], ['status', 'accepted', 'resolved', owner, at('2026-10-07', 16)], ['status', 'resolved', 'closed', owner, at('2026-10-08', 9)], ['reopen', 'closed', 'accepted', owner, at('2026-10-19', 9), 'Khách báo máy lạnh lại không mát sau 10 ngày.']],
    messages: [[owner, 'Đã vệ sinh và bơm gas.', false, at('2026-10-07', 16)], [owner, 'Mở lại theo phản ánh mới của khách; kiểm tra block.', true, at('2026-10-19', 9)]], dueAt: at('2026-10-19', 21),
  });
  ticket('C203', null, 'REPAIR', 'Sơn lại tường phòng C203', 'Sơn lại toàn bộ tường, thay rèm trước khi cho thuê lại.', 'low', 'in_progress', at('2026-10-05', 15), { reporter: owner, assignee: owner, events: [['assign', 'new', 'accepted', owner, at('2026-10-05', 16), null, owner], ['status', 'accepted', 'in_progress', owner, at('2026-10-07', 8)]] });
  db.counters.ticket = ticketSeq;

  // ------------------------------------------------------------ chi phí (phân hệ mở rộng)
  db.expenses.push(
    { id: id('expense:1'), propertyId: BT.id, roomId: rooms.A104.id, ticketId: id('ticket:1'), categoryId: id('ecat:ANCU:REPAIR'), amount: 1200000, incurredOn: '2026-10-14', paidAt: at('2026-10-14', 16), description: 'Chống thấm mái tôn phòng A104', evidenceFileId: null, recordedBy: owner.id, reversalOfId: null, reason: null, createdAt: at('2026-10-14', 16) },
    { id: id('expense:2'), propertyId: CG.id, roomId: null, ticketId: id('ticket:6'), categoryId: id('ecat:ANCU:REPAIR'), amount: 85000, incurredOn: '2026-10-03', paidAt: at('2026-10-03', 10), description: 'Bóng LED hành lang', evidenceFileId: null, recordedBy: owner.id, reversalOfId: null, reason: null, createdAt: at('2026-10-03', 11) },
    { id: id('expense:3'), propertyId: BT.id, roomId: null, ticketId: null, categoryId: id('ecat:ANCU:UTILITY'), amount: 12500000, incurredOn: '2026-10-05', paidAt: at('2026-10-05', 9), description: 'Tiền điện đầu vào tháng 9 (hóa đơn điện lực)', evidenceFileId: null, recordedBy: owner.id, reversalOfId: null, reason: null, createdAt: at('2026-10-05', 9) },
    { id: id('expense:4'), propertyId: TD.id, roomId: null, ticketId: null, categoryId: id('ecat:ANCU:OPERATION'), amount: 300000, incurredOn: '2026-10-06', paidAt: null, description: 'Vệ sinh sân phơi (ghi nhầm số tiền)', evidenceFileId: null, recordedBy: owner.id, reversalOfId: null, reason: null, createdAt: at('2026-10-06', 9) },
    { id: id('expense:5'), propertyId: TD.id, roomId: null, ticketId: null, categoryId: id('ecat:ANCU:OPERATION'), amount: 300000, incurredOn: '2026-10-06', paidAt: null, description: 'Đảo bút toán vệ sinh sân phơi ghi nhầm', evidenceFileId: null, recordedBy: owner.id, reversalOfId: id('expense:4'), reason: 'Ghi nhầm số tiền, đúng là 200.000 đ.', createdAt: at('2026-10-06', 10) },
    { id: id('expense:6'), propertyId: TD.id, roomId: null, ticketId: null, categoryId: id('ecat:ANCU:OPERATION'), amount: 200000, incurredOn: '2026-10-06', paidAt: at('2026-10-06', 17), description: 'Vệ sinh sân phơi', evidenceFileId: null, recordedBy: owner.id, reversalOfId: null, reason: null, createdAt: at('2026-10-06', 10, 5) },
  );

  // ------------------------------------------------------------ cấu hình, mẫu nhắc, tác vụ nền
  db.emailConfigs.push({ organizationId: org.id, host: 'smtp.example.com', port: 587, securityMode: 'starttls', username: 'no-reply@ancu.example.com', fromAddress: 'no-reply@ancu.example.com', fromName: 'Nhà trọ An Cư', hasSecret: true, secretRef: 'secret://smtp/ancu', lastTestAt: null, lastTestResult: null, updatedAt: at('2026-09-01') });
  const template = (code, channel, subject, body, version = 1) => {
    const tpl = { id: id(`tpl:${code}`), organizationId: org.id, code, channel, version, subject, body, isActive: true, updatedAt: at('2026-09-01') };
    db.messageTemplates.push(tpl);
    return tpl;
  };
  const tIssued = template('invoice_issued', 'email', 'Hóa đơn {{invoice.code}} – phòng {{room.code}}', 'Chào {{tenant.fullName}},\n\nHóa đơn {{invoice.code}} kỳ {{period.label}}: {{invoice.total}}. Hạn thanh toán {{invoice.dueOn}}.\n\nNhà trọ An Cư');
  const tBefore = template('invoice_due_soon', 'email', 'Nhắc hạn hóa đơn {{invoice.code}}', 'Hóa đơn {{invoice.code}} còn {{invoice.outstanding}}, đến hạn ngày {{invoice.dueOn}}.');
  const tOverdue = template('invoice_overdue', 'email', 'Hóa đơn {{invoice.code}} đã quá hạn', 'Hóa đơn {{invoice.code}} đã quá hạn {{invoice.daysOverdue}} ngày, còn {{invoice.outstanding}}.');
  const tContract = template('contract_expiring', 'email', 'Hợp đồng {{contract.code}} sắp hết hạn', 'Hợp đồng phòng {{room.code}} hết hạn ngày {{contract.endDate}}. Vui lòng liên hệ quản lý để gia hạn hoặc chuẩn bị trả phòng.');
  template('payment_confirmed', 'email', 'Đã nhận {{payment.amount}}', 'SmartRent đã ghi nhận khoản thu {{payment.code}}.');
  template('ticket_updated', 'in_app', 'Ticket {{ticket.code}} cập nhật', '{{ticket.title}}: {{ticket.status}}');
  db.reminderRules.push(
    { id: id('rule:due-3'), organizationId: org.id, eventType: 'invoice_due', dayOffset: -3, templateId: tBefore.id, isEnabled: true },
    { id: id('rule:overdue+1'), organizationId: org.id, eventType: 'invoice_overdue', dayOffset: 1, templateId: tOverdue.id, isEnabled: true },
    { id: id('rule:overdue+7'), organizationId: org.id, eventType: 'invoice_overdue', dayOffset: 7, templateId: tOverdue.id, isEnabled: true },
    { id: id('rule:contract-30'), organizationId: org.id, eventType: 'contract_expiring', dayOffset: -30, templateId: tContract.id, isEnabled: true },
    { id: id('rule:issued'), organizationId: org.id, eventType: 'invoice_issued', dayOffset: 0, templateId: tIssued.id, isEnabled: true },
  );
  db.jobRuns.push(
    { id: id('job:1'), organizationId: org.id, jobKind: 'daily_reminders', status: 'succeeded', startedAt: at('2026-10-19', 8), finishedAt: at('2026-10-19', 8, 1), summary: 'Gửi 3 nhắc quá hạn, 1 nhắc hợp đồng (mô phỏng).', error: null, dedupeKey: 'daily_reminders:2026-10-19' },
    { id: id('job:2'), organizationId: org.id, jobKind: 'daily_reminders', status: 'failed', startedAt: at('2026-10-20', 8), finishedAt: at('2026-10-20', 8, 2), summary: null, error: 'Mô phỏng: máy chủ SMTP không phản hồi sau 30 giây. Sẽ thử lại lần sau.', dedupeKey: 'daily_reminders:2026-10-20' },
    { id: id('job:3'), organizationId: org.id, jobKind: 'daily_reminders', status: 'succeeded', startedAt: at('2026-10-21', 8), finishedAt: at('2026-10-21', 8, 1), summary: 'Gửi 4 nhắc quá hạn (mô phỏng), bỏ qua 2 nhắc đã gửi trước đó.', error: null, dedupeKey: 'daily_reminders:2026-10-21' },
    { id: id('job:4'), organizationId: org.id, jobKind: 'expire_reservations', status: 'succeeded', startedAt: at('2026-10-16', 0, 5), finishedAt: at('2026-10-16', 0, 5), summary: 'Giải phóng 1 giữ chỗ hết hạn (GC-0002, phòng C103).', error: null, dedupeKey: 'expire_reservations:2026-10-16' },
  );
  db.deliveries.push({ id: id('delivery:son'), organizationId: org.id, recipientUserId: null, toEmail: null, channel: 'email', templateCode: 'invoice_overdue', eventKey: 'son', subject: 'Nhắc khách C201', dedupeKey: 'invoice_overdue:son', status: 'failed', createdAt: at('2026-10-21', 8), attempts: [{ at: at('2026-10-21', 8), result: 'failed', error: 'Khách chưa có email trong hồ sơ.' }] });
  db.exportJobs.push(
    { id: id('export:1'), organizationId: org.id, kind: 'invoices', format: 'csv', filters: { periodMonth: '2026-09' }, status: 'succeeded', requestedBy: owner.id, requestedAt: at('2026-10-01', 9), finishedAt: at('2026-10-01', 9), rowCount: 17, note: 'Tệp CSV tạo trong trình duyệt (mock).' },
    { id: id('export:2'), organizationId: org.id, kind: 'receivables', format: 'pdf', filters: { periodMonth: '2026-09' }, status: 'failed', requestedBy: owner.id, requestedAt: at('2026-10-01', 9, 5), finishedAt: at('2026-10-01', 9, 6), rowCount: null, note: 'Mô phỏng: chưa có dịch vụ tạo PDF ở máy chủ.' },
  );
  db.backupRuns.push(
    { id: id('backup:1'), organizationId: null, kind: 'backup', status: 'succeeded', reference: 'MÔ PHỎNG – chưa có bản sao lưu thật', startedAt: at('2026-10-20', 2), finishedAt: at('2026-10-20', 2, 10), note: 'Bản ghi minh họa; backend cần chạy pg_dump/snapshot và lưu tham chiếu thật.' },
    { id: id('backup:2'), organizationId: null, kind: 'restore_test', status: 'succeeded', reference: 'MÔ PHỎNG – khôi phục thử', startedAt: at('2026-10-01', 3), finishedAt: at('2026-10-01', 3, 25), note: 'Bản ghi minh họa cho lần kiểm tra khôi phục định kỳ.' },
  );
  ['bank', 'payment_gateway', 'esign', 'tax_invoice'].forEach((kind) => db.integrations.push({ id: id(`integration:${kind}`), organizationId: org.id, kind, provider: null, status: 'not_configured', settings: {}, secretRef: null, updatedAt: null }));

  // ------------------------------------------------------------ AI mẫu
  db.aiConversations.push({ id: id('ai:1'), organizationId: org.id, userId: owner.id, title: 'Phòng trống tháng 11', createdAt: at('2026-10-19', 20), dataScope: { properties: 'all', period: '2026-10' } });
  db.aiMessages.push(
    { id: id('aimsg:1'), conversationId: id('ai:1'), role: 'user', content: 'Tháng 11 còn phòng nào trống ở Bình Thạnh?', createdAt: at('2026-10-19', 20), sources: [] },
    { id: id('aimsg:2'), conversationId: id('ai:1'), role: 'assistant', content: 'Bình Thạnh hiện có A204 còn trống; A303 đang được giữ chỗ đến 25/10 cho khách khác. A104 đang bảo trì, A304 ngừng khai thác. (Câu trả lời mô phỏng, chưa kết nối mô hình AI.)', createdAt: at('2026-10-19', 20, 0), sources: ['Phòng', 'Giữ chỗ'], model: 'mock-rules' },
  );

  // ------------------------------------------------------------ thông báo và nhật ký
  const staffIds = [owner.id, owner.id];
  notify(db, { organizationId: org.id, recipientIds: [...staffIds, owner.id], eventKey: 'inquiry:1', title: 'Yêu cầu thuê mới YC-0001', body: 'Chị Hạnh hỏi phòng A204, muốn xem cuối tuần.', url: `/admin/viewings?inquiry=${id('inquiry:1')}`, at: '2026-10-21T02:41:00.000Z' });
  notify(db, { organizationId: org.id, recipientIds: staffIds, eventKey: 'payment.reported:an', title: 'Khách báo chuyển khoản 1.655.000 đ', body: 'Nguyễn Văn An (A101) báo đã chuyển, chờ xác minh.', url: '/admin/invoices?hasPending=true', at: at('2026-10-20', 20, 16) });
  notify(db, { organizationId: org.id, recipientIds: staffIds, eventKey: 'ticket.overdue:3', title: 'SC-0003 quá hạn xử lý', body: 'Ổ cắm A203 mất điện, ưu tiên khẩn cấp (4 giờ).', url: `/admin/tickets/${id('ticket:3')}`, at: at('2026-10-20', 11) });
  notify(db, { organizationId: org.id, recipientIds: staffIds, eventKey: 'contract.expiring:bao', title: 'Hợp đồng A201 hết hạn 31/10/2026', body: 'Phạm Quốc Bảo: còn 11 ngày. Liên hệ gia hạn hoặc chuẩn bị trả phòng.', url: `/admin/contracts/${id('contract:bao')}`, at: at('2026-10-21', 8) });
  notify(db, { organizationId: org.id, recipientIds: [owner.id], eventKey: 'treq:linh', title: 'Đề nghị trả phòng C102', body: 'Cao Thị Thùy Linh muốn trả phòng ngày 31/10/2026.', url: '/admin/contracts?requests=pending', at: at('2026-10-01', 20) });
  notify(db, { organizationId: org.id, recipientIds: [tenantUser.id], eventKey: 'payment.confirmed:an', title: 'Đã xác nhận khoản thu 2.000.000 đ', body: `Phân bổ vào hóa đơn ${sep.an.code}. Còn phải thu 1.655.000 đ.`, url: `/invoices/${sep.an.id}`, at: at('2026-10-02', 10, 30) });
  notify(db, { organizationId: org.id, recipientIds: [tenantUser.id], eventKey: 'payment.reported.ack:an', title: 'Đã nhận báo chuyển khoản', body: 'Khoản 1.655.000 đ đang chờ quản lý xác minh. Hóa đơn chỉ cập nhật sau khi xác nhận.', url: '/invoices', at: at('2026-10-20', 20, 16) });
  db.notifications.filter((n) => n.eventKey === 'payment.confirmed:an' || n.eventKey === `invoice.issued:${sep.an.id}`).forEach((n) => { n.readAt = at('2026-10-02', 12); });
  audit(db, ctxAt(at('2026-09-10', 17)), { action: 'billing_period.lock', tableName: 'billing_periods', recordId: periods['BT:2026-08'].id, after: { status: 'locked' }, reason: 'Đã đối soát thu tiền tháng 8.' });
  audit(db, ctxAt(at('2026-09-12', 9)), { action: 'billing_period.unlock', tableName: 'billing_periods', recordId: periods['TD:2026-08'].id, before: { status: 'locked' }, after: { status: 'open' }, reason: 'Mở lại để kiểm tra chỉ số nước B204 theo phản ánh của khách.' });
  audit(db, ctxAt(at('2026-08-25', 10)), { action: 'charge_rate.change', tableName: 'charge_rates', recordId: id('rate:BT:WATER:2026-09-01'), before: { unitPrice: 22000 }, after: { unitPrice: 25000, effectiveFrom: '2026-09-01' }, reason: 'Điều chỉnh giá nước theo giá đầu vào mới.' });
  audit(db, ctxAt(at('2026-10-02', 10), owner), { action: 'payment.confirm', tableName: 'payments', recordId: anPayment.id, after: { amount: 2000000, allocatedTo: sep.an.code } });

  return singleBusiness(db);
}
