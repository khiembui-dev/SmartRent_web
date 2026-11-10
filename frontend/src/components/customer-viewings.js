import { portalApi } from '../services/api.js';
import { reasonDialog, toast } from './dialogs.js';
import { link } from './ui.js';
import { html } from '../utils/html.js';
import { negotiationInfo, proposalModal, canAcceptViewing, viewingOpen } from './viewing-negotiation.js';

export function customerViewing(q) {
  return html`<article class="cu-card mb-3" data-inquiry="${q.id}">
    <strong>${q.room?.code} · ${q.room?.propertyName || ''}</strong>
    <small class="d-block">Yêu cầu ${q.code}</small>
    ${negotiationInfo(q)}
    ${viewingOpen(q) ? html`<div class="d-flex flex-wrap gap-2">
      ${canAcceptViewing(q, 'user') ? html`<button type="button" class="btn btn-primary btn-sm" data-viewing-action="accept" data-id="${q.id}">Đồng ý giờ mới</button>` : ''}
      <button type="button" class="btn btn-outline-primary btn-sm" data-viewing-action="propose" data-id="${q.id}">Đề xuất giờ khác</button>
      <button type="button" class="btn btn-outline-secondary btn-sm" data-viewing-action="cancel" data-id="${q.id}">Hủy yêu cầu</button>
    </div>` : ''}
    <p class="small text-muted-sr mt-2 mb-0">Lịch xem chưa giữ phòng cho bạn.</p>
    ${q.slug ? html`<a class="small" href="${link(`/rooms/${q.slug}`)}">Chi tiết phòng</a>` : ''}
  </article>`;
}

export function bindCustomerViewings(root, getItems, reload) {
  const handler = async (event) => {
    const btn = event.target.closest('[data-viewing-action]');
    if (!btn || btn.disabled) return;
    const q = getItems().find((x) => x.id === btn.dataset.id);
    if (!q) return;
    btn.disabled = true;
    try {
      const submit = (body) => portalApi.decideViewing(q.id, body);
      let result;
      if (btn.dataset.viewingAction === 'propose') result = await proposalModal(q, submit);
      else if (btn.dataset.viewingAction === 'cancel') {
        const reason = await reasonDialog({ title: 'Hủy yêu cầu xem phòng', label: 'Lý do hủy', required: true });
        if (reason) result = await submit({ action: 'cancel', reason });
      } else result = await submit({ action: 'accept', proposalId: q.proposal?.id || null });
      if (result) { toast('Đã cập nhật yêu cầu xem phòng'); await reload(); }
    } catch (error) {
      toast(error.detail || error.message || 'Chưa cập nhật được lịch. Vui lòng tải lại.', { tone: 'danger' });
      await reload();
    } finally { btn.disabled = false; }
  };
  root.addEventListener('click', handler);
  return () => root.removeEventListener('click', handler);
}
