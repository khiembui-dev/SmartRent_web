// Điều phối: kiểm tra phiên/khu vực/quyền, gắn khung, nạp trang, dọn dẹp trang cũ, quản lý tiêu điểm và tiêu đề.
import { config } from './config.js';
import { currentLocation, defineRoutes, match, navigate, rememberCurrent, startRouter } from './router/router.js';
import { NOT_FOUND, ROUTES } from './router/routes.js';
import { isAdminPath, loginRedirect } from './services/access.js';
import { authState } from './services/auth-state.js';
import { session } from './services/session.js';
import { applyLayoutTheme, mountAdminShell, mountAuthShell, mountCustomerShell } from './components/shells.js';
import { errorState, forbiddenPage, loadingBlock } from './components/ui.js';
import { html, setHtml } from './utils/html.js';
import { focusFirst } from './utils/dom.js';
import { toQueryString } from './utils/query.js';

const appRoot = document.getElementById('app');
const announcer = document.getElementById('route-announcer');
let shell = null;
let shellKey = null;
let cleanups = [];
let renderToken = 0;
let controller = null;

function mountShell(layout) {
  const key = `${layout}:${session.user?.id || 'guest'}:${session.organization?.id || ''}`;
  if (shell && shellKey === key) return shell;
  applyLayoutTheme(layout);
  if (layout === 'admin') shell = mountAdminShell(appRoot);
  else if (layout === 'auth') shell = mountAuthShell(appRoot);
  else shell = mountCustomerShell(appRoot);
  shellKey = key;
  return shell;
}

function runCleanups() {
  cleanups.forEach((fn) => {
    try {
      fn();
    } catch (error) {
      console.warn('Dọn dẹp trang lỗi:', error);
    }
  });
  cleanups = [];
}

function guard(route, location) {
  const next = `${location.path}${toQueryString(location.query)}`;
  return loginRedirect(route.auth, session.user, next);
}

async function render() {
  const token = ++renderToken;
  controller?.abort();
  controller = new AbortController();
  const location = currentLocation();
  const found = match(location.path);
  const route = found?.route || NOT_FOUND;
  if (route.redirect) {
    await navigate(`${route.redirect}${toQueryString(location.query)}`, { replace: true, force: true });
    return;
  }
  const redirect = guard(route, location);
  if (redirect && redirect !== location.path) {
    await navigate(redirect, { replace: true, force: true });
    return;
  }

  runCleanups();
  const current = mountShell(route.layout);
  current.setActive(location.path);
  const outlet = current.outlet;
  setHtml(outlet, loadingBlock(6));

  if (route.perm && !session.can(route.perm)) {
    setHtml(outlet, forbiddenPage(route.perm));
    document.title = 'Không có quyền – SmartRent';
    return;
  }

  let title = 'SmartRent';
  const ctx = {
    params: found?.params || {},
    query: location.query,
    path: location.path,
    outlet,
    signal: controller.signal,
    session,
    setTitle(t) {
      title = t;
      document.title = `${t} – SmartRent`;
    },
    onCleanup(fn) {
      cleanups.push(fn);
    },
    navigate,
    refresh: () => render(),
    shell: current,
  };
  try {
    const module = await route.load();
    if (token !== renderToken) return;
    const cleanup = await module.default(ctx);
    if (typeof cleanup === 'function') cleanups.push(cleanup);
  } catch (error) {
    if (token !== renderToken) return;
    console.error(error);
    setHtml(outlet, html`<div class="sr-panel">${errorState(error)}</div>`);
    outlet.querySelector('#sr-retry')?.addEventListener('click', () => render());
  }
  if (token !== renderToken) return;
  rememberCurrent();
  if (!location.hash) window.scrollTo({ top: 0 });
  focusFirst(outlet);
  announcer.textContent = `Đã mở trang ${title}`;
  current.refresh();
}

export async function startApp() {
  defineRoutes(ROUTES);
  authState.on('unauthorized', async () => {
    if (!session.isAuthenticated) return;
    session.clearLocal();
    const loc = currentLocation();
    await navigate(`/login?expired=1&next=${encodeURIComponent(loc.path)}`, { replace: true, force: true });
  });
  document.addEventListener('sr:data-changed', () => shell?.invalidateCounts());
  await session.init();
  if (config.isMock) document.documentElement.dataset.dataSource = 'mock';
  await startRouter(render);
}
