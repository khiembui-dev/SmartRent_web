// Chi tiết cơ sở: bảng giá đang áp dụng và các phòng thuộc cơ sở.
import { priceText, RATE_FIELDS, roomThumb, statBand } from '../../components/admin-kit.js';
import { badge } from '../../components/badges.js';
import { confirmDialog, reasonDialog, runAction } from '../../components/dialogs.js';
import { emptyState, errorState, icon, link, loadingBlock, pageHeader, plate } from '../../components/ui.js';
import { propertiesApi, roomsApi } from '../../services/api.js';
import { session } from '../../services/session.js';
import { formatDate } from '../../utils/date.js';
import { formatVnd } from '../../utils/money.js';
import { html, setHtml } from '../../utils/html.js';
import { bindActions, dataChanged } from './common.js';

export default async function PropertyDetailPage(ctx) {
  const id = ctx.params.id;
  const canWrite = session.can('properties.write');
  let property;

  const render = async () => {
    setHtml(ctx.outlet, loadingBlock(8));
    let rooms;
    try {
      [property, rooms] = await Promise.all([propertiesApi.get(id), roomsApi.list({ propertyId: id, pageSize: 200 }).then((r) => r.items)]);
    } catch (error) {
      setHtml(ctx.outlet, errorState(error));
      return;
    }
    const p = property;
    ctx.setTitle(p.name);
    const sinceOf = (code) => p.rates.find((r) => r.chargeType.code === code && !r.effectiveTo)?.effectiveFrom;
    setHtml(ctx.outlet, html`${pageHeader({
      title: p.name,
      titleExtra: p.isActive ? '' : html`<span class="sr-badge tone-muted">Ngừng hoạt động</span>`,
      subtitle: html`${icon('geo-alt')} ${[p.address.line, p.address.locality, p.address.province].filter(Boolean).join(', ')}`,
      breadcrumbs: [{ label: 'Cơ sở', href: '/admin/properties' }, { label: p.name }],
      actions: canWrite ? html`
        <button type="button" class="btn btn-outline-danger btn-sm" data-action="delete">${icon('trash3')} Xóa</button>
        <button type="button" class="btn btn-outline-secondary btn-sm" data-action="${p.isActive ? 'deactivate' : 'activate'}">${p.isActive ? 'Ngừng hoạt động' : 'Kích hoạt lại'}</button>
        <a class="btn btn-outline-secondary btn-sm" href="${link(`/admin/properties/${id}/edit`)}">${icon('pencil')} Sửa</a>
        ${session.can('rooms.write') ? html`<a class="btn btn-primary btn-sm" href="${link(`/admin/rooms/new?propertyId=${id}`)}">${icon('plus-lg')} Thêm phòng</a>` : ''}` : '',
    })}
    ${statBand([
    { label: 'Tổng số phòng', value: p.roomCount },
    { label: 'Đã thuê', value: p.occupiedCount, note: p.roomCount ? `Lấp đầy ${Math.round((p.occupiedCount / p.roomCount) * 100)}%` : '' },
    { label: 'Còn trống', value: p.availableCount, tone: p.availableCount ? 'wash' : null },
    { label: 'Bảo trì, ngừng khai thác', value: p.maintenanceCount + p.inactiveCount },
  ])}
    <div class="ad-grid">
      <div class="ad-col-main"><section class="sr-panel">
        <div class="sr-panel-head"><h2>Phòng của cơ sở</h2><span class="sr-panel-note">${rooms.length} phòng</span></div>
        ${rooms.length ? html`<div class="table-responsive"><table class="table align-middle mb-0"><thead><tr><th>Phòng</th><th>Diện tích</th><th class="text-end">Giá thuê</th><th>Khách đang ở</th><th>Trạng thái</th></tr></thead>
          <tbody>${rooms.map((r) => html`<tr><td><span class="d-inline-flex align-items-center gap-2">${roomThumb(r.coverImageUrl)}${plate(r)}</span></td><td class="num">${r.areaM2} m²</td><td class="text-end num">${formatVnd(r.currentRent)}</td>
            <td>${r.currentTenancy ? html`<a class="link-quiet" href="${link(`/admin/tenants/${r.currentTenancy.representative.id}`)}">${r.currentTenancy.representative.fullName}</a>` : html`<span class="text-muted-sr">—</span>`}</td><td>${badge('occupancy', r.occupancyStatus)}</td></tr>`)}</tbody></table></div>`
    : emptyState({ iconName: 'door-closed', title: 'Cơ sở chưa có phòng', text: 'Thêm phòng và chọn kế thừa giá từ cơ sở này.', action: session.can('rooms.write') ? html`<a class="btn btn-primary btn-sm" href="${link(`/admin/rooms/new?propertyId=${id}`)}">Thêm phòng</a>` : '' })}
      </section></div>
      <div class="ad-col-side"><section class="sr-panel">
        <div class="sr-panel-head"><h2>Bảng giá đang áp dụng</h2></div>
        <ul class="ad-price-list">${RATE_FIELDS.map((r) => html`<li><span>${r.label}${sinceOf(r.code) ? html`<small>Từ ${formatDate(sinceOf(r.code))}</small>` : ''}</span><strong class="num">${priceText(p.prices[r.code], r.unit)}</strong></li>`)}</ul>
      </section></div>
    </div>`);
  };

  await render();
  ctx.onCleanup(bindActions(ctx.outlet, {
    delete: async () => {
      if (!(await confirmDialog({ title: `Xóa ${property.name}?`, text: 'Chỉ xóa được cơ sở chưa có phòng. Thao tác này không thể hoàn tác.', confirmText: 'Xóa cơ sở', tone: 'danger' }))) return;
      if (await runAction(async () => { await propertiesApi.remove(id); return true; }, { success: 'Đã xóa cơ sở' })) {
        await session.reload();
        dataChanged();
        ctx.navigate('/admin/properties');
      }
    },
    deactivate: async () => {
      const reason = await reasonDialog({ title: 'Ngừng hoạt động cơ sở', text: 'Cơ sở còn khách đang ở thì chưa ngừng được. Tin đăng của cơ sở sẽ không hiển thị với khách.', confirmText: 'Ngừng hoạt động', tone: 'danger' });
      if (reason && await runAction(() => propertiesApi.deactivate(id, reason), { success: 'Đã ngừng hoạt động' })) await render();
    },
    activate: async () => {
      if (await runAction(() => propertiesApi.activate(id), { success: 'Đã kích hoạt lại' })) await render();
    },
  }));
}
