// Router SPA dùng History API. Mỗi route nạp module trang theo nhu cầu (code-splitting) nên thư viện chỉ tải khi trang cần.
// Deploy tĩnh cần cấu hình fallback mọi đường dẫn về index.html (xem frontend/README.md).
import { config } from '../config.js';
import { parseQuery, toQueryString } from '../utils/query.js';

const base = config.basePath.replace(/\/$/, '');
let routes = [];
let onNavigate = () => {};
let leaveGuard = null;
let current = null;

function compile(path) {
  const keys = [];
  const pattern = path.replace(/\//g, '\\/').replace(/:([a-zA-Z]+)/g, (_, key) => {
    keys.push(key);
    return '([^/]+)';
  });
  return { regex: new RegExp(`^${pattern}\\/?$`), keys };
}

export function defineRoutes(list) {
  routes = list.map((route) => ({ ...route, ...compile(route.path) }));
}

export function stripBase(pathname) {
  return base && pathname.startsWith(base) ? pathname.slice(base.length) || '/' : pathname;
}

export function href(path) {
  return `${base}${path}`;
}

export function match(pathname) {
  for (const route of routes) {
    const m = route.regex.exec(pathname);
    if (m) {
      const params = {};
      route.keys.forEach((key, i) => { params[key] = decodeURIComponent(m[i + 1]); });
      return { route, params };
    }
  }
  return null;
}

export function currentLocation() {
  return { path: stripBase(window.location.pathname), query: parseQuery(window.location.search), hash: window.location.hash };
}

/** Trang có dữ liệu chưa lưu đặt guard trả về true khi cần hỏi trước khi rời. */
export function setLeaveGuard(fn) {
  leaveGuard = fn;
  return () => {
    if (leaveGuard === fn) leaveGuard = null;
  };
}

async function confirmLeave() {
  if (!leaveGuard || !leaveGuard()) return true;
  const { confirmDialog } = await import('../components/dialogs.js');
  const ok = await confirmDialog({
    title: 'Rời trang khi chưa lưu?',
    text: 'Các thay đổi trên biểu mẫu này sẽ mất nếu bạn rời trang.',
    confirmText: 'Rời trang',
    cancelText: 'Ở lại',
    tone: 'danger',
  });
  if (ok) leaveGuard = null;
  return ok;
}

export async function navigate(to, { replace = false, force = false } = {}) {
  const url = new URL(to, window.location.origin + base + '/');
  const target = `${base}${stripBase(url.pathname)}${url.search}${url.hash}`;
  if (!force && !(await confirmLeave())) return false;
  if (replace) window.history.replaceState({}, '', target);
  else window.history.pushState({}, '', target);
  await onNavigate();
  return true;
}

/** Cập nhật query string (bộ lọc) mà không vẽ lại trang. */
export function replaceQuery(params) {
  const next = `${window.location.pathname}${toQueryString(params)}`;
  window.history.replaceState({}, '', next);
}

export function startRouter(handler) {
  onNavigate = handler;
  window.addEventListener('popstate', async () => {
    if (leaveGuard && leaveGuard()) {
      const ok = await confirmLeave();
      if (!ok) {
        window.history.pushState({}, '', current || window.location.href);
        return;
      }
    }
    await onNavigate();
  });
  window.addEventListener('beforeunload', (event) => {
    if (leaveGuard && leaveGuard()) {
      event.preventDefault();
      event.returnValue = '';
    }
  });
  // Bắt click vào link nội bộ để không tải lại trang.
  document.addEventListener('click', (event) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    const anchor = event.target instanceof Element ? event.target.closest('a[href]') : null;
    if (!anchor || anchor.target || anchor.hasAttribute('download') || anchor.dataset.external !== undefined) return;
    const url = new URL(anchor.href, window.location.href);
    if (url.origin !== window.location.origin) return;
    if (base && !url.pathname.startsWith(base)) return;
    if (url.pathname === window.location.pathname && url.search === window.location.search && url.hash) return;
    event.preventDefault();
    navigate(`${stripBase(url.pathname)}${url.search}${url.hash}`);
  });
  return onNavigate();
}

export function rememberCurrent() {
  current = window.location.href;
}
