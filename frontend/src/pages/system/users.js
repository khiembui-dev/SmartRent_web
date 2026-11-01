// Tài khoản toàn hệ thống: khóa/mở khóa (thu hồi phiên). Không xem hay sửa mật khẩu người dùng.
import { reasonDialog, runAction } from '../../components/dialogs.js';
import { mountList } from '../../components/list-page.js';
import { dateTime, pageHeader } from '../../components/ui.js';
import { systemApi } from '../../services/api.js';
import { session } from '../../services/session.js';
import { html, setHtml } from '../../utils/html.js';
import { bindActions } from '../admin/common.js';

const MEMBER = { active: 'đang làm', invited: 'đã mời', suspended: 'tạm khóa', left: 'đã nghỉ' };

export default async function SystemUsersPage(ctx) {
  ctx.setTitle('Tài khoản');
  setHtml(ctx.outlet, html`${pageHeader({ title: 'Tài khoản', subtitle: 'Mọi tài khoản đăng nhập: nhân sự đơn vị, khách thuê và quản trị hệ thống. Khóa tài khoản thu hồi mọi phiên đăng nhập.' })}<div data-list></div>`);
  const list = mountList(ctx, ctx.outlet.querySelector('[data-list]'), {
    filters: [{ name: 'q', type: 'search', label: 'Tìm tài khoản', placeholder: 'Tên hoặc email' }],
    columns: [
      { title: 'Tài khoản', sortKey: 'displayName', render: (u) => html`<span class="fw-550">${u.displayName}</span><div class="small text-muted-sr">${u.email}</div>` },
      { title: 'Loại', render: (u) => [u.systemRoles.includes('SystemAdmin') ? 'Quản trị hệ thống' : null, u.organizations.length ? 'Nhân sự đơn vị' : null, u.isTenant ? 'Khách thuê' : null].filter(Boolean).join(', ') || '—' },
      { title: 'Đơn vị', render: (u) => html`<span class="small">${u.organizations.map((o) => `${o.name} (${MEMBER[o.status] || o.status})`).join('; ') || '—'}</span>` },
      { title: 'Đăng nhập gần nhất', sortKey: 'lastLoginAt', render: (u) => (u.lastLoginAt ? dateTime(u.lastLoginAt) : '—') },
      { title: 'Trạng thái', render: (u) => (u.isActive ? html`<span class="sr-badge tone-ok">Hoạt động</span>` : html`<span class="sr-badge tone-danger">Đã khóa</span>`) },
      { title: '', render: (u) => (u.id === session.user.id ? html`<span class="small text-muted-sr">Bạn</span>` : u.isActive ? html`<button class="btn btn-sm btn-outline-danger" data-action="lock" data-id="${u.id}" data-name="${u.displayName}">Khóa</button>` : html`<button class="btn btn-sm btn-outline-success" data-action="unlock" data-id="${u.id}">Mở khóa</button>`) },
    ],
    fetch: (q, o) => systemApi.users(q, o),
    order: [[0, 'asc']],
    empty: { title: 'Không có tài khoản' },
  });
  ctx.onCleanup(bindActions(ctx.outlet, {
    lock: async (btn) => {
      const reason = await reasonDialog({ title: `Khóa tài khoản ${btn.dataset.name}?`, text: 'Mọi phiên đăng nhập bị thu hồi ngay. Dữ liệu nghiệp vụ không bị xóa.', confirmText: 'Khóa tài khoản', tone: 'danger' });
      if (reason && await runAction(() => systemApi.lockUser(btn.dataset.id, reason), { success: 'Đã khóa tài khoản' })) list.reload();
    },
    unlock: async (btn) => {
      if (await runAction(() => systemApi.unlockUser(btn.dataset.id), { success: 'Đã mở khóa tài khoản' })) list.reload();
    },
  }));
}
