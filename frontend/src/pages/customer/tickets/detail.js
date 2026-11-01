// Trao đổi trực tiếp với quản lý trên một yêu cầu. Ghi chú nội bộ của admin không gửi về đây.
import { badge } from '../../../components/badges.js';
import { confirmDialog, reasonDialog, runAction, toast } from '../../../components/dialogs.js';
import { showErrors } from '../../../components/form.js';
import { openModal } from '../../../components/modal.js';
import { errorState, icon, link, loadingBlock } from '../../../components/ui.js';
import { filesApi, portalApi } from '../../../services/api.js';
import { session } from '../../../services/session.js';
import { formatDateTime } from '../../../utils/date.js';
import { html, multiline, setHtml } from '../../../utils/html.js';
import { composerHtml, eventsHtml, threadHtml } from '../../shared/ticket-thread.js';
import { pageHead } from '../common.js';

export default async function TicketDetailPage(ctx) {
  setHtml(ctx.outlet, html`<div class="cu-page" data-root>${loadingBlock(8)}</div>`);
  const root = ctx.outlet.querySelector('[data-root]');
  let t;

  const render = async () => {
    try {
      t = await portalApi.ticket(ctx.params.id);
    } catch (error) {
      if (error?.isAborted || ctx.signal.aborted) return;
      setHtml(root, html`${errorState(error)}<p class="text-center"><a href="${link('/tickets')}">Về danh sách yêu cầu</a></p>`);
      return;
    }
    if (ctx.signal.aborted) return;
    ctx.setTitle(`${t.code} – ${t.title}`);
    setHtml(root, html`
      ${pageHead({ title: t.title, subtitle: `${t.code}, phòng ${t.room.code}`, back: { href: '/tickets', label: 'Yêu cầu của tôi' } })}
      ${t.status === 'resolved' ? html`<div class="cu-resolved">
        <div><strong>Quản lý báo đã xử lý xong</strong>${t.resolutionNotes ? html`<p>${t.resolutionNotes}</p>` : ''}</div>
        <div class="cu-resolved-actions"><button type="button" class="btn btn-primary btn-sm" data-confirm>${icon('check2-circle')} Xác nhận đã xong</button><button type="button" class="btn btn-outline-danger btn-sm" data-reopen>Chưa xong, mở lại</button></div>
      </div>` : ''}
      <div class="cu-ticket-layout">
        <section class="cu-card cu-chat">
          <div class="cu-chat-first">
            <span class="cu-chat-label">Yêu cầu của bạn, ${formatDateTime(t.createdAt)}</span>
            <p>${multiline(t.description)}</p>
            ${t.files.length ? html`<div class="d-flex flex-wrap gap-2">${t.files.map((f) => html`<button type="button" class="btn btn-sm btn-outline-secondary" data-action="view-file" data-file="${f.id}">${icon('image')} ${f.fileName}</button>`)}</div>` : ''}
          </div>
          ${threadHtml(t, { currentUserId: session.user.id })}
          ${composerHtml({ disabled: t.status === 'closed', disabledText: 'Yêu cầu đã đóng. Mở lại nếu vấn đề vẫn còn.' })}
        </section>
        <aside class="cu-ticket-side">
          <section class="cu-card">
            <h2>Tình trạng</h2>
            <dl class="cu-facts">
              <div><dt>Trạng thái</dt><dd>${badge('ticket', t.status)}</dd></div>
              <div><dt>Mức độ</dt><dd>${badge('priority', t.priority)}</dd></div>
              <div><dt>Loại</dt><dd>${t.category?.name || '—'}</dd></div>
              <div><dt>Người xử lý</dt><dd>${t.assignedTo?.displayName || 'Đang chờ phân công'}</dd></div>
            </dl>
            ${t.status === 'closed' ? html`<button type="button" class="btn btn-outline-danger btn-sm w-100 mt-3" data-reopen>Vấn đề vẫn còn, mở lại</button>` : ''}
          </section>
          <section class="cu-card"><h2>Tiến độ</h2>${eventsHtml(t)}</section>
        </aside>
      </div>`);

    const composer = root.querySelector('[data-composer]');
    composer?.addEventListener('submit', async (event) => {
      event.preventDefault();
      const body = composer.querySelector('[data-field="body"]').value.trim();
      if (!body) {
        showErrors(composer, { body: ['Nhập nội dung.'] });
        return;
      }
      const button = composer.querySelector('button[type="submit"]');
      button.disabled = true;
      try {
        await portalApi.messageTicket(t.id, { body });
        await render();
      } catch (error) {
        button.disabled = false;
        showErrors(composer, error.fieldErrors || {}, { detail: error.detail || error.message });
      }
    });
  };
  await render();

  const onClick = async (event) => {
    if (event.target.closest('[data-confirm]')) {
      if (!(await confirmDialog({ title: 'Xác nhận đã xử lý xong?', text: 'Yêu cầu sẽ được đóng. Nếu sự cố quay lại, bạn vẫn mở lại được.', confirmText: 'Xác nhận', tone: 'primary' }))) return;
      if (await runAction(() => portalApi.confirmTicket(t.id), { success: 'Cảm ơn bạn đã xác nhận' })) await render();
    } else if (event.target.closest('[data-reopen]')) {
      const reason = await reasonDialog({ title: 'Mở lại yêu cầu', label: 'Vấn đề còn gì chưa ổn?', confirmText: 'Mở lại', tone: 'danger' });
      if (reason && await runAction(() => portalApi.reopenTicket(t.id, reason))) {
        toast('Đã mở lại, quản lý sẽ xử lý tiếp');
        await render();
      }
    } else {
      const fileButton = event.target.closest('[data-action="view-file"]');
      if (!fileButton) return;
      const result = await runAction(() => filesApi.downloadUrl(fileButton.dataset.file));
      if (result) openModal({ title: result.file?.fileName || 'Ảnh', size: 'lg', body: html`<img class="img-fluid border rounded" src="${result.url}" alt="">` });
    }
  };
  root.addEventListener('click', onClick);
  ctx.onCleanup(() => root.removeEventListener('click', onClick));
}
