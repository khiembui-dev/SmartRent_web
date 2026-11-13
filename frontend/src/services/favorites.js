// Phòng yêu thích. Chưa đăng nhập (hoặc admin xem trang khách): lưu trên trình duyệt này.
// Tài khoản khách: lưu theo tài khoản ở máy chủ; lần đầu đăng nhập, danh sách trên trình duyệt được gộp vào tài khoản rồi xóa khỏi máy.
// Mọi nút [data-fav="<roomId>"] trên trang tự bật/tắt qua một bộ bắt sự kiện chung.
import { html } from '../utils/html.js';
import { icon } from '../components/ui.js';
import { portalApi } from './api.js';
import { session } from './session.js';

const KEY = 'smartrent.favorites';
export const FAVORITES_LIMIT = 100;
const listeners = new Set();
let ids = [];
let owner = null;
let loading = null;
let installed = false;

function readLocal() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(list) ? list.filter((x) => typeof x?.roomId === 'string') : [];
  } catch {
    return [];
  }
}
function writeLocal(list) {
  try {
    if (list.length) localStorage.setItem(KEY, JSON.stringify(list.slice(0, FAVORITES_LIMIT)));
    else localStorage.removeItem(KEY);
  } catch {
    // trình duyệt chặn lưu: danh sách chỉ còn trong phiên này
  }
}

const usesAccount = () => session.isCustomer;
/** Bản lưu trên trình duyệt (có tên/slug để vẫn hiện được phòng đã ngừng đăng). */
export const localFavorites = () => readLocal();
export const favoriteIds = () => ids.slice();
export const isFavorite = (roomId) => ids.includes(roomId);
export const favoritesInAccount = () => usesAccount();

export function onFavoritesChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit() {
  syncButtons();
  listeners.forEach((fn) => fn(ids.slice()));
}

/** Cập nhật mọi nút trái tim và số đếm đang có trên trang. */
export function syncButtons(root = document) {
  root.querySelectorAll('[data-fav]').forEach((button) => {
    const on = ids.includes(button.dataset.fav);
    button.classList.toggle('is-on', on);
    button.setAttribute('aria-pressed', String(on));
    const label = on ? 'Bỏ khỏi phòng yêu thích' : 'Lưu vào phòng yêu thích';
    button.title = label;
    if (button.dataset.favText != null) button.querySelector('[data-fav-label]').textContent = on ? 'Đã lưu' : 'Lưu phòng';
    else button.setAttribute('aria-label', `${label}: ${button.dataset.favTitle || 'phòng này'}`);
  });
  document.querySelectorAll('[data-fav-count]').forEach((badge) => {
    badge.textContent = ids.length > 99 ? '99+' : String(ids.length);
    badge.hidden = ids.length === 0;
  });
}

/** Nạp lại theo phiên hiện tại. Gọi khi gắn khung trang khách (mỗi lần đổi người đăng nhập). */
export function loadFavorites() {
  const key = usesAccount() ? `user:${session.user.id}` : 'browser';
  if (owner === key && loading) return loading;
  owner = key;
  loading = (async () => {
    if (!usesAccount()) {
      ids = readLocal().map((x) => x.roomId);
      return;
    }
    const local = readLocal();
    try {
      const result = local.length ? await portalApi.mergeFavorites({ roomIds: local.map((x) => x.roomId) }) : await portalApi.favorites();
      if (owner !== key) return;
      if (local.length) writeLocal([]);
      ids = result.roomIds || [];
    } catch {
      // Máy chủ lỗi: tạm hiện bản trên trình duyệt, giữ nguyên để lần sau gộp lại.
      if (owner === key) ids = local.map((x) => x.roomId);
    }
  })().finally(emit);
  return loading;
}

/** Bật/tắt yêu thích. room: { id, title, slug }. Trả về true nếu vừa lưu. */
export async function toggleFavorite(room) {
  await loading;
  const before = ids;
  const on = !ids.includes(room.id);
  if (on && ids.length >= FAVORITES_LIMIT) throw new Error(`Đã lưu tối đa ${FAVORITES_LIMIT} phòng. Bỏ bớt phòng cũ rồi lưu lại.`);
  ids = on ? [room.id, ...ids] : ids.filter((x) => x !== room.id);
  emit();
  if (!usesAccount()) {
    const list = readLocal().filter((x) => x.roomId !== room.id);
    if (on) list.unshift({ roomId: room.id, savedAt: new Date().toISOString(), title: room.title || '', slug: room.slug || '' });
    writeLocal(list);
    return on;
  }
  try {
    const result = on ? await portalApi.addFavorite(room.id) : await portalApi.removeFavorite(room.id);
    ids = result.roomIds || [];
    emit();
    return on;
  } catch (error) {
    ids = before;
    emit();
    throw error;
  }
}

/** Nút trái tim nổi trên ảnh thẻ phòng; withText: nút có chữ "Lưu phòng"/"Đã lưu" (trang chi tiết). */
export function favoriteButton(room, { withText = false, className = '' } = {}) {
  const on = isFavorite(room.id);
  const label = on ? 'Bỏ khỏi phòng yêu thích' : 'Lưu vào phòng yêu thích';
  return html`<button type="button" class="sr-fav ${withText ? 'sr-fav-text' : ''} ${on ? 'is-on' : ''} ${className}" data-fav="${room.id}" data-fav-title="${room.title || ''}" data-fav-slug="${room.slug || ''}"
    ${withText ? html`data-fav-text` : html`aria-label="${label}: ${room.title || 'phòng này'}"`} aria-pressed="${String(on)}" title="${label}">
    <span class="sr-fav-icon">${icon('heart', 'sr-fav-off')}${icon('heart-fill', 'sr-fav-on')}</span>${withText ? html`<span data-fav-label>${on ? 'Đã lưu' : 'Lưu phòng'}</span>` : ''}
  </button>`;
}

/** Gắn một lần cho cả ứng dụng: bấm trái tim ở bất kỳ trang khách nào. */
export function installFavoriteButtons({ notify } = {}) {
  if (installed) return;
  installed = true;
  document.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-fav]');
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    if (button.dataset.busy) return;
    button.dataset.busy = '1';
    try {
      const saved = await toggleFavorite({ id: button.dataset.fav, title: button.dataset.favTitle, slug: button.dataset.favSlug });
      if (saved) {
        button.classList.remove('is-pop');
        void button.offsetWidth;
        button.classList.add('is-pop');
      }
      notify?.(saved ? (usesAccount() ? 'Đã lưu vào Phòng yêu thích.' : 'Đã lưu vào Phòng yêu thích trên trình duyệt này. Đăng nhập để xem trên mọi thiết bị.') : 'Đã bỏ khỏi Phòng yêu thích.', saved ? 'success' : 'info');
    } catch (error) {
      notify?.(error?.message || 'Chưa lưu được phòng yêu thích. Thử lại sau.', 'error');
    } finally {
      delete button.dataset.busy;
    }
  });
}
