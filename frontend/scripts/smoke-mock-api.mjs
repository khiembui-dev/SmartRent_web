// Kiểm tra nhanh mock API trong Node (không cần trình duyệt): đăng nhập theo vai trò, chạy các luồng nghiệp vụ chính
// và đối chiếu số liệu với đặc tả. Chạy: npm run test:mock
// Mock dùng localStorage → script tạo bộ nhớ tạm trong RAM, không đụng dữ liệu trình duyệt.

const memory = new Map();
globalThis.localStorage = {
  getItem: (k) => (memory.has(k) ? memory.get(k) : null),
  setItem: (k, v) => memory.set(k, String(v)),
  removeItem: (k) => memory.delete(k),
};
globalThis.localStorage.setItem('smartrent.demo.latency', '0,0');

const { mockTransport, listRoutes } = await import('../src/mocks/server.js');
const { resetData } = await import('../src/mocks/db.js');
const { DEMO_PASSWORD, REFERENCE_TODAY } = await import('../src/mocks/seed.js');

// Mock chạy theo đồng hồ thật còn dữ liệu mẫu cố định, nên kết quả từng đổi theo ngày chạy (từ 31/10/2026 tiền thuê lẻ ngày
// vượt tiền cọc làm kịch bản trả phòng sai). Dời đồng hồ về ngày tham chiếu của seed; thời gian vẫn chạy tiếp để giữ thứ tự sự kiện.
const RealDate = Date;
const clockOffset = new RealDate(`${REFERENCE_TODAY}T10:00:00+07:00`).getTime() - RealDate.now();
globalThis.Date = class extends RealDate {
  constructor(...args) {
    if (args.length) super(...args);
    else super(RealDate.now() + clockOffset);
  }

  static now() {
    return RealDate.now() + clockOffset;
  }
};

let passed = 0;
const failures = [];
function check(condition, label, detail) {
  if (condition) passed += 1;
  else failures.push(`${label}${detail ? ` → ${JSON.stringify(detail).slice(0, 300)}` : ''}`);
}

// Ghi lại route đã chạy thành công để cuối bài kiểm tra mọi route mock đều được gọi ít nhất một lần.
const ROUTES = listRoutes().map((r) => ({ key: `${r.method} ${r.path}`, method: r.method, auth: r.auth, path: r.path, re: new RegExp(`^${r.path.replace(/:(\w+)/g, '[^/]+')}$`) }));
const hit = new Set();
const record = (method, path) => {
  const route = ROUTES.find((x) => x.method === method && x.re.test(path));
  if (route) hit.add(route.key);
};

function client(token, organizationId) {
  const call = (method, path, { body, query, key } = {}) => mockTransport({
    method, path, body, query, idempotencyKey: key,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(organizationId ? { 'X-Organization-Id': organizationId } : {}) },
  }).then((result) => {
    record(method, path);
    return result;
  });
  return {
    get: (p, query) => call('GET', p, { query }),
    post: (p, body, key) => call('POST', p, { body, key }),
    put: (p, body) => call('PUT', p, { body }),
    patch: (p, body) => call('PATCH', p, { body }),
    del: (p) => call('DELETE', p),
  };
}

async function expectError(promise, status, code, label) {
  try {
    await promise;
    failures.push(`${label}: mong đợi lỗi ${status}/${code} nhưng thành công`);
  } catch (error) {
    check(error.status === status && (!code || error.code === code), label, { status: error.status, code: error.code, detail: error.detail });
  }
}

async function login(email) {
  const res = await client().post('/api/v1/auth/login', { email, password: DEMO_PASSWORD });
  const me = await client(res.accessToken).get('/api/v1/me');
  return { token: res.accessToken, me, api: client(res.accessToken, me.organizations[0]?.id) };
}

resetData();
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());

// ---------------------------------------------------------------- công khai
const pub = client();
const rooms = await pub.get('/api/v1/public/rooms', { pageSize: 50 });
check(rooms.totalItems >= 8, 'Trang công khai có tin đăng', rooms.totalItems);
check(rooms.items.every((r) => r.slug && r.rent > 0), 'Tin công khai có slug và giá thuê');
check(rooms.items.every((r) => typeof r.coverImageUrl === 'string' && r.coverImageUrl.startsWith('/images/rooms/')), 'Mọi tin công khai có ảnh bìa dạng đường dẫn', rooms.items.map((r) => r.coverImageUrl));
const publicFilters = await pub.get('/api/v1/public/filters');
check(['ELECTRICITY', 'WATER', 'SERVICE'].every((code) => publicFilters.feeSummary.some((f) => f.code === code && f.min <= f.max)), 'Trang chủ có khoảng giá điện, nước, dịch vụ từ bảng giá', publicFilters.feeSummary);
check(!publicFilters.feeSummary.some((f) => f.category === 'rent'), 'Khoảng giá phí không lẫn tiền thuê');
check(publicFilters.depositRange.min > 0 && publicFilters.properties.every((x) => x.name && x.locality), 'Trang chủ có khoảng cọc và danh sách khu nhà', publicFilters.properties);
const withVideo = rooms.items.filter((r) => r.hasVideo);
check(withVideo.length === 1 && withVideo[0].roomCode === 'A204', 'Chỉ tin có video mới gắn cờ video', withVideo.map((r) => r.roomCode));
const slugA204 = rooms.items.find((r) => r.roomCode === 'A204').slug;
const detail = await pub.get(`/api/v1/public/rooms/${slugA204}`);
check(detail.fees.some((f) => f.category === 'electricity'), 'Chi tiết phòng công khai liệt kê phí điện');
check(detail.videoUrl === '/videos/room-tour.mp4' && (await pub.get(`/api/v1/public/rooms/${rooms.items.find((r) => !r.hasVideo).slug}`)).videoUrl === null, 'Chi tiết phòng trả video đúng tin đăng');
check(rooms.items.every((r) => r.availability.status === 'available'), 'Trang thuê phòng chỉ có phòng trống', rooms.items.map((r) => r.availability.status));
check(!rooms.items.some((r) => ['A101', 'A303', 'A104', 'C204'].includes(r.roomCode)), 'Phòng đang ở, giữ chỗ, bảo trì, bị ẩn không hiện ở trang thuê phòng');
const held = await pub.get('/api/v1/public/rooms/bt-a303-phong-don');
check(held.availability.status === 'on_hold', 'Mở trực tiếp phòng đang giữ chỗ vẫn báo đúng trạng thái', held.availability);

// Khách tự tạo tài khoản rồi mới đặt được lịch xem phòng
const viewingAt = new Date(Date.now() + 2 * 86400000).toISOString();
await expectError(pub.post('/api/v1/portal/inquiries', { slug: slugA204, preferredViewingAt: viewingAt, occupants: 1 }), 401, null, 'Chưa đăng nhập không đặt được lịch xem phòng');
const registerBody = { fullName: 'Khách Tự Đăng Ký', phone: '0912000111', email: 'khach.moi@example.com', password: 'matkhau123', acceptedTerms: true };
await expectError(pub.post('/api/v1/auth/register', { ...registerBody, password: 'ngan' }), 422, 'validation_failed', 'Đăng ký mật khẩu quá ngắn bị chặn');
await expectError(pub.post('/api/v1/auth/register', { ...registerBody, acceptedTerms: false }), 422, 'validation_failed', 'Đăng ký chưa đồng ý bị chặn');
await expectError(pub.post('/api/v1/auth/register', { ...registerBody, email: 'an.khachthue@example.com' }), 409, 'email_taken', 'Đăng ký trùng email bị chặn');
const newcomer = await pub.post('/api/v1/auth/register', registerBody);
const newApi = client(newcomer.accessToken);
const newMe = await newApi.get('/api/v1/me');
check(newMe.tenantProfiles.length === 1 && newMe.tenantProfiles[0].tenancies.length === 0, 'Tài khoản mới có hồ sơ khách, chưa có phòng', newMe.tenantProfiles);
check((await newApi.get('/api/v1/portal/tenancies')).length === 0 && (await newApi.get('/api/v1/portal/invoices')).items.length === 0, 'Khách chưa có phòng không có đợt thuê và hóa đơn');
await expectError(newApi.post('/api/v1/portal/inquiries', { slug: 'bt-a303-phong-don', preferredViewingAt: viewingAt, occupants: 1 }), 409, 'room_not_available', 'Không đặt được phòng không còn trống');
await expectError(newApi.post('/api/v1/portal/inquiries', { slug: slugA204, preferredViewingAt: '2020-01-01T03:00:00.000Z', occupants: 1 }), 422, 'validation_failed', 'Không đặt lịch xem ở quá khứ');
const inquiry = await newApi.post('/api/v1/portal/inquiries', { slug: slugA204, preferredViewingAt: viewingAt, occupants: 3, message: 'Xem sau giờ làm' });
check(/^YC-/.test(inquiry.referenceCode) && inquiry.overCapacity, 'Đặt lịch nhận mã tham chiếu, báo vượt số người', inquiry);
await expectError(newApi.post('/api/v1/portal/inquiries', { slug: slugA204, preferredViewingAt: viewingAt, occupants: 1 }), 409, 'inquiry_exists', 'Không đặt trùng lịch cho cùng một phòng');
const myInquiries = await newApi.get('/api/v1/portal/inquiries');
check(myInquiries.length === 1 && myInquiries[0].status === 'new' && myInquiries[0].slug === slugA204, 'Khách xem lại được lịch đã đặt', myInquiries);
const hoaBinhRoom = rooms.items.find((r) => r.roomCode === 'H101');
await newApi.post('/api/v1/portal/inquiries', { slug: hoaBinhRoom.slug, preferredViewingAt: viewingAt, occupants: 1 });
check((await newApi.get('/api/v1/me')).tenantProfiles.length === 2, 'Đặt phòng đơn vị khác tạo thêm hồ sơ ở đơn vị đó');
const contactInfo = await pub.get('/api/v1/public/contact-info');
check(contactInfo.organizations[0].phone === '0900000001' && contactInfo.organizations[0].email === 'ha.chutro@example.com', 'Liên hệ lấy từ tài khoản chủ trọ', contactInfo.organizations[0]);

// ---------------------------------------------------------------- chủ trọ
const owner = await login('ha.chutro@example.com');
const api = owner.api;
const dash = await api.get('/api/v1/dashboard');
check(dash.rooms.total === 30, 'Dashboard đếm đúng 30 phòng của đơn vị An Cư', dash.rooms.total);
check(dash.tasks.find((t) => t.key === 'pending_payments').count >= 1, 'Dashboard có việc "chờ xác minh"');

const invoices = await api.get('/api/v1/invoices', { q: 'HD-BT2609-001' });
const sepAn = invoices.items[0];
check(sepAn.totalAmount === 3655000, 'Hóa đơn ví dụ = 3.655.000', sepAn.totalAmount);
check(sepAn.paidAmount === 2000000 && sepAn.outstandingAmount === 1655000, 'Thu 2.000.000 còn 1.655.000', sepAn);
check(sepAn.isOverdue && sepAn.paymentStatus === 'partial', 'Thu một phần vẫn quá hạn', sepAn);
const sepDetail = await api.get(`/api/v1/invoices/${sepAn.id}`);
check(sepDetail.lines.some((l) => l.isOneTime && l.amount === 30000), 'Phí một lần 30.000 nằm trên hóa đơn tháng 9');
check(sepDetail.lines.some((l) => l.amount === 0 && l.unitPrice === 0), 'Dòng giá 0 vẫn hiển thị (giá 0 hợp lệ)');
check(sepDetail.pendingPayments.length === 1, 'Báo chuyển khoản chờ xác minh gắn với hóa đơn');

// Chỉ số kỳ 10 cho A101 rồi lập nháp: phí một lần không lặp.
// Kỳ tham chiếu của dữ liệu mẫu (cố định, không phụ thuộc ngày chạy kiểm thử).
const periods = await api.get('/api/v1/billing-periods', { month: '2026-10' });
const btOct = periods.items.find((p) => p.property.code === 'BT' && p.monthStart === '2026-10-01');
const sheet = await api.get(`/api/v1/billing-periods/${btOct.id}/worksheet`);
const rowA101 = sheet.rows.find((r) => r.room.code === 'A101');
check(rowA101.group === 'missing_readings', 'A101 kỳ 10 thuộc nhóm thiếu chỉ số', rowA101.group);
const observedAt = new Date().toISOString();
await expectError(api.post('/api/v1/meter-readings', { meterId: rowA101.readings.electricity.meterId, readingValue: 150, observedAt, billingPeriodId: btOct.id }), 422, 'reading_decreased', 'Chỉ số nhỏ hơn lần trước bị chặn');
const batch = await api.post('/api/v1/meter-readings/batch', { billingPeriodId: btOct.id, items: [
  { meterId: rowA101.readings.electricity.meterId, readingValue: 312, observedAt },
  { meterId: rowA101.readings.water.meterId, readingValue: 17, observedAt },
] });
check(batch.results.every((x) => x.status === 'succeeded'), 'Ghi chỉ số hàng loạt thành công', batch);
const draft = await api.post('/api/v1/invoices/drafts', { tenancyId: rowA101.tenancy.id, periodId: btOct.id, kind: 'periodic' });
check(!draft.lines.some((l) => l.isOneTime), 'Kỳ sau không lặp phí một lần', draft.lines.map((l) => l.description));
check(draft.lines.find((l) => l.chargeType.category === 'electricity').quantity === 112, 'Điện kỳ 10 = 312 − 200', draft.lines);
const issued = await api.post(`/api/v1/invoices/${draft.id}/issue`, {});
check(issued.status === 'issued' && issued.code, 'Phát hành nháp kỳ 10', issued.code);
await expectError(api.post(`/api/v1/invoices/${draft.id}/issue`, {}), 409, 'invoice_not_draft', 'Phát hành lặp bị chặn');
await expectError(api.put(`/api/v1/invoices/${draft.id}`, { notes: 'sửa' }), 409, 'invoice_not_draft', 'Không sửa hóa đơn đã phát hành');

// Xác nhận báo chuyển khoản 1.655.000 → hóa đơn tháng 9 đủ; xác nhận lại không thu trùng.
const pending = (await api.get('/api/v1/payments', { status: 'pending' })).items.find((p) => p.amount === 1655000);
const key = 'smoke-confirm-1';
const confirmed = await api.post(`/api/v1/payments/${pending.id}/confirm`, { allocations: [{ invoiceId: sepAn.id, amount: 1655000 }] }, key);
check(confirmed.status === 'confirmed' && confirmed.unappliedAmount === 0, 'Xác nhận và phân bổ khoản chờ', confirmed);
const replay = await api.post(`/api/v1/payments/${pending.id}/confirm`, { allocations: [{ invoiceId: sepAn.id, amount: 1655000 }] }, key);
check(replay.id === confirmed.id, 'Gửi lại cùng Idempotency-Key trả kết quả cũ');
await expectError(api.post(`/api/v1/payments/${pending.id}/confirm`, { allocations: [] }, 'another-key'), 409, 'payment_already_confirmed', 'Xác nhận lần hai bằng khóa khác bị chặn');
const sepAfter = await api.get(`/api/v1/invoices/${sepAn.id}`);
check(sepAfter.outstandingAmount === 0 && sepAfter.dueOn === sepAn.dueOn, 'Hóa đơn đủ tiền, hạn không đổi', sepAfter);

// Thu dư: phân bổ vượt nợ bị chặn.
const hungUnapplied = (await api.get('/api/v1/payments', { unapplied: 'true' })).items.find((p) => p.amount === 500000);
const otherInvoice = (await api.get('/api/v1/invoices', { overdue: 'true' })).items.find((i) => i.room.code === 'A201');
await expectError(api.post(`/api/v1/payments/${hungUnapplied.id}/allocations`, { allocations: [{ invoiceId: otherInvoice.id, amount: 500000 }] }), 422, 'payer_mismatch', 'Không phân bổ tiền khách này cho khách khác');

// Điều chỉnh giảm và hủy.
const credit = await api.post(`/api/v1/invoices/${otherInvoice.id}/adjustments`, { kind: 'credit_adjustment', reason: 'Giảm do mất nước 2 ngày', lines: [{ description: 'Giảm trừ mất nước', amount: 50000 }] });
check(credit.receivableAmount === otherInvoice.receivableAmount - 50000, 'Chứng từ giảm làm giảm số phải thu', credit);

// Khóa kỳ chặn ghi; mở khóa cần lý do.
const tdAug = (await api.get('/api/v1/billing-periods', { month: '2026-08' })).items.find((p) => p.property.code === 'TD');
await expectError(api.post(`/api/v1/billing-periods/${tdAug.id}/unlock`, { reason: '' }), 422, 'validation_failed', 'Mở khóa kỳ không có lý do bị chặn');

// Giữ chỗ chồng lịch bị chặn.
const roomA303 = (await api.get('/api/v1/rooms', { q: 'A303' })).items[0];
const tenantKhoa = (await api.get('/api/v1/tenants', { q: 'Khoa' })).items[0];
await expectError(api.post('/api/v1/reservations', { roomId: roomA303.id, tenantId: tenantKhoa.id, startsOn: '2026-11-10', holdExpiresAt: new Date(Date.now() + 86400000).toISOString(), cancellationTerms: 'Thử' }), 409, 'room_overlap', 'Giữ chỗ chồng lịch bị chặn');

// Nhận phòng mới A204 (khách mới) với hợp đồng ký, chỉ số, cọc thực thu khác mức yêu cầu.
const catalog = await api.get('/api/v1/catalog');
const rent = catalog.chargeTypes.find((c) => c.code === 'RENT');
const newTenant = await api.post('/api/v1/tenants', { fullName: 'Khách Kiểm Thử', phone: '0900000888', email: 'kiemthu@example.com' });
const signedFile = await api.post('/api/v1/files', { fileName: 'ban-ky.pdf', contentType: 'application/pdf', sizeBytes: 1000, dataUrl: 'data:application/pdf;base64,AA==', visibility: 'private', purpose: 'contract_signed' });
const roomA204 = (await api.get('/api/v1/rooms', { q: 'A204' })).items[0];
await expectError(api.post('/api/v1/tenancies/check-in', { mode: 'new', roomId: roomA204.id, tenantId: newTenant.id, moveInOn: today, contract: { endsOn: '2027-10-21', requiredDeposit: 3100000, invoiceDay: 28, dueAfterDays: 7, prorationPolicy: 'actual_days', termsText: 'Điều khoản', rates: [{ chargeTypeId: rent.id, unitPrice: 3100000 }] }, signature: { signatureMethod: 'paper', signedAt: new Date().toISOString(), signedFileId: signedFile.id }, readings: { electricity: 50 }, confirm: true }), 422, 'validation_failed', 'Nhận phòng thiếu chỉ số nước bị chặn');
const lastE = (await api.get(`/api/v1/rooms/${roomA204.id}`)).meters.find((m) => m.meterKind === 'electricity').lastReading;
const checkin = await api.post('/api/v1/tenancies/check-in', {
  mode: 'new', roomId: roomA204.id, tenantId: newTenant.id, moveInOn: today,
  contract: { endsOn: '2027-10-21', requiredDeposit: 3100000, invoiceDay: 28, dueAfterDays: 7, prorationPolicy: 'actual_days', termsText: 'Điều khoản thử', rates: [{ chargeTypeId: rent.id, unitPrice: 3100000 }] },
  signature: { signatureMethod: 'paper', signedAt: new Date().toISOString(), signedFileId: signedFile.id },
  readings: { electricity: (lastE?.value || 0) + 1, water: 5 }, deposit: { amount: 2000000, methodCode: 'cash' }, confirm: true,
});
check(checkin.status === 'active' && checkin.depositHeld === 2000000 && checkin.requiredDeposit === 3100000, 'Nhận phòng: cọc thực thu khác mức yêu cầu', checkin);
await expectError(api.post('/api/v1/tenancies/check-in', { mode: 'new', roomId: roomA204.id, tenantId: tenantKhoa.id, moveInOn: today, contract: { endsOn: '2027-10-21', requiredDeposit: 0, invoiceDay: 28, dueAfterDays: 7, prorationPolicy: 'actual_days', termsText: 'x', rates: [{ chargeTypeId: rent.id, unitPrice: 1 }] }, signature: { signatureMethod: 'paper', signedAt: new Date().toISOString(), signedFileId: signedFile.id }, readings: { electricity: 999, water: 99 }, confirm: true }), 409, null, 'Hai lần nhận cùng phòng không cùng thành công');

// Trả phòng B102 còn nợ? (đã thu đủ) → trả bình thường với hoàn cọc.
const b102 = (await api.get('/api/v1/tenancies', { q: 'B102' })).items.find((t) => t.status === 'active');
const b102Detail = await api.get(`/api/v1/tenancies/${b102.id}`);
const eLast = b102Detail.meters.find((m) => m.meterKind === 'electricity').lastReading.value;
const wLast = b102Detail.meters.find((m) => m.meterKind === 'water').lastReading.value;
const preview = await api.post(`/api/v1/tenancies/${b102.id}/checkout/preview`, { moveOutOn: today, readings: { electricity: eLast + 10, water: wLast + 1 } });
check(preview.depositHeld === 3000000, 'Xem trước trả phòng đọc đúng cọc đang giữ', preview.depositHeld);
const still = await api.get(`/api/v1/tenancies/${b102.id}`);
check(still.status === 'active', 'Xem trước không ghi dữ liệu');

// Trả phòng B102: hoàn toàn bộ cọc, phòng về bảo trì.
const done = await api.post(`/api/v1/tenancies/${b102.id}/checkout`, {
  moveOutOn: today, readings: { electricity: eLast + 10, water: wLast + 1 }, handover: { notes: 'Phòng sạch' }, terminationReason: 'Khách chuyển công tác',
  roomStatusAfter: 'maintenance', offsets: [{ invoiceId: 'final', amount: preview.finalInvoice.totalAmount }], refund: { amount: 3000000 - preview.finalInvoice.totalAmount, methodCode: 'cash' },
});
check(done.status === 'ended' && done.depositHeld === 0 && done.outstandingAmount === 0, 'Trả phòng: bù trừ cọc vào hóa đơn cuối, hoàn phần còn lại', { status: done.status, held: done.depositHeld, debt: done.outstandingAmount });
const roomB102 = (await api.get('/api/v1/rooms', { q: 'B102' })).items[0];
check(roomB102.occupancyStatus === 'maintenance', 'Phòng sau trả chuyển bảo trì');

// Trả phòng còn nợ bắt buộc có quyền + lý do.
const c101 = (await api.get('/api/v1/tenancies', { q: 'C101' })).items.find((t) => t.status === 'active');
const c101Detail = await api.get(`/api/v1/tenancies/${c101.id}`);
const ce = c101Detail.meters.find((m) => m.meterKind === 'electricity').lastReading.value;
const cw = c101Detail.meters.find((m) => m.meterKind === 'water').lastReading.value;
await expectError(api.post(`/api/v1/tenancies/${c101.id}/checkout`, { moveOutOn: today, readings: { electricity: ce + 5, water: cw + 1 }, terminationReason: 'Thử', roomStatusAfter: 'available' }), 422, 'deposit_not_settled', 'Không đóng đợt thuê khi cọc chưa xử lý');

// Chuyển phòng B201 → B203 (hợp đồng kế tiếp, chuyển cọc hai vế).
const b201 = (await api.get('/api/v1/tenancies', { q: 'B201' })).items.find((t) => t.status === 'active');
const b201Detail = await api.get(`/api/v1/tenancies/${b201.id}`);
const roomB203 = (await api.get('/api/v1/rooms', { q: 'B203' })).items[0];
const b203Detail = await api.get(`/api/v1/rooms/${roomB203.id}`);
const transfer = await api.post(`/api/v1/tenancies/${b201.id}/transfer`, {
  targetRoomId: roomB203.id, transferOn: today, reason: 'Khách muốn phòng có máy lạnh',
  oldReadings: { electricity: b201Detail.meters[0].lastReading.value + 3, water: b201Detail.meters[1].lastReading.value + 1 },
  newReadings: { electricity: (b203Detail.meters[0].lastReading?.value || 0) + 1, water: (b203Detail.meters[1].lastReading?.value || 0) + 1 },
  contract: { endsOn: '2027-10-21', requiredDeposit: 2700000, invoiceDay: 28, dueAfterDays: 7, prorationPolicy: 'actual_days', termsText: 'Hợp đồng kế tiếp sau chuyển phòng', rates: [{ chargeTypeId: rent.id, unitPrice: 2700000 }] },
  signature: { signatureMethod: 'paper', signedAt: new Date().toISOString(), signedFileId: signedFile.id }, depositTransferAmount: 2700000, issueFinalInvoice: false,
}).catch((error) => error);
check(transfer.newTenancy?.depositHeld === 2700000 && transfer.newTenancy?.transferFrom, 'Chuyển phòng mở đợt mới, chuyển cọc, giữ liên kết', transfer.detail || transfer.code || transfer.newTenancy);

// Gia hạn A201: phụ lục v2 → ký → hợp đồng hết cảnh báo.
const contractA201 = (await api.get('/api/v1/contracts', { q: 'A201' })).items[0];
check(contractA201.expiring, 'A201 đang sắp hết hạn');
const v2 = await api.post(`/api/v1/contracts/${contractA201.id}/versions`, { effectiveFrom: '2026-11-01', endsOn: '2027-11-01', requiredDeposit: 3600000, invoiceDay: 28, dueAfterDays: 7, prorationPolicy: 'actual_days', termsText: 'Gia hạn 12 tháng', changeReason: 'Gia hạn', rates: [{ chargeTypeId: rent.id, unitPrice: 3800000 }] });
const draftVersion = v2.versions.find((v) => !v.isSigned);
await expectError(api.post(`/api/v1/contracts/${contractA201.id}/versions/${draftVersion.id}/sign`, { signatureMethod: 'paper', signedAt: new Date().toISOString() }), 422, 'signed_file_required', 'Ký phiên bản bắt buộc có bản ký');
const signed = await api.post(`/api/v1/contracts/${contractA201.id}/versions/${draftVersion.id}/sign`, { signatureMethod: 'paper', signedAt: new Date().toISOString(), signedFileId: signedFile.id });
check(!signed.expiring && signed.endsOn === '2027-11-01', 'Ký phụ lục gia hạn cập nhật hạn hợp đồng', { endsOn: signed.endsOn, expiring: signed.expiring });
await expectError(api.put(`/api/v1/contracts/${contractA201.id}/versions/${draftVersion.id}`, { effectiveFrom: '2026-11-01', endsOn: '2027-11-01', requiredDeposit: 0, invoiceDay: 1, dueAfterDays: 1, prorationPolicy: 'actual_days', termsText: 'x', changeReason: 'x', rates: [{ chargeTypeId: rent.id, unitPrice: 1 }] }), 409, 'version_signed', 'Bản đã ký bị khóa');

// Phát hành hàng loạt kỳ 10 Thủ Đức: phòng thiếu chỉ số báo lỗi riêng, phòng đủ thì phát hành.
const tdOct = (await api.get('/api/v1/billing-periods', { month: '2026-10' })).items.find((p) => p.property.code === 'TD');
const tdSheet = await api.get(`/api/v1/billing-periods/${tdOct.id}/worksheet`);
const candidates = tdSheet.rows.filter((row) => ['ready', 'draft', 'missing_readings'].includes(row.group)).map((row) => row.tenancy.id);
const batchResult = await api.post('/api/v1/invoice-batches', { periodId: tdOct.id, action: 'issue', tenancyIds: candidates }, 'smoke-batch-1');
check(batchResult.summary.succeeded >= 1, 'Phát hành hàng loạt có phòng thành công', batchResult.summary);
check(batchResult.items.every((i) => i.status !== 'pending'), 'Mỗi phòng có kết quả riêng', batchResult.items.map((i) => i.status));

// Ticket: tiếp nhận → giải quyết → đóng → mở lại có lý do.
const ticket = (await api.get('/api/v1/tickets', { q: 'SC-0002' })).items[0];
await api.post(`/api/v1/tickets/${ticket.id}/transitions`, { action: 'accept' });
await expectError(api.post(`/api/v1/tickets/${ticket.id}/transitions`, { action: 'resolve' }), 422, 'validation_failed', 'Giải quyết ticket cần ghi kết quả');
await api.post(`/api/v1/tickets/${ticket.id}/transitions`, { action: 'resolve', resolutionNotes: 'Thay ron vòi sen' });
const anApi = client((await login('an.khachthue@example.com')).token);
const tClosed = await anApi.post(`/api/v1/portal/tickets/${ticket.id}/confirm`, {});
check(tClosed.status === 'closed', 'Khách xác nhận đóng ticket');
const tReopen = await api.post(`/api/v1/tickets/${ticket.id}/transitions`, { action: 'reopen', reason: 'Khách báo vẫn rỉ nước' });
check(tReopen.status === 'accepted' && tReopen.events.some((e) => e.kind === 'reopen'), 'Mở lại ticket có lịch sử');

// ---------------------------------------------------------------- nhân viên (phạm vi 1 cơ sở, không có quyền xác nhận tiền)
const staff = await login('lan.nhanvien@example.com');
const staffRooms = await staff.api.get('/api/v1/rooms', { pageSize: 100 });
check(staffRooms.items.every((r) => r.property.code === 'BT'), 'Nhân viên chỉ thấy phòng cơ sở được giao', staffRooms.items.map((r) => r.property.code));
const tdRoom = (await api.get('/api/v1/rooms', { q: 'B104' })).items[0];
await expectError(staff.api.get(`/api/v1/rooms/${tdRoom.id}`), 404, 'not_found', 'Đổi ID trên URL sang cơ sở khác bị chặn');
await expectError(staff.api.post(`/api/v1/payments/${hungUnapplied.id}/reversals`, { kind: 'correction', amount: 1, reason: 'Thử quyền' }), 403, 'forbidden', 'Nhân viên không có quyền đảo tiền');

// ---------------------------------------------------------------- khách thuê và người ở cùng
const tenant = await login('an.khachthue@example.com');
const tApi = client(tenant.token);
const overview = await tApi.get('/api/v1/portal/overview');
check(overview.hasRepresentativeRole, 'Khách đại diện thấy phần tài chính');
const portalInvoices = await tApi.get('/api/v1/portal/invoices');
const portalPaid = await tApi.get('/api/v1/portal/invoices', { paymentStatus: 'paid' });
check(portalPaid.items.every((i) => i.paymentStatus === 'paid' && i.status === 'issued'), 'Cổng khách lọc hóa đơn đã thu đủ ở máy chủ', portalPaid.totalItems);
const portalTenancies = await tApi.get('/api/v1/portal/tenancies');
const portalTenancy = portalTenancies.find((x) => x.room.code === 'A101');
check(portalTenancy.rent === 3000000 && portalTenancy.room.areaM2 > 0, 'Cổng khách thấy tiền thuê và diện tích phòng từ hợp đồng', portalTenancy.rent);
const portalTenancyDetail = await tApi.get(`/api/v1/portal/tenancies/${portalTenancy.id}`);
check(portalTenancyDetail.handovers[0].readings.length === 2 && portalTenancyDetail.handovers[0].readings.every((r) => r.serialNumber && r.readingValue != null), 'Biên bản bàn giao ở cổng khách có chỉ số điện nước đầu vào', portalTenancyDetail.handovers[0].readings);
check(portalInvoices.items.every((i) => i.representative.fullName === 'Nguyễn Văn An'), 'Khách chỉ thấy hóa đơn của mình');
await expectError(tApi.get(`/api/v1/portal/invoices/${otherInvoice.id}`), 404, 'not_found', 'Khách mở hóa đơn người khác bị chặn');
await expectError(tApi.get('/api/v1/invoices'), 403, null, 'Khách gọi API quản trị bị chặn');
const resident = await login('bich.oghep@example.com');
const rApi = client(resident.token);
const rOverview = await rApi.get('/api/v1/portal/overview');
check(!rOverview.hasRepresentativeRole && rOverview.openInvoices.length === 0, 'Người ở cùng không thấy công nợ của đại diện', rOverview);
const reported = await tApi.post('/api/v1/portal/payments', { invoiceIds: [issued.id], amount: 100000, receivedAt: new Date().toISOString(), externalReference: 'FT-SMOKE-01' });
const portalPending = await tApi.get('/api/v1/portal/invoices', { hasPending: 'true' });
check(portalPending.items.length > 0 && portalPending.items.every((i) => i.pendingPaymentCount > 0), 'Cổng khách lọc hóa đơn chờ xác minh ở máy chủ', portalPending.totalItems);
check(reported.status === 'pending', 'Báo chuyển khoản từ cổng khách là chờ xác minh', reported.status);
const afterReport = await api.get(`/api/v1/invoices/${issued.id}`);
check(afterReport.paidAmount === 0, 'Báo chuyển khoản chưa cộng vào đã thu', afterReport.paidAmount);

// ---------------------------------------------------------------- ticket từ cổng khách, ghi chú nội bộ, tệp đính kèm
const portalCatalog = await tApi.get('/api/v1/portal/catalog');
const anTenancy = overview.tenancies.find((x) => x.status === 'active');
const pTicket = await tApi.post('/api/v1/portal/tickets', { tenancyId: anTenancy.id, categoryId: portalCatalog.ticketCategories[0].id, title: 'Ổ cắm lỏng', description: 'Ổ cắm cạnh giường bị lỏng', priority: 'normal' }, 'smoke-pticket-1');
check(pTicket.status === 'new' && pTicket.dueAt, 'Khách báo sự cố có hạn SLA', pTicket);
const pTicketAgain = await tApi.post('/api/v1/portal/tickets', { tenancyId: anTenancy.id, categoryId: portalCatalog.ticketCategories[0].id, title: 'Ổ cắm lỏng', description: 'Ổ cắm cạnh giường bị lỏng', priority: 'normal' }, 'smoke-pticket-1');
check(pTicketAgain.id === pTicket.id, 'Gửi lại cùng khóa không tạo ticket trùng');
const publicFile = await api.post('/api/v1/files', { fileName: 'sua-o-cam.png', contentType: 'image/png', sizeBytes: 68, visibility: 'private', purpose: 'ticket', dataUrl: 'data:image/png;base64,iVBORw0KGgo=' });
const internalFile = await api.post('/api/v1/files', { fileName: 'bao-gia-noi-bo.png', contentType: 'image/png', sizeBytes: 68, visibility: 'private', purpose: 'ticket', dataUrl: 'data:image/png;base64,iVBORw0KGgo=' });
await api.post(`/api/v1/tickets/${pTicket.id}/messages`, { body: 'Báo giá thợ 150.000', isInternal: true, fileIds: [internalFile.id] });
await api.post(`/api/v1/tickets/${pTicket.id}/messages`, { body: 'Chiều nay thợ qua kiểm tra', isInternal: false, fileIds: [publicFile.id] });
const tView = await tApi.get(`/api/v1/portal/tickets/${pTicket.id}`);
check(tView.messages.length === 1 && !tView.messages[0].isInternal, 'Khách không thấy ghi chú nội bộ', tView.messages);
const dl = await tApi.get(`/api/v1/files/${publicFile.id}/download-url`);
check(dl.url && dl.file?.fileName === 'sua-o-cam.png', 'Khách tải được ảnh quản lý gửi trong trao đổi', dl.file);
await expectError(tApi.get(`/api/v1/files/${internalFile.id}/download-url`), 404, 'not_found', 'Khách không tải được tệp của ghi chú nội bộ');
await expectError(tApi.post(`/api/v1/portal/tickets/${pTicket.id}/confirm`, {}), 409, 'ticket_not_resolved', 'Khách chưa xác nhận được khi ticket chưa giải quyết');
await api.post(`/api/v1/tickets/${pTicket.id}/transitions`, { action: 'accept' });
await api.post(`/api/v1/tickets/${pTicket.id}/transitions`, { action: 'resolve', resolutionNotes: 'Đã siết lại ổ cắm' });
const pClosed = await tApi.post(`/api/v1/portal/tickets/${pTicket.id}/confirm`, {});
check(pClosed.status === 'closed', 'Khách xác nhận đã xử lý thì ticket đóng', pClosed.status);

// ---------------------------------------------------------------- đề nghị gia hạn từ cổng khách
const renewalReq = await tApi.post('/api/v1/portal/requests', { tenancyId: anTenancy.id, requestType: 'renewal', desiredOn: '2027-12-31', message: 'Muốn ở thêm 1 năm' });
check(renewalReq.status === 'pending', 'Đề nghị gia hạn ở trạng thái chờ xử lý', renewalReq.status);
await expectError(tApi.post('/api/v1/portal/requests', { tenancyId: anTenancy.id, requestType: 'renewal', desiredOn: '2027-12-31' }), 409, 'request_pending', 'Không gửi trùng đề nghị cùng loại đang chờ');
await expectError(rApi.post('/api/v1/portal/requests', { tenancyId: anTenancy.id, requestType: 'checkout', desiredOn: '2027-01-31' }), 403, 'forbidden', 'Người ở cùng không gửi đề nghị trả phòng');

// ---------------------------------------------------------------- phân quyền: không cấp quyền cao hơn mình
const manager = await login('quan.quanly@example.com');
const ownerRole = (await api.get('/api/v1/roles')).find((x) => x.code === 'owner');
await expectError(manager.api.post('/api/v1/members/invitations', { displayName: 'Thử', email: 'thu.leo.quyen@example.com', roleIds: [ownerRole.id], propertyScope: 'all' }), 403, null, 'Quản lý không mời được người với vai trò chủ trọ');

// ---------------------------------------------------------------- quản trị hệ thống
const admin = await login('admin@smartrent.example.com');
const orgs = await client(admin.token).get('/api/v1/system/organizations');
check(orgs.items.length === 2, 'Quản trị hệ thống thấy 2 đơn vị', orgs.items.length);

// ================================================================ phủ toàn bộ route mock
// Mỗi thao tác dưới đây chạy trên dữ liệu đã thay đổi bởi các bước trên; mục tiêu là mọi route trả kết quả thành công
// ít nhất một lần với dữ liệu hợp lệ (lỗi nghiệp vụ đã kiểm ở phần trước).
const plusDays = (iso, n) => new Date(Date.parse(`${iso}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const inHours = (h) => new Date(Date.now() + h * 3600000).toISOString();
const adminApi = client(admin.token);
const pngData = 'data:image/png;base64,iVBORw0KGgo=';

// Công khai và xác thực
await pub.post('/api/v1/auth/forgot-password', { email: 'bich.oghep@example.com' });
await pub.post('/api/v1/auth/reset-password', { token: 'demo-reset-token', newPassword: DEMO_PASSWORD });
const techA = await login('minh.kythuat@example.com');
const techB = await login('minh.kythuat@example.com');
const techAUser = client(techA.token);
await techAUser.post('/api/v1/auth/refresh', {});
await techAUser.post('/api/v1/me/change-password', { currentPassword: DEMO_PASSWORD, newPassword: 'demo12345' });
await techAUser.post('/api/v1/me/change-password', { currentPassword: 'demo12345', newPassword: DEMO_PASSWORD });
const techC = await login('minh.kythuat@example.com');
const sessions = await techAUser.get('/api/v1/me/sessions');
check(sessions.length === 2, 'Đổi mật khẩu thu hồi các phiên khác', sessions.length);
await techAUser.del(`/api/v1/me/sessions/${sessions.find((x) => !x.isCurrent).id}`);
await techAUser.post('/api/v1/auth/logout', {});
await expectError(client(techB.token).get('/api/v1/me'), 401, null, 'Phiên đã bị thu hồi không dùng được');
void techC;

// Cơ sở, phòng, danh mục
const internet = catalog.chargeTypes.find((c) => c.code === 'INTERNET');
const compensation = catalog.chargeTypes.find((c) => c.code === 'COMPENSATION');
const kt = await api.post('/api/v1/properties', { code: 'KT1', name: 'Cơ sở kiểm thử', address: { line: '1 Đường Thử', locality: 'Quận 1', province: 'TP. Hồ Chí Minh' }, billingSettings: { invoiceDay: 28, dueAfterDays: 7, contractWarningDays: 30 } });
await api.put(`/api/v1/properties/${kt.id}`, { code: 'KT1', name: 'Cơ sở kiểm thử 1', address: { line: '1 Đường Thử', locality: 'Quận 1', province: 'TP. Hồ Chí Minh' } });
await api.post(`/api/v1/properties/${kt.id}/deactivate`, { reason: 'Tạm ngừng để kiểm thử' });
await api.post(`/api/v1/properties/${kt.id}/activate`, {});
await api.post(`/api/v1/properties/${kt.id}/rates/preview`, { chargeTypeId: internet.id });
await api.post(`/api/v1/properties/${kt.id}/rates`, { chargeTypeId: internet.id, effectiveFrom: today, unitPrice: 100000, calculationMethod: 'fixed', billingCycle: 'monthly', reason: 'Giá internet cơ sở mới' });
const k01 = await api.post('/api/v1/rooms', { propertyId: kt.id, roomTypeId: catalog.roomTypes[0].id, code: 'K01', name: 'Phòng K01', areaM2: 20, capacity: 2, requiredDeposit: 2000000, rent: 2500000, meters: { electricity: 'E-K01', water: 'W-K01' } });
const listedNew = (await pub.get('/api/v1/public/rooms', { pageSize: 100 })).items.find((x) => x.roomCode === k01.code);
check(Boolean(listedNew), 'Phòng trống admin vừa tạo hiện ngay ở trang thuê phòng', k01.code);
await api.put(`/api/v1/rooms/${k01.id}`, { roomTypeId: catalog.roomTypes[0].id, code: 'K01', name: 'Phòng K01 hướng sân', areaM2: 21, capacity: 2, requiredDeposit: 2000000 });
await api.post(`/api/v1/rooms/${k01.id}/status`, { status: 'maintenance', reason: 'Sửa điện trước khi đăng tin' });
await api.post(`/api/v1/rooms/${k01.id}/status`, { status: 'available', reason: 'Đã sửa điện xong' });
const img1 = await api.post('/api/v1/files', { fileName: 'k01-1.png', contentType: 'image/png', sizeBytes: 68, visibility: 'public', purpose: 'room_image', dataUrl: pngData });
const img2 = await api.post('/api/v1/files', { fileName: 'k01-2.png', contentType: 'image/png', sizeBytes: 68, visibility: 'public', purpose: 'room_image', dataUrl: pngData });
await api.post(`/api/v1/rooms/${k01.id}/images`, { fileId: img1.id, caption: 'Toàn cảnh' });
const images = await api.post(`/api/v1/rooms/${k01.id}/images`, { fileId: img2.id, caption: 'Cửa sổ' });
await api.patch(`/api/v1/rooms/${k01.id}/images`, { order: [images[1].id, images[0].id], coverImageId: images[1].id });
await api.put(`/api/v1/rooms/${k01.id}/listing`, { title: 'Phòng K01 thoáng mát gần chợ', status: 'published', description: 'Phòng mới sửa.' });
const imagesLeft = await api.del(`/api/v1/rooms/${k01.id}/images/${images[0].id}`);
check(imagesLeft.length === 1 && imagesLeft[0].isCover, 'Xóa ảnh giữ lại ảnh bìa', imagesLeft);
const asset = await api.post(`/api/v1/rooms/${k01.id}/assets`, { code: 'GIUONG', name: 'Giường 1m6', quantity: 1, acquiredOn: today });
await api.put(`/api/v1/rooms/${k01.id}/assets/${asset.id}`, { conditionNotes: 'Mới' });
const roomRate = await api.post(`/api/v1/rooms/${k01.id}/rates`, { chargeTypeId: internet.id, effectiveFrom: today, unitPrice: 0, calculationMethod: 'fixed', billingCycle: 'monthly', reason: 'Tặng internet tháng đầu' });
check(roomRate.rate.unitPrice === 0, 'Giá riêng phòng bằng 0 được chấp nhận', roomRate.rate);
await api.post(`/api/v1/rooms/${k01.id}/rates/${roomRate.rate.id}/end`, { effectiveTo: plusDays(today, 30) });
await api.get(`/api/v1/rooms/${k01.id}/availability`, { from: today, to: plusDays(today, 60) });
const k02 = await api.post('/api/v1/rooms', { propertyId: kt.id, roomTypeId: catalog.roomTypes[0].id, code: 'K02', name: 'Phòng K02', areaM2: 18, capacity: 1, requiredDeposit: 0, rent: 1800000 });
await api.del(`/api/v1/rooms/${k02.id}`);
const kt2 = await api.post('/api/v1/properties', { code: 'KT2', name: 'Cơ sở nhập nhầm', address: { line: '2 Đường Thử', province: 'TP. Hồ Chí Minh' } });
await api.del(`/api/v1/properties/${kt2.id}`);
const rt = await api.post('/api/v1/catalog/room-types', { code: 'KT', name: 'Phòng thử' });
await api.put(`/api/v1/catalog/room-types/${rt.id}`, { name: 'Phòng thử nghiệm' });
const am = await api.post('/api/v1/catalog/amenities', { code: 'BAN-CONG', name: 'Ban công' });
await api.put(`/api/v1/catalog/amenities/${am.id}`, { name: 'Ban công rộng' });
const ct = await api.post('/api/v1/catalog/charge-types', { code: 'PARK', name: 'Gửi xe', category: 'service', unitLabel: 'xe' });
await api.put(`/api/v1/catalog/charge-types/${ct.id}`, { name: 'Gửi xe máy', unitLabel: 'xe' });

// Yêu cầu thuê, lịch xem, giữ chỗ
let q = await api.post('/api/v1/inquiries', { roomId: k01.id, contactName: 'Khách Phòng K', phone: '0900000777', occupants: 1, desiredMoveIn: plusDays(today, 5) });
q = await api.post(`/api/v1/inquiries/${q.id}/transitions`, { action: 'consult', note: 'Khách hỏi về giờ giấc' });
await api.post(`/api/v1/inquiries/${q.id}/events`, { kind: 'call', body: 'Đã gọi tư vấn giá điện nước' });
await api.put(`/api/v1/inquiries/${q.id}/assign`, { userId: owner.me.user.id });
q = await api.post(`/api/v1/inquiries/${q.id}/viewings`, { startsAt: inHours(26), endsAt: inHours(27) });
const viewingResult = await api.post(`/api/v1/viewings/${q.viewings[0].id}/result`, { status: 'completed', resultNotes: 'Khách ưng phòng' });
check(viewingResult.inquiry.status === 'consulting', 'Có kết quả xem phòng thì yêu cầu về tư vấn', viewingResult.inquiry.status);
q = await api.post(`/api/v1/inquiries/${q.id}/tenant`, { fullName: 'Khách Phòng K', phone: '0900000777', confirmNew: true });
const hold = await api.post('/api/v1/reservations', { roomId: k01.id, tenantId: q.tenantId, startsOn: plusDays(today, 3), holdExpiresAt: inHours(48), cancellationTerms: 'Hủy trước 24 giờ được hoàn tiền giữ chỗ.', inquiryId: q.id }, 'smoke-hold-k01');
await api.post(`/api/v1/reservations/${hold.id}/extend`, { holdExpiresAt: inHours(72), reason: 'Khách xin thêm một ngày' });
const cancelled = await api.post(`/api/v1/reservations/${hold.id}/cancel`, { reason: 'Khách đổi ý không thuê' });
check(cancelled.status === 'cancelled', 'Hủy giữ chỗ giải phóng lịch', cancelled.status);

// Khách thuê, giấy tờ, đề nghị sửa hồ sơ
await api.put(`/api/v1/tenants/${newTenant.id}`, { fullName: 'Khách Kiểm Thử', phone: '0900000888', email: 'kiemthu@example.com', addressLine: '12 Đường Thử', locality: 'Quận 3' });
const withDoc = await api.post(`/api/v1/tenants/${newTenant.id}/identity-documents`, { documentType: 'cccd', number: '079200001234', issuedOn: '2021-05-01' });
await api.post(`/api/v1/tenants/${newTenant.id}/identity-documents/${withDoc.identityDocuments[0].id}/verify`, {});
await api.post(`/api/v1/tenants/${newTenant.id}/portal-invitation`, {});
const anTenantId = overview.tenancies.find((x) => x.role === 'representative').representative.id;
await api.post(`/api/v1/tenants/${anTenantId}/password-reset-link`, {});
// Dữ liệu mẫu đã có một đề nghị chờ duyệt của An: duyệt đề nghị đó rồi mới gửi đề nghị mới (mỗi khách một đề nghị chờ).
const seedPcr = (await tApi.get('/api/v1/portal/profile')).profiles[0].changeRequests.find((x) => x.status === 'pending');
await expectError(tApi.post('/api/v1/portal/profile-change-requests', { changes: { phone: '0901999888' } }), 409, 'pending_request_exists', 'Không gửi đề nghị sửa hồ sơ thứ hai khi còn đề nghị chờ');
await api.post(`/api/v1/profile-change-requests/${seedPcr.id}/approve`, { reviewNotes: 'Đã gọi xác nhận' });
const pcr1 = await tApi.post('/api/v1/portal/profile-change-requests', { changes: { phone: '0901999888' }, reason: 'Đổi số điện thoại' });
await tApi.post(`/api/v1/portal/profile-change-requests/${pcr1.id}/cancel`, {});
const pcr3 = await tApi.post('/api/v1/portal/profile-change-requests', { changes: { email: 'an.moi@example.com' } });
await api.post(`/api/v1/profile-change-requests/${pcr3.id}/reject`, { reviewNotes: 'Chưa xác minh được email mới' });

// Đợt thuê: người ở cùng, nhập hợp đồng cho đợt thiếu hồ sơ, đề nghị từ khách
const roommate = await api.post('/api/v1/tenants', { fullName: 'Người Ở Cùng Thử', phone: '0900000666' });
const withResident = await api.post(`/api/v1/tenancies/${checkin.id}/residents`, { tenantId: roommate.id, joinedOn: today, relationship: 'Bạn' });
await api.post(`/api/v1/tenancies/${checkin.id}/residents/${withResident.residents.find((x) => x.tenant.id === roommate.id).id}/leave`, { leftOn: plusDays(today, 1) });
const son = (await api.get('/api/v1/tenancies', { q: 'C201' })).items.find((t) => t.status === 'active');
const sonDetail = await api.get(`/api/v1/tenancies/${son.id}`);
const imported = await api.post(`/api/v1/tenancies/${son.id}/contracts`, {
  effectiveFrom: sonDetail.actualMoveIn,
  contract: { endsOn: '2027-06-01', requiredDeposit: 2500000, invoiceDay: 28, dueAfterDays: 7, prorationPolicy: 'actual_days', termsText: 'Hợp đồng giấy nhập lại', rates: [{ chargeTypeId: rent.id, unitPrice: 2500000 }] },
  signature: { signatureMethod: 'paper', signedAt: new Date().toISOString(), signedFileId: signedFile.id },
}, 'smoke-import-son');
const openGap = imported.onboardingGaps.find((g) => !g.resolvedAt);
if (openGap) await api.post(`/api/v1/tenancies/${son.id}/onboarding-gaps/${openGap.id}/resolve`, { notes: 'Đã bổ sung giấy tờ' });
else check(imported.onboardingGaps.every((g) => g.resolvedAt), 'Nhập hợp đồng hoàn thiện mục hồ sơ thiếu');
await api.post(`/api/v1/tenancy-requests/${renewalReq.id}/approve`, { decisionNotes: 'Đồng ý, sẽ lập phụ lục' });
const checkoutReq = await tApi.post('/api/v1/portal/requests', { tenancyId: anTenancy.id, requestType: 'checkout', desiredOn: plusDays(today, 20) }, 'smoke-req-checkout');
await api.post(`/api/v1/tenancy-requests/${checkoutReq.id}/reject`, { decisionNotes: 'Cần báo trước 30 ngày theo hợp đồng' });
const transferReq = await tApi.post('/api/v1/portal/requests', { tenancyId: anTenancy.id, requestType: 'transfer', desiredOn: plusDays(today, 10), targetRoomId: portalCatalog.transferTargets.find((r) => r.code !== 'A101').id }, 'smoke-req-transfer');
await tApi.post(`/api/v1/portal/requests/${transferReq.id}/cancel`, {});

// Hợp đồng: phiên bản nháp, tệp, xóa bản nháp, chấm dứt, lưu trữ, hợp đồng kế tiếp
const v3 = await api.post(`/api/v1/contracts/${contractA201.id}/versions`, { effectiveFrom: '2027-11-01', endsOn: '2028-11-01', requiredDeposit: 3600000, invoiceDay: 28, dueAfterDays: 7, prorationPolicy: 'actual_days', termsText: 'Gia hạn lần 2', changeReason: 'Gia hạn', rates: [{ chargeTypeId: rent.id, unitPrice: 3900000 }] });
const v3Draft = v3.versions.find((x) => !x.isSigned);
await api.put(`/api/v1/contracts/${contractA201.id}/versions/${v3Draft.id}`, { effectiveFrom: '2027-11-01', endsOn: '2028-11-01', requiredDeposit: 3600000, invoiceDay: 28, dueAfterDays: 7, prorationPolicy: 'actual_days', termsText: 'Gia hạn lần 2 (sửa)', changeReason: 'Gia hạn', rates: [{ chargeTypeId: rent.id, unitPrice: 3850000 }] });
await api.post(`/api/v1/contracts/${contractA201.id}/versions/${v3Draft.id}/files`, { fileKind: 'draft', fileId: signedFile.id });
await api.del(`/api/v1/contracts/${contractA201.id}/versions/${v3Draft.id}`);
const c101Contract = (await api.get('/api/v1/contracts', { q: 'C101' })).items[0];
const terminated = await api.post(`/api/v1/contracts/${c101Contract.id}/terminate`, { terminatedOn: plusDays(today, 30), reason: 'Khách báo chấm dứt sớm' });
check(Boolean(terminated.warning), 'Chấm dứt hợp đồng khi khách còn ở có cảnh báo, không tự trả phòng', terminated.warning);
const b102Contract = (await api.get('/api/v1/contracts', { q: 'B102' })).items.find((k) => ['terminated', 'expired'].includes(k.status));
await api.post(`/api/v1/contracts/${b102Contract.id}/archive`, {});
const checkinContract = (await api.get('/api/v1/contracts', { q: 'A204' })).items.find((k) => k.tenancyId === checkin.id);
const successor = await api.post(`/api/v1/contracts/${checkinContract.id}/successor`, { effectiveFrom: '2027-10-21', endsOn: '2028-10-21', requiredDeposit: 3100000, invoiceDay: 28, dueAfterDays: 7, prorationPolicy: 'actual_days', termsText: 'Hợp đồng kế tiếp', changeReason: 'Ký mới khi hết hạn', rates: [{ chargeTypeId: rent.id, unitPrice: 3200000 }] });
await expectError(api.del(`/api/v1/contracts/${checkinContract.id}`), 409, 'contract_signed', 'Không xóa hợp đồng đã ký');
await api.get(`/api/v1/contracts/${successor.id}`);
await api.del(`/api/v1/contracts/${successor.id}`);

// Kỳ, chỉ số, thay công tơ
const ktPeriod = await api.post('/api/v1/billing-periods', { propertyId: kt.id, monthStart: `${today.slice(0, 7)}-01` });
await api.post(`/api/v1/billing-periods/${ktPeriod.id}/lock`, { acknowledgeIncomplete: true, reason: 'Khóa thử kỳ cơ sở mới' });
await api.post(`/api/v1/billing-periods/${ktPeriod.id}/unlock`, { reason: 'Mở lại để kiểm thử' });
const a204 = await api.get(`/api/v1/tenancies/${checkin.id}`);
const a204E = a204.meters.find((m) => m.meterKind === 'electricity');
const single = await api.post('/api/v1/meter-readings', { meterId: a204E.id, readingValue: a204E.lastReading.value + 5, observedAt: new Date().toISOString(), billingPeriodId: btOct.id });
await api.post(`/api/v1/meter-readings/${single.id}/correct`, { readingValue: a204E.lastReading.value + 4, reason: 'Ghi nhầm một số' });
await api.post(`/api/v1/meters/${a204E.id}/replace`, { replacedAt: new Date().toISOString(), oldFinalValue: a204E.lastReading.value + 6, newSerialNumber: 'E-A204-NEW', newInitialValue: 0, reason: 'Công tơ cũ hỏng' }, 'smoke-replace-a204');

// Hóa đơn: nháp tính lại/sửa/xóa, phát sinh riêng, gửi, hủy, thay thế, chạy lại lô
const a204Draft = await api.post('/api/v1/invoices/drafts', { tenancyId: checkin.id, periodId: btOct.id, kind: 'periodic' }, 'smoke-a204-draft');
await api.post(`/api/v1/invoices/${a204Draft.id}/recompute`, {});
await api.put(`/api/v1/invoices/${a204Draft.id}`, { notes: 'Ghi chú thử', manualLines: [{ description: 'Phí gửi xe', amount: 100000 }] });
await api.del(`/api/v1/invoices/${a204Draft.id}`);
const oneTime = await api.post('/api/v1/invoices/drafts', { tenancyId: checkin.id, kind: 'one_time', serviceOn: today, lines: [{ description: 'Bồi thường ổ khóa', amount: 150000, chargeTypeId: compensation.id }] }, 'smoke-onetime-1');
await api.post(`/api/v1/invoices/${oneTime.id}/issue`, {}, 'smoke-onetime-1-issue');
await api.post(`/api/v1/invoices/${oneTime.id}/send`, { template: 'invoice_issued' });
await api.post(`/api/v1/invoices/${oneTime.id}/void`, { reason: 'Lập nhầm số tiền' });
const replacement = await api.post(`/api/v1/invoices/${oneTime.id}/replacement`, {});
check(replacement.kind === 'replacement' && replacement.status === 'draft', 'Hóa đơn thay thế bắt đầu ở trạng thái nháp', replacement.kind);
const openOneTime = await api.post('/api/v1/invoices/drafts', { tenancyId: checkin.id, kind: 'one_time', serviceOn: today, lines: [{ description: 'Phí làm thẻ từ', amount: 400000 }] }, 'smoke-onetime-2');
await api.post(`/api/v1/invoices/${openOneTime.id}/issue`, {}, 'smoke-onetime-2-issue');
await api.post(`/api/v1/invoice-batches/${batchResult.id}/retry`, {});
await api.get(`/api/v1/invoice-batches/${batchResult.id}`);

// Thu tiền: từ chối, ghi xác nhận ngay, phân bổ, đảo phân bổ, hoàn tiền
const toReject = await api.post('/api/v1/payments', { tenantId: newTenant.id, amount: 200000, receivedAt: new Date().toISOString(), methodCode: 'cash', notes: 'Thu hộ' }, 'smoke-pay-reject');
await api.post(`/api/v1/payments/${toReject.id}/reject`, { reason: 'Không nhận được tiền mặt' });
const direct = await api.post('/api/v1/payments', { tenantId: newTenant.id, amount: 300000, receivedAt: new Date().toISOString(), methodCode: 'bank_transfer', externalReference: 'FT-COV-01', confirmNow: true }, 'smoke-pay-direct');
check(direct.status === 'confirmed' && direct.unappliedAmount === 300000, 'Ghi xác nhận ngay, chưa phân bổ', direct);
const allocated = await api.post(`/api/v1/payments/${direct.id}/allocations`, { allocations: [{ invoiceId: openOneTime.id, amount: 100000 }] }, 'smoke-pay-alloc');
await api.post(`/api/v1/payment-allocations/${allocated.allocations[0].id}/reverse`, { amount: 50000, reason: 'Phân bổ nhầm số tiền' }, 'smoke-alloc-reverse');
const refunded = await api.post(`/api/v1/payments/${direct.id}/reversals`, { kind: 'refund', amount: 100000, reason: 'Hoàn tiền thừa cho khách', methodCode: 'cash' }, 'smoke-pay-refund');
check(refunded.reversedAmount === 100000, 'Hoàn tiền bằng bút toán đảo', refunded.reversedAmount);

// Cọc: bổ sung, hoàn, bù trừ, chuyển
await api.post(`/api/v1/tenancies/${checkin.id}/deposit/receipts`, { amount: 1100000, payment: { receivedAt: new Date().toISOString(), methodCode: 'cash' }, reason: 'Bổ sung cọc cho đủ hợp đồng' }, 'smoke-dep-receipt');
await api.post(`/api/v1/tenancies/${checkin.id}/deposit/refunds`, { amount: 100000, methodCode: 'cash', reason: 'Hoàn phần cọc thu dư' }, 'smoke-dep-refund');
const afterOffset = await api.post(`/api/v1/tenancies/${checkin.id}/deposit/offsets`, { invoiceId: openOneTime.id, amount: 100000, reason: 'Khách đồng ý trừ vào cọc' }, 'smoke-dep-offset');
check(afterOffset.heldAmount === 2900000 && afterOffset.requiredDeposit === 3100000 && afterOffset.shortfall === 200000, 'Sổ cọc: 2.000.000 + 1.100.000 − 100.000 hoàn − 100.000 bù trừ; vẫn thiếu 200.000 so với hợp đồng', afterOffset);
await api.post(`/api/v1/tenancies/${transfer.newTenancy.id}/deposit/transfers`, { toTenancyId: b201.id, amount: 100000, reason: 'Điều chỉnh chuyển cọc thừa khi chuyển phòng' }, 'smoke-dep-transfer');

// Ticket, thông báo
const ticketCat = catalog.ticketCategories[0];
const staffTicket = await api.post('/api/v1/tickets', { roomId: k01.id, categoryId: ticketCat.id, title: 'Kiểm tra ổ điện trước khi cho thuê', description: 'Ổ điện tường phía bắc', priority: 'low' }, 'smoke-ticket-k01');
const membersList = await api.get('/api/v1/members', { pageSize: 50 });
const techMember = membersList.items.find((m) => m.user.email === 'minh.kythuat@example.com');
await api.post(`/api/v1/tickets/${staffTicket.id}/assign`, { userId: techMember.user.id, note: 'Nhờ kiểm tra trong tuần' });
const myNotifications = await api.get('/api/v1/notifications', { unread: 'true' });
if (myNotifications.items[0]) await api.post(`/api/v1/notifications/${myNotifications.items[0].id}/read`, {});
await api.post('/api/v1/notifications/read-all', {});
check((await api.get('/api/v1/notifications/unread-count')).unreadCount === 0, 'Đánh dấu đã đọc tất cả');

// Nhân sự, vai trò
const roles = await api.get('/api/v1/roles');
const staffRole = roles.find((x) => x.code === 'staff');
const invited = await api.post('/api/v1/members/invitations', { displayName: 'Nhân sự mới', email: 'nhansu.moi@example.com', roleIds: [staffRole.id], propertyScope: 'assigned', propertyIds: [kt.id] });
await api.put(`/api/v1/members/${invited.id}`, { roleIds: [staffRole.id], propertyScope: 'all' });
await api.post(`/api/v1/members/${invited.id}/resend-invitation`, {});
await api.post(`/api/v1/members/${techMember.id}/suspend`, { reason: 'Nghỉ phép dài hạn' });
await api.post(`/api/v1/members/${techMember.id}/activate`, {});
const accountant = await api.post('/api/v1/roles', { code: 'ke-toan', name: 'Kế toán', permissions: ['invoices.read', 'payments.read'] });
await api.put(`/api/v1/roles/${accountant.id}`, { name: 'Kế toán', permissions: ['invoices.read', 'payments.read', 'reports.read'] });

// Cấu hình, tác vụ nền, xuất, tích hợp
const orgSettings = await api.get('/api/v1/settings/organization');
await api.put('/api/v1/settings/organization', { name: orgSettings.name, phone: orgSettings.phone, email: orgSettings.email, settings: { dailyJobTime: '07:30', retentionDays: 365, contractWarningDays: 30 } });
await api.put('/api/v1/settings/email', { host: 'smtp.example.com', port: 587, securityMode: 'starttls', fromAddress: 'no-reply@example.com', fromName: 'SmartRent', password: 'mat-khau-demo' });
const emailTest = await api.post('/api/v1/settings/email/test', { toEmail: 'ha.chutro@example.com' });
check(emailTest.simulated && emailTest.result === 'simulated_ok', 'Gửi thử email là mô phỏng', emailTest);
check(!('password' in (await api.get('/api/v1/settings/email'))), 'Mật khẩu SMTP không trả về giao diện');
const templates = await api.get('/api/v1/settings/templates');
await api.put(`/api/v1/settings/templates/${templates[0].id}`, { subject: templates[0].subject, body: `${templates[0].body}\nTrân trọng.`, isActive: true });
const ruleRow = await api.post('/api/v1/settings/reminder-rules', { eventType: 'invoice_due', dayOffset: -2, templateId: templates[0].id, isEnabled: true });
await api.put(`/api/v1/settings/reminder-rules/${ruleRow.id}`, { isEnabled: false });
await api.post('/api/v1/jobs/expire_reservations/run', {});
await api.post('/api/v1/jobs/daily_reminders/run', { force: true });
const failedDelivery = (await api.get('/api/v1/deliveries', { status: 'failed' })).items[0];
if (failedDelivery) await api.post(`/api/v1/deliveries/${failedDelivery.id}/retry`, {});
await api.post('/api/v1/exports', { kind: 'invoices', format: 'csv', filters: { status: 'issued' }, rowCount: 12 });
const integrations = await api.get('/api/v1/integrations');
await api.put(`/api/v1/integrations/${integrations[0].id}`, { provider: 'Ngân hàng demo', settings: { webhookUrl: 'https://example.com/hook' }, apiKey: 'khoa-demo' });
const integrationTest = await api.post(`/api/v1/integrations/${integrations[0].id}/test`, {});
check(integrationTest.simulated && !integrationTest.ok, 'Kiểm tra tích hợp báo chưa kết nối thật', integrationTest);

// Chi phí, AI
const expense = await api.post('/api/v1/expenses', { propertyId: kt.id, categoryId: catalog.expenseCategories[0].id, amount: 250000, incurredOn: today, description: 'Mua bóng đèn' }, 'smoke-expense-1');
await api.post(`/api/v1/expenses/${expense.id}/reverse`, { reason: 'Ghi nhầm cơ sở' });
const conv = await api.post('/api/v1/ai/conversations', { title: 'Cuộc hỏi mới' });
const answered = await api.post(`/api/v1/ai/conversations/${conv.id}/messages`, { content: 'Những hóa đơn nào quá hạn?' });
check(answered.messages.some((m) => m.role === 'assistant' && /quá hạn/.test(m.content)), 'Trợ lý mô phỏng trả lời theo phạm vi', answered.messages.length);
await api.get(`/api/v1/ai/conversations/${conv.id}`);

// Cổng khách: mở lại ticket rồi trao đổi
await tApi.post(`/api/v1/portal/tickets/${pTicket.id}/reopen`, { reason: 'Ổ cắm lại lỏng sau hai ngày' });
await tApi.post(`/api/v1/portal/tickets/${pTicket.id}/messages`, { body: 'Tối nay em có nhà' });

// Quản trị hệ thống, quyền hỗ trợ
const newOrg = await adminApi.post('/api/v1/system/organizations', { code: 'KTHU', name: 'Đơn vị kiểm thử', ownerName: 'Chủ Thử', ownerEmail: 'chu.thu@example.com' });
check(newOrg.propertyCount === 0 && newOrg.memberCount === 0, 'Đơn vị mới không có dữ liệu mẫu', newOrg);
await adminApi.post(`/api/v1/system/organizations/${newOrg.id}/suspend`, { reason: 'Tạm ngừng để kiểm thử' });
await adminApi.post(`/api/v1/system/organizations/${newOrg.id}/activate`, {});
const sysUsers = await adminApi.get('/api/v1/system/users', { q: 'chu.thu' });
await adminApi.post(`/api/v1/system/users/${sysUsers.items[0].id}/lock`, { reason: 'Khóa để kiểm thử' });
await adminApi.post(`/api/v1/system/users/${sysUsers.items[0].id}/unlock`, {});
await adminApi.post('/api/v1/system/backups', { kind: 'backup' });
const grant = await api.post('/api/v1/support-access', { reason: 'Nhờ hỗ trợ kiểm tra báo cáo', hours: 2 });
await api.post(`/api/v1/support-access/${grant.id}/revoke`, {});

// GET còn lại: danh sách không tham số theo đúng đối tượng gọi, rồi chi tiết theo ID thật.
const byAuth = { public: pub, tenant: tApi, system: adminApi, user: api, staff: api };
for (const route of ROUTES.filter((x) => x.method === 'GET' && !x.path.includes(':') && !hit.has(x.key))) await byAuth[route.auth].get(route.path, { pageSize: 5 });
const firstId = async (listPath, field = 'id', who = api) => {
  const res = await who.get(listPath, { pageSize: 1 });
  return (Array.isArray(res) ? res : res.items)[0]?.[field];
};
const detailCalls = {
  'GET /api/v1/handovers/:id': async () => api.get(`/api/v1/handovers/${await firstId('/api/v1/handovers')}`),
  'GET /api/v1/reservations/:id': async () => api.get(`/api/v1/reservations/${hold.id}`),
  'GET /api/v1/meters/:id/readings': async () => api.get(`/api/v1/meters/${a204E.id}/readings`),
  'GET /api/v1/tenancies/:id/deposit': async () => api.get(`/api/v1/tenancies/${checkin.id}/deposit`),
  'GET /api/v1/billing-periods/:id': async () => api.get(`/api/v1/billing-periods/${btOct.id}`),
  'GET /api/v1/payments/:id': async () => api.get(`/api/v1/payments/${direct.id}`),
  'GET /api/v1/properties/:id': async () => api.get(`/api/v1/properties/${kt.id}`),
  'GET /api/v1/inquiries/:id': async () => api.get(`/api/v1/inquiries/${q.id}`),
  'GET /api/v1/tenants/:id': async () => api.get(`/api/v1/tenants/${newTenant.id}`),
  'GET /api/v1/tickets/:id': async () => api.get(`/api/v1/tickets/${staffTicket.id}`),
  'GET /api/v1/portal/tenancies/:id': async () => tApi.get(`/api/v1/portal/tenancies/${anTenancy.id}`),
  'GET /api/v1/portal/invoices/:id': async () => tApi.get(`/api/v1/portal/invoices/${portalInvoices.items[0].id}`),
  'GET /api/v1/tenants/duplicates': async () => api.get('/api/v1/tenants/duplicates', { phone: '0900000888' }),
};
for (const [key, run] of Object.entries(detailCalls)) if (!hit.has(key)) await run();

// ---------------------------------------------------------------- luồng quản trị: cơ sở → phòng → hợp đồng → tính tiền → hóa đơn
{
resetData();
const boss = await login('ha.chutro@example.com');
const a2 = boss.api;
const catalog2 = await a2.get('/api/v1/catalog');
const chargeId = (code) => catalog2.chargeTypes.find((c) => c.code === code).id;
const rateList = (pairs) => pairs.map(([code, unitPrice]) => ({ chargeTypeId: chargeId(code), unitPrice }));

const prop = await a2.post('/api/v1/properties', { name: 'Nhà trọ Kiểm Thử', address: { line: '1 Đường A', province: 'TP. Hồ Chí Minh' }, rates: rateList([['ELECTRICITY', 3900], ['WATER', 18000], ['GARBAGE', 25000], ['SERVICE', 0]]) });
check(prop.code === 'NTKT', 'Cơ sở không nhập mã được sinh mã từ tên', prop.code);
check(prop.prices.ELECTRICITY === 3900 && prop.prices.SERVICE === 0, 'Cơ sở lưu bảng giá, giá 0 hợp lệ', prop.prices);
const repriced = await a2.put(`/api/v1/properties/${prop.id}`, { code: prop.code, name: prop.name, address: prop.address, rates: rateList([['ELECTRICITY', 4100]]) });
check(repriced.prices.ELECTRICITY === 4100, 'Đổi giá cơ sở trong ngày tạo vẫn áp dụng ngay', repriced.prices);
const again = await a2.put(`/api/v1/properties/${prop.id}`, { code: prop.code, name: prop.name, address: prop.address, rates: rateList([['ELECTRICITY', 4000]]) });
check(again.prices.ELECTRICITY === 4000, 'Sửa giá lần hai trong ngày không báo chồng giá', again.prices);

const type = catalog2.roomTypes[0].id;
const newRoom = await a2.post('/api/v1/rooms', {
  propertyId: prop.id, roomTypeId: type, code: 'p101', name: 'Phòng P101', areaM2: 20, capacity: 2, requiredDeposit: 3000000, rent: 3000000, operatingStatus: 'maintenance',
  rates: rateList([['ELECTRICITY', 4000], ['WATER', 20000]]),
});
const scopeOf = (room, code) => room.rates.effective.find((r) => r.chargeType.code === code)?.scope;
check(newRoom.code === 'P101' && newRoom.operatingStatus === 'maintenance', 'Phòng mới nhận trạng thái chọn trong form', newRoom.operatingStatus);
check(scopeOf(newRoom, 'ELECTRICITY') === 'property' && scopeOf(newRoom, 'WATER') === 'room', 'Giá trùng cơ sở là kế thừa, giá khác là giá riêng', newRoom.rates.effective.map((r) => [r.chargeType.code, r.scope]));
check(newRoom.meters.length === 2, 'Phòng mới tự có công tơ điện và nước', newRoom.meters.length);
await a2.post(`/api/v1/rooms/${newRoom.id}/status`, { status: 'available', reason: 'Đã bảo trì xong' });
const reRoom = await a2.put(`/api/v1/rooms/${newRoom.id}`, { roomTypeId: type, code: 'P101', name: 'Phòng P101', areaM2: 20, capacity: 2, requiredDeposit: 3000000, rent: 3200000, rates: rateList([['WATER', 18000]]) });
check(reRoom.currentRent === 3200000, 'Sửa phòng đổi được giá thuê', reRoom.currentRent);
check(scopeOf(reRoom, 'WATER') === 'property', 'Sửa về đúng giá cơ sở thì phòng quay lại kế thừa', reRoom.rates.effective.map((r) => [r.chargeType.code, r.scope]));

const tenantNew = await a2.post('/api/v1/tenants', { fullName: 'Khách Luồng Mới', phone: '0900000777' });
const pdf = { contentType: 'application/pdf', sizeBytes: 1000, dataUrl: 'data:application/pdf;base64,AA==', visibility: 'private', purpose: 'contract_signed' };
const fileA = await a2.post('/api/v1/files', { ...pdf, fileName: 'ban-ky.pdf' });
const fileB = await a2.post('/api/v1/files', { ...pdf, fileName: 'phu-luc.pdf' });
const tenancyNew = await a2.post('/api/v1/tenancies/check-in', {
  mode: 'new', roomId: newRoom.id, tenantId: tenantNew.id, moveInOn: today, confirm: true,
  contract: { endsOn: '2027-10-21', requiredDeposit: 3000000, invoiceDay: 28, dueAfterDays: 7, prorationPolicy: 'actual_days', termsText: 'Điều khoản', rates: reRoom.rates.effective.map((r) => ({ chargeTypeId: r.chargeType.id, unitPrice: r.unitPrice, calculationMethod: r.calculationMethod, billingCycle: r.billingCycle, prorationMode: r.prorationMode })) },
  signature: { signatureMethod: 'paper', signedAt: new Date().toISOString(), signedFileId: fileA.id }, readings: { electricity: 100, water: 10 }, deposit: { amount: 3000000, methodCode: 'cash' },
});
const contractId = tenancyNew.contracts[0].id;
const withFile = await a2.post(`/api/v1/contracts/${contractId}/attachments`, { fileId: fileB.id, note: 'Phụ lục' });
check(withFile.attachments.length === 1 && withFile.deposit.held === 3000000 && withFile.tenant.id === tenantNew.id && withFile.roomInfo.id === newRoom.id, 'Hợp đồng liên kết khách, phòng, cọc và tệp bổ sung', withFile.deposit);
const noFile = await a2.del(`/api/v1/contracts/${contractId}/attachments/${withFile.attachments[0].id}`);
check(noFile.attachments.length === 0 && noFile.versions[0].files.length === 1, 'Xóa tệp bổ sung không đụng bản đã ký');

const period = await a2.post('/api/v1/billing-periods', { propertyId: prop.id, monthStart: `${today.slice(0, 7)}-01` });
const sheet1 = await a2.get(`/api/v1/billing-periods/${period.id}/worksheet`);
const row1 = sheet1.rows[0];
check(row1.group === 'missing_readings' && row1.readings.electricity.previous.value === 100, 'Bảng tính tiền hiện số tháng trước và báo chưa nhập số', row1.group);
check(row1.estimate.unitPrices.electricity === 4000 && row1.estimate.total === null, 'Chưa đủ số thì chưa có tổng tạm tính', row1.estimate);
await a2.post('/api/v1/meter-readings/batch', { billingPeriodId: period.id, items: [{ meterId: row1.readings.electricity.meterId, readingValue: 150, observedAt: new Date().toISOString() }, { meterId: row1.readings.water.meterId, readingValue: 15, observedAt: new Date().toISOString() }] }, 'smoke-batch');
const sheet2 = await a2.get(`/api/v1/billing-periods/${period.id}/worksheet`);
const row2 = sheet2.rows[0];
check(row2.group === 'ready' && row2.estimate.total > 0, 'Đủ số thì sẵn sàng tạo hóa đơn và có tạm tính', row2.group);
const batch = await a2.post('/api/v1/invoice-batches', { periodId: period.id, action: 'issue', tenancyIds: [row2.tenancy.id] }, 'smoke-issue');
check(batch.summary.succeeded === 1 && batch.items[0].invoice.totalAmount === row2.estimate.total, 'Tạo hóa đơn: tổng khớp tạm tính', { est: row2.estimate.total, got: batch.items[0].invoice?.totalAmount });
const issued = batch.items[0].invoice;

const listed = await a2.get('/api/v1/invoices', { q: issued.code, outstanding: 'true' });
check(listed.items.length === 1 && listed.summary.outstandingAmount === issued.totalAmount, 'Danh sách hóa đơn có tổng trên toàn tập lọc', listed.summary);
const pendingList = await a2.get('/api/v1/invoices', { hasPending: 'true', pageSize: 50 });
check(pendingList.items.length >= 1 && pendingList.items.every((i) => i.pendingPaymentCount > 0), 'Lọc được hóa đơn có khoản chờ xác minh', pendingList.items.length);

await a2.post('/api/v1/payments', { tenantId: tenantNew.id, amount: 100000, receivedAt: new Date().toISOString(), methodCode: 'cash', confirmNow: true, allocations: [{ invoiceId: issued.id, amount: 100000 }] }, 'smoke-pay');
const afterPart = await a2.get(`/api/v1/invoices/${issued.id}`);
check(afterPart.paymentStatus === 'partial' && afterPart.paidAmount === 100000, 'Ghi nhận thanh toán một phần', afterPart.paymentStatus);
await expectError(a2.post(`/api/v1/invoices/${issued.id}/void`, { reason: 'Thử hủy khi đã thu tiền' }), 422, 'invoice_has_allocations', 'Hóa đơn đã có khoản thu không hủy thẳng được');
const undone = await a2.post(`/api/v1/payment-allocations/${afterPart.allocations[0].id}/reverse`, { amount: 100000, reason: 'Ghi nhận nhầm', reversePayment: true }, 'smoke-undo');
const afterUndo = await a2.get(`/api/v1/invoices/${issued.id}`);
check(afterUndo.paymentStatus === 'unpaid' && undone.unappliedAmount === 0, 'Hoàn tác trả hóa đơn về chưa thu, không còn tiền chưa phân bổ ảo', { status: afterUndo.paymentStatus, unapplied: undone.unappliedAmount });

const anTenant = (await a2.get('/api/v1/tenants', { q: 'Nguyễn Văn An' })).items[0];
await expectError(a2.post(`/api/v1/tenants/${tenantNew.id}/password`, { newPassword: 'matkhaumoi1' }), 422, 'no_portal_account', 'Khách chưa có tài khoản thì chưa đổi mật khẩu được');
await expectError(a2.post(`/api/v1/tenants/${anTenant.id}/password`, { newPassword: 'ngan' }), 422, 'validation_failed', 'Mật khẩu mới quá ngắn bị chặn');
await a2.post(`/api/v1/tenants/${anTenant.id}/password`, { newPassword: 'matkhaumoi1' });
await expectError(client().post('/api/v1/auth/login', { email: 'an.khachthue@example.com', password: DEMO_PASSWORD }), 401, 'invalid_credentials', 'Mật khẩu cũ của khách hết hiệu lực');
const anLogin = await client().post('/api/v1/auth/login', { email: 'an.khachthue@example.com', password: 'matkhaumoi1' });
check(Boolean(anLogin.accessToken), 'Khách đăng nhập bằng mật khẩu mới');

const me2 = await a2.put('/api/v1/me/profile', { displayName: 'Trần Thu Hà', email: 'ha.chutro@example.com', phone: '0912345678' });
check(me2.user.phone === '0912345678', 'Admin cập nhật thông tin tài khoản', me2.user.phone);
check((await pub.get('/api/v1/public/contact-info')).organizations[0].phone === '0912345678', 'Đổi điện thoại ở Cài đặt admin hiện ngay ở trang Liên hệ');
await expectError(a2.put('/api/v1/me/profile', { displayName: 'Trần Thu Hà', email: 'quan.quanly@example.com' }), 409, 'email_taken', 'Email đã thuộc tài khoản khác bị chặn');

const sched = await a2.get('/api/v1/settings/billing-schedule');
check(sched.meterReadingDay === 25 && sched.invoiceCreateDay === 28, 'Đọc lịch nhắc tính tiền', sched);
await expectError(a2.put('/api/v1/settings/billing-schedule', { meterReadingDay: 28, invoiceCreateDay: 20, reminderEnabled: true }), 422, 'validation_failed', 'Ngày tạo hóa đơn trước ngày nhập số bị chặn');
const sched2 = await a2.put('/api/v1/settings/billing-schedule', { meterReadingDay: 1, invoiceCreateDay: 2, reminderEnabled: true });
const dash2 = await a2.get('/api/v1/dashboard');
check(sched2.meterReadingDay === 1 && dash2.billing.schedule.readingDue === (dash2.billing.missingReadings > 0), 'Tới ngày nhập số thì Tổng quan nhắc', dash2.billing.schedule);
check(dash2.billing.tenancyCount >= dash2.billing.invoiced + dash2.billing.missingReadings && dash2.rooms.strip.every((x) => x.propertyName), 'Tổng quan có tiến độ tính tiền và sơ đồ phòng', dash2.billing);

// Phòng đã có khách từ trước: chọn "Đã thuê" ở form phòng. Không tạo hợp đồng giả, phòng đã thuê nhưng chưa phát hành được hóa đơn.
const roomBody = (code) => ({ propertyId: prop.id, code, name: `Phòng ${code}`, areaM2: 20, capacity: 2, requiredDeposit: 3000000, rent: 3000000, rates: [] });
const stayer = await a2.post('/api/v1/tenants', { fullName: 'Khách Đang Ở', phone: '0900000778' });
const mover = await a2.post('/api/v1/tenants', { fullName: 'Khách Gỡ Nhầm', phone: '0900000779' });
const rented = await a2.post('/api/v1/rooms', { ...roomBody('P201'), occupant: { tenantId: stayer.id, moveInOn: '2026-06-01', readings: { electricity: 1200, water: 55 } } });
check(rented.occupancyStatus === 'occupied' && rented.currentTenancy.representative.id === stayer.id && rented.currentTenancy.onboardingMode === 'import' && !rented.currentTenancy.hasContract, 'Chọn Đã thuê gán khách vào phòng, không tạo hợp đồng', rented.currentTenancy);
check(rented.roomType.code === 'STANDARD' && (await a2.get('/api/v1/rooms', { contract: 'missing', propertyId: prop.id })).items.some((x) => x.id === rented.id), 'Phòng không chọn loại nhận loại tiêu chuẩn, lọc được phòng chưa có hợp đồng', rented.roomType);
check((await a2.get('/api/v1/dashboard')).tasks.some((t) => t.key === 'missing_contracts' && t.count >= 1), 'Tổng quan nhắc phòng đã thuê chưa có hợp đồng');
await expectError(a2.post('/api/v1/rooms', { ...roomBody('P202'), occupant: { tenantId: stayer.id, moveInOn: '2026-06-01' } }), 409, 'tenant_has_tenancy', 'Khách đang thuê phòng khác thì không gán được');
check(!(await a2.get('/api/v1/rooms', { propertyId: prop.id, q: 'P202' })).items.length, 'Gán khách lỗi thì phòng mới không bị tạo dở');
await expectError(a2.post('/api/v1/rooms', { ...roomBody('P203'), occupant: { tenantId: mover.id, moveInOn: '2027-01-01' } }), 422, 'validation_failed', 'Ngày vào ở ở tương lai bị chặn');

const stayDetail = await a2.get(`/api/v1/tenancies/${rented.currentTenancy.id}`);
check(stayDetail.meters.every((m) => m.hasBaseline) && stayDetail.onboardingGaps.length === 3, 'Khách đang ở có số đầu và danh sách hồ sơ thiếu', stayDetail.onboardingGaps);
const stayFile = await a2.post('/api/v1/files', { ...pdf, fileName: 'ban-ky-p201.pdf' });
const stayRates = rented.rates.effective.filter((r) => r.unitPrice != null).map((r) => ({ chargeTypeId: r.chargeType.id, unitPrice: r.unitPrice }));
const imported = await a2.post(`/api/v1/tenancies/${rented.currentTenancy.id}/contracts`, {
  effectiveFrom: '2026-06-01', deposit: { amount: 3000000, methodCode: 'cash' },
  contract: { endsOn: '2027-06-01', requiredDeposit: 3000000, invoiceDay: 28, dueAfterDays: 7, prorationPolicy: 'actual_days', termsText: 'Điều khoản', rates: stayRates },
  signature: { signatureMethod: 'paper', signedAt: new Date().toISOString(), signedFileId: stayFile.id },
});
check(imported.contracts.length === 1 && imported.depositHeld === 3000000 && imported.onboardingGaps.find((g) => g.missingItem === 'Hợp đồng đã ký').resolvedAt, 'Bổ sung hợp đồng ghi nhận cọc và hoàn thiện hồ sơ', { deposit: imported.depositHeld });
check((await a2.get(`/api/v1/rooms/${rented.id}`)).currentTenancy.hasContract, 'Phòng hết nhãn chưa có hợp đồng sau khi bổ sung');
await expectError(a2.post(`/api/v1/tenancies/${rented.currentTenancy.id}/cancel-import`, { reason: 'Thử gỡ khách' }), 409, 'tenancy_has_records', 'Đã có hợp đồng thì không gỡ khách được');

// Sửa phòng có sẵn: công tơ lắp hôm nay nhưng khách vào ở từ trước vẫn nhận được số đầu.
const blank = await a2.post('/api/v1/rooms', roomBody('P204'));
const assigned = await a2.put(`/api/v1/rooms/${blank.id}`, { ...roomBody('P204'), occupant: { tenantId: mover.id, moveInOn: '2026-05-01', readings: { electricity: 300 } } });
check(assigned.occupancyStatus === 'occupied' && assigned.meters.some((m) => m.lastReading?.value === 300), 'Sửa phòng cũng gán được khách, số đầu không phụ thuộc ngày lắp công tơ', assigned.meters);
await expectError(a2.post(`/api/v1/tenancies/${assigned.currentTenancy.id}/cancel-import`, {}), 422, 'validation_failed', 'Gỡ khách phải có lý do');
const dropped = await a2.post(`/api/v1/tenancies/${assigned.currentTenancy.id}/cancel-import`, { reason: 'Chọn nhầm khách' });
const freed = await a2.get(`/api/v1/rooms/${blank.id}`);
check(dropped.status === 'cancelled' && freed.occupancyStatus === 'available' && !freed.currentTenancy && freed.meters.every((m) => !m.lastReading), 'Gỡ khách trả phòng về trống và hủy số đầu', { status: dropped.status, room: freed.occupancyStatus, meters: freed.meters });
}
const missed = ROUTES.filter((x) => !hit.has(x.key)).map((x) => x.key);
check(!missed.length, `Mọi route mock (${ROUTES.length}) chạy thành công ít nhất một lần`, missed);

console.log(`\nĐạt ${passed} kiểm tra; ${hit.size}/${ROUTES.length} route mock đã chạy thành công.`);
if (failures.length) {
  console.log(`Không đạt ${failures.length}:`);
  failures.forEach((f) => console.log(` - ${f}`));
  process.exit(1);
}
