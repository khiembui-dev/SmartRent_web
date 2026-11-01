// "Máy chủ" mô phỏng chạy trong trình duyệt: cùng đường dẫn, mã lỗi và DTO như docs/api/openapi.yaml.
// Mỗi thao tác ghi chạy trên bản sao dữ liệu và chỉ commit khi không lỗi, mô phỏng transaction của backend.
// Đây KHÔNG phải cơ chế bảo mật: quyền ở đây chỉ để xem trước hành vi bị từ chối.

import { config } from '../config.js';
import { ApiError } from '../services/errors.js';
import { todayIso, nowInstant } from '../utils/date.js';
import { uuid } from '../utils/ids.js';
import { commit, getData } from './db.js';
import { permissionsOf } from './engine.js';

import registerAuth from './handlers/auth.js';
import registerPublic from './handlers/public.js';
import registerProperties from './handlers/properties.js';
import registerLeasing from './handlers/leasing.js';
import registerTenants from './handlers/tenants.js';
import registerTenancies from './handlers/tenancies.js';
import registerContracts from './handlers/contracts.js';
import registerMetering from './handlers/metering.js';
import registerInvoices from './handlers/invoices.js';
import registerPayments from './handlers/payments.js';
import registerSupport from './handlers/support.js';
import registerAdmin from './handlers/admin.js';
import registerReports from './handlers/reports.js';
import registerPortal from './handlers/portal.js';
import registerSystem from './handlers/system.js';

const routes = [];

function compile(path) {
  const keys = [];
  const pattern = path.replace(/\//g, '\\/').replace(/:([a-zA-Z]+)/g, (_, key) => {
    keys.push(key);
    return '([^/]+)';
  });
  return { regex: new RegExp(`^${pattern}$`), keys };
}

function makeRegistrar() {
  const add = (method) => (path, handler, options = {}) => {
    routes.push({ method, path, handler, ...compile(path), auth: options.auth || 'staff', perm: options.perm, scope: options.scope });
  };
  return { get: add('GET'), post: add('POST'), put: add('PUT'), patch: add('PATCH'), delete: add('DELETE') };
}

const registrar = makeRegistrar();
[registerAuth, registerPublic, registerProperties, registerLeasing, registerTenants, registerTenancies, registerContracts,
  registerMetering, registerInvoices, registerPayments, registerSupport, registerAdmin, registerReports, registerPortal,
  registerSystem].forEach((register) => register(registrar));

/** Danh sách route để đối chiếu với OpenAPI (scripts/check-contract.mjs đọc trực tiếp mã nguồn). */
export function listRoutes() {
  return routes.map((r) => ({ method: r.method, path: r.path, auth: r.auth, perm: r.perm }));
}

function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new ApiError({ code: 'aborted' }));
      return;
    }
    const timer = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(timer);
      reject(new ApiError({ code: 'aborted' }));
    }, { once: true });
  });
}

function stableStringify(value) {
  if (value == null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`).join(',')}}`;
}

function authenticate(db, headers) {
  const header = headers?.Authorization || headers?.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return null;
  const session = db.sessions.find((s) => s.id === token && !s.revokedAt);
  if (!session || session.expiresAt < nowInstant()) return null;
  const user = db.users.find((u) => u.id === session.userId);
  if (!user || !user.isActive) return null;
  return { user, session };
}

function buildContext(route, request, db, auth, match) {
  const params = {};
  route.keys.forEach((key, i) => {
    params[key] = decodeURIComponent(match[i + 1]);
  });
  const ctx = {
    method: route.method,
    path: request.path,
    params,
    query: request.query || {},
    body: request.body ?? {},
    idempotencyKey: request.idempotencyKey || null,
    db,
    user: auth?.user || null,
    session: auth?.session || null,
    now: nowInstant(),
    today: todayIso(),
    correlationId: uuid(),
    organizationId: null,
    membership: null,
    permissions: new Set(),
    propertyIds: null,
  };
  ctx.can = (perm) => ctx.permissions.has(perm);
  ctx.require = (perm) => {
    const list = Array.isArray(perm) ? perm : [perm];
    if (!list.some((p) => ctx.permissions.has(p))) {
      throw new ApiError({ status: 403, code: 'forbidden', detail: `Vai trò hiện tại thiếu quyền "${list.join('" hoặc "')}".` });
    }
  };
  ctx.canSeeProperty = (propertyId) => ctx.propertyIds == null || ctx.propertyIds.has(propertyId);
  ctx.assertProperty = (propertyId) => {
    if (!ctx.canSeeProperty(propertyId)) {
      throw new ApiError({ status: 404, code: 'not_found', detail: 'Không tìm thấy dữ liệu trong phạm vi cơ sở được phân công.' });
    }
  };
  return ctx;
}

function resolveStaffScope(ctx, db, headers) {
  const orgId = headers?.['X-Organization-Id'];
  const memberships = db.memberships.filter((m) => m.userId === ctx.user.id && m.status === 'active');
  const membership = memberships.find((m) => m.organizationId === orgId) || (orgId ? null : memberships[0]);
  if (!membership) {
    throw new ApiError({ status: 403, code: 'not_a_member', detail: 'Tài khoản không thuộc đơn vị này hoặc đã bị tạm khóa.' });
  }
  const org = db.organizations.find((o) => o.id === membership.organizationId);
  if (!org?.isActive) throw new ApiError({ status: 403, code: 'organization_suspended', detail: 'Đơn vị đang tạm ngưng hoạt động.' });
  ctx.membership = membership;
  ctx.organizationId = membership.organizationId;
  ctx.permissions = permissionsOf(db, membership);
  ctx.propertyIds = membership.propertyScope === 'all' ? null : new Set(membership.propertyIds);
}

function readAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

/** Mock lưu tệp trong localStorage (giới hạn vài MB) nên thu nhỏ ảnh trước khi lưu; API thật nhận nguyên tệp. */
async function shrinkImage(file) {
  if (!file.type.startsWith('image/') || file.size <= 120 * 1024 || typeof createImageBitmap === 'undefined') return null;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 960 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas.toDataURL('image/jpeg', 0.72);
}

/** API thật nhận multipart/form-data; mock đọc tệp thành data URL để lưu thử trong trình duyệt. */
async function formDataToObject(form) {
  const out = {};
  for (const [key, value] of form.entries()) {
    if (typeof File !== 'undefined' && value instanceof File) {
      out.fileName = value.name;
      out.contentType = value.type || 'application/octet-stream';
      out.sizeBytes = value.size;
      const shrunk = await shrinkImage(value).catch(() => null);
      if (shrunk) {
        out.dataUrl = shrunk;
        out.sizeBytes = Math.round(shrunk.length * 0.75);
        out.contentType = 'image/jpeg';
      } else {
        // Tệp lớn dùng blob URL (chỉ sống trong tab hiện tại) để không làm đầy localStorage.
        out.dataUrl = value.size <= 2 * 1024 * 1024 ? await readAsDataUrl(value) : URL.createObjectURL(value);
      }
    } else {
      out[key] = value;
    }
  }
  return out;
}

export async function mockTransport(request) {
  if (typeof FormData !== 'undefined' && request.body instanceof FormData) {
    request = { ...request, body: await formDataToObject(request.body) };
  }
  const { method, path, signal } = request;
  const [min, max] = config.mockLatency;
  await wait(min + Math.random() * Math.max(0, max - min), signal);

  let match = null;
  const route = routes.find((r) => {
    if (r.method !== method) return false;
    match = r.regex.exec(path);
    return Boolean(match);
  });
  if (!route) {
    throw new ApiError({ status: 404, code: 'route_not_found', detail: `Mock chưa có endpoint ${method} ${path}.` });
  }

  const isWrite = method !== 'GET';
  const current = getData();
  const db = isWrite ? structuredClone(current) : current;
  const auth = authenticate(db, request.headers);

  if (route.auth !== 'public' && !auth) {
    throw new ApiError({ status: 401, code: 'unauthorized', detail: 'Phiên đăng nhập không còn hiệu lực.' });
  }
  const ctx = buildContext(route, request, db, auth, match);

  if (route.auth === 'staff') resolveStaffScope(ctx, db, request.headers);
  if (route.auth === 'tenant') {
    ctx.tenantRecords = db.tenants.filter((t) => t.userId === ctx.user.id);
    if (!ctx.tenantRecords.length) throw new ApiError({ status: 403, code: 'not_a_tenant', detail: 'Tài khoản chưa liên kết hồ sơ khách thuê.' });
  }
  if (route.auth === 'system' && !ctx.user.systemRoles?.includes('SystemAdmin')) {
    throw new ApiError({ status: 403, code: 'forbidden', detail: 'Chỉ quản trị hệ thống được truy cập.' });
  }
  if (route.perm) ctx.require(route.perm);

  // Chống lặp: cùng Idempotency-Key + cùng nội dung trả lại kết quả cũ, khác nội dung thì từ chối.
  const idemKey = isWrite && ctx.idempotencyKey ? `${route.method} ${route.path}#${ctx.idempotencyKey}` : null;
  if (idemKey) {
    const stored = db.idempotency[idemKey];
    const hash = stableStringify({ params: ctx.params, body: ctx.body });
    if (stored) {
      if (stored.hash !== hash) {
        throw new ApiError({ status: 422, code: 'idempotency_key_reused', detail: 'Khóa chống lặp đã dùng cho một yêu cầu khác.' });
      }
      return structuredClone(stored.result);
    }
    ctx.idempotencyHash = hash;
  }

  const result = await route.handler(ctx);
  if (isWrite) {
    if (idemKey) db.idempotency[idemKey] = { hash: ctx.idempotencyHash, result: result ?? null, at: ctx.now };
    commit(db);
  }
  return result === undefined ? null : structuredClone(result);
}
