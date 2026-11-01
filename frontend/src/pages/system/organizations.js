// Quản trị hệ thống: đơn vị chủ trọ. Chỉ thấy số liệu tổng quát; dữ liệu nghiệp vụ của đơn vị cần quyền hỗ trợ do chủ trọ cấp.
import { reasonDialog, runAction, toast } from '../../components/dialogs.js';
import { mountList } from '../../components/list-page.js';
import { formModal } from '../../components/modal.js';
import { dateTime, icon, note, pageHeader } from '../../components/ui.js';
import { systemApi } from '../../services/api.js';
import { html, setHtml } from '../../utils/html.js';
import { bindActions } from '../admin/common.js';

export default async function SystemOrganizationsPage(ctx) {
  ctx.setTitle('Đơn vị chủ trọ');
  setHtml(ctx.outlet, html`${pageHeader({
    title: 'Đơn vị chủ trọ', subtitle: 'Mỗi đơn vị là một chủ trọ hoặc công ty quản lý, dữ liệu tách biệt hoàn toàn với đơn vị khác.',
    actions: html`<button class="btn btn-primary btn-sm" data-action="create">${icon('plus-lg')} Tạo đơn vị</button>`,
  })}
    ${note('Quản trị hệ thống không xem phòng, khách, hóa đơn của đơn vị. Khi cần hỗ trợ, chủ trọ cấp quyền hỗ trợ có lý do và thời hạn (xem Hỗ trợ & vận hành).')}
    <div class="mt-3" data-list></div>`);
  const list = mountList(ctx, ctx.outlet.querySelector('[data-list]'), {
    filters: [{ name: 'q', type: 'search', label: 'Tìm đơn vị', placeholder: 'Mã hoặc tên' }],
    columns: [
      { title: 'Đơn vị', sortKey: 'name', render: (o) => html`<span class="fw-550">${o.name}</span><div class="small text-muted-sr">${o.code}</div>` },
      { title: 'Chủ trọ', render: (o) => o.owners.map((u) => u.displayName).join(', ') || html`<span class="text-danger">Chưa có</span>` },
      { title: 'Quy mô', render: (o) => html`<span class="small">${o.propertyCount} cơ sở, ${o.roomCount} phòng, ${o.activeTenancies} đợt thuê đang ở, ${o.memberCount} nhân sự</span>` },
      { title: 'Trạng thái', render: (o) => (o.isActive ? html`<span class="sr-badge tone-ok">Hoạt động</span>` : html`<span class="sr-badge tone-danger">Tạm ngừng</span>`) },
      { title: 'Tạo lúc', sortKey: 'createdAt', render: (o) => dateTime(o.createdAt) },
      { title: '', render: (o) => (o.isActive ? html`<button class="btn btn-sm btn-outline-danger" data-action="suspend" data-id="${o.id}" data-name="${o.name}">Tạm ngừng</button>` : html`<button class="btn btn-sm btn-outline-success" data-action="activate" data-id="${o.id}">Kích hoạt</button>`) },
    ],
    fetch: (q, o) => systemApi.organizations(q, o),
    order: [[0, 'asc']],
    empty: { title: 'Chưa có đơn vị' },
  });
  ctx.onCleanup(bindActions(ctx.outlet, {
    create: async () => {
      const result = await formModal({
        title: 'Tạo đơn vị chủ trọ', submitLabel: 'Tạo đơn vị',
        intro: note('Hệ thống tạo sẵn vai trò mặc định (Chủ trọ, Quản lý, Nhân viên), danh mục khoản thu, loại sự cố, SLA và cấu hình; mời chủ trọ đặt mật khẩu qua email (mô phỏng). Không tạo dữ liệu mẫu.'),
        fields: [
          { name: 'code', label: 'Mã đơn vị', required: true, col: 'col-md-4', help: 'Chữ in hoa, không dấu' },
          { name: 'name', label: 'Tên đơn vị', required: true, col: 'col-md-8' },
          { name: 'ownerName', label: 'Họ tên chủ trọ', required: true, col: 'col-md-6' },
          { name: 'ownerEmail', label: 'Email chủ trọ', type: 'email', required: true, col: 'col-md-6' },
        ],
        transform: (v) => ({ ...v, code: v.code?.toUpperCase() }),
        onSubmit: (v) => systemApi.createOrganization(v),
      });
      if (result) { toast(`Đã tạo ${result.name}; lời mời chủ trọ ở trạng thái mô phỏng`); list.reload(); }
    },
    suspend: async (btn) => {
      const reason = await reasonDialog({ title: `Tạm ngừng ${btn.dataset.name}?`, text: 'Nhân sự của đơn vị không đăng nhập vào khu quản trị được cho tới khi kích hoạt lại. Dữ liệu được giữ nguyên.', confirmText: 'Tạm ngừng', tone: 'danger' });
      if (reason && await runAction(() => systemApi.suspendOrganization(btn.dataset.id, reason), { success: 'Đã tạm ngừng đơn vị' })) list.reload();
    },
    activate: async (btn) => {
      if (await runAction(() => systemApi.activateOrganization(btn.dataset.id), { success: 'Đã kích hoạt đơn vị' })) list.reload();
    },
  }));
}
