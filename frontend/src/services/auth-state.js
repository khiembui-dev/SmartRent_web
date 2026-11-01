// Trạng thái xác thực tối thiểu dùng chung cho lớp HTTP (tránh phụ thuộc vòng với session.js).
// - Mock: token mô phỏng lưu localStorage để tải lại trang vẫn đăng nhập.
// - API: access token chỉ giữ trong bộ nhớ; refresh token nằm ở cookie HttpOnly do backend cấp (xem BACKEND_HANDOFF.md).
import { config } from '../config.js';

const TOKEN_KEY = 'smartrent.session';
const ORG_KEY = 'smartrent.organization';

const state = { token: null, expiresAt: null, organizationId: null };
const listeners = new Map();

function safeGet(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function safeSet(key, value) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // trình duyệt chặn bộ nhớ: vẫn chạy trong phiên hiện tại
  }
}

export const authState = {
  restore() {
    state.organizationId = safeGet(ORG_KEY);
    if (config.isMock) {
      try {
        const saved = JSON.parse(safeGet(TOKEN_KEY) || 'null');
        if (saved?.token && saved.expiresAt > new Date().toISOString()) Object.assign(state, saved);
      } catch {
        // bỏ qua dữ liệu hỏng
      }
    }
  },
  get token() {
    return state.token;
  },
  get organizationId() {
    return state.organizationId;
  },
  setToken(token, expiresAt) {
    state.token = token;
    state.expiresAt = expiresAt;
    if (config.isMock) safeSet(TOKEN_KEY, JSON.stringify({ token, expiresAt }));
  },
  clear() {
    state.token = null;
    state.expiresAt = null;
    safeSet(TOKEN_KEY, null);
  },
  setOrganization(id) {
    state.organizationId = id;
    safeSet(ORG_KEY, id);
  },
  on(event, fn) {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event).add(fn);
    return () => listeners.get(event).delete(fn);
  },
  emit(event, payload) {
    listeners.get(event)?.forEach((fn) => fn(payload));
  },
};
