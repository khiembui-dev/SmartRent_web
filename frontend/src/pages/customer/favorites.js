// Trang Phòng yêu thích: các phòng khách đã bấm trái tim. Tài khoản khách đọc từ máy chủ; khách chưa đăng nhập đọc từ trình duyệt
// rồi tra cứu tin đang công khai theo ID. Phòng đã có người thuê hoặc tạm ẩn vẫn hiện (mờ) để khách tự bỏ lưu.
import { errorState, icon, link, loadingBlock } from '../../components/ui.js';
import { publicApi, portalApi } from '../../services/api.js';
import { favoriteButton, favoriteIds, favoritesInAccount, loadFavorites, localFavorites, onFavoritesChange } from '../../services/favorites.js';
import { session } from '../../services/session.js';
import { formatDate } from '../../utils/date.js';
import { html, setHtml } from '../../utils/html.js';
import { pageHead, roomCard } from './common.js';

async function savedRooms(signal) {
  if (favoritesInAccount()) return (await portalApi.favoriteRooms()).items;
  const local = localFavorites();
  if (!local.length) return [];
  const found = await publicApi.rooms({ ids: local.map((x) => x.roomId).join(','), pageSize: 100, sort: 'newest' }, { signal });
  const byId = new Map(found.items.map((r) => [r.id, r]));
  return local.map((x) => {
    const room = byId.get(x.roomId);
    return room
      ? { roomId: x.roomId, savedAt: x.savedAt, status: room.availability?.status || 'available', room }
      : { roomId: x.roomId, savedAt: x.savedAt, status: 'unlisted', room: null, title: x.title || 'Phòng đã lưu' };
  });
}

function goneCard(item) {
  return html`<article class="cu-room is-gone" data-gone="${item.roomId}">
    <div class="cu-room-link">
      <span class="cu-room-photo"><span class="cu-room-nophoto">${icon('house-slash')}</span>${item.roomCode ? html`<span class="sr-plate">${item.roomCode}</span>` : ''}</span>
      <span class="cu-room-body">
        <span class="cu-room-title">${item.title}</span>
        ${item.propertyName ? html`<span class="cu-room-meta">${icon('geo-alt')} ${item.propertyName}</span>` : ''}
        <span class="cu-room-meta">${item.status === 'removed' ? 'Phòng đã gỡ khỏi trang.' : 'Phòng đã có người thuê hoặc tạm ẩn khỏi trang khách.'}</span>
        <span class="cu-room-foot"><span class="cu-room-saved">Lưu ngày ${formatDate(item.savedAt)}</span></span>
      </span>
    </div>
    ${favoriteButton({ id: item.roomId, title: item.title })}
  </article>`;
}

const card = (item) => (item.room ? roomCard(item.room, { note: item.status === 'on_hold' ? 'Đang có người giữ chỗ' : '' }) : goneCard(item));

export default async function FavoritesPage(ctx) {
  ctx.setTitle('Phòng yêu thích');
  const inAccount = favoritesInAccount();
  setHtml(ctx.outlet, html`<div class="cu-page">
    ${pageHead({
      title: 'Phòng yêu thích',
      subtitle: inAccount ? 'Danh sách lưu theo tài khoản, xem được trên mọi thiết bị.' : 'Các phòng bạn đã bấm trái tim, lưu trên trình duyệt này.',
      actions: html`<a class="btn btn-outline-primary btn-sm" href="${link('/rooms')}">${icon('search')} Tìm thêm phòng</a>`,
    })}
    ${session.isAuthenticated ? '' : html`<aside class="cu-guest">
      <span>${icon('heart')} Đăng nhập để giữ danh sách này trên mọi thiết bị. Phòng đã lưu sẽ tự gộp vào tài khoản.</span>
      <span class="cu-guest-actions"><a class="btn btn-primary btn-sm" href="${link('/login?next=/favorites')}">Đăng nhập</a><a class="btn btn-outline-primary btn-sm" href="${link('/register?next=/favorites')}">Tạo tài khoản</a></span>
    </aside>`}
    <div data-results>${loadingBlock(3)}</div>
  </div>`);
  const results = ctx.outlet.querySelector('[data-results]');

  const empty = () => setHtml(results, html`<div class="cu-empty cu-fav-empty">
    <span class="cu-fav-empty-icon">${icon('heart')}</span>
    <h2>Chưa có phòng yêu thích</h2>
    <p>Bấm biểu tượng trái tim trên thẻ phòng để lưu lại, rồi quay về đây so sánh giá và hẹn xem.</p>
    <a class="btn btn-primary btn-sm" href="${link('/rooms')}">Xem phòng đang trống</a>
  </div>`);

  let items = [];
  const count = () => {
    const saved = favoriteIds();
    const kept = items.filter((x) => saved.includes(x.roomId));
    const el = results.querySelector('[data-fav-summary]');
    if (el) el.textContent = kept.length ? `${kept.length} phòng đã lưu${kept.some((x) => !x.room) ? `, ${kept.filter((x) => !x.room).length} phòng đã ngừng đăng` : ''}` : 'Đã bỏ lưu hết. Bấm lại trái tim nếu muốn giữ phòng.';
  };

  const load = async () => {
    setHtml(results, loadingBlock(3));
    try {
      await loadFavorites();
      items = await savedRooms(ctx.signal);
    } catch (error) {
      if (error?.isAborted || ctx.signal.aborted) return;
      setHtml(results, errorState(error));
      results.querySelector('#sr-retry')?.addEventListener('click', load);
      return;
    }
    if (ctx.signal.aborted) return;
    if (!items.length) { empty(); return; }
    setHtml(results, html`<p class="cu-count" aria-live="polite" data-fav-summary></p><div class="cu-room-grid">${items.map(card)}</div>`);
    count();
  };

  // Bỏ lưu một phòng không còn đăng thì không lưu lại được nữa: gỡ thẻ khỏi trang. Phòng còn đăng giữ thẻ để bấm lại.
  ctx.onCleanup(onFavoritesChange((saved) => {
    results.querySelectorAll('[data-gone]').forEach((el) => { if (!saved.includes(el.dataset.gone)) el.remove(); });
    items = items.filter((x) => x.room || saved.includes(x.roomId));
    if (!items.length) empty();
    else count();
  }));
  await load();
}
