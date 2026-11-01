// Chi tiết phòng: ảnh, giá đang áp dụng, tiện ích, khách đang thuê, hợp đồng của phòng, tin đăng trên trang tìm phòng.
import { ROOM_RATE_FIELDS, priceText, statBand } from '../../components/admin-kit.js';
import { badge } from '../../components/badges.js';
import { confirmDialog, errorDialog, reasonDialog, runAction, toast } from '../../components/dialogs.js';
import { asset, emptyState, errorState, icon, link, loadingBlock, note, pageHeader, plate } from '../../components/ui.js';
import { ApiError } from '../../services/errors.js';
import { contractsApi, reservationsApi, roomsApi, tenanciesApi } from '../../services/api.js';
import { session } from '../../services/session.js';
import { formatDate, formatDateTime } from '../../utils/date.js';
import { formatVnd } from '../../utils/money.js';
import { html, setHtml } from '../../utils/html.js';
import { bindActions, dataChanged } from './common.js';

export default async function RoomDetailPage(ctx) {
  const id = ctx.params.id;
  const canWrite = session.can('rooms.write');
  let room;

  const render = async () => {
    setHtml(ctx.outlet, loadingBlock(10));
    let contracts = [];
    try {
      [room, contracts] = await Promise.all([roomsApi.get(id), session.can('contracts.read') ? contractsApi.list({ roomId: id, pageSize: 20 }).then((r) => r.items) : []]);
    } catch (error) {
      setHtml(ctx.outlet, errorState(error));
      return;
    }
    const r = room;
    ctx.setTitle(`Phòng ${r.code}`);
    const rate = (code) => r.rates.effective.find((x) => x.chargeType.code === code);
    const hold = r.calendar.find((c) => c.reservation?.status === 'holding');
    const current = contracts.find((k) => ['active', 'signed', 'expired'].includes(k.status) && k.tenancyStatus === 'active');
    const occupant = r.currentTenancy;
    const cover = r.images.find((i) => i.isCover) || r.images[0];
    const listingLive = r.listing?.status === 'published';
    setHtml(ctx.outlet, html`${pageHeader({
      title: html`${plate(r.code, { size: 'lg' })} ${r.name}`,
      titleExtra: badge('occupancy', r.occupancyStatus),
      subtitle: html`<a class="link-quiet" href="${link(`/admin/properties/${r.property.id}`)}">${r.property.name}</a>${r.floorLabel ? `, ${r.floorLabel}` : ''}`,
      breadcrumbs: [{ label: 'Phòng', href: '/admin/rooms' }, { label: r.code }],
      actions: html`
        ${canWrite ? html`<button type="button" class="btn btn-outline-danger btn-sm" data-action="delete">${icon('trash3')} Xóa</button>
        <a class="btn btn-outline-secondary btn-sm" href="${link(`/admin/rooms/${id}/edit`)}">${icon('pencil')} Sửa</a>` : ''}
        ${r.occupancyStatus === 'available' && !hold && session.can('tenancies.checkin') ? html`<a class="btn btn-primary btn-sm" href="${link(`/admin/contracts/new?roomId=${id}`)}">${icon('file-earmark-plus')} Tạo hợp đồng</a>` : ''}`,
    })}
    ${statBand([
    { label: 'Giá thuê', value: formatVnd(r.currentRent) },
    { label: 'Diện tích', value: `${r.areaM2} m²`, note: `Tối đa ${r.capacity} người` },
    { label: 'Tiền cọc đề xuất', value: formatVnd(r.requiredDeposit) },
  ])}
    ${hold ? html`<div class="ad-reminder sr-no-print">${icon('bookmark')}<p>Phòng đang được giữ cho <strong>${hold.reservation.tenant.fullName}</strong> đến ${formatDateTime(hold.holdExpiresAt)}.</p>
      ${session.can('inquiries.write') ? html`<button type="button" class="btn btn-sm btn-primary" data-action="cancel-hold" data-id="${hold.reservation.id}">Hủy giữ chỗ</button>` : ''}</div>` : ''}
    <div class="ad-grid">
      <div class="ad-col-main">
        <section class="sr-panel">
          ${cover ? html`<div class="ad-gallery"><img class="ad-gallery-main" src="${asset(cover.url)}" alt="${cover.caption || `Ảnh phòng ${r.code}`}">
            ${r.images.length > 1 ? html`<div class="ad-gallery-strip">${r.images.filter((i) => i.id !== cover.id).slice(0, 4).map((i) => html`<img src="${asset(i.url)}" alt="${i.caption || ''}" loading="lazy">`)}</div>` : ''}</div>`
    : emptyState({ iconName: 'image', title: 'Phòng chưa có ảnh', text: 'Thêm ảnh trước khi đăng tin lên trang tìm phòng.', action: canWrite ? html`<a class="btn btn-outline-primary btn-sm" href="${link(`/admin/rooms/${id}/edit`)}">Thêm ảnh</a>` : '' })}
          ${r.description ? html`<div class="sr-panel-body border-top"><p class="mb-0">${r.description}</p></div>` : ''}
        </section>
        <section class="sr-panel"><div class="sr-panel-head"><h2>Hợp đồng của phòng</h2><span class="sr-panel-note">${contracts.length} hợp đồng</span></div>
          ${contracts.length ? html`<div class="table-responsive"><table class="table align-middle mb-0"><thead><tr><th>Mã</th><th>Khách thuê</th><th>Thời hạn</th><th>Trạng thái</th></tr></thead><tbody>
            ${contracts.map((k) => html`<tr><td><a class="fw-semibold" href="${link(`/admin/contracts/${k.id}`)}">${k.code}</a></td>
              <td><a class="link-quiet" href="${link(`/admin/tenants/${k.representative.id}`)}">${k.representative.fullName}</a></td>
              <td class="num">${formatDate(k.effectiveFrom)} – ${formatDate(k.displayEndOn)}</td><td>${badge('contract', k.status)}</td></tr>`)}</tbody></table></div>`
    : html`<p class="ad-mini-empty">Phòng chưa có hợp đồng.</p>`}
        </section>
        ${r.tickets.length ? html`<section class="sr-panel ad-mini"><div class="sr-panel-head"><h2>Ticket gần đây</h2></div><ul>
          ${r.tickets.map((t) => html`<li><a href="${link(`/admin/tickets/${t.id}`)}"><span class="ad-mini-text"><strong>${t.title}</strong><small>${t.code}, ${formatDate(t.createdAt)}</small></span><span class="ad-mini-end">${badge('ticket', t.status)}</span></a></li>`)}</ul></section>` : ''}
      </div>
      <div class="ad-col-side">
        ${occupant ? html`<section class="sr-panel ${occupant.hasContract ? '' : 'is-callout'}"><div class="sr-panel-head"><h2>Khách đang thuê</h2></div><div class="sr-panel-body">
          <p class="mb-1"><a class="fw-semibold" href="${link(`/admin/tenants/${occupant.representative.id}`)}">${occupant.representative.fullName}</a></p>
          <p class="small text-muted-sr mb-2">${current ? `Đến hết ${formatDate(current.displayEndOn)}` : `Vào ở từ ${formatDate(occupant.since)}`}</p>
          ${current ? html`<a class="btn btn-outline-secondary btn-sm w-100" href="${link(`/admin/contracts/${current.id}`)}">Mở hợp đồng ${current.code}</a>` : ''}
          ${occupant.hasContract ? '' : html`<p class="small mb-2">Chưa có hợp đồng nên chưa tạo được hóa đơn cho phòng này.</p>
            <div class="ad-stack">
              ${session.can('contracts.sign') ? html`<a class="btn btn-primary btn-sm" href="${link(`/admin/contracts/new?tenancyId=${occupant.id}`)}">${icon('file-earmark-plus')} Bổ sung hợp đồng</a>` : ''}
              ${occupant.onboardingMode === 'import' && session.can('tenancies.checkin') ? html`<button type="button" class="btn btn-outline-danger btn-sm" data-action="cancel-import" data-id="${occupant.id}">Gỡ khách khỏi phòng</button>` : ''}
            </div>`}
        </div></section>` : ''}
        <section class="sr-panel"><div class="sr-panel-head"><h2>Giá và chi phí</h2></div>
          <ul class="ad-price-list">${ROOM_RATE_FIELDS.map((f) => {
    const item = rate(f.code);
    return item ? html`<li><span>${f.label}<small>${item.scope === 'room' ? 'Giá riêng của phòng' : 'Theo cơ sở'}</small></span><strong class="num">${priceText(item.unitPrice, f.unit)}</strong></li>` : '';
  })}</ul></section>
        <section class="sr-panel"><div class="sr-panel-head"><h2>Tiện ích và nội thất</h2></div><div class="sr-panel-body">
          ${r.amenities.length ? html`<ul class="ad-amenities">${r.amenities.map((a) => html`<li>${icon(a.icon || 'check2')} ${a.name}</li>`)}</ul>` : html`<p class="small text-muted-sr mb-0">Chưa có tiện ích.</p>`}</div></section>
        <section class="sr-panel"><div class="sr-panel-head"><h2>Tin trên trang tìm phòng</h2></div><div class="sr-panel-body">
          <p class="small mb-2">${r.listing ? badge('listing', r.listing.status) : html`<span class="sr-badge tone-muted">Chưa đăng</span>`}</p>
          ${r.images.length ? '' : html`<div class="mb-2">${note('Cần ít nhất một ảnh để đăng tin.', { tone: 'warn' })}</div>`}
          ${canWrite ? html`<button type="button" class="btn btn-outline-primary btn-sm w-100" data-action="listing" data-status="${listingLive ? 'hidden' : 'published'}">${listingLive ? 'Ẩn tin khỏi trang tìm phòng' : 'Đăng lên trang tìm phòng'}</button>` : ''}
        </div></section>
      </div>
    </div>`);
  };

  await render();
  ctx.onCleanup(bindActions(ctx.outlet, {
    delete: async () => {
      if (!(await confirmDialog({ title: `Xóa phòng ${room.code}?`, text: 'Chỉ xóa được phòng chưa có lịch sử thuê. Thao tác này không thể hoàn tác.', confirmText: 'Xóa phòng', tone: 'danger' }))) return;
      try {
        await roomsApi.remove(id);
        toast('Đã xóa phòng');
        dataChanged();
        ctx.navigate('/admin/rooms');
      } catch (error) {
        if (!(error instanceof ApiError) || error.code !== 'room_has_history') {
          await errorDialog(error);
          return;
        }
        const reason = await reasonDialog({ title: 'Phòng có lịch sử nên không xóa được', text: 'Có thể ngừng khai thác phòng để ẩn khỏi danh sách cho thuê và vẫn giữ lịch sử.', label: 'Lý do ngừng khai thác', confirmText: 'Ngừng khai thác', tone: 'danger' });
        if (reason && await runAction(() => roomsApi.setStatus(id, 'inactive', reason), { success: 'Đã ngừng khai thác phòng' })) await render();
      }
    },
    listing: async (btn) => {
      const body = { title: room.listing?.title || `${room.name} – ${room.property.name}`, description: room.listing?.description || room.description, status: btn.dataset.status };
      if (await runAction(() => roomsApi.saveListing(id, body), { success: btn.dataset.status === 'published' ? 'Đã đăng tin' : 'Đã ẩn tin' })) await render();
    },
    'cancel-import': async (btn) => {
      const reason = await reasonDialog({ title: 'Gỡ khách khỏi phòng', text: 'Dùng khi chọn nhầm khách hoặc khách đã chuyển đi mà chưa có hợp đồng. Phòng trở lại còn trống và số điện nước đã nhập cho khách này bị hủy. Khách đã có hợp đồng hoặc hóa đơn thì phải trả phòng theo hợp đồng.', confirmText: 'Gỡ khách', tone: 'danger' });
      if (reason && await runAction(() => tenanciesApi.cancelImport(btn.dataset.id, reason), { success: 'Đã gỡ khách khỏi phòng' })) {
        dataChanged();
        await render();
      }
    },
    'cancel-hold': async (btn) => {
      const reason = await reasonDialog({ title: 'Hủy giữ chỗ', text: 'Phòng sẽ trở lại trạng thái còn trống.', confirmText: 'Hủy giữ chỗ', tone: 'danger' });
      if (reason && await runAction(() => reservationsApi.cancel(btn.dataset.id, reason), { success: 'Đã hủy giữ chỗ' })) await render();
    },
  }));
}
