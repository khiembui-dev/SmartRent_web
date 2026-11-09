// Hồ sơ khách: thông tin liên hệ, tài khoản (đổi mật khẩu), phòng đang thuê, hợp đồng, hóa đơn, ticket, đề nghị sửa hồ sơ.
import { invoiceBadges, statBand } from '../../components/admin-kit.js';
import { badge } from '../../components/badges.js';
import { reasonDialog, runAction, toast } from '../../components/dialogs.js';
import { formModal } from '../../components/modal.js';
import { errorState, icon, link, loadingBlock, note, pageHeader, plate, simulated } from '../../components/ui.js';
import { contractsApi, profileRequestsApi, tenantsApi } from '../../services/api.js';
import { session } from '../../services/session.js';
import { formatDate, formatDateTime } from '../../utils/date.js';
import { formatPhone, initials } from '../../utils/format.js';
import { formatVnd } from '../../utils/money.js';
import { html, setHtml } from '../../utils/html.js';
import { bindActions, dataChanged } from './common.js';
import { tenantFormModal, tenantPasswordModal } from './tenant-dialogs.js';

const FIELD_LABELS = { fullName: 'Họ tên', phone: 'Điện thoại', email: 'Email', emergencyContactName: 'Người liên hệ khẩn cấp', emergencyContactPhone: 'Điện thoại khẩn cấp', address: 'Địa chỉ' };
const showValue = (value) => (value && typeof value === 'object' ? Object.values(value).filter(Boolean).join(', ') : value) || '(trống)';

export default async function TenantDetailPage(ctx) {
  const id = ctx.params.id;
  const canWrite = session.can('tenants.write');
  let t;

  const render = async () => {
    setHtml(ctx.outlet, loadingBlock(10));
    let contracts = [];
    try {
      [t, contracts] = await Promise.all([tenantsApi.get(id), session.can('contracts.read') ? contractsApi.list({ tenantId: id, pageSize: 50 }).then((r) => r.items) : []]);
    } catch (error) {
      setHtml(ctx.outlet, errorState(error));
      return;
    }
    ctx.setTitle(t.fullName);
    const pending = t.profileChangeRequests.filter((p) => p.status === 'pending');
    const current = t.tenancies.find((x) => x.status === 'active') || t.tenancies.find((x) => x.status === 'planned');
    setHtml(ctx.outlet, html`${pageHeader({
      title: t.fullName,
      titleExtra: badge('residence', t.residenceStatus),
      subtitle: t.code,
      breadcrumbs: [{ label: 'Khách thuê', href: '/admin/tenants' }, { label: t.fullName }],
      actions: canWrite ? html`
        ${t.hasPortalAccount ? html`<button type="button" class="btn btn-outline-secondary btn-sm" data-action="password">${icon('key')} Đổi mật khẩu</button>`
    : html`<button type="button" class="btn btn-outline-secondary btn-sm" data-action="invite">${icon('envelope')} Mời tạo tài khoản</button>`}
        <button type="button" class="btn btn-primary btn-sm" data-action="edit">${icon('pencil')} Sửa thông tin</button>` : '',
    })}
    ${pending.map((p) => html`<section class="sr-panel is-callout"><div class="sr-panel-head"><h2>Khách đề nghị sửa hồ sơ</h2><span class="sr-panel-note">Gửi ${formatDateTime(p.createdAt)}</span>
      ${canWrite ? html`<div class="sr-panel-actions"><button type="button" class="btn btn-outline-secondary btn-sm" data-action="reject-profile" data-id="${p.id}">Từ chối</button><button type="button" class="btn btn-primary btn-sm" data-action="approve-profile" data-id="${p.id}">Duyệt</button></div>` : ''}</div>
      <div class="sr-panel-body"><ul class="ad-changes">${Object.entries(p.changes).map(([field, change]) => html`<li><span>${FIELD_LABELS[field] || field}</span><span class="text-muted-sr">${showValue(change.from)}</span>${icon('arrow-right')}<strong>${showValue(change.to)}</strong></li>`)}</ul>
        ${p.reason ? html`<p class="small text-muted-sr mt-2 mb-0">Lý do: ${p.reason}</p>` : ''}</div></section>`)}
    ${statBand([
    { label: 'Phòng đang thuê', value: current ? current.room.code : 'Chưa thuê', note: current?.room.propertyName, href: current ? `/admin/rooms/${current.room.id}` : null },
    t.invoices && { label: 'Còn nợ', value: formatVnd(t.outstandingAmount), note: t.overdueAmount ? `Quá hạn ${formatVnd(t.overdueAmount)}` : 'Không có nợ quá hạn', tone: t.overdueAmount ? 'danger' : null },
    { label: 'Cọc đang giữ', value: formatVnd(t.depositHeldTotal) },
    { label: 'Hợp đồng', value: contracts.length },
  ])}
    <div class="ad-grid">
      <div class="ad-col-side">
        <section class="sr-panel ad-profile">
          <div class="ad-profile-head"><span class="ad-profile-avatar">${initials(t.fullName)}</span><div class="min-w-0"><strong>${t.fullName}</strong><small>${t.code}</small></div></div>
          <dl class="ad-kv">
            <div><dt>Điện thoại</dt><dd>${t.phone ? html`<a href="tel:${t.phone}">${formatPhone(t.phone)}</a>` : '—'}</dd></div>
            <div><dt>Email</dt><dd>${t.email || '—'}</dd></div>
            <div><dt>Ngày sinh</dt><dd>${t.dateOfBirth ? formatDate(t.dateOfBirth) : '—'}</dd></div>
            <div><dt>Địa chỉ</dt><dd>${[t.address?.line, t.address?.locality].filter(Boolean).join(', ') || '—'}</dd></div>
            <div><dt>Liên hệ khẩn cấp</dt><dd>${t.emergencyContactName ? `${t.emergencyContactName}${t.emergencyContactPhone ? `, ${formatPhone(t.emergencyContactPhone)}` : ''}` : '—'}</dd></div>
            <div><dt>Giấy tờ</dt><dd>${t.identityDocuments.length ? t.identityDocuments.map((d) => html`<span class="d-block">${d.numberMasked} ${d.verifiedAt ? html`<span class="sr-badge tone-ok">Đã xác minh</span>` : html`<span class="sr-badge tone-muted">Chưa xác minh</span>`}</span>`) : '—'}</dd></div>
            ${t.notes ? html`<div><dt>Ghi chú</dt><dd>${t.notes}</dd></div>` : ''}
          </dl>
        </section>
        <section class="sr-panel"><div class="sr-panel-head"><h2>Tài khoản đăng nhập</h2></div><div class="sr-panel-body">
          ${t.account ? html`<dl class="ad-kv">
            <div><dt>Email đăng nhập</dt><dd>${t.account.email}</dd></div>
            <div><dt>Trạng thái</dt><dd>${t.account.isActive ? html`<span class="sr-badge tone-ok">Đang hoạt động</span>` : html`<span class="sr-badge tone-danger">Đã khóa</span>`}</dd></div>
            <div><dt>Đăng nhập gần nhất</dt><dd>${t.account.lastLoginAt ? formatDateTime(t.account.lastLoginAt) : 'Chưa đăng nhập'}</dd></div></dl>`
    : html`<p class="small text-muted-sr mb-2">Khách chưa có tài khoản nên chưa xem được hóa đơn trực tuyến.</p><p class="small text-muted-sr">Gửi lời mời đặt mật khẩu để khách kích hoạt tài khoản.</p>`}
        </div></section>
      </div>
      <div class="ad-col-main">
        <section class="sr-panel"><div class="sr-panel-head"><h2>Hợp đồng và phòng</h2>
          ${session.can('tenancies.checkin') && !current?.contract ? html`<div class="sr-panel-actions"><a class="btn btn-outline-primary btn-sm" href="${link(current ? `/admin/contracts/new?tenancyId=${current.id}` : `/admin/contracts/new?tenantId=${id}`)}">${icon('file-earmark-plus')} ${current ? 'Bổ sung hợp đồng' : 'Tạo hợp đồng'}</a></div>` : ''}</div>
          ${contracts.length ? html`<div class="table-responsive"><table class="table align-middle mb-0"><thead><tr><th>Mã</th><th>Phòng</th><th>Thời hạn</th><th class="text-end">Tiền thuê</th><th>Trạng thái</th></tr></thead><tbody>
            ${contracts.map((k) => html`<tr><td><a class="fw-semibold" href="${link(`/admin/contracts/${k.id}`)}">${k.code}</a></td><td>${plate(k.room)}</td>
              <td class="num">${formatDate(k.effectiveFrom)} – ${formatDate(k.displayEndOn)}</td><td class="text-end num">${formatVnd(k.rent)}</td><td>${badge('contract', k.status)}</td></tr>`)}</tbody></table></div>`
    : html`<p class="ad-mini-empty">Khách chưa có hợp đồng.</p>`}
        </section>
        ${t.invoices ? html`<section class="sr-panel"><div class="sr-panel-head"><h2>Hóa đơn</h2><span class="sr-panel-note">${t.invoices.length} hóa đơn</span></div>
          ${t.invoices.length ? html`<div class="table-responsive"><table class="table align-middle mb-0"><thead><tr><th>Mã</th><th>Phòng</th><th>Hạn</th><th class="text-end">Tổng</th><th class="text-end">Còn lại</th><th>Trạng thái</th></tr></thead><tbody>
            ${t.invoices.slice(0, 8).map((i) => html`<tr><td><a class="fw-semibold" href="${link(`/admin/invoices/${i.id}`)}">${i.code}</a></td><td>${plate(i.room)}</td><td class="num">${formatDate(i.dueOn)}</td>
              <td class="text-end num">${formatVnd(i.totalAmount)}</td><td class="text-end num">${formatVnd(i.outstandingAmount)}</td><td>${invoiceBadges(i)}</td></tr>`)}</tbody></table></div>`
    : html`<p class="ad-mini-empty">Chưa có hóa đơn.</p>`}</section>` : ''}
        ${t.tickets.length ? html`<section class="sr-panel ad-mini"><div class="sr-panel-head"><h2>Ticket</h2></div><ul>${t.tickets.slice(0, 5).map((k) => html`<li><a href="${link(`/admin/tickets/${k.id}`)}"><span class="ad-mini-text"><strong>${k.title}</strong><small>${k.code}</small></span><span class="ad-mini-end">${badge('ticket', k.status)}</span></a></li>`)}</ul></section>` : ''}
      </div>
    </div>`);
  };

  await render();
  ctx.onCleanup(bindActions(ctx.outlet, {
    edit: async () => {
      if (await tenantFormModal(t)) {
        toast('Đã lưu thông tin khách');
        dataChanged();
        await render();
      }
    },
    password: async () => {
      if ((await tenantPasswordModal(t)) !== null) {
        toast('Đã đổi mật khẩu. Khách cần đăng nhập lại.');
      }
    },
    invite: async () => {
      const result = await runAction(() => tenantsApi.invitePortal(id));
      if (result) toast(`Đã tạo thư mời đặt mật khẩu cho ${result.toEmail}`, 'info');
    },
    'approve-profile': async (btn) => {
      const result = await formModal({
        title: 'Duyệt đề nghị sửa hồ sơ', submitLabel: 'Duyệt', intro: note('Thông tin mới được cập nhật vào hồ sơ khách ngay khi duyệt.'),
        fields: [{ name: 'reviewNotes', label: 'Ghi chú', type: 'textarea', rows: 2, optional: true }],
        onSubmit: (v) => profileRequestsApi.approve(btn.dataset.id, v.reviewNotes),
      });
      if (result) {
        toast('Đã duyệt đề nghị');
        dataChanged();
        await render();
      }
    },
    'reject-profile': async (btn) => {
      const reason = await reasonDialog({ title: 'Từ chối đề nghị', label: 'Lý do từ chối', text: 'Khách thấy lý do này trong tài khoản của mình.', confirmText: 'Từ chối', tone: 'danger' });
      if (reason && await runAction(() => profileRequestsApi.reject(btn.dataset.id, reason), { success: 'Đã từ chối đề nghị' })) {
        dataChanged();
        await render();
      }
    },
  }));
}
