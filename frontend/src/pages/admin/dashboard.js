// Tổng quan: trả lời nhanh "phòng nào trống, tháng này thu được bao nhiêu, hôm nay phải làm gì".
// Mọi số liệu lấy từ một lần gọi dashboard; bấm vào số mở đúng danh sách đã lọc.
// Bố cục: lưới 3 cột, khối nằm trọn trong ô của lưới và mỗi hàng cao bằng nhau (xem .ad-dash trong _admin.scss).
import { progressBar, propertySelect, statBand } from '../../components/admin-kit.js';
import { badge } from '../../components/badges.js';
import { emptyState, errorState, icon, link, loadingBlock, pageHeader, plate } from '../../components/ui.js';
import { replaceQuery } from '../../router/router.js';
import { dashboardApi } from '../../services/api.js';
import { session } from '../../services/session.js';
import { formatDate, formatDateTime, formatWeekday, monthOptions, todayIso } from '../../utils/date.js';
import { formatVnd } from '../../utils/money.js';
import { html, setHtml } from '../../utils/html.js';

// Số lượng lấy từ cùng một snapshot SQL; mỗi phòng chỉ thuộc một trạng thái.
function roomStatistics(d) {
  const r = d.rooms;
  const reserved = r.reserved ?? r.availableWithUpcoming ?? 0;
  const available = r.reserved == null ? Math.max(0, r.available - reserved) : r.available;
  const property = d.scope.allProperties ? '' : `&propertyId=${encodeURIComponent(d.scope.properties[0]?.id || '')}`;
  const stats = [
    { key: 'available', label: 'Phòng trống', value: available, icon: 'door-open', note: 'Sẵn sàng cho khách thuê' },
    { key: 'occupied', label: 'Phòng đang ở', value: r.occupied, icon: 'people', note: 'Có hợp đồng đang thuê' },
    { key: 'reserved', label: 'Đang cọc giữ phòng', value: reserved, icon: 'bookmark-check', note: 'Đang giữ cho khách' },
  ];
  return html`<section class="sr-panel ad-room-stats">
    <div class="sr-panel-head"><h2>Thống kê phòng</h2><span class="sr-panel-note">Hiện tại · ${r.total} phòng</span></div>
    <div class="sr-panel-body">
      <div class="ad-room-stat-grid">${stats.map((s) => html`<a class="ad-room-stat is-${s.key}" href="${link(`/admin/rooms?status=${s.key}${property}`)}">
        <span class="ad-room-stat-icon">${icon(s.icon)}</span><span>${s.label}</span><strong class="num">${s.value}</strong><small>${s.note}</small>
      </a>`)}</div>
      <div class="ad-room-stat-footer"><span>Tỷ lệ lấp đầy <strong>${String(r.occupancyRate).replace('.', ',')}%</strong></span><span>Bảo trì: ${r.maintenance} · Ngừng khai thác: ${r.inactive}</span></div>
      ${progressBar([{ label: 'Đang ở', value: r.occupied, tone: 'done' }, { label: 'Cọc giữ phòng', value: reserved, tone: 'todo' }, { label: 'Trống', value: available, tone: 'ready' }], r.total)}
    </div>
  </section>`;
}

// daysLeft tính tới ngày kết thúc loại trừ: bằng 0 nghĩa là ngày cuối hợp đồng đã qua, không phải còn hạn.
const daysLeftText = (days) => {
  if (days > 0) return `Còn ${days} ngày`;
  return days === 0 ? 'Vừa hết hạn' : `Trễ ${-days} ngày`;
};

function taskList(tasks) {
  const open = tasks.filter((t) => t.count > 0);
  return html`<section class="sr-panel ad-tasks">
    <div class="sr-panel-head"><h2>Việc cần làm</h2><span class="sr-panel-note">${open.length ? `${open.length} nhóm việc` : ''}</span></div>
    ${open.length ? html`<ul>${open.map((t) => html`<li><a class="tone-${t.tone}" href="${link(t.url)}"><span class="ad-task-count num">${t.count}</span><span>${t.label}</span>${icon('chevron-right')}</a></li>`)}</ul>`
    : emptyState({ iconName: 'check2-circle', title: 'Đã xử lý hết việc', text: 'Không còn việc tồn đọng trong phạm vi này.' })}
  </section>`;
}

function billingCard(b) {
  const waiting = b.readyToInvoice + b.draftCount;
  return html`<section class="sr-panel ad-billing-card">
    <div class="sr-panel-head"><h2>Tính tiền ${b.label.toLowerCase()}</h2></div>
    <div class="sr-panel-body">
      <p class="ad-billing-figure"><strong class="num">${b.invoiced}</strong> / ${b.tenancyCount} phòng đã có hóa đơn</p>
      ${progressBar([{ label: 'Đã có hóa đơn', value: b.invoiced, tone: 'done' }, { label: 'Đủ số, chờ tạo', value: waiting, tone: 'ready' }, { label: 'Chưa nhập số', value: b.missingReadings, tone: 'todo' }], b.tenancyCount)}
      <ul class="ad-billing-legend">
        <li><span class="is-todo"></span>Chưa nhập số <strong class="num">${b.missingReadings}</strong></li>
        <li><span class="is-ready"></span>Đủ số, chờ tạo hóa đơn <strong class="num">${waiting}</strong></li>
        <li><span class="is-done"></span>Đã có hóa đơn <strong class="num">${b.invoiced}</strong></li>
      </ul>
      <dl class="ad-billing-dates">
        <div><dt>Nhập số điện nước</dt><dd>Ngày ${b.schedule.meterReadingDay} hằng tháng</dd></div>
        <div><dt>Tạo hóa đơn</dt><dd>Ngày ${b.schedule.invoiceCreateDay} hằng tháng</dd></div>
      </dl>
      <a class="btn btn-primary btn-sm w-100" href="${link('/admin/billing')}">Mở trang tính tiền</a>
    </div>
  </section>`;
}

function listPanel({ title, href, rows, emptyText }) {
  return html`<section class="sr-panel ad-mini">
    <div class="sr-panel-head"><h2>${title}</h2><div class="sr-panel-actions"><a class="ad-link" href="${link(href)}">Xem tất cả</a></div></div>
    ${rows.length ? html`<ul>${rows}</ul>` : html`<p class="ad-mini-empty">${emptyText}</p>`}
  </section>`;
}

function render(body, d) {
  const b = d.billing;
  const f = d.finance;
  const can = (perm) => session.can(perm);
  setHtml(body, html`
    ${b.schedule.readingDue || b.schedule.invoiceDue ? html`<div class="ad-reminder sr-no-print">
      ${icon('bell')}
      <p>${b.schedule.readingDue
    ? html`Đã qua ngày nhập số điện nước (ngày ${b.schedule.meterReadingDay} hằng tháng). Còn <strong>${b.missingReadings} phòng</strong> chưa có số tháng này.`
    : html`Đã tới ngày tạo hóa đơn (ngày ${b.schedule.invoiceCreateDay} hằng tháng). <strong>${b.readyToInvoice + b.draftCount} phòng</strong> đã đủ số.`}</p>
      <a class="btn btn-sm btn-primary" href="${link(`/admin/billing?group=${b.schedule.readingDue ? 'missing_readings' : 'ready'}`)}">${b.schedule.readingDue ? 'Nhập số ngay' : 'Tạo hóa đơn'}</a>
    </div>` : ''}
    ${statBand([
    can('payments.read') && { label: `Doanh thu ${d.scope.label.toLowerCase()}`, value: formatVnd(f.collectedThisMonth?.toInvoices), note: 'Không gồm tiền cọc', href: '/admin/invoices' },
    can('invoices.read') && { label: 'Hóa đơn chưa thanh toán', value: formatVnd(f.totalOutstanding), note: f.overdueCount ? `${f.overdueCount} hóa đơn quá hạn` : 'Không có hóa đơn quá hạn', tone: f.overdueCount ? 'danger' : null, href: '/admin/invoices?outstanding=true' },
    can('tickets.read') && { label: 'Ticket chưa xử lý', value: d.tickets.open, note: d.tickets.overdue ? `${d.tickets.overdue} ticket quá hạn` : `${d.tickets.new} ticket mới`, tone: d.tickets.overdue ? 'danger' : null, href: '/admin/tickets?status=open' },
    can('inquiries.read') && { label: 'Yêu cầu xem phòng', value: d.viewings.pending, note: `${d.viewings.upcoming} lịch hẹn sắp tới`, tone: d.viewings.pending ? 'wash' : null, href: '/admin/viewings' },
    can('contracts.read') && { label: 'Hợp đồng sắp hết hạn', value: d.contracts.expiring, note: d.contracts.expiredOccupied ? `${d.contracts.expiredOccupied} đã hết hạn, khách vẫn ở` : 'Trong 30 ngày tới', tone: d.contracts.expiredOccupied ? 'danger' : d.contracts.expiring ? 'wash' : null, href: '/admin/contracts?expiring=true' },
  ])}
    <div class="ad-dash">
      <div class="is-wide">${roomStatistics(d)}</div>
      <div class="is-lead">${billingCard(b)}</div>
      <div class="is-full">${taskList(d.tasks)}</div>
      <div class="is-wide"><section class="sr-panel"><div class="sr-panel-head"><h2>Thu tiền 6 tháng gần đây</h2><span class="sr-panel-note">Theo kỳ hóa đơn. Khoản chờ xác minh chưa được tính.</span></div>
        <div class="sr-panel-body" data-chart></div></section></div>
      <div>${listPanel({
    title: 'Hóa đơn quá hạn', href: '/admin/invoices?overdue=true', emptyText: 'Không có hóa đơn quá hạn.',
    rows: d.recent.overdueInvoices.map((i) => html`<li><a href="${link(`/admin/invoices/${i.id}`)}">${plate(i.room, { linkTo: false })}<span class="ad-mini-text"><strong>${i.representative.fullName}</strong><small>Quá hạn ${i.daysOverdue} ngày</small></span><span class="ad-mini-end num">${formatVnd(i.outstandingAmount)}</span></a></li>`),
  })}</div>
      <div>${listPanel({
    title: 'Lịch xem phòng', href: '/admin/viewings', emptyText: 'Chưa có yêu cầu hoặc lịch hẹn.',
    rows: [
      ...d.recent.viewings.map((v) => html`<li><a href="${link('/admin/viewings')}">${plate(v.inquiry.room, { linkTo: false })}<span class="ad-mini-text"><strong>${v.inquiry.contactName}</strong><small>${formatDateTime(v.startsAt)}</small></span></a></li>`),
      ...d.recent.inquiries.map((q) => html`<li><a href="${link(`/admin/viewings?inquiry=${q.id}`)}">${plate(q.room, { linkTo: false })}<span class="ad-mini-text"><strong>${q.contactName}</strong><small>Chờ xếp lịch</small></span><span class="ad-mini-end">${badge('inquiry', q.status)}</span></a></li>`),
    ].slice(0, 5),
  })}</div>
      <div>${listPanel({
    title: 'Hợp đồng sắp hết hạn', href: '/admin/contracts?expiring=true', emptyText: 'Không có hợp đồng sắp hết hạn.',
    rows: d.recent.expiringContracts.map((k) => html`<li><a href="${link(`/admin/contracts/${k.id}`)}">${plate(k.room, { linkTo: false })}<span class="ad-mini-text"><strong>${k.representative.fullName}</strong><small>Đến hết ${formatDate(k.displayEndOn)}</small></span><span class="ad-mini-end small ${k.daysLeft <= 0 ? 'text-danger' : ''}">${daysLeftText(k.daysLeft)}</span></a></li>`),
  })}</div>
      <div>${listPanel({
    title: 'Ticket cần xử lý', href: '/admin/tickets?status=open', emptyText: 'Không có ticket cần xử lý.',
    rows: d.recent.tickets.map((t) => html`<li><a href="${link(`/admin/tickets/${t.id}`)}">${plate(t.room, { linkTo: false })}<span class="ad-mini-text"><strong>${t.title}</strong><small>${t.code}${t.isOverdue ? ', quá hạn xử lý' : ''}</small></span><span class="ad-mini-end">${badge('priority', t.priority)}</span></a></li>`),
  })}</div>
    </div>`);
}

export default async function DashboardPage(ctx) {
  ctx.setTitle('Tổng quan');
  const today = todayIso();
  let month = ctx.query.month || today.slice(0, 7);
  let propertyId = ctx.query.propertyId ?? session.propertyId;
  let disposeChart = () => {};
  ctx.onCleanup(() => disposeChart());

  setHtml(ctx.outlet, html`${pageHeader({
    title: 'Tổng quan',
    subtitle: `${formatWeekday(today)}, ${formatDate(today)}`,
    actions: html`<div class="ad-head-filters">
      ${propertySelect({ id: 'db-property', value: propertyId })}
      <div class="ad-field"><label class="form-label" for="db-month">Tháng</label>
        <select class="form-select form-select-sm" id="db-month">${monthOptions({ back: 12, ahead: 0, include: month }).map((o) => html`<option value="${o.value}" ${o.value === month ? 'selected' : ''}>${o.label}</option>`)}</select></div>
    </div>`,
  })}<div data-body>${loadingBlock(10)}</div>`);
  const body = ctx.outlet.querySelector('[data-body]');

  let requestId = 0;
  const load = async () => {
    const request = ++requestId;
    replaceQuery({ month: month === today.slice(0, 7) ? undefined : month, propertyId: propertyId || undefined });
    body.style.opacity = body.children.length > 1 ? '.6' : '';
    try {

      const data = await dashboardApi.get({ month, propertyId: propertyId || undefined }, { signal: ctx.signal });
      if (request !== requestId || ctx.signal.aborted) return;
      disposeChart();
      render(body, data);
      const chartEl = body.querySelector('[data-chart]');
      if (data.charts.monthly.length && chartEl) {
        const { chartWithTable } = await import('../../components/charts.js');
        disposeChart = chartWithTable(chartEl, {
          labels: data.charts.monthly.map((m) => m.label.replace('Tháng ', 'T')),
          series: [{ label: 'Đã thu', data: data.charts.monthly.map((m) => m.allocated) }, { label: 'Còn nợ', data: data.charts.monthly.map((m) => m.outstanding) }],
          stacked: true, height: 232,
        });
      }
    } catch (error) {
      if (ctx.signal.aborted || request !== requestId) return;
      setHtml(body, errorState(error));
      body.querySelector('#sr-retry')?.addEventListener('click', load);
    }
    body.style.opacity = '';
  };

  ctx.outlet.querySelector('#db-property').addEventListener('change', (event) => {
    propertyId = event.target.value;
    session.setPropertyId(propertyId);
    load();
  });
  ctx.outlet.querySelector('#db-month').addEventListener('change', (event) => {
    month = event.target.value;
    load();
  });
  await load();
}
