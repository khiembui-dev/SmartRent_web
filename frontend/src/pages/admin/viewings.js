// Lịch xem phòng: bên trái là yêu cầu khách gửi từ trang tìm phòng, bên phải là lịch hẹn theo ngày.
// Gửi yêu cầu chưa giữ phòng; sau khi xem xong có thể tạo hợp đồng ngay từ lịch hẹn.
import { negotiationInfo, proposalModal, canAcceptViewing } from '../../components/viewing-negotiation.js';
import { propertySelect } from '../../components/admin-kit.js';
import { badge } from '../../components/badges.js';
import { reasonDialog, runAction, toast } from '../../components/dialogs.js';
import { formModal } from '../../components/modal.js';
import { emptyState, errorState, icon, link, loadingBlock, pageHeader, plate, relative } from '../../components/ui.js';
import { replaceQuery } from '../../router/router.js';
import { inquiriesApi, viewingsApi } from '../../services/api.js';
import { session } from '../../services/session.js';
import { addDays, formatDate, formatTime, formatWeekday, todayIso } from '../../utils/date.js';
import { formatPhone } from '../../utils/format.js';
import { html, multiline, setHtml } from '../../utils/html.js';
import { bindActions, dataChanged } from './common.js';

const WAITING = ['new', 'accepted', 'consulting'];

const dayLabel = (iso, today) => {
  if (iso === today) return 'Hôm nay';
  if (iso === addDays(today, 1)) return 'Ngày mai';
  if (iso === addDays(today, -1)) return 'Hôm qua';
  return formatWeekday(iso);
};

export default async function ViewingsPage(ctx) {
  ctx.setTitle('Lịch xem phòng');
  const today = todayIso();
  const canWrite = session.can('inquiries.write');
  let propertyId = ctx.query.propertyId ?? session.propertyId;
  let view = 'upcoming';
  let inquiries = [];
  let viewings = [];

  setHtml(ctx.outlet, html`${pageHeader({
    title: 'Lịch xem phòng',
    subtitle: 'Xác nhận giờ khách chọn hoặc đề xuất giờ khác. Ghi kết quả sau buổi xem.',
    actions: html`<div class="ad-head-filters">${propertySelect({ id: 'vw-property', value: propertyId })}</div>`,
  })}<div data-body>${loadingBlock(8)}</div>`);
  const body = ctx.outlet.querySelector('[data-body]');

  const requestCard = (q) => html`<article class="ad-request ${ctx.query.inquiry === q.id ? 'is-focus' : ''}" id="yc-${q.id}">
    <header>${plate(q.room)}<div class="min-w-0"><strong>${q.contactName}</strong><small>${q.room.propertyName}</small></div>${badge('inquiry', q.status)}</header>
    <dl>
      ${q.phone ? html`<div><dt>Điện thoại</dt><dd><a href="tel:${q.phone}">${formatPhone(q.phone)}</a></dd></div>` : ''}
      <div><dt>Số người</dt><dd>${q.occupants} người</dd></div>
      ${q.desiredMoveIn ? html`<div><dt>Muốn vào ở</dt><dd>${formatDate(q.desiredMoveIn)}</dd></div>` : ''}
      ${q.email ? html`<div class="is-wide"><dt>Email</dt><dd>${q.email}</dd></div>` : ''}
    </dl>
    ${negotiationInfo(q)}
    ${q.message ? html`<p class="ad-request-msg">${multiline(q.message)}</p>` : ''}
    <footer><small>Gửi ${relative(q.createdAt)}</small>
      ${canWrite ? html`<span class="ad-request-actions">
        ${canAcceptViewing(q, 'admin') ? html`<button type="button" class="btn btn-primary btn-sm" data-action="accept" data-id="${q.id}">Xác nhận lịch</button>` : ''}
        <button type="button" class="btn btn-outline-primary btn-sm" data-action="propose" data-id="${q.id}">Đề xuất giờ khác</button>
        ${!q.nextViewing ? html`<button type="button" class="btn btn-outline-secondary btn-sm" data-action="reject" data-id="${q.id}">Từ chối</button>` : ''}</span>` : ''}</footer>
  </article>`;

  const appointment = (v) => {
    const q = v.inquiry;
    const open = v.status === 'scheduled';
    const late = open && new Date(v.endsAt) <= new Date();
    return html`<li class="ad-appt ${late ? 'is-late' : ''} ${ctx.query.inquiry === q.id ? 'is-focus' : ''}">
      <time class="num">${formatTime(v.startsAt)}</time>
      <div class="ad-appt-main">
        <div class="ad-appt-title">${plate(q.room)}<strong>${q.contactName}</strong>${q.phone ? html`<a class="small" href="tel:${q.phone}">${formatPhone(q.phone)}</a>` : ''}</div>
        <p>${q.room.propertyName}${v.host ? `, ${v.host.displayName} dẫn xem` : ''}${v.resultNotes ? `. ${v.resultNotes}` : ''}</p>
      </div>
      <div class="ad-appt-end">
        ${late ? html`<span class="sr-badge tone-wash">Cần ghi kết quả</span>` : badge('viewing', v.status)}
        ${open && canWrite ? html`<span class="ad-request-actions">
          ${new Date(v.endsAt) <= new Date() ? html`<button type="button" class="btn btn-outline-secondary btn-sm" data-action="result" data-id="${v.id}" data-status="no_show">Khách không đến</button>` : ''}
          ${new Date(v.startsAt) > new Date() ? html`<button type="button" class="btn btn-outline-primary btn-sm" data-action="propose" data-id="${q.id}">Đề nghị đổi lịch</button>` : ''}
          <button type="button" class="btn btn-outline-secondary btn-sm" data-action="result" data-id="${v.id}" data-status="cancelled">Hủy lịch</button>
          ${new Date(v.startsAt) <= new Date() ? html`<button type="button" class="btn btn-outline-primary btn-sm" data-action="result" data-id="${v.id}" data-status="completed">Đã xem</button>` : ''}</span>` : ''}
        ${v.status === 'completed' && !['converted', 'rejected', 'cancelled'].includes(q.status) && session.can('tenancies.checkin') ? html`<a class="btn btn-primary btn-sm" href="${link(`/admin/contracts/new?inquiryId=${q.id}&roomId=${q.room.id}`)}">${icon('file-earmark-plus')} Tạo hợp đồng</a>` : ''}
      </div>
    </li>`;
  };

  const render = () => {
    const queue = inquiries.filter((q) => (!q.nextViewing && WAITING.includes(q.status)) || q.proposal);
    const upcoming = viewings.filter((v) => v.status === 'scheduled').sort((a, b) => a.startsAt.localeCompare(b.startsAt));
    const past = viewings.filter((v) => v.status !== 'scheduled').sort((a, b) => b.startsAt.localeCompare(a.startsAt));
    const shown = view === 'upcoming' ? upcoming : past;
    const days = new Map();
    shown.forEach((v) => {
      if (!days.has(v.date)) days.set(v.date, []);
      days.get(v.date).push(v);
    });
    setHtml(body, html`<div class="ad-viewings">
      <section class="sr-panel ad-queue">
        <div class="sr-panel-head"><h2>Yêu cầu chờ xác nhận</h2><span class="ad-count ${queue.length ? 'is-attention' : ''} num">${queue.length}</span></div>
        ${queue.length ? html`<div class="ad-queue-list">${queue.map(requestCard)}</div>` : emptyState({ iconName: 'inbox', title: 'Không có yêu cầu mới', text: 'Khách gửi yêu cầu ở trang tìm phòng sẽ hiện ở đây.' })}
      </section>
      <section class="sr-panel ad-agenda">
        <div class="ad-tabs" role="group" aria-label="Chọn nhóm lịch hẹn">
          <button type="button" class="ad-tab" data-view="upcoming" aria-pressed="${String(view === 'upcoming')}">Sắp tới<span class="num">${upcoming.length}</span></button>
          <button type="button" class="ad-tab" data-view="past" aria-pressed="${String(view === 'past')}">Đã có kết quả<span class="num">${past.length}</span></button>
        </div>
        ${days.size ? html`${[...days].map(([date, rows]) => html`<div class="ad-day"><h3>${dayLabel(date, today)}<small>${formatDate(date)}</small></h3><ul>${rows.map(appointment)}</ul></div>`)}`
    : emptyState({ iconName: 'calendar-check', title: view === 'upcoming' ? 'Chưa có lịch hẹn' : 'Chưa có lịch đã xong', text: view === 'upcoming' ? 'Xếp lịch từ một yêu cầu ở cột bên.' : '' })}
      </section>
    </div>`);
    if (ctx.query.inquiry) body.querySelector('.is-focus')?.scrollIntoView({ block: 'center' });
  };

  const load = async () => {
    replaceQuery({ propertyId: propertyId || undefined, inquiry: ctx.query.inquiry });
    try {
      const scope = { propertyId: propertyId || undefined, pageSize: 200 };
      const [a, b] = await Promise.all([inquiriesApi.list({ ...scope, status: 'open' }, { signal: ctx.signal }), viewingsApi.list({ ...scope, from: addDays(today, -60) }, { signal: ctx.signal })]);
      inquiries = a.items;
      viewings = b.items;
      render();
    } catch (error) {
      if (ctx.signal.aborted) return;
      setHtml(body, errorState(error));
      body.querySelector('#sr-retry')?.addEventListener('click', load);
    }
  };

  const onChange = (event) => {
    if (event.target.id !== 'vw-property') return;
    propertyId = event.target.value;
    session.setPropertyId(propertyId);
    load();
  };
  const onClick = (event) => {
    const btn = event.target.closest('[data-view]');
    if (!btn) return;
    view = btn.dataset.view;
    render();
  };
  ctx.outlet.addEventListener('change', onChange);
  ctx.outlet.addEventListener('click', onClick);
  ctx.onCleanup(() => {
    ctx.outlet.removeEventListener('change', onChange);
    ctx.outlet.removeEventListener('click', onClick);
  });

  ctx.onCleanup(bindActions(ctx.outlet, {
    accept: async (btn) => {
      const q = inquiries.find((x) => x.id === btn.dataset.id);
      await runAction(() => inquiriesApi.decide(q.id, { action: 'accept', proposalId: q.proposal?.id || null }), { success: 'Đã xác nhận lịch xem' });
      dataChanged();
      await load();
    },
    propose: async (btn) => {
      const q = inquiries.find((x) => x.id === btn.dataset.id) || viewings.find((x) => x.inquiry.id === btn.dataset.id)?.inquiry;
      const result = await proposalModal(q, (body) => inquiriesApi.decide(q.id, body));
      if (result) { toast('Đã gửi đề xuất, chờ khách đồng ý'); dataChanged(); await load(); }
    },
    reject: async (btn) => {
      const reason = await reasonDialog({ title: 'Từ chối yêu cầu', text: 'Yêu cầu sẽ đóng lại, phòng không bị ảnh hưởng.', confirmText: 'Từ chối', tone: 'danger' });
      if (reason && await runAction(() => inquiriesApi.transition(btn.dataset.id, { action: 'reject', reason }), { success: 'Đã từ chối yêu cầu' })) {
        dataChanged();
        await load();
      }
    },
    result: async (btn) => {
      const { status } = btn.dataset;
      const result = await formModal({
        title: { completed: 'Khách đã xem phòng', no_show: 'Khách không đến', cancelled: 'Hủy lịch hẹn' }[status], submitLabel: 'Lưu kết quả',
        fields: [{ name: 'resultNotes', label: 'Ghi chú', type: 'textarea', rows: 2, required: status === 'cancelled', optional: status !== 'cancelled', placeholder: status === 'completed' ? 'Khách ưng phòng, muốn vào ở đầu tháng…' : '' }],
        onSubmit: (v) => viewingsApi.result(btn.dataset.id, { status, resultNotes: v.resultNotes }),
      });
      if (result) {
        toast('Đã lưu kết quả');
        dataChanged();
        if (status === 'completed') view = 'past';
        await load();
      }
    },
  }));

  await load();
}
