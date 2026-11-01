// Trang Hỗ trợ: các yêu cầu đã gửi tới quản lý, trao đổi trực tiếp ở từng yêu cầu.
import { badge } from '../../../components/badges.js';
import { errorState, icon, link, loadingBlock } from '../../../components/ui.js';
import { replaceQuery } from '../../../router/router.js';
import { portalApi } from '../../../services/api.js';
import { formatDateTime } from '../../../utils/date.js';
import { html, setHtml } from '../../../utils/html.js';
import { loadStay, noRoomPanel, pageHead, pager } from '../common.js';

const TABS = [
  { key: 'all', label: 'Tất cả', query: {} },
  { key: 'open', label: 'Đang xử lý', query: { status: 'open' } },
  { key: 'resolved', label: 'Chờ bạn xác nhận', query: { status: 'resolved' } },
  { key: 'closed', label: 'Đã xong', query: { status: 'closed' } },
];

function ticketRow(t) {
  const urgent = ['urgent', 'high'].includes(t.priority);
  return html`<li><a class="cu-ledger-row" href="${link(`/tickets/${t.id}`)}">
    <span class="cu-ledger-main">
      <strong>${t.title}</strong>
      <small>${t.code}${t.category ? `, ${t.category.name}` : ''}, gửi ${formatDateTime(t.createdAt)}</small>
    </span>
    <span class="cu-ledger-status">${badge('ticket', t.status)}${urgent ? html`<span class="sr-badge tone-danger">Khẩn</span>` : ''}</span>
    <span class="cu-ledger-money"><small>${icon('chat-dots')} ${t.messageCount} trao đổi</small></span>
    ${icon('chevron-right', 'cu-ledger-go')}
  </a></li>`;
}

export default async function TicketsPage(ctx) {
  ctx.setTitle('Hỗ trợ');
  setHtml(ctx.outlet, html`<div class="cu-page cu-medium" data-root>${loadingBlock(6)}</div>`);
  const root = ctx.outlet.querySelector('[data-root]');
  const head = (canCreate) => pageHead({
    title: 'Yêu cầu hỗ trợ', subtitle: 'Gửi sự cố điện nước, thiết bị trong phòng và trao đổi trực tiếp với quản lý.',
    actions: canCreate ? html`<a class="btn btn-primary" href="${link('/tickets/new')}">${icon('plus-lg')} Gửi yêu cầu</a>` : '',
  });

  let stay;
  try {
    stay = await loadStay();
  } catch (error) {
    if (error?.isAborted || ctx.signal.aborted) return;
    setHtml(root, errorState(error));
    return;
  }
  if (ctx.signal.aborted) return;
  if (!stay.current) {
    setHtml(root, html`${head(false)}${noRoomPanel('Yêu cầu hỗ trợ')}`);
    return;
  }

  let tab = TABS.some((t) => t.key === ctx.query.status) ? ctx.query.status : 'all';
  let page = Number(ctx.query.page) || 1;
  setHtml(root, html`${head(stay.tenancies.some((t) => t.status === 'active'))}
    <div class="cu-tabs" role="group" aria-label="Lọc yêu cầu">${TABS.map((t) => html`<button type="button" class="${tab === t.key ? 'active' : ''}" data-tab="${t.key}" aria-pressed="${String(tab === t.key)}">${t.label}</button>`)}</div>
    <div data-list>${loadingBlock(4)}</div>`);
  const list = root.querySelector('[data-list]');

  const load = async () => {
    setHtml(list, loadingBlock(4));
    replaceQuery({ status: tab === 'all' ? undefined : tab, page: page > 1 ? page : undefined });
    let result;
    try {
      const { query } = TABS.find((t) => t.key === tab);
      result = await portalApi.tickets({ ...query, page, pageSize: 12 }, { signal: ctx.signal });
    } catch (error) {
      if (error?.isAborted || ctx.signal.aborted) return;
      setHtml(list, errorState(error));
      return;
    }
    if (ctx.signal.aborted) return;
    setHtml(list, result.items.length
      ? html`<ul class="cu-ledger">${result.items.map(ticketRow)}</ul>${pager(result)}`
      : html`<div class="cu-empty"><h2>${tab === 'all' ? 'Chưa có yêu cầu nào' : 'Không có yêu cầu ở mục này'}</h2><p>Có hư hỏng trong phòng, bạn gửi yêu cầu để quản lý xử lý.</p></div>`);
  };

  const onClick = (event) => {
    const button = event.target.closest('[data-tab]');
    if (button) {
      tab = button.dataset.tab;
      page = 1;
      root.querySelectorAll('[data-tab]').forEach((b) => {
        b.classList.toggle('active', b === button);
        b.setAttribute('aria-pressed', String(b === button));
      });
      load();
    }
    const pageButton = event.target.closest('[data-page]');
    if (pageButton && !pageButton.disabled) {
      page = Number(pageButton.dataset.page);
      load();
    }
  };
  root.addEventListener('click', onClick);
  ctx.onCleanup(() => root.removeEventListener('click', onClick));
  await load();
}
