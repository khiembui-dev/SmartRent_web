// Phòng: tìm, lọc theo cơ sở/trạng thái, xem, sửa, xóa. Trạng thái ở suy ra từ đợt thuê, không phải nhãn sửa tay.
import { roomThumb, rowActions } from '../../components/admin-kit.js';
import { badge } from '../../components/badges.js';
import { confirmDialog, errorDialog, reasonDialog, runAction, toast } from '../../components/dialogs.js';
import { mountList } from '../../components/list-page.js';
import { icon, link, pageHeader, plate } from '../../components/ui.js';
import { ApiError } from '../../services/errors.js';
import { roomsApi } from '../../services/api.js';
import { session } from '../../services/session.js';
import { formatVnd } from '../../utils/money.js';
import { html, setHtml } from '../../utils/html.js';
import { bindActions, dataChanged } from './common.js';
import { roomImagePreview } from '../../services/room-images.js';

const STATUS_OPTIONS = [{ value: 'available', label: 'Còn trống' }, { value: 'occupied', label: 'Đã thuê' }, { value: 'reserved', label: 'Đang cọc giữ phòng' }, { value: 'maintenance', label: 'Bảo trì' }, { value: 'inactive', label: 'Ngừng khai thác' }];

export default function RoomsPage(ctx) {
  ctx.setTitle('Phòng');
  const canWrite = session.can('rooms.write');
  setHtml(ctx.outlet, html`${pageHeader({
    title: 'Phòng',
    subtitle: 'Phòng còn trống cần đăng tin để xuất hiện ở trang khách. Muốn trả phòng đã thuê, mở hợp đồng của phòng.',
    actions: canWrite ? html`<a class="btn btn-primary btn-sm" href="${link('/admin/rooms/new')}">${icon('plus-lg')} Thêm phòng</a>` : '',
  })}<div data-list></div>`);

  const list = mountList(ctx, ctx.outlet.querySelector('[data-list]'), {
    filters: [
      { name: 'q', type: 'search', label: 'Tìm phòng', placeholder: 'Mã phòng, tên phòng, tên khách' },
      { name: 'propertyId', type: 'property' },
      { name: 'status', type: 'select', label: 'Trạng thái', options: STATUS_OPTIONS },
    ],
    quick: [{ label: 'Đã thuê, chưa có hợp đồng', params: { contract: 'missing' } }],
    columns: [
      { title: 'Phòng', sortKey: 'code', render: (r) => html`<span class="ad-room-cell">${roomThumb(r.coverImageUrl)}<span class="min-w-0">${plate(r)}<span class="ad-room-name">${r.name}</span></span></span>` },
      { title: 'Cơ sở', sortKey: 'property.code', render: (r) => r.property.name },
      { title: 'Diện tích', sortKey: 'areaM2', className: 'text-end', render: (r) => html`<span class="num">${r.areaM2} m²</span>` },
      { title: 'Giá thuê', sortKey: 'currentRent', className: 'text-end', render: (r) => html`<span class="num">${formatVnd(r.currentRent)}</span>` },
      { title: 'Khách đang ở', render: (r) => (r.currentTenancy ? html`<a class="link-quiet" href="${link(`/admin/tenants/${r.currentTenancy.representative.id}`)}">${r.currentTenancy.representative.fullName}</a>` : html`<span class="text-muted-sr">—</span>`) },
      { title: 'Trạng thái', sortKey: 'occupancyStatus', render: (r) => html`${badge('occupancy', r.occupancyStatus)}${r.upcoming ? html` <span class="sr-badge tone-wash no-dot">${r.upcoming.state === 'held' ? 'Đang giữ chỗ' : 'Sắp có khách'}</span>` : ''}${r.currentTenancy && !r.currentTenancy.hasContract ? html` <span class="sr-badge tone-wash no-dot">Chưa có hợp đồng</span>` : ''}` },
      // Trạng thái ở và trạng thái tin là hai điều kiện độc lập; hiển thị cả hai để biết vì sao khách chưa thấy phòng.
      { title: 'Tin trên trang khách', sortKey: 'listing.status', render: (r) => html`${badge('listing', r.listing?.status || 'hidden')}${r.listing?.status === 'published' && (r.property.isActive === false || r.occupancyStatus !== 'available') ? html`<small class="d-block text-muted-sr mt-1">${r.property.isActive === false ? 'Cơ sở ngừng hoạt động' : 'Chưa hiện trong phòng trống'}</small>` : ''}` },
      {
        title: '', className: 'text-end ad-actions-col', priority: 2,
        render: (r) => rowActions([
          { href: `/admin/rooms/${r.id}`, label: `Xem phòng ${r.code}`, icon: 'eye' },
          canWrite && { href: `/admin/rooms/${r.id}/edit`, label: `Sửa phòng ${r.code}`, icon: 'pencil' },
          canWrite && (r.listing?.status === 'published'
            ? { action: 'hide-listing', id: r.id, label: `Ẩn tin phòng ${r.code} khỏi trang khách`, icon: 'eye-slash' }
            : { action: 'publish', id: r.id, label: `Đăng phòng ${r.code} lên trang khách`, icon: 'megaphone' }),
          canWrite && { action: 'delete', id: r.id, label: `Xóa phòng ${r.code}`, icon: 'trash3', danger: true },
        ]),
      },
    ],
    fetch: async (q, o) => {
      const result = await roomsApi.list(q, o);
      await Promise.all(result.items.map(async room => { room.coverImageUrl = await roomImagePreview(room.coverImageUrl, o); }));
      return result;
    },
    order: [[0, 'asc']],
    rowHref: (r) => `/admin/rooms/${r.id}`,
    empty: { title: 'Chưa có phòng', text: 'Thêm phòng và gắn vào một cơ sở.' },
  });

  // Dùng chính API đăng/ẩn của trang chi tiết; không đổi trạng thái thuê hoặc tự đăng tất cả phòng ẩn.
  const changeListing = async (btn, status) => {
    const saved = await runAction(async () => {
      const room = await roomsApi.get(btn.dataset.id);
      return roomsApi.saveListing(room.id, {
        status,
        title: room.listing?.title || `${room.name} – ${room.property.name}`,
        description: room.listing?.description || room.description,
      });
    }, { success: status === 'published' ? 'Đã đăng tin. Phòng còn trống sẽ hiển thị ở trang khách.' : 'Đã ẩn tin khỏi trang khách' });
    if (saved) {
      dataChanged();
      list.reload();
    }
  };

  ctx.onCleanup(bindActions(ctx.outlet, {
    publish: (btn) => changeListing(btn, 'published'),
    'hide-listing': (btn) => changeListing(btn, 'hidden'),
    delete: async (btn) => {
      if (!(await confirmDialog({ title: 'Xóa phòng này?', text: 'Chỉ xóa được phòng chưa có lịch sử thuê. Thao tác này không thể hoàn tác.', confirmText: 'Xóa phòng', tone: 'danger' }))) return;
      try {
        await roomsApi.remove(btn.dataset.id);
        toast('Đã xóa phòng');
        dataChanged();
        list.reload();
      } catch (error) {
        if (!(error instanceof ApiError) || error.code !== 'room_has_history') {
          await errorDialog(error);
          return;
        }
        // Phòng có lịch sử không xóa được: gợi ý ngừng khai thác để vừa ẩn phòng vừa giữ dữ liệu.
        const reason = await reasonDialog({ title: 'Phòng có lịch sử nên không xóa được', text: 'Có thể ngừng khai thác phòng để ẩn khỏi danh sách cho thuê và vẫn giữ lịch sử.', label: 'Lý do ngừng khai thác', confirmText: 'Ngừng khai thác', tone: 'danger' });
        if (reason && await runAction(() => roomsApi.setStatus(btn.dataset.id, 'inactive', reason), { success: 'Đã ngừng khai thác phòng' })) list.reload();
      }
    },
  }));
}
