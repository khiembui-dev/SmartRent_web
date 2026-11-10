import { formModal } from './modal.js';
import { formatDateTime } from '../utils/date.js';
import { html } from '../utils/html.js';
import { viewingBounds, viewingTimeError } from '../utils/viewing.js';

export const viewingOpen = (q) => !['cancelled', 'rejected', 'converted', 'completed', 'no_show'].includes(q.status);
export const confirmedStart = (q) => q.scheduledAt || q.nextViewing?.startsAt;
export const pendingTime = (q) => q.proposal?.startsAt || (!confirmedStart(q) ? q.preferredViewingAt : null);
export const needsNewTime = (q) => !pendingTime(q) || new Date(pendingTime(q)) <= new Date();
export const canAcceptViewing = (q, role) => viewingOpen(q) && !needsNewTime(q) &&
  (q.proposal ? q.proposal.byRole !== role : role === 'admin' && !confirmedStart(q));
export const negotiationLabel = (q) => !viewingOpen(q) ? ({ cancelled: 'Đã hủy', rejected: 'Đã từ chối', completed: 'Đã xem', no_show: 'Khách không đến', converted: 'Đã tạo hợp đồng' }[q.status])
  : q.proposal ? (needsNewTime(q) ? 'Cần chọn lại giờ' : q.proposal.byRole === 'admin' ? 'Chờ khách phản hồi' : 'Chờ quản lý xác nhận')
    : confirmedStart(q) ? 'Đã hẹn' : needsNewTime(q) ? 'Cần chọn lại giờ' : 'Chờ xác nhận';

export function negotiationInfo(q) {
  const start = confirmedStart(q);
  return html`<div class="small my-2">
    <p class="mb-1"><strong>Khách đề nghị:</strong> ${formatDateTime(q.preferredViewingAt)}</p>
    ${start ? html`<p class="mb-1"><strong>Lịch đang có hiệu lực:</strong> ${formatDateTime(start)}${q.scheduledEndsAt || q.nextViewing?.endsAt ? ` – ${formatDateTime(q.scheduledEndsAt || q.nextViewing.endsAt)}` : ''}</p>` : ''}
    ${q.proposal ? html`<div class="alert alert-info py-2 mb-2"><strong>${q.proposal.byRole === 'admin' ? 'Quản lý' : 'Khách'} đề xuất:</strong> ${formatDateTime(q.proposal.startsAt)} – ${formatDateTime(q.proposal.endsAt)}<br>${q.proposal.reason}<br><small>Chưa có hiệu lực cho đến khi bên còn lại đồng ý.</small></div>` : ''}
    <span class="sr-badge tone-info">${negotiationLabel(q)}</span>
    ${viewingOpen(q) && needsNewTime(q) && (!start || q.proposal) ? html`<p class="text-danger mb-1">Giờ đề nghị đã qua. Vui lòng chọn giờ mới.</p>` : ''}
    ${q.decisionNotes && !viewingOpen(q) ? html`<p class="mb-1">Lý do: ${q.decisionNotes}</p>` : ''}
    ${(q.negotiationHistory || []).length ? html`<details class="mt-2"><summary>Lịch sử trao đổi (${q.negotiationHistory.length})</summary><ul class="ps-3">${q.negotiationHistory.map((h) => html`<li>${formatDateTime(h.at)} · ${h.byRole === 'admin' ? 'Quản lý' : 'Khách'} · ${{ accept: 'Xác nhận', propose: 'Đề xuất giờ', reject: 'Từ chối', cancel: 'Hủy' }[h.action] || h.action}${h.startsAt ? `: ${formatDateTime(h.startsAt)}` : ''}${h.reason ? ` — ${h.reason}` : ''}</li>`)}</ul></details>` : ''}
  </div>`;
}

export function proposalModal(q, submit) {
  return formModal({
    title: 'Đề xuất giờ xem khác', submitLabel: 'Gửi đề xuất',
    intro: html`<p>Giờ mới cần bên còn lại đồng ý. Lịch đã chốt vẫn có hiệu lực trong lúc chờ.</p>`,
    fields: [
      { name: 'startsAt', label: 'Giờ bắt đầu', type: 'datetime', required: true, default: viewingBounds().defaultTime, min: viewingBounds().min, attrs: { 'data-viewing-hours': 'true' }, help: 'Bắt đầu chậm nhất 20:00, kết thúc chậm nhất 21:00 (giờ Việt Nam).' },
      { name: 'minutes', label: 'Thời lượng', type: 'select', default: '30', placeholderOption: false, options: [15, 30, 45, 60].map((n) => ({ value: String(n), label: `${n} phút` })) },
      { name: 'reason', label: 'Lý do / lời nhắn', type: 'textarea', required: true, maxLength: 1000 },
    ],
    validate: (v) => {
      const end = new Date(new Date(v.startsAt).getTime() + Number(v.minutes) * 60000);
      const error = viewingTimeError(v.startsAt, new Date(), end);
      return error ? { startsAt: [error] } : null;
    },
    onSubmit: (v) => submit({ action: 'propose', proposalId: q.proposal?.id || null, startsAt: v.startsAt,
      endsAt: new Date(new Date(v.startsAt).getTime() + Number(v.minutes) * 60000).toISOString(), reason: v.reason }),
  });
}
