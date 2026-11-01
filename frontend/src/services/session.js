// Phiên đăng nhập phía giao diện. Ẩn/hiện nút theo quyền chỉ để dễ dùng; quyền thật do backend kiểm tra mọi request.
import { config } from '../config.js';
import { authApi } from './api.js';
import { authState } from './auth-state.js';

const PROPERTY_KEY = 'smartrent.propertyFilter';
const listeners = new Set();
const state = { me: null, ready: false };

function emit() {
  listeners.forEach((fn) => fn(state.me));
}

function safeGet(key) {
  try {
    return localStorage.getItem(key) || '';
  } catch {
    return '';
  }
}
function safeSet(key, value) {
  try {
    if (value) localStorage.setItem(key, value);
    else localStorage.removeItem(key);
  } catch {
    // bỏ qua
  }
}

export const session = {
  get me() { return state.me; },
  get user() { return state.me?.user || null; },
  get ready() { return state.ready; },
  get isAuthenticated() { return Boolean(state.me); },
  get isStaff() { return Boolean(state.me?.organizations.length); },
  get isTenant() { return Boolean(state.me?.tenantProfiles.length); },
  get isSystemAdmin() { return Boolean(state.me?.isSystemAdmin); },
  /** Đã có phòng (đang ở, sắp vào ở hoặc từng ở). Trang khách vẫn hỏi lại máy chủ, giá trị này chỉ để chọn trang mở đầu. */
  get hasRoom() { return Boolean(state.me?.tenantProfiles.some((p) => p.tenancies.length)); },
  get isResidentOnly() {
    const profiles = state.me?.tenantProfiles || [];
    const current = profiles.flatMap((p) => p.tenancies).filter((t) => ['active', 'planned'].includes(t.status));
    return current.length > 0 && current.every((t) => t.role === 'resident');
  },

  get organization() {
    const orgs = state.me?.organizations || [];
    return orgs.find((o) => o.id === authState.organizationId) || orgs[0] || null;
  },
  get organizations() { return state.me?.organizations || []; },

  /** Bộ lọc cơ sở toàn cục của khu quản trị ('' = tất cả cơ sở trong phạm vi). */
  get propertyId() {
    const org = this.organization;
    if (!org) return '';
    const saved = safeGet(`${PROPERTY_KEY}.${org.id}`);
    return org.properties.some((p) => p.id === saved) ? saved : '';
  },
  setPropertyId(propertyId) {
    const org = this.organization;
    if (!org) return;
    safeSet(`${PROPERTY_KEY}.${org.id}`, propertyId);
    emit();
  },

  can(permission) {
    return Boolean(this.organization?.permissions.includes(permission));
  },
  canAny(permissions) {
    return permissions.some((p) => this.can(p));
  },

  homePath() {
    if (!state.me) return '/login';
    if (this.isStaff) return '/admin';
    if (this.isTenant) return this.hasRoom ? '/invoices' : '/rooms';
    if (this.isSystemAdmin) return '/system';
    return '/';
  },

  async init() {
    authState.restore();
    if (!config.isMock && !authState.token) {
      // API thật: thử lấy access token mới bằng refresh cookie HttpOnly (nếu backend cấp).
      try {
        const { http } = await import('./client.js');
        const result = await http.post('/api/v1/auth/refresh', {}, { retried: true });
        authState.setToken(result.accessToken, result.expiresAt);
      } catch {
        // chưa đăng nhập
      }
    }
    if (authState.token) {
      try {
        await this.reload();
      } catch {
        authState.clear();
        state.me = null;
      }
    }
    state.ready = true;
    emit();
  },

  async reload() {
    state.me = await authApi.me();
    const org = this.organization;
    if (org && authState.organizationId !== org.id) authState.setOrganization(org.id);
    emit();
    return state.me;
  },

  async login(email, password) {
    const result = await authApi.login(email, password);
    authState.setToken(result.accessToken, result.expiresAt);
    await this.reload();
    return state.me;
  },

  async register(body) {
    const result = await authApi.register(body);
    authState.setToken(result.accessToken, result.expiresAt);
    await this.reload();
    return state.me;
  },

  async logout() {
    try {
      await authApi.logout();
    } catch {
      // vẫn xóa phiên phía trình duyệt
    }
    this.clearLocal();
  },

  clearLocal() {
    authState.clear();
    state.me = null;
    emit();
  },

  setOrganization(organizationId) {
    authState.setOrganization(organizationId);
    emit();
  },

  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
};
