// Hội thoại ticket dùng chung cho quản trị và cổng khách. Ghi chú nội bộ chỉ hiện ở quản trị.
import { badge } from '../../components/badges.js';
import { dateTime, emptyState, icon } from '../../components/ui.js';
import { html, multiline } from '../../utils/html.js';

export function threadHtml(ticket, { currentUserId }) {
  if (!ticket.messages.length) return emptyState({ iconName: 'chat', title: 'Chưa có trao đổi', text: 'Gửi tin nhắn đầu tiên bên dưới.' });
  return html`<div class="sr-thread">${ticket.messages.map((m) => html`<div class="sr-msg ${m.author?.id === currentUserId ? 'is-mine' : ''} ${m.isInternal ? 'is-internal' : ''}">
    <div class="sr-msg-meta"><strong>${m.author?.displayName || 'Hệ thống'}</strong><span>${dateTime(m.createdAt)}</span>${m.isInternal ? html`<span class="sr-badge tone-wash no-dot">${icon('eye-slash')} Ghi chú nội bộ</span>` : ''}</div>
    <div>${multiline(m.body)}</div>
    ${m.files?.length ? html`<div class="d-flex flex-wrap gap-2 mt-2">${m.files.map((f) => html`<button type="button" class="btn btn-sm btn-outline-secondary" data-action="view-file" data-file="${f.id}">${icon('paperclip')} ${f.fileName}</button>`)}</div>` : ''}
  </div>`)}</div>`;
}

export function composerHtml({ allowInternal = false, disabled = false, disabledText = '' }) {
  if (disabled) return html`<p class="small text-muted-sr mt-3 mb-0">${disabledText}</p>`;
  return html`<form class="mt-3" novalidate data-composer>
    <label class="form-label" for="tk-msg">Trao đổi</label>
    <textarea class="form-control" id="tk-msg" rows="3" data-field="body" placeholder="Nhập nội dung trao đổi"></textarea>
    <div class="invalid-feedback d-block" data-error-for="body"></div>
    <div class="d-flex flex-wrap align-items-center gap-3 mt-2">
      ${allowInternal ? html`<div class="form-check"><input class="form-check-input" type="checkbox" id="tk-internal" data-field="isInternal"><label class="form-check-label" for="tk-internal">Ghi chú nội bộ (khách không thấy)</label></div>` : ''}
      <button type="submit" class="btn btn-primary btn-sm ms-auto">${icon('send')} Gửi</button>
    </div>
  </form>`;
}

export function eventsHtml(ticket) {
  const kind = { created: 'Tạo ticket', assign: 'Phân công', status: 'Đổi trạng thái', reopen: 'Mở lại' };
  return html`<ul class="sr-timeline">${ticket.events.slice().reverse().map((e) => html`<li class="${e.kind === 'reopen' ? 'is-warn' : ''}">
    <div><strong>${kind[e.kind] || e.kind}</strong> ${e.toStatus ? badge('ticket', e.toStatus) : ''}${e.assignedTo ? html` cho ${e.assignedTo.displayName}` : ''}</div>
    ${e.reason ? html`<div class="small">${e.reason}</div>` : ''}<div class="sr-timeline-meta">${e.actor?.displayName || '—'}, ${dateTime(e.occurredAt)}</div></li>`)}</ul>`;
}
