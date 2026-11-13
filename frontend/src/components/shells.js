// Khung giao diện cho từng khu vực. Shell giữ nguyên khi chuyển trang trong cùng khu vực; chỉ vùng nội dung thay đổi.
import { Dropdown, Offcanvas } from 'bootstrap';
import { href, navigate } from '../router/router.js';
import { dashboardApi, notificationsApi, publicApi } from '../services/api.js';
import { session } from '../services/session.js';
import { installFavoriteButtons, loadFavorites } from '../services/favorites.js';
import { formatRelative } from '../utils/date.js';
import { formatPhone, initials } from '../utils/format.js';
import { html, setHtml } from '../utils/html.js';
import { mountChatWidget } from './chat-widget.js';
import { toast } from './dialogs.js';
import { ADMIN_NAV, CUSTOMER_NAV } from './nav-config.js';
import { icon } from './ui.js';

// ------------------------------------------------------------ chủ đề sáng/tối
export function currentTheme() {
  return document.documentElement.getAttribute('data-bs-theme') === 'dark' ? 'dark' : 'light';
}
export function toggleTheme() {
  const next = currentTheme() === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-bs-theme', next);
  try {
    localStorage.setItem('smartrent.theme', next);
  } catch {
    // bỏ qua
  }
  document.querySelectorAll('[data-theme-toggle]').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(next === 'dark'));
    btn.innerHTML = `<i class="bi bi-${next === 'dark' ? 'sun' : 'moon-stars'}" aria-hidden="true"></i><span class="visually-hidden">Đổi giao diện sáng/tối</span>`;
  });
}
/** Khu khách và trang đăng nhập thiết kế cho nền sáng; khu quản trị giữ lựa chọn sáng/tối của người dùng. */
export function applyLayoutTheme(layout) {
  let theme = 'light';
  if (!['customer', 'auth'].includes(layout)) {
    let saved = null;
    try {
      saved = localStorage.getItem('smartrent.theme');
    } catch {
      // bỏ qua
    }
    theme = saved || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  }
  document.documentElement.setAttribute('data-bs-theme', theme);
}

const themeButton = () => html`<button type="button" class="sr-icon-btn" data-theme-toggle aria-pressed="${String(currentTheme() === 'dark')}" title="Đổi giao diện sáng/tối">
  ${icon(currentTheme() === 'dark' ? 'sun' : 'moon-stars')}<span class="visually-hidden">Đổi giao diện sáng/tối</span></button>`;

const brand = (to, org) => html`<a class="sr-brand" href="${href(to)}"><span class="sr-plate">SR</span><span>SmartRent${org ? html`<span class="sr-brand-org">${org}</span>` : ''}</span></a>`;

// ------------------------------------------------------------ thông báo (chuông)
function notificationsMenu(prefix) {
  return html`<div class="dropdown">
    <button type="button" class="sr-icon-btn" data-bs-toggle="dropdown" data-bs-auto-close="outside" aria-expanded="false" data-notif-toggle title="Thông báo">
      ${icon('bell')}<span class="visually-hidden">Thông báo</span><span class="sr-dot" data-notif-count hidden></span>
    </button>
    <div class="dropdown-menu dropdown-menu-end sr-notif-menu">
      <div class="d-flex align-items-center justify-content-between px-3 py-2 border-bottom">
        <strong class="small">Thông báo</strong>
        <button type="button" class="btn btn-link btn-sm p-0" data-notif-readall>Đánh dấu đã đọc</button>
      </div>
      <div data-notif-list class="overflow-auto" style="max-height:60vh"><div class="p-3 small text-muted-sr">Đang tải…</div></div>
      ${prefix === '/admin' ? '' : html`<a class="d-block text-center small py-2 border-top" href="${href(`${prefix}/notifications`)}">Xem tất cả thông báo</a>`}
    </div>
  </div>`;
}

function wireNotifications(root, prefix) {
  const list = root.querySelector('[data-notif-list]');
  const count = root.querySelector('[data-notif-count]');
  const refreshCount = async () => {
    try {
      const { unreadCount } = await notificationsApi.unreadCount();
      count.hidden = unreadCount === 0;
      count.textContent = unreadCount > 9 ? '9+' : String(unreadCount);
      root.querySelector('[data-notif-toggle]').setAttribute('aria-label', `Thông báo, ${unreadCount} chưa đọc`);
    } catch {
      count.hidden = true;
    }
  };
  const loadList = async () => {
    try {
      const result = await notificationsApi.list({ pageSize: 8 });
      setHtml(list, result.items.length ? result.items.map((n) => html`<a class="sr-notif ${n.readAt ? '' : 'is-unread'}" href="${href(n.relativeUrl || (prefix === '/admin' ? '/admin' : `${prefix}/notifications`))}" data-notif-id="${n.id}">
        ${icon(n.readAt ? 'bell' : 'bell-fill', 'text-muted-sr mt-1')}
        <span class="min-w-0"><span class="d-block sr-notif-title">${n.title}</span><span class="d-block text-muted-sr text-truncate">${n.body}</span><span class="sr-notif-time">${formatRelative(n.createdAt)}</span></span>
      </a>`) : html`<div class="p-4 text-center small text-muted-sr">Không có thông báo mới.</div>`);
    } catch {
      setHtml(list, html`<div class="p-3 small text-danger">Không tải được thông báo.</div>`);
    }
  };
  root.querySelector('[data-notif-toggle]').addEventListener('show.bs.dropdown', loadList);
  list.addEventListener('click', (event) => {
    const item = event.target.closest('[data-notif-id]');
    if (item) {
      notificationsApi.read(item.dataset.notifId).then(refreshCount).catch(() => {});
      Dropdown.getInstance(root.querySelector('[data-notif-toggle]'))?.hide();
    }
  });
  root.querySelector('[data-notif-readall]').addEventListener('click', async () => {
    await notificationsApi.readAll().catch(() => {});
    await Promise.all([refreshCount(), loadList()]);
  });
  refreshCount();
  return refreshCount;
}

function userMenu(prefix) {
  const user = session.user;
  return html`<div class="dropdown">
    <button type="button" class="btn btn-sm d-flex align-items-center gap-2 border-0" data-bs-toggle="dropdown" aria-expanded="false">
      ${user?.avatarUrl ? html`<img class="sr-avatar ad-avatar-img" src="${user.avatarUrl}" alt="">` : html`<span class="sr-avatar">${initials(user?.displayName)}</span>`}
      <span class="d-none d-md-inline text-start lh-tight"><span class="d-block small fw-semibold">${user?.displayName}</span>
        <span class="d-block small text-muted-sr">${session.isAdmin ? 'Admin · Chủ trọ' : 'Khách hàng'}</span></span>
      ${icon('chevron-down', 'small text-muted-sr')}
    </button>
    <ul class="dropdown-menu dropdown-menu-end">
      <li><h6 class="dropdown-header">${user?.email}</h6></li>
      <li><a class="dropdown-item" href="${href(prefix === '/admin' ? '/admin/settings' : `${prefix}/account`)}">${icon('person-gear')} Tài khoản và cài đặt</a></li>
      ${session.isAdmin && prefix !== '/admin' ? html`<li><a class="dropdown-item" href="${href('/admin')}">${icon('building')} Khu quản trị</a></li>` : ''}
      ${session.isCustomer ? html`<li><a class="dropdown-item" href="${href('/invoices')}">${icon('house-door')} Trang khách thuê</a></li>` : ''}
      <li><a class="dropdown-item" href="${href('/')}">${icon('globe2')} Trang tìm phòng</a></li>
      <li><hr class="dropdown-divider"></li>
      <li><button type="button" class="dropdown-item" data-logout>${icon('box-arrow-right')} Đăng xuất</button></li>
    </ul>
  </div>`;
}

function wireCommon(root) {
  root.querySelectorAll('[data-theme-toggle]').forEach((btn) => btn.addEventListener('click', toggleTheme));
  root.querySelectorAll('[data-logout]').forEach((btn) => btn.addEventListener('click', async () => {
    await session.logout();
    navigate('/admin', { force: true });
  }));
}

function setActiveLinks(root, path) {
  root.querySelectorAll('[data-nav-path]').forEach((a) => {
    const p = a.dataset.navPath;
    const active = a.dataset.exact === 'true' ? path === p : path === p || path.startsWith(`${p}/`);
    a.classList.toggle('active', active);
    if (active) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
}

// ------------------------------------------------------------ quản trị / hệ thống
export function mountAdminShell(root) {
  const nav = ADMIN_NAV;
  const prefix = '/admin';
  const org = session.organization;
  const groups = nav.map((g) => ({ ...g, items: g.items.filter((i) => !i.perm || session.can(i.perm)) })).filter((g) => g.items.length);
  const navLink = (i) => html`<a class="sr-nav-link" href="${href(i.path)}" data-nav-path="${i.path}" data-exact="${String(Boolean(i.exact))}">
    ${icon(i.icon)}<span>${i.label}</span>${i.countKey ? html`<span class="sr-nav-count" data-count="${i.countKey}" hidden></span>` : ''}</a>`;
  setHtml(root, html`<div class="sr-app sr-admin">
    <aside class="sr-sidebar offcanvas-lg offcanvas-start" tabindex="-1" id="sr-sidebar" aria-label="Điều hướng chính">
      <div class="d-flex align-items-start justify-content-between">
        ${brand(prefix, org?.name)}
        <button type="button" class="btn-close btn-close-white d-lg-none m-3" data-bs-dismiss="offcanvas" data-bs-target="#sr-sidebar" aria-label="Đóng menu"></button>
      </div>
      <div class="offcanvas-body">
        <nav class="sr-nav">${groups.map((g) => html`<div class="sr-nav-group">
          ${g.title ? html`<div class="sr-nav-title">${g.title}</div>` : ''}
          ${g.items.map(navLink)}
        </div>`)}</nav>
      </div>
    </aside>
    <div class="min-w-0">
      <header class="sr-topbar sr-no-print">
        <button type="button" class="sr-icon-btn d-lg-none" data-bs-toggle="offcanvas" data-bs-target="#sr-sidebar" aria-controls="sr-sidebar" title="Mở menu">${icon('list')}<span class="visually-hidden">Mở menu</span></button>
        <div class="sr-topbar-spacer"></div>
        ${themeButton()}
        ${notificationsMenu(prefix)}
        ${userMenu(prefix)}
      </header>
      <main id="main" class="sr-main" tabindex="-1"></main>
    </div>
  </div>`);
  wireCommon(root);
  mountChatWidget(root, { audience: 'admin' });
  const refreshNotifications = wireNotifications(root, prefix);
  const sidebar = root.querySelector('#sr-sidebar');
  sidebar.addEventListener('click', (event) => {
    if (event.target.closest('a.sr-nav-link') && window.innerWidth < 992) Offcanvas.getInstance(sidebar)?.hide();
  });

  let countsAt = 0;
  const refreshCounts = async () => {
    if (Date.now() - countsAt < 20000 || !session.can('properties.read')) return;
    countsAt = Date.now();
    try {
      const data = await dashboardApi.get({});
      for (const task of data.tasks) {
        const el = root.querySelector(`[data-count="${task.key}"]`);
        if (el) {
          el.hidden = !task.count;
          el.textContent = task.count > 99 ? '99+' : String(task.count);
          el.title = task.label;
        }
      }
    } catch {
      // không chặn giao diện nếu không tải được số đếm
    }
  };
  return {
    outlet: root.querySelector('#main'),
    setActive: (path) => setActiveLinks(root, path),
    refresh: () => {
      refreshNotifications();
      refreshCounts();
    },
    invalidateCounts: () => { countsAt = 0; },
  };
}

// ------------------------------------------------------------ khu khách hàng
function customerAccount() {
  if (!session.isAuthenticated) {
    return html`<a class="sr-site-login" href="${href('/login')}">Đăng nhập</a><a class="btn btn-primary btn-sm d-none d-sm-inline-block" href="${href('/register')}">Tạo tài khoản</a>`;
  }
  const user = session.user;
  return html`${session.isCustomer ? notificationsMenu('') : ''}
    <div class="dropdown">
      <button type="button" class="sr-site-user" data-bs-toggle="dropdown" aria-expanded="false" aria-label="Tài khoản">
        <span class="sr-avatar">${initials(user?.displayName)}</span><span class="d-none d-md-inline">${user?.displayName}</span>${icon('chevron-down', 'small')}
      </button>
      <ul class="dropdown-menu dropdown-menu-end">
        <li><h6 class="dropdown-header">${user?.email}</h6></li>
        ${session.isCustomer ? html`<li><a class="dropdown-item" href="${href('/account')}">${icon('person')} Tài khoản của tôi</a></li>` : ''}
        ${session.isAdmin ? html`<li><a class="dropdown-item" href="${href('/admin')}">${icon('building')} Vào trang quản lý</a></li>` : ''}
        <li><hr class="dropdown-divider"></li>
        <li><button type="button" class="dropdown-item" data-site-logout>${icon('box-arrow-right')} Đăng xuất</button></li>
      </ul>
    </div>`;
}

function customerFooter(items) {
  return html`<footer class="sr-site-foot sr-no-print">
    <div class="sr-foot-main">
      <div class="sr-foot-brand">
        <a class="sr-site-brand" href="${href('/')}"><span class="sr-plate">SR</span><span>SmartRent</span></a>
        <p>Phòng trọ có giá thuê, tiền cọc và các khoản phí ghi rõ trước khi xem phòng.</p>
      </div>
      <nav class="sr-foot-col" aria-label="Liên kết chân trang">
        <h2>Khám phá</h2>
        <ul>${items.map((i) => html`<li><a href="${href(i.path)}">${i.label}</a></li>`)}</ul>
      </nav>
      <div class="sr-foot-col" data-foot-contact hidden></div>
      <div class="sr-foot-col" data-foot-places hidden></div>
    </div>
    <div class="sr-foot-bottom"><span>© ${new Date().getFullYear()} SmartRent. Bảo lưu mọi quyền.</span></div>
  </footer>`;
}

/** Liên hệ và khu nhà lấy từ dữ liệu quản trị; chưa tải được thì chân trang vẫn đủ phần còn lại. */
async function fillFooter(root) {
  let organizations;
  try {
    ({ organizations } = await publicApi.contactInfo());
  } catch {
    return;
  }
  // Khu nhà lấy cùng đơn vị với số điện thoại đang hiện để khách không gọi nhầm nơi.
  const org = organizations.find((o) => o.phone || o.email) ?? organizations[0];
  if (!org) return;
  const contact = root.querySelector('[data-foot-contact]');
  const places = root.querySelector('[data-foot-places]');
  if (contact && (org.phone || org.email)) {
    contact.hidden = false;
    setHtml(contact, html`<h2>Liên hệ</h2><ul>
      ${org.phone ? html`<li><a href="tel:${org.phone}">${icon('telephone')} ${formatPhone(org.phone)}</a></li>` : ''}
      ${org.email ? html`<li><a href="mailto:${org.email}">${icon('envelope')} ${org.email}</a></li>` : ''}
    </ul>`);
  }
  if (places && org.properties.length) {
    places.hidden = false;
    setHtml(places, html`<h2>Khu nhà</h2><ul>${org.properties.slice(0, 5).map((p) => html`<li><span>${p.name}</span></li>`)}</ul>`);
  }
}

export function mountCustomerShell(root) {
  const items = CUSTOMER_NAV.filter((i) => (!i.member || session.isCustomer));
  const navLink = (i, className, short = false) => html`<a class="${className}" href="${href(i.path)}" data-nav-path="${i.path}">${icon(i.icon)}<span>${short && i.short ? i.short : i.label}</span>${i.count === 'favorites' ? html`<span class="sr-fav-count" data-fav-count hidden></span>` : ''}</a>`;
  setHtml(root, html`<div class="sr-site">
    <header class="sr-site-head sr-no-print">
      <a class="sr-site-brand" href="${href('/')}"><span class="sr-plate">SR</span><span>SmartRent</span></a>
      <nav class="sr-site-nav" aria-label="Điều hướng chính">${items.map((i) => navLink(i, 'sr-site-link'))}</nav>
      <div class="sr-site-actions">${customerAccount()}</div>
    </header>
    <main id="main" class="sr-site-main" tabindex="-1"></main>
    ${customerFooter(items)}
    <nav class="sr-site-tabbar sr-no-print" aria-label="Điều hướng nhanh">${items.map((i) => navLink(i, 'sr-site-tab', true))}</nav>
  </div>`);
  wireCommon(root);
  root.querySelector('[data-site-logout]')?.addEventListener('click', async () => {
    await session.logout();
    navigate('/', { force: true });
  });
  fillFooter(root);
  // Phòng yêu thích: nạp theo người đang đăng nhập (khung gắn lại mỗi lần đổi tài khoản), gộp danh sách trên trình duyệt vào tài khoản.
  installFavoriteButtons({ notify: toast });
  loadFavorites();
  // Admin xem trang khách không dùng trợ lý khách (máy chủ cũng từ chối); admin có trợ lý riêng trong /admin.
  if (!session.isAdmin) mountChatWidget(root, { audience: 'customer' });
  const refreshNotifications = session.isCustomer ? wireNotifications(root, '') : () => {};
  return { outlet: root.querySelector('#main'), setActive: (path) => setActiveLinks(root, path), refresh: refreshNotifications, invalidateCounts() {} };
}

// ------------------------------------------------------------ xác thực
export function mountAuthShell(root) {
  setHtml(root, html`<div class="sr-auth">
    <div class="sr-auth-art" aria-hidden="true">
      <a class="sr-brand p-0" href="${href('/')}"><span class="sr-plate">SR</span><span>SmartRent</span></a>
      <div>
        <div class="sr-doors mb-4" style="grid-template-columns:repeat(6,56px)">
          ${['A101', 'A102', 'A103', 'A104', 'A201', 'A202', 'A203', 'A204', 'A301', 'A302', 'A303', 'A304'].map((c, i) => html`<span class="sr-door ${[7, 10].includes(i) ? 'is-available' : i === 3 ? 'is-maintenance' : i === 11 ? 'is-inactive' : 'is-occupied'}" style="height:84px">${c}</span>`)}
        </div>
        <p class="sr-display mb-2" style="font-size:2rem;line-height:1.1;max-width:18ch">Có tài khoản là đặt lịch xem phòng được ngay.</p>
        <p class="mb-0" style="color:var(--sr-sidebar-ink);max-width:44ch">Khi đã thuê, hóa đơn, hợp đồng và yêu cầu hỗ trợ của bạn nằm cùng một chỗ.</p>
      </div>
    </div>
    <div class="sr-auth-panel"><div class="d-flex justify-content-between align-items-center mb-4 d-lg-none">
      <a class="sr-brand p-0" style="color:var(--sr-ink)" href="${href('/')}"><span class="sr-plate">SR</span><span>SmartRent</span></a></div>
      <main id="main" class="sr-auth-main" tabindex="-1"></main>
    </div>
  </div>`);
  wireCommon(root);
  return { outlet: root.querySelector('#main'), setActive() {}, refresh() {}, invalidateCounts() {} };
}
