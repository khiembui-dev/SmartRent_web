// Khách thuê: quản lý tài khoản khách, tìm theo tên/điện thoại/phòng, mở hồ sơ để sửa thông tin và đổi mật khẩu.
import { rowActions } from '../../components/admin-kit.js';
import { badge, options } from '../../components/badges.js';
import { toast } from '../../components/dialogs.js';
import { mountList } from '../../components/list-page.js';
import { icon, link, pageHeader, person, plate } from '../../components/ui.js';
import { tenantsApi } from '../../services/api.js';
import { session } from '../../services/session.js';
import { formatPhone } from '../../utils/format.js';
import { html, setHtml } from '../../utils/html.js';
import { bindActions, dataChanged, moneyCell } from './common.js';
import { tenantFormModal } from './tenant-dialogs.js';

export default function TenantsPage(ctx) {
  ctx.setTitle('Khách thuê');
  const canWrite = session.can('tenants.write');
  setHtml(ctx.outlet, html`${pageHeader({
    title: 'Khách thuê',
    subtitle: 'Tài khoản và hồ sơ của khách. Khách đã rời phòng vẫn giữ lịch sử hợp đồng và công nợ.',
    actions: canWrite ? html`<button type="button" class="btn btn-primary btn-sm" data-action="add">${icon('person-plus')} Thêm khách</button>` : '',
  })}<div data-list></div>`);

  const list = mountList(ctx, ctx.outlet.querySelector('[data-list]'), {
    filters: [
      { name: 'q', type: 'search', label: 'Tìm khách', placeholder: 'Tên, mã khách, điện thoại, email, phòng' },
      { name: 'propertyId', type: 'property' },
      { name: 'residenceStatus', type: 'select', label: 'Tình trạng ở', options: options('residence') },
      { name: 'portal', type: 'select', label: 'Tài khoản', options: [{ value: 'yes', label: 'Đã có tài khoản' }, { value: 'no', label: 'Chưa có tài khoản' }] },
    ],
    quick: [
      { label: 'Đang ở', params: { residenceStatus: 'active' } },
      { label: 'Còn nợ', params: { debt: 'outstanding' } },
      { label: 'Có đề nghị sửa hồ sơ', params: { profileRequests: 'pending' } },
    ],
    columns: [
      { title: 'Khách thuê', sortKey: 'fullName', render: (t) => html`<a class="ad-person-link" href="${link(`/admin/tenants/${t.id}`)}">${person(t.fullName, t.code)}</a>` },
      { title: 'Liên hệ', render: (t) => html`<span class="num">${formatPhone(t.phone)}</span><div class="small text-muted-sr">${t.email || ''}</div>` },
      { title: 'Tài khoản', render: (t) => (t.hasPortalAccount ? html`<span class="sr-badge tone-ok">Đã có tài khoản</span>` : html`<span class="sr-badge tone-muted">Chưa có tài khoản</span>`) },
      { title: 'Phòng đang thuê', render: (t) => (t.currentTenancy ? html`${plate(t.currentTenancy.room)}${t.currentTenancy.role === 'resident' ? html` <span class="small text-muted-sr">ở cùng</span>` : ''}` : html`<span class="text-muted-sr">—</span>`) },
      { title: 'Còn nợ', sortKey: 'outstandingAmount', className: 'text-end', render: (t) => html`${moneyCell(t.outstandingAmount, { danger: true })}${t.overdueAmount ? html`<div class="small text-danger">Quá hạn</div>` : ''}` },
      { title: 'Tình trạng', render: (t) => html`${badge('residence', t.residenceStatus)}${t.hasPendingProfileRequest ? html` <span class="sr-badge tone-wash no-dot">Đề nghị sửa</span>` : ''}` },
      { title: '', className: 'text-end ad-actions-col', priority: 2, render: (t) => rowActions([{ href: `/admin/tenants/${t.id}`, label: `Xem hồ sơ ${t.fullName}`, icon: 'eye' }]) },
    ],
    fetch: (q, o) => tenantsApi.list(q, o),
    order: [[0, 'asc']],
    rowHref: (t) => `/admin/tenants/${t.id}`,
    exportSpec: {
      kind: 'tenants', filename: 'khach-thue',
      columns: [{ label: 'Mã', key: 'code' }, { label: 'Họ tên', key: 'fullName' }, { label: 'Điện thoại', key: 'phone' }, { label: 'Email', key: 'email' }, { label: 'Phòng', value: (t) => t.currentTenancy?.room?.code || '' }, { label: 'Tình trạng', key: 'residenceStatus' }, { label: 'Còn nợ', key: 'outstandingAmount' }],
    },
    empty: { title: 'Chưa có khách thuê', text: 'Hồ sơ khách được tạo khi khách đăng ký hoặc khi lập hợp đồng.' },
  });

  ctx.onCleanup(bindActions(ctx.outlet, {
    add: async () => {
      const created = await tenantFormModal();
      if (created) {
        toast(`Đã thêm ${created.fullName}`);
        dataChanged();
        list.reload();
      }
    },
  }));
}
