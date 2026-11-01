// Hỗ trợ & vận hành: quyền hỗ trợ đang có, sao lưu/kiểm thử khôi phục (MÔ PHỎNG), tình trạng nguồn dữ liệu demo.
import { confirmDialog, runAction } from '../../components/dialogs.js';
import { dateTime, dl, emptyState, errorState, icon, loadingBlock, note, pageHeader, panel, simulated } from '../../components/ui.js';
import { systemApi } from '../../services/api.js';
import { html, setHtml } from '../../utils/html.js';

export default async function SystemOperationsPage(ctx) {
  ctx.setTitle('Hỗ trợ & vận hành');
  const render = async () => {
    setHtml(ctx.outlet, loadingBlock(6));
    let grants;
    let backups;
    let health;
    try {
      [grants, backups, health] = await Promise.all([systemApi.supportAccess(), systemApi.backups(), systemApi.health()]);
    } catch (error) {
      setHtml(ctx.outlet, errorState(error));
      return;
    }
    setHtml(ctx.outlet, html`${pageHeader({ title: 'Hỗ trợ & vận hành', subtitle: 'Theo dõi quyền hỗ trợ do chủ trọ cấp, sao lưu và tình trạng hệ thống.' })}
      <div class="row g-3">
        <div class="col-xl-7">
          ${panel({
      title: 'Quyền hỗ trợ truy cập', note: 'Do chủ trọ cấp, có lý do và hết hạn tự động', flush: true,
      body: grants.length ? html`<ul class="list-group list-group-flush">${grants.map((g) => html`<li class="list-group-item">
              <div class="d-flex flex-wrap gap-2 align-items-center"><strong>${g.organization.name}</strong>${g.isActive ? html`<span class="sr-badge tone-warn">Đang hiệu lực</span>` : html`<span class="sr-badge tone-muted">${g.revokedAt ? 'Đã thu hồi' : 'Hết hạn'}</span>`}</div>
              <div class="small">${g.reason}</div><div class="small text-muted-sr">Cấp bởi ${g.grantedBy?.displayName} cho ${g.grantedTo?.displayName}, ${dateTime(g.startsAt)} → ${dateTime(g.expiresAt)}</div></li>`)}</ul>` : emptyState({ iconName: 'shield-lock', title: 'Chưa có quyền hỗ trợ nào' }),
    })}
          ${panel({
      title: 'Sao lưu và kiểm thử khôi phục', actions: html`${simulated()}<button class="btn btn-sm btn-outline-primary" data-run="backup">${icon('cloud-arrow-up')} Ghi nhận sao lưu</button><button class="btn btn-sm btn-outline-secondary" data-run="restore_test">${icon('arrow-counterclockwise')} Ghi nhận kiểm thử khôi phục</button>`, flush: true,
      body: html`<div class="px-3 pt-3">${note('Chưa kết nối dịch vụ sao lưu nên hệ thống chưa sao lưu hay khôi phục thật.', { tone: 'sim' })}</div>
              ${backups.length ? html`<div class="table-responsive"><table class="table table-sm align-middle mb-0"><thead><tr><th>Bắt đầu</th><th>Loại</th><th>Kết quả</th><th>Tham chiếu</th></tr></thead><tbody>
              ${backups.map((b) => html`<tr><td class="small">${dateTime(b.startedAt)}</td><td>${b.kind === 'backup' ? 'Sao lưu' : 'Kiểm thử khôi phục'}</td><td>${b.status === 'succeeded' ? html`<span class="sr-badge tone-ok">Ghi nhận</span>` : html`<span class="sr-badge tone-danger">Lỗi</span>`}</td><td class="small">${b.reference}</td></tr>`)}</tbody></table></div>` : emptyState({ title: 'Chưa có lần sao lưu nào' })}`,
    })}
        </div>
        <div class="col-xl-5">
          ${panel({
      title: 'Tình trạng nguồn dữ liệu', body: html`${dl([
        ['Nguồn dữ liệu', health.dataSource === 'mock' ? 'Dữ liệu mô phỏng trong trình duyệt' : health.dataSource],
        ['Đơn vị', health.counts.organizations], ['Tài khoản', health.counts.users], ['Phòng', health.counts.rooms], ['Hóa đơn', health.counts.invoices], ['Phiếu thu', health.counts.payments],
      ])}`,
    })}
        </div>
      </div>`);
  };
  await render();
  const onClick = async (event) => {
    const btn = event.target.closest('[data-run]');
    if (!btn) return;
    const label = btn.dataset.run === 'backup' ? 'sao lưu' : 'kiểm thử khôi phục';
    if (!(await confirmDialog({ title: `Ghi nhận ${label} (mô phỏng)?`, text: 'Chỉ tạo một dòng minh họa; không có dữ liệu nào được sao lưu hay khôi phục.', confirmText: 'Ghi nhận' }))) return;
    if (await runAction(() => systemApi.runBackup(btn.dataset.run), { success: `Đã ghi nhận ${label} (mô phỏng)` })) await render();
  };
  ctx.outlet.addEventListener('click', onClick);
  ctx.onCleanup(() => ctx.outlet.removeEventListener('click', onClick));
}
