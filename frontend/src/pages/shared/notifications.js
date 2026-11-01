// Trung tâm thông báo trong ứng dụng, dùng chung cho quản trị, cổng khách và quản trị hệ thống.
import { runAction } from '../../components/dialogs.js';
import { emptyState, errorState, icon, link, loadingBlock, pageHeader, panel } from '../../components/ui.js';
import { replaceQuery } from '../../router/router.js';
import { notificationsApi } from '../../services/api.js';
import { formatDateTime, formatRelative } from '../../utils/date.js';
import { html, setHtml } from '../../utils/html.js';

const PAGE_SIZE = 20;

export default async function NotificationsPage(ctx) {
  ctx.setTitle('Thông báo');
  let unreadOnly = ctx.query.unread === 'true';
  let items = [];
  let page = 1;
  let totalPages = 1;
  let unreadCount = 0;

  setHtml(ctx.outlet, html`${pageHeader({ title: 'Thông báo', subtitle: 'Thông báo trong ứng dụng. Email/SMS nhắc việc (nếu bật) được ghi riêng ở lịch sử gửi.' })}<div data-body></div>`);
  const body = ctx.outlet.querySelector('[data-body]');

  const render = () => setHtml(body, panel({
    title: html`${unreadOnly ? 'Chưa đọc' : 'Tất cả thông báo'} <span class="small text-muted-sr fw-normal">${unreadCount} chưa đọc</span>`,
    actions: html`<div class="btn-group btn-group-sm" role="group" aria-label="Lọc thông báo">
        <button type="button" class="btn btn-outline-secondary ${unreadOnly ? '' : 'active'}" aria-pressed="${String(!unreadOnly)}" data-filter="all">Tất cả</button>
        <button type="button" class="btn btn-outline-secondary ${unreadOnly ? 'active' : ''}" aria-pressed="${String(unreadOnly)}" data-filter="unread">Chưa đọc</button></div>
      <button type="button" class="btn btn-sm btn-outline-primary" data-readall ${unreadCount ? '' : 'disabled'}>${icon('check2-all')} Đánh dấu tất cả đã đọc</button>`,
    flush: true,
    body: items.length ? html`<div class="list-group list-group-flush">${items.map((n) => html`<a class="list-group-item list-group-item-action sr-notif ${n.readAt ? '' : 'is-unread'}" href="${link(n.relativeUrl || ctx.path)}" data-id="${n.id}">
        ${icon(n.readAt ? 'bell' : 'bell-fill', 'text-muted-sr mt-1')}
        <span class="min-w-0 flex-grow-1"><span class="d-block sr-notif-title">${n.title}</span><span class="d-block text-muted-sr">${n.body}</span>
        <span class="sr-notif-time" title="${formatDateTime(n.createdAt)}">${formatRelative(n.createdAt)}${n.readAt ? '' : ', chưa đọc'}</span></span></a>`)}</div>
      ${page < totalPages ? html`<div class="p-3 text-center border-top"><button type="button" class="btn btn-sm btn-outline-secondary" data-more>Xem thêm</button></div>` : ''}`
      : emptyState({ iconName: 'bell-slash', title: unreadOnly ? 'Không còn thông báo chưa đọc' : 'Chưa có thông báo' }),
  }));

  const load = async (append = false) => {
    if (!append) setHtml(body, loadingBlock(5));
    try {
      const result = await notificationsApi.list({ page, pageSize: PAGE_SIZE, unread: unreadOnly ? 'true' : undefined }, { signal: ctx.signal });
      items = append ? [...items, ...result.items] : result.items;
      totalPages = result.totalPages;
      unreadCount = result.unreadCount ?? 0;
      render();
    } catch (error) {
      if (error?.isAborted) return;
      setHtml(body, errorState(error));
    }
  };

  const onClick = async (event) => {
    const filter = event.target.closest('[data-filter]');
    if (filter) {
      unreadOnly = filter.dataset.filter === 'unread';
      page = 1;
      replaceQuery(unreadOnly ? { unread: 'true' } : {});
      await load();
      return;
    }
    if (event.target.closest('[data-more]')) {
      page += 1;
      await load(true);
      return;
    }
    if (event.target.closest('[data-readall]')) {
      if (await runAction(() => notificationsApi.readAll(), { success: 'Đã đánh dấu tất cả đã đọc' })) {
        page = 1;
        await load();
        document.dispatchEvent(new CustomEvent('sr:data-changed'));
      }
      return;
    }
    const item = event.target.closest('[data-id]');
    if (item) notificationsApi.read(item.dataset.id).catch(() => {});
  };
  ctx.outlet.addEventListener('click', onClick);
  ctx.onCleanup(() => ctx.outlet.removeEventListener('click', onClick));
  await load();
}
