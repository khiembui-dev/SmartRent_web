// Lớp HTTP tập trung: chọn transport (mock | api), gắn token + đơn vị, chuẩn hóa lỗi, xử lý 401 (làm mới phiên một lần).
// Trang/component KHÔNG gọi fetch trực tiếp; luôn đi qua services/api.js.
import { config } from '../config.js';
import { cleanParams } from '../utils/query.js';
import { authState } from './auth-state.js';
import { ApiError } from './errors.js';

let transportPromise;
function transport() {
  if (!transportPromise) {
    transportPromise = config.isMock
      ? import('../mocks/server.js').then((m) => m.mockTransport)
      : import('./http-transport.js').then((m) => m.httpTransport);
  }
  return transportPromise;
}

let refreshing = null;
async function refreshSession() {
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const t = await transport();
        const headers = authState.token ? { Authorization: `Bearer ${authState.token}` } : {};
        const result = await t({ method: 'POST', path: '/api/v1/auth/refresh', headers, body: {} });
        authState.setToken(result.accessToken, result.expiresAt);
        return true;
      } catch {
        return false;
      } finally {
        setTimeout(() => { refreshing = null; }, 0);
      }
    })();
  }
  return refreshing;
}

export async function request(method, path, options = {}) {
  const t = await transport();
  const headers = { ...(options.headers || {}) };
  if (authState.token) headers.Authorization = `Bearer ${authState.token}`;
  if (authState.organizationId && options.organization !== false) headers['X-Organization-Id'] = authState.organizationId;
  try {
    return await t({
      method, path, query: options.query ? cleanParams(options.query) : undefined, body: options.body,
      idempotencyKey: options.idempotencyKey, signal: options.signal, timeoutMs: options.timeoutMs, headers,
    });
  } catch (raw) {
    const error = raw instanceof ApiError ? raw : new ApiError({ status: 0, code: 'client_error', detail: raw?.message, cause: raw });
    if (error.isUnauthorized && !options.retried && !path.startsWith('/api/v1/auth/')) {
      if (await refreshSession()) return request(method, path, { ...options, retried: true });
      authState.emit('unauthorized', error);
    }
    if (error.isForbidden) authState.emit('forbidden', error);
    throw error;
  }
}

export const http = {
  get: (path, query, options = {}) => request('GET', path, { ...options, query }),
  post: (path, body, options = {}) => request('POST', path, { ...options, body }),
  put: (path, body, options = {}) => request('PUT', path, { ...options, body }),
  patch: (path, body, options = {}) => request('PATCH', path, { ...options, body }),
  delete: (path, options = {}) => request('DELETE', path, options),
};
