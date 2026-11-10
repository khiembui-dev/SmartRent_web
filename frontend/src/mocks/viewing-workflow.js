import { uuid } from '../utils/ids.js';
import { viewingTimeError } from '../utils/viewing.js';
import { fail } from './respond.js';
import { find, notify } from './engine.js';
import { availability } from './handlers/public.js';

export function viewingFields(db, q) {
  const current = db.viewings.find((v) => v.inquiryId === q.id && v.status === 'scheduled');
  return { preferredViewingAt: q.preferredViewingAt || null, proposal: q.proposal || null,
    negotiationHistory: q.negotiationHistory || [], decisionNotes: q.closedReason || null,
    scheduledAt: current?.startsAt || null, scheduledEndsAt: current?.endsAt || null };
}

export function decideViewing(ctx, q, admin) {
  const b = ctx.body;
  const { db } = ctx;
  const role = admin ? 'admin' : 'user';
  if (['completed', 'no_show', 'cancelled', 'rejected', 'converted'].includes(q.status)) fail(409, 'viewing_closed', 'Yêu cầu đã kết thúc.');
  if (!['accept', 'propose', 'cancel', 'reject'].includes(b.action)) fail(422, 'validation_failed', 'Thao tác không hợp lệ.');
  const reason = b.reason?.trim();
  if (['propose', 'cancel', 'reject'].includes(b.action) && (!reason || reason.length > 1000)) fail(422, 'validation_failed', 'Cần lý do, tối đa 1000 ký tự.');
  const scheduled = db.viewings.find((v) => v.inquiryId === q.id && v.status === 'scheduled');
  if (b.action === 'reject' && (!admin || scheduled)) fail(409, 'invalid_decision', 'Lịch đã chốt cần hủy có lý do.');
  let start, end;
  const previous = scheduled?.startsAt || q.proposal?.startsAt || q.preferredViewingAt;
  if (['accept', 'propose'].includes(b.action)) {
    if ((b.proposalId || null) !== (q.proposal?.id || null)) fail(409, 'proposal_changed', 'Đề xuất đã thay đổi. Tải lại để tiếp tục.');
    const room = find(db.rooms, q.roomId);
    if (availability(db, room, ctx.today).status !== 'available') fail(409, 'room_unavailable', 'Phòng không còn nhận lịch xem.');
    if (!Number.isInteger(q.occupants) || q.occupants < 1 || q.occupants > room.capacity) fail(422, 'invalid_occupants', 'Số người vượt sức chứa phòng.');
    if (b.action === 'accept') {
      if (!q.proposal && (!admin || scheduled)) fail(409, 'no_proposal', 'Không có đề xuất cần xác nhận.');
      if (q.proposal?.byRole === role) fail(409, 'other_party_required', 'Cần bên còn lại đồng ý.');
      start = q.proposal?.startsAt || q.preferredViewingAt;
      end = q.proposal?.endsAt || new Date(new Date(start).getTime() + 30 * 60000).toISOString();
    } else { start = b.startsAt; end = b.endsAt || (start ? new Date(new Date(start).getTime() + 30 * 60000).toISOString() : null); }
    const error = viewingTimeError(start, ctx.now, end);
    if (error) fail(422, 'invalid_preferred_time', error);
  }
  const event = { id: uuid(), action: b.action, byRole: role, actorId: ctx.user.id, at: ctx.now, reason, startsAt: start, endsAt: end, previousStartsAt: previous };
  if (b.action === 'propose') {
    q.proposal = { id: event.id, byRole: role, byId: ctx.user.id, startsAt: start, endsAt: end, reason, createdAt: ctx.now };
    if (!scheduled) q.status = 'consulting';
  } else if (b.action === 'accept') {
    if (scheduled) scheduled.status = 'cancelled';
    db.viewings.push({ id: uuid(), inquiryId: q.id, startsAt: start, endsAt: end, status: 'scheduled',
      hostUserId: db.users.find((u) => u.role === 'admin').id, resultNotes: null });
    q.proposal = null; q.status = 'viewing';
  } else {
    if (scheduled) scheduled.status = 'cancelled';
    q.proposal = null; q.status = b.action === 'reject' ? 'rejected' : 'cancelled'; q.closedReason = reason;
  }
  (q.negotiationHistory ||= []).push(event);
  const recipient = admin ? find(db.tenants, q.tenantId)?.userId : db.users.find((u) => u.role === 'admin')?.id;
  if (recipient) notify(db, { organizationId: q.organizationId, recipientIds: [recipient], eventKey: `viewing:${q.id}:${event.id}`,
    title: 'Lịch xem phòng', body: reason || 'Lịch xem đã được xác nhận.', url: admin ? '/rooms' : `/admin/viewings?inquiry=${q.id}`, at: ctx.now });
  return q;
}
