// Gửi yêu cầu hỗ trợ cho phòng đang ở; yêu cầu vào thẳng mục Ticket của admin.
import { toast } from '../../../components/dialogs.js';
import { bindForm, enhance, formAlert, renderFields } from '../../../components/form.js';
import { errorState, link, loadingBlock, note } from '../../../components/ui.js';
import { portalApi } from '../../../services/api.js';
import { html, setHtml } from '../../../utils/html.js';
import { loadStay, noRoomPanel, pageHead } from '../common.js';

const PRIORITY = [
  { value: 'normal', label: 'Bình thường' },
  { value: 'high', label: 'Cao: ảnh hưởng lớn tới sinh hoạt' },
  { value: 'urgent', label: 'Khẩn cấp: nguy hiểm hoặc mất điện, nước toàn phòng' },
  { value: 'low', label: 'Thấp: không gấp' },
];

export default async function TicketNewPage(ctx) {
  ctx.setTitle('Gửi yêu cầu hỗ trợ');
  setHtml(ctx.outlet, html`<div class="cu-page cu-narrow" data-root>${loadingBlock(6)}</div>`);
  const root = ctx.outlet.querySelector('[data-root]');
  const head = pageHead({ title: 'Gửi yêu cầu hỗ trợ', back: { href: '/tickets', label: 'Yêu cầu của tôi' } });

  let stay;
  let catalog;
  try {
    [stay, catalog] = await Promise.all([loadStay(), portalApi.catalog()]);
  } catch (error) {
    if (error?.isAborted || ctx.signal.aborted) return;
    setHtml(root, errorState(error));
    return;
  }
  if (ctx.signal.aborted) return;
  if (!stay.current) {
    setHtml(root, html`${head}${noRoomPanel('Yêu cầu hỗ trợ')}`);
    return;
  }
  const active = stay.tenancies.filter((t) => t.status === 'active');
  if (!active.length) {
    setHtml(root, html`${head}${note('Bạn gửi được yêu cầu sau khi đã nhận phòng.')}`);
    return;
  }

  const fields = [
    active.length > 1
      ? { name: 'tenancyId', label: 'Phòng', type: 'select', required: true, options: active.map((t) => ({ value: t.id, label: `${t.room.code} – ${t.property.name}` })) }
      : { name: 'tenancyId', type: 'hidden', default: active[0].id },
    { name: 'categoryId', label: 'Loại sự cố', type: 'select', required: true, options: catalog.ticketCategories.map((c) => ({ value: c.id, label: c.name })), col: 'col-md-6' },
    { name: 'priority', label: 'Mức độ', type: 'select', required: true, default: 'normal', placeholderOption: false, options: PRIORITY, col: 'col-md-6' },
    { name: 'title', label: 'Tóm tắt', required: true, maxLength: 200, placeholder: 'Ví dụ: Bóng đèn nhà tắm không sáng' },
    { name: 'description', label: 'Mô tả', type: 'textarea', rows: 4, required: true, help: 'Ghi rõ vị trí, từ khi nào và thời gian bạn có nhà để thợ vào phòng.' },
    { type: 'html', html: html`<div data-uploader><label class="form-label" for="tk-files">Ảnh sự cố (tối đa 4)</label><input type="file" id="tk-files" multiple></div>` },
  ];
  setHtml(root, html`${head}
    <form class="cu-card" novalidate>
      ${active.length === 1 ? html`<div class="mb-3">${note(html`Gửi cho phòng <strong>${active[0].room.code}</strong>, ${active[0].property.name}.`)}</div>` : ''}
      ${formAlert()}${renderFields(fields)}
      <div class="d-flex justify-content-end gap-2 mt-3"><a class="btn btn-outline-secondary" href="${link('/tickets')}">Hủy</a><button class="btn btn-primary" type="submit">Gửi yêu cầu</button></div>
    </form>`);

  const form = root.querySelector('form');
  ctx.onCleanup(await enhance(form));
  const { createUploader } = await import('../../../components/uploader.js');
  if (ctx.signal.aborted) return;
  const uploader = createUploader(form.querySelector('#tk-files'), { multiple: true, maxFiles: 4, accept: ['image/jpeg', 'image/png', 'image/webp'], purpose: 'ticket' });
  ctx.onCleanup(() => uploader.destroy());
  const binding = bindForm(form, {
    fields, submittingLabel: 'Đang gửi…',
    // Chỉ gửi các fileId backend đã xác nhận; không lặng lẽ bỏ ảnh khi upload bị lỗi.
    validate: () => (uploader.busy ? { description: ['Đợi tải ảnh xong.'] }
      : uploader.hasErrors ? { description: ['Ảnh tải lên lỗi. Thử lại hoặc gỡ ảnh lỗi trước khi gửi.'] } : null),
    onSubmit: async (v, { idempotencyKey }) => {
      const ticket = await portalApi.createTicket({ ...v, fileIds: uploader.fileIds }, idempotencyKey);
      toast(`Đã gửi ${ticket.code}`);
      binding.reset();
      ctx.navigate(`/tickets/${ticket.id}`, { force: true });
    },
  });
  ctx.onCleanup(() => binding.destroy());
}
