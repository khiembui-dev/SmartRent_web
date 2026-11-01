// Cơ sở: xem nhanh tình trạng phòng và bảng giá của từng cơ sở, mở chi tiết, sửa, xóa.
import { progressBar, RATE_FIELDS, rowActions } from '../../components/admin-kit.js';
import { confirmDialog, runAction } from '../../components/dialogs.js';
import { emptyState, errorState, icon, link, loadingBlock, pageHeader } from '../../components/ui.js';
import { replaceQuery } from '../../router/router.js';
import { propertiesApi } from '../../services/api.js';
import { session } from '../../services/session.js';
import { debounce } from '../../utils/dom.js';
import { formatVnd } from '../../utils/money.js';
import { html, setHtml } from '../../utils/html.js';
import { bindActions, dataChanged } from './common.js';

function propertyRow(p, canWrite) {
  const free = p.availableCount;
  return html`<article class="ad-prop ${p.isActive ? '' : 'is-off'}">
    <div class="ad-prop-main">
      <a class="ad-prop-name" href="${link(`/admin/properties/${p.id}`)}">${p.name}</a>
      <p>${icon('geo-alt')} ${[p.address.line, p.address.locality, p.address.province].filter(Boolean).join(', ')}</p>
      ${p.isActive ? '' : html`<span class="sr-badge tone-muted">Ngừng hoạt động</span>`}
    </div>
    <div class="ad-prop-occ">
      <p><strong class="num">${p.occupiedCount}</strong>/${p.roomCount} phòng đã thuê${free ? html`, <strong class="num">${free}</strong> trống` : ''}</p>
      ${progressBar([{ label: 'Đã thuê', value: p.occupiedCount, tone: 'done' }, { label: 'Còn trống', value: p.availableCount, tone: 'todo' }, { label: 'Khác', value: p.maintenanceCount + p.inactiveCount, tone: 'off' }], p.roomCount)}
    </div>
    <dl class="ad-prop-prices">${RATE_FIELDS.map((r) => html`<div><dt>${r.short}</dt><dd class="num">${p.prices[r.code] == null ? 'Chưa đặt' : formatVnd(p.prices[r.code])}</dd></div>`)}</dl>
    ${rowActions([
    { href: `/admin/properties/${p.id}`, label: `Xem chi tiết ${p.name}`, icon: 'eye' },
    canWrite && { href: `/admin/properties/${p.id}/edit`, label: `Sửa ${p.name}`, icon: 'pencil' },
    canWrite && { action: 'delete', id: p.id, label: `Xóa ${p.name}`, icon: 'trash3', danger: true },
  ])}
  </article>`;
}

export default async function PropertiesPage(ctx) {
  ctx.setTitle('Cơ sở');
  const canWrite = session.can('properties.write');
  let q = ctx.query.q || '';
  let items = [];

  setHtml(ctx.outlet, html`${pageHeader({
    title: 'Cơ sở',
    subtitle: 'Mỗi cơ sở giữ bảng giá điện, nước và dịch vụ. Phòng mới có thể kế thừa bảng giá này.',
    actions: canWrite ? html`<a class="btn btn-primary btn-sm" href="${link('/admin/properties/new')}">${icon('plus-lg')} Thêm cơ sở</a>` : '',
  })}
  <section class="sr-panel">
    <div class="ad-toolbar"><div class="ad-search">${icon('search')}<input type="search" class="form-control form-control-sm" id="pr-q" value="${q}" placeholder="Tìm theo tên hoặc địa chỉ" aria-label="Tìm cơ sở" autocomplete="off"></div></div>
    <div data-list>${loadingBlock(6)}</div>
  </section>`);
  const list = ctx.outlet.querySelector('[data-list]');

  const load = async () => {
    replaceQuery({ q: q || undefined });
    try {
      items = (await propertiesApi.list({ q: q || undefined, pageSize: 100 }, { signal: ctx.signal })).items;
    } catch (error) {
      if (ctx.signal.aborted) return;
      setHtml(list, errorState(error));
      list.querySelector('#sr-retry')?.addEventListener('click', load);
      return;
    }
    setHtml(list, items.length ? html`${items.map((p) => propertyRow(p, canWrite))}` : emptyState(q
      ? { iconName: 'search', title: 'Không tìm thấy cơ sở', text: 'Thử tên hoặc địa chỉ khác.' }
      : { iconName: 'buildings', title: 'Chưa có cơ sở nào', text: 'Thêm cơ sở đầu tiên để bắt đầu tạo phòng.', action: canWrite ? html`<a class="btn btn-primary btn-sm" href="${link('/admin/properties/new')}">Thêm cơ sở</a>` : '' }));
  };
  const search = debounce(() => load(), 300);
  ctx.outlet.querySelector('#pr-q').addEventListener('input', (event) => {
    q = event.target.value.trim();
    search();
  });
  ctx.onCleanup(() => search.cancel());
  ctx.onCleanup(bindActions(ctx.outlet, {
    delete: async (btn) => {
      const p = items.find((x) => x.id === btn.dataset.id);
      if (!(await confirmDialog({ title: `Xóa ${p.name}?`, text: 'Chỉ xóa được cơ sở chưa có phòng. Thao tác này không thể hoàn tác.', confirmText: 'Xóa cơ sở', tone: 'danger' }))) return;
      const done = await runAction(async () => { await propertiesApi.remove(p.id); return true; }, { success: `Đã xóa ${p.name}` });
      if (done) {
        await session.reload();
        dataChanged();
        await load();
      }
    },
  }));
  await load();
}
