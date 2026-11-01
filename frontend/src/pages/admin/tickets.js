// Ticket: hộp thư hai cột. Khách gửi từ tài khoản của mình, quản lý trả lời, đổi trạng thái và phân công ngay tại đây.
import { badge } from '../../components/badges.js';
import { reasonDialog, runAction, toast } from '../../components/dialogs.js';
import { showErrors } from '../../components/form.js';
import { formModal, openModal } from '../../components/modal.js';
import { emptyState, errorState, icon, link, loadingBlock, note, pageHeader, plate, relative } from '../../components/ui.js';
import { href } from '../../router/router.js';
import { filesApi, ticketsApi } from '../../services/api.js';
import { session } from '../../services/session.js';
import { formatDateTime } from '../../utils/date.js';
import { debounce } from '../../utils/dom.js';
import { html, multiline, setHtml } from '../../utils/html.js';
import { bindActions, dataChanged, getCatalog, staffOptions } from './common.js';
import { composerHtml, threadHtml } from '../shared/ticket-thread.js';

const FILTERS = [['open', 'Đang mở'], ['new', 'Mới'], ['overdue', 'Quá hạn'], ['resolved', 'Đã giải quyết'], ['', 'Tất cả']];

export default async function TicketsPage(ctx) {
  ctx.setTitle('Ticket');
  const canWrite = session.can('tickets.write');
  const canClose = session.can('tickets.close');
  let selected = ctx.params.id || null;
  let filter = ctx.query.overdue ? 'overdue' : ctx.query.status ?? 'open';
  let q = '';
  let items = [];
  let t = null;

  setHtml(ctx.outlet, html`${pageHeader({ title: 'Ticket', subtitle: 'Yêu cầu hỗ trợ khách gửi từ tài khoản của mình.' })}
  <div class="ad-inbox ${selected ? 'has-selected' : ''}">
    <section class="sr-panel ad-inbox-list">
      <div class="ad-inbox-tools">
        <div class="ad-search">${icon('search')}<input type="search" class="form-control form-control-sm" data-q placeholder="Tìm tiêu đề, mã, phòng" aria-label="Tìm ticket"></div>
        <div class="ad-tabs is-compact" role="group" aria-label="Lọc ticket">${FILTERS.map(([key, label]) => html`<button type="button" class="ad-tab" data-filter="${key}" aria-pressed="${String(filter === key)}">${label}</button>`)}</div>
      </div>
      <div data-items>${loadingBlock(8)}</div>
    </section>
    <section class="sr-panel ad-inbox-pane" data-pane></section>
  </div>`);
  const itemsEl = ctx.outlet.querySelector('[data-items]');
  const pane = ctx.outlet.querySelector('[data-pane]');
  const inbox = ctx.outlet.querySelector('.ad-inbox');

  const renderItems = () => {
    setHtml(itemsEl, items.length ? html`<ul class="ad-ticket-list">${items.map((x) => html`<li><a class="${x.id === selected ? 'is-active' : ''}" href="${link(`/admin/tickets/${x.id}`)}" data-ticket="${x.id}">
      <span class="ad-ticket-top">${plate(x.room, { linkTo: false })}<span class="ad-ticket-title">${x.title}</span></span>
      <span class="ad-ticket-meta"><span>${x.code}</span>${badge('ticket', x.status)}${x.priority === 'urgent' || x.priority === 'high' ? badge('priority', x.priority) : ''}${x.isOverdue ? html`<span class="sr-badge tone-danger">Quá hạn</span>` : ''}</span>
    </a></li>`)}</ul>` : emptyState({ iconName: 'chat-left-text', title: 'Không có ticket', text: filter === 'open' ? 'Mọi yêu cầu đã được xử lý.' : 'Thử bộ lọc khác.' }));
  };

  const loadItems = async () => {
    const query = { q: q || undefined, pageSize: 100, sort: filter === 'open' ? 'dueAt' : '-createdAt', ...(filter === 'overdue' ? { overdue: 'true' } : { status: filter || undefined }) };
    try {
      items = (await ticketsApi.list(query, { signal: ctx.signal })).items;
      renderItems();
    } catch (error) {
      if (ctx.signal.aborted) return;
      setHtml(itemsEl, errorState(error));
      itemsEl.querySelector('#sr-retry')?.addEventListener('click', loadItems);
    }
  };

  const renderPane = () => {
    const s = t.status;
    const open = !['resolved', 'closed'].includes(s);
    setHtml(pane, html`<header class="ad-pane-head">
      <a class="ad-pane-back d-lg-none" href="${link('/admin/tickets')}">${icon('arrow-left')} Danh sách ticket</a>
      <div class="ad-pane-title"><h2>${t.title}</h2><div class="ad-badges">${badge('ticket', s)}${badge('priority', t.priority)}${t.isOverdue ? html`<span class="sr-badge tone-danger">Quá hạn xử lý</span>` : ''}</div></div>
      <div class="ad-pane-actions">
        ${s === 'new' && canWrite ? html`<button type="button" class="btn btn-primary btn-sm" data-action="move" data-to="accept">Tiếp nhận</button>` : ''}
        ${['new', 'accepted'].includes(s) && canWrite ? html`<button type="button" class="btn btn-outline-primary btn-sm" data-action="move" data-to="start">Bắt đầu xử lý</button>` : ''}
        ${['accepted', 'in_progress'].includes(s) && canWrite ? html`<button type="button" class="btn btn-outline-secondary btn-sm" data-action="wait">Chờ bổ sung</button>` : ''}
        ${s === 'waiting' && canWrite ? html`<button type="button" class="btn btn-outline-primary btn-sm" data-action="move" data-to="resume">Tiếp tục xử lý</button>` : ''}
        ${['accepted', 'in_progress', 'waiting'].includes(s) && canClose ? html`<button type="button" class="btn btn-success btn-sm" data-action="resolve">${icon('check2-circle')} Đã giải quyết</button>` : ''}
        ${s === 'resolved' && canClose ? html`<button type="button" class="btn btn-outline-success btn-sm" data-action="move" data-to="close">Đóng ticket</button>` : ''}
        ${!open && canClose ? html`<button type="button" class="btn btn-outline-danger btn-sm" data-action="reopen">Mở lại</button>` : ''}
        ${open && session.can('tickets.assign') ? html`<button type="button" class="btn btn-outline-secondary btn-sm" data-action="assign">${icon('person-check')} Phân công</button>` : ''}
      </div>
    </header>
    <div class="ad-pane-body">
      <div class="ad-pane-main">
        <div class="ad-ticket-desc"><p class="ad-ticket-from"><strong>${t.reportedBy?.displayName || 'Khách'}</strong> gửi ${relative(t.createdAt)}</p>
          <p class="mb-0">${multiline(t.description)}</p>
          ${t.files.length ? html`<div class="d-flex flex-wrap gap-2 mt-2">${t.files.map((f) => html`<button type="button" class="btn btn-sm btn-outline-secondary" data-action="view-file" data-file="${f.id}">${icon('image')} ${f.fileName}</button>`)}</div>` : ''}
          ${t.resolutionNotes ? html`<div class="mt-3">${note(html`<strong>Kết quả xử lý:</strong> ${t.resolutionNotes}`, { tone: 'ok' })}</div>` : ''}
        </div>
        ${threadHtml(t, { currentUserId: session.user.id })}
        ${composerHtml({ allowInternal: true, disabled: !canWrite || s === 'closed', disabledText: s === 'closed' ? 'Ticket đã đóng. Mở lại nếu cần trao đổi tiếp.' : 'Vai trò của bạn chỉ xem ticket.' })}
      </div>
      <aside class="ad-pane-side"><dl class="ad-kv">
        <div><dt>Phòng</dt><dd>${plate(t.room)}</dd></div>
        <div><dt>Cơ sở</dt><dd>${t.room.propertyName}</dd></div>
        <div><dt>Mã ticket</dt><dd>${t.code}</dd></div>
        <div><dt>Loại</dt><dd>${t.category?.name || '—'}</dd></div>
        <div><dt>Người xử lý</dt><dd>${t.assignedTo?.displayName || 'Chưa phân công'}</dd></div>
        <div><dt>Hạn xử lý</dt><dd class="${t.isOverdue ? 'text-danger fw-semibold' : ''}">${t.dueAt ? formatDateTime(t.dueAt) : '—'}</dd></div>
      </dl></aside>
    </div>`);
    const composer = pane.querySelector('[data-composer]');
    composer?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const body = composer.querySelector('[data-field="body"]').value.trim();
      if (!body) { showErrors(composer, { body: ['Nhập nội dung trả lời.'] }); return; }
      const button = composer.querySelector('button[type="submit"]');
      button.disabled = true;
      try {
        t = await ticketsApi.message(t.id, { body, isInternal: composer.querySelector('[data-field="isInternal"]')?.checked || false });
        renderPane();
        await loadItems();
      } catch (error) {
        button.disabled = false;
        showErrors(composer, error.fieldErrors || {}, { detail: error.detail || error.message });
      }
    });
  };

  const loadPane = async () => {
    if (!selected) {
      setHtml(pane, emptyState({ iconName: 'chat-left-text', title: 'Chọn một ticket', text: 'Nội dung trao đổi hiện ở đây.' }));
      return;
    }
    setHtml(pane, loadingBlock(8));
    try {
      t = await ticketsApi.get(selected);
      ctx.setTitle(`${t.code}: ${t.title}`);
      renderPane();
    } catch (error) {
      setHtml(pane, errorState(error));
      pane.querySelector('#sr-retry')?.addEventListener('click', loadPane);
    }
  };

  // Chọn ticket chỉ tải lại cột phải; giữ nguyên danh sách và vị trí cuộn.
  const onClick = (event) => {
    const item = event.target.closest('[data-ticket]');
    if (item) {
      event.preventDefault();
      selected = item.dataset.ticket;
      window.history.pushState({}, '', href(`/admin/tickets/${selected}`));
      inbox.classList.add('has-selected');
      renderItems();
      loadPane();
      return;
    }
    const tab = event.target.closest('[data-filter]');
    if (tab) {
      filter = tab.dataset.filter;
      ctx.outlet.querySelectorAll('[data-filter]').forEach((b) => b.setAttribute('aria-pressed', String(b === tab)));
      loadItems();
    }
  };
  const search = debounce(() => loadItems(), 300);
  const onInput = (event) => {
    if (!event.target.matches('[data-q]')) return;
    q = event.target.value.trim();
    search();
  };
  // Bấm vào ticket trong danh sách phải thắng bộ bắt link của router.
  ctx.outlet.addEventListener('click', onClick, true);
  ctx.outlet.addEventListener('input', onInput);
  ctx.onCleanup(() => {
    search.cancel();
    ctx.outlet.removeEventListener('click', onClick, true);
    ctx.outlet.removeEventListener('input', onInput);
  });

  const move = async (body, message) => {
    const next = await runAction(() => ticketsApi.transition(t.id, body), { success: message });
    if (next) {
      t = next;
      dataChanged();
      renderPane();
      await loadItems();
    }
  };

  ctx.onCleanup(bindActions(ctx.outlet, {
    move: (btn) => move({ action: btn.dataset.to }, { accept: 'Đã tiếp nhận', start: 'Đang xử lý', resume: 'Tiếp tục xử lý', close: 'Đã đóng ticket' }[btn.dataset.to]),
    wait: async () => {
      const reason = await reasonDialog({ title: 'Chuyển sang chờ bổ sung', label: 'Đang chờ gì?', text: 'Ví dụ: chờ nhà mạng kiểm tra, chờ khách gửi thêm ảnh.', minLength: 3, confirmText: 'Lưu' });
      if (reason) await move({ action: 'wait', reason }, 'Đã chuyển sang chờ bổ sung');
    },
    resolve: async () => {
      const next = await formModal({
        title: 'Ghi nhận đã giải quyết', submitLabel: 'Đã giải quyết', submitTone: 'success',
        fields: [{ name: 'resolutionNotes', label: 'Kết quả xử lý', type: 'textarea', rows: 3, required: true, help: 'Khách thấy nội dung này.' }],
        onSubmit: (v) => ticketsApi.transition(t.id, { action: 'resolve', resolutionNotes: v.resolutionNotes }),
      });
      if (next) {
        t = next;
        toast('Đã ghi nhận giải quyết');
        dataChanged();
        renderPane();
        await loadItems();
      }
    },
    reopen: async () => {
      const reason = await reasonDialog({ title: 'Mở lại ticket', text: 'Hạn xử lý mới được tính lại.', label: 'Lý do mở lại', confirmText: 'Mở lại', tone: 'danger' });
      if (reason) await move({ action: 'reopen', reason }, 'Đã mở lại ticket');
    },
    assign: async () => {
      const catalog = await getCatalog();
      const next = await formModal({
        title: 'Phân công xử lý', submitLabel: 'Phân công',
        fields: [{ name: 'userId', label: 'Người xử lý', type: 'select', required: true, options: staffOptions(catalog), default: t.assignedTo?.id }, { name: 'note', label: 'Ghi chú', optional: true }],
        onSubmit: (v) => ticketsApi.assign(t.id, v),
      });
      if (next) {
        t = next;
        toast('Đã phân công');
        dataChanged();
        renderPane();
        await loadItems();
      }
    },
    'view-file': async (btn) => {
      const result = await runAction(() => filesApi.downloadUrl(btn.dataset.file));
      if (result) openModal({ title: result.file?.fileName || 'Tệp', size: 'lg', body: html`<img class="img-fluid border rounded" src="${result.url}" alt="">` });
    },
  }));

  await Promise.all([loadItems(), loadPane()]);
}
