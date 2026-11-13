// Trợ lý AI nổi ở góc màn hình, dùng cho khu quản trị và khu khách.
// - Máy chủ giữ lịch sử, quyết định quyền và dữ liệu; giao diện chỉ hiển thị.
// - Câu trả lời được escape trước rồi mới định dạng (in đậm, danh sách, bảng). Không hiển thị link hay ảnh do AI viết;
//   nút mở trang chỉ lấy từ trường actions máy chủ tạo và phải là đường dẫn nội bộ đúng khu.
// - Nút mở là robot trợ lý (ảnh public/images/rooms/RobotAI.png, bản thu nhỏ ở public/images/chat/).
// - Gắn data-lenis-prevent: trang chủ dùng Lenis cuộn mượt, nếu không khung chat không nhận được bánh xe chuột.
// - Khung chat là div (không phải section): trang chủ có rule chung `section { min-height: 100vh; padding: 7rem … }`.
import { href } from '../router/router.js';
import { aiApi, portalAiApi } from '../services/api.js';
import { session } from '../services/session.js';
import { formatRelative, formatTime } from '../utils/format.js';
import { escapeHtml, html, multiline, raw, setHtml } from '../utils/html.js';
import { asset, icon } from './ui.js';

const MAX_CHARS = 2000;
const WIDE_KEY = 'smartrent.chat.wide';

const COPY = {
  admin: {
    subtitle: 'Trong phạm vi bạn quản lý',
    lead: 'Hỏi bằng lời thường. Mình tra trực tiếp phòng, công nợ, hóa đơn, chỉ số điện nước, hợp đồng và khách thuê.',
    placeholder: 'Hỏi về doanh thu, công nợ, phòng…',
    suggestions: [
      ['graph-up-arrow', 'Doanh thu và công nợ tháng này'],
      ['exclamation-diamond', 'Khách nào đang nợ quá hạn?'],
      ['calendar2-x', 'Hợp đồng sắp hết hạn trong 30 ngày'],
      ['speedometer2', 'Phòng nào chưa nhập chỉ số tháng này?'],
      ['wrench-adjustable', 'Sự cố nào chưa xử lý?'],
      ['door-open', 'Phòng nào đang trống?'],
    ],
  },
  customer: {
    subtitle: 'Dữ liệu thuê phòng của bạn',
    lead: 'Hỏi bằng lời thường. Mình tra trực tiếp hóa đơn, tiền điện nước, hợp đồng, thanh toán và phòng còn trống.',
    placeholder: 'Ví dụ: Tôi còn nợ bao nhiêu?',
    suggestions: [
      ['receipt', 'Tôi còn nợ bao nhiêu, hạn khi nào?'],
      ['lightning-charge', 'Tiền điện nước hóa đơn gần nhất'],
      ['bank', 'Thông tin chuyển khoản để thanh toán'],
      ['file-earmark-text', 'Hợp đồng của tôi hết hạn khi nào?'],
      ['wrench-adjustable', 'Yêu cầu sửa chữa của tôi tới đâu rồi?'],
      ['door-open', 'Còn phòng trống nào dưới 4 triệu?'],
    ],
  },
};

const WAITING = [
  [0, 'Đang đọc câu hỏi'],
  [1500, 'Đang tra cứu dữ liệu'],
  [6000, 'Đang đối chiếu số liệu'],
  [20000, 'Câu hỏi cần tra nhiều dữ liệu, sắp xong'],
];

function storage(kind) {
  try { return kind === 'local' ? window.localStorage : window.sessionStorage; } catch { return null; }
}
function safeGet(key, kind = 'session') {
  try { return storage(kind)?.getItem(key) ?? null; } catch { return null; }
}
function safeSet(key, value, kind = 'session') {
  try {
    if (value) storage(kind)?.setItem(key, value);
    else storage(kind)?.removeItem(key);
  } catch {
    // trình duyệt chặn bộ nhớ: lịch sử vẫn còn ở máy chủ trong mục Lịch sử
  }
}

// ------------------------------------------------------------ định dạng câu trả lời (an toàn)

function inline(text) {
  // text đã escape; chỉ thêm đúng các thẻ biết trước.
  return text
    .replace(/\*\*([^*\n]+?)\*\*/g, '<strong>$1</strong>')
    .replace(/&#96;([^\n]+?)&#96;/g, '<code>$1</code>');
}

function tableHtml(rows) {
  const cells = (line) => line.replace(/^\s*\|/, '').replace(/\|\s*$/, '').split('|').map((c) => inline(c.trim()));
  const body = rows.filter((r) => !/^\s*\|?\s*:?-{2,}/.test(r));
  if (!body.length) return '';
  const [head, ...rest] = body;
  return `<div class="sr-chat-table"><table><thead><tr>${cells(head).map((c) => `<th>${c}</th>`).join('')}</tr></thead><tbody>${
    rest.map((r) => `<tr>${cells(r).map((c) => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
}

/** Markdown tối thiểu: đoạn, gạch đầu dòng, danh sách số, bảng, tiêu đề nhỏ. Không có link/ảnh/HTML. */
export function richText(content) {
  const lines = escapeHtml(content || '').split(/\r?\n/);
  const out = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i += 1; continue; }
    if (/^\s*\|/.test(line)) {
      const rows = [];
      while (i < lines.length && /^\s*\|/.test(lines[i])) rows.push(lines[i++]);
      out.push(tableHtml(rows));
      continue;
    }
    const bullet = /^\s*(?:[-*•])\s+(.*)$/;
    const numbered = /^\s*\d+[.)]\s+(.*)$/;
    if (bullet.test(line) || numbered.test(line)) {
      const ordered = numbered.test(line) && !bullet.test(line);
      const pattern = ordered ? numbered : bullet;
      const items = [];
      while (i < lines.length && pattern.test(lines[i])) {
        items.push(inline(lines[i].match(pattern)[1]));
        i += 1;
        // Dòng thụt lề ngay sau một mục là phần tiếp theo của mục đó.
        while (i < lines.length && /^\s{2,}\S/.test(lines[i]) && !bullet.test(lines[i]) && !numbered.test(lines[i])) {
          items[items.length - 1] += `<br>${inline(lines[i].trim())}`;
          i += 1;
        }
      }
      const tag = ordered ? 'ol' : 'ul';
      out.push(`<${tag}>${items.map((x) => `<li>${x}</li>`).join('')}</${tag}>`);
      continue;
    }
    const heading = line.match(/^\s*#{1,6}\s+(.*)$/);
    if (heading) {
      out.push(`<p class="sr-chat-h">${inline(heading[1])}</p>`);
      i += 1;
      continue;
    }
    const para = [];
    while (i < lines.length && lines[i].trim() && !/^\s*(\||[-*•]\s|\d+[.)]\s|#{1,6}\s)/.test(lines[i])) para.push(inline(lines[i++].trim()));
    out.push(`<p>${para.join('<br>')}</p>`);
  }
  return raw(out.join(''));
}

/** Văn bản thuần để sao chép: bỏ dấu ** của chữ đậm. */
function plainText(content) {
  return String(content || '').replace(/\*\*([^*\n]+?)\*\*/g, '$1').replace(/`([^`\n]+?)`/g, '$1');
}

function safeAction(audience, action) {
  if (!action || typeof action.path !== 'string' || typeof action.label !== 'string') return false;
  if (!/^\/[A-Za-z0-9/_-]{0,160}$/.test(action.path) || action.path.includes('//')) return false;
  const adminPath = action.path === '/admin' || action.path.startsWith('/admin/');
  return adminPath === (audience === 'admin');
}

function errorText(error) {
  if (error?.code === 'timeout' || error?.status === 504) return 'Trợ lý phản hồi quá lâu. Gửi lại câu hỏi để thử lần nữa.';
  if (error?.code === 'network') return 'Không kết nối được máy chủ. Kiểm tra mạng rồi gửi lại.';
  if (error?.code === 'ai_not_configured') return 'Chưa kết nối dịch vụ trợ lý AI.';
  if (error?.status === 401) return 'Phiên đăng nhập đã hết hạn. Đăng nhập lại để tiếp tục.';
  if (error?.detail) return error.detail;
  return 'Chưa gửi được câu hỏi. Gửi lại để thử lần nữa.';
}

/** Ảnh robot: bản đầy đủ cho nút mở và màn hình chào, bản khuôn mặt cho ảnh đại diện nhỏ. */
const robot = () => asset('/images/chat/robot-ai.webp');
const robotFace = () => asset('/images/chat/robot-ai-face.webp');
const avatar = (extra = '') => html`<span class="sr-chat-avatar ${extra}" aria-hidden="true"><img src="${robotFace()}" alt="" width="64" height="64" decoding="async"></span>`;

// ------------------------------------------------------------ widget

/**
 * Gắn trợ lý vào khung trang. audience: 'admin' | 'customer'.
 * Khách chưa đăng nhập thấy lời mời đăng nhập; trang gọi không gắn widget cho admin ở khu khách.
 */
export function mountChatWidget(container, { audience }) {
  const copy = COPY[audience];
  const api = audience === 'admin' ? aiApi : portalAiApi;
  const guest = audience === 'customer' && !session.isCustomer;
  const storageKey = `smartrent.chat.${audience}.${session.user?.id || 'guest'}`;
  const state = {
    open: false, view: 'chat', conversation: null, messages: [], sending: false, error: null,
    unavailable: false, loaded: false, history: null, waitText: '', wide: safeGet(WIDE_KEY, 'local') === '1',
  };
  let waitTimers = [];

  const root = document.createElement('div');
  root.className = `sr-chat sr-no-print is-${audience}`;
  // Lenis (cuộn mượt ở trang chủ) bỏ qua vùng có data-lenis-prevent, để khung chat tự cuộn bằng bánh xe chuột.
  root.setAttribute('data-lenis-prevent', '');
  setHtml(root, html`
    <button type="button" class="sr-chat-launcher" aria-expanded="false" aria-controls="sr-chat-panel" data-chat-toggle>
      <span class="sr-chat-bot" aria-hidden="true"><img src="${robot()}" alt="" width="240" height="216" decoding="async"></span>
      <span class="sr-chat-launcher-text" aria-hidden="true">
        <span class="sr-chat-status"></span>
        <span class="is-closed">Trợ lý AI</span><span class="is-opened">Thu gọn</span>
      </span>
      <span class="sr-chat-launcher-end" aria-hidden="true"><span class="is-closed">${icon('stars')}</span><span class="is-opened">${icon('chevron-down')}</span></span>
      <span class="visually-hidden" data-chat-toggle-text>Mở trợ lý AI SmartRent</span>
    </button>
    <div id="sr-chat-panel" class="sr-chat-panel" role="dialog" aria-modal="false" aria-labelledby="sr-chat-title" hidden>
      <header class="sr-chat-head">
        ${avatar('is-head')}
        <div class="sr-chat-title">
          <h2 id="sr-chat-title">Trợ lý AI SmartRent</h2>
          <p><span class="sr-chat-status" aria-hidden="true"></span><span data-chat-status-text>${copy.subtitle}</span></p>
        </div>
        <div class="sr-chat-head-actions">
          ${guest ? '' : html`<button type="button" class="sr-chat-icon is-wide-toggle" data-chat-wide aria-pressed="false" title="Phóng to khung chat">${icon('arrows-angle-expand')}<span class="visually-hidden">Phóng to khung chat</span></button>
          <button type="button" class="sr-chat-icon" data-chat-history title="Lịch sử trò chuyện" aria-pressed="false">${icon('clock-history')}<span class="visually-hidden">Lịch sử trò chuyện</span></button>
          <button type="button" class="sr-chat-icon" data-chat-new title="Cuộc trò chuyện mới">${icon('plus-lg')}<span class="visually-hidden">Cuộc trò chuyện mới</span></button>`}
          <button type="button" class="sr-chat-icon" data-chat-close title="Đóng">${icon('x-lg')}<span class="visually-hidden">Đóng trợ lý</span></button>
        </div>
      </header>
      <div class="sr-chat-body" data-chat-body></div>
      ${guest ? '' : html`<form class="sr-chat-composer" data-chat-form novalidate>
        <div class="sr-chat-input">
          <label class="visually-hidden" for="sr-chat-input">Câu hỏi cho trợ lý</label>
          <textarea id="sr-chat-input" rows="1" maxlength="${MAX_CHARS}" placeholder="${copy.placeholder}" autocomplete="off"></textarea>
          <button type="submit" class="sr-chat-send" data-chat-send title="Gửi (Enter)">${icon('arrow-up')}<span class="visually-hidden">Gửi câu hỏi</span></button>
        </div>
        <div class="sr-chat-foot">
          <span>${icon('shield-lock')} Trợ lý chỉ đọc dữ liệu, không thay đổi gì trong tài khoản.</span>
          <span class="sr-chat-count" data-chat-count></span>
        </div>
      </form>`}
      <div class="visually-hidden" aria-live="polite" data-chat-announce></div>
    </div>`);
  container.append(root);

  const panel = root.querySelector('.sr-chat-panel');
  const body = root.querySelector('[data-chat-body]');
  const launcher = root.querySelector('[data-chat-toggle]');
  const launcherText = root.querySelector('[data-chat-toggle-text]');
  const input = root.querySelector('#sr-chat-input');
  const form = root.querySelector('[data-chat-form]');
  const count = root.querySelector('[data-chat-count]');
  const sendButton = root.querySelector('[data-chat-send]');
  const historyButton = root.querySelector('[data-chat-history]');
  const wideButton = root.querySelector('[data-chat-wide]');
  const statusText = root.querySelector('[data-chat-status-text]');
  const announcer = root.querySelector('[data-chat-announce]');

  // ---------------------------------------------------------- hiển thị

  function messageView(m, index) {
    if (m.role === 'user') {
      return html`<div class="sr-chat-msg is-user"><div class="sr-chat-bubble">${multiline(m.content)}</div>
        ${m.createdAt ? html`<time datetime="${m.createdAt}">${formatTime(m.createdAt)}</time>` : ''}</div>`;
    }
    const actions = (m.actions || []).filter((a) => safeAction(audience, a));
    return html`<div class="sr-chat-msg is-bot">
      ${avatar()}
      <div class="sr-chat-stack">
        <div class="sr-chat-sheet sr-chat-rich">${richText(m.content)}</div>
        ${actions.length ? html`<div class="sr-chat-actions">${actions.map((a) => html`<a class="sr-chat-action" href="${href(a.path)}" data-chat-action>${a.label}${icon('arrow-up-right')}</a>`)}</div>` : ''}
        <div class="sr-chat-meta">
          ${m.sources?.length ? html`<span class="sr-chat-verified">${icon('patch-check')}<span>Đã đối chiếu với ${m.sources.join(', ')}</span></span>` : ''}
          ${m.createdAt ? html`<time datetime="${m.createdAt}">${formatTime(m.createdAt)}</time>` : ''}
          <button type="button" class="sr-chat-copy" data-chat-copy="${index}" title="Sao chép câu trả lời">${icon('copy')}<span class="visually-hidden">Sao chép câu trả lời</span></button>
        </div>
      </div>
    </div>`;
  }

  function welcomeView() {
    const name = session.user?.displayName?.trim();
    return html`<div class="sr-chat-welcome">
      <p class="sr-chat-hello">${name ? `Chào ${name},` : 'Chào bạn,'}<br>bạn cần tra cứu gì?</p>
      <p class="sr-chat-lead">${copy.lead}</p>
      <div class="sr-chat-suggest" role="list">${copy.suggestions.map(([ic, text]) => html`<button type="button" role="listitem" class="sr-chat-tile" data-chat-suggest="${text}">
        <span class="sr-chat-tile-icon">${icon(ic)}</span><span>${text}</span></button>`)}</div>
      <p class="sr-chat-trust">${icon('patch-check')}<span>Con số nào trong câu trả lời cũng lấy từ hệ thống và được đối chiếu trước khi hiển thị.</span></p>
    </div>`;
  }

  function chatView() {
    if (guest) {
      return html`<div class="sr-chat-empty">
        <img class="sr-chat-hero" src="${robot()}" alt="" width="240" height="216" decoding="async">
        <p class="sr-chat-hello is-center">Đăng nhập để hỏi về phòng của bạn</p>
        <p class="sr-chat-lead">Trợ lý tra hóa đơn, tiền điện nước và hợp đồng trong chính tài khoản của bạn.</p>
        <div class="sr-chat-cta">
          <a class="btn btn-primary" href="${href(`/login?next=${encodeURIComponent(window.location.pathname)}`)}">Đăng nhập</a>
          <a class="btn btn-outline-primary" href="${href('/register')}">Tạo tài khoản</a>
        </div>
        <p class="sr-chat-note">Chưa đăng nhập, bạn vẫn xem được phòng trống ở trang Thuê phòng.</p>
      </div>`;
    }
    if (state.unavailable) {
      return html`<div class="sr-chat-empty">
        <span class="sr-chat-empty-icon">${icon('plug')}</span>
        <p class="sr-chat-hello is-center">Chưa kết nối dịch vụ trợ lý AI</p>
        <p class="sr-chat-note">${audience === 'admin' ? 'Cấu hình Chatbot:BaseUrl, ApiKey và Model cho backend theo docs/CHATBOT_AI.md.' : 'Bạn vẫn xem hóa đơn và hợp đồng trực tiếp trong tài khoản.'}</p>
      </div>`;
    }
    const parts = [];
    if (!state.messages.length && !state.sending) parts.push(welcomeView());
    parts.push(...state.messages.map((m, i) => messageView(m, i)));
    if (state.sending) {
      parts.push(html`<div class="sr-chat-msg is-bot is-pending">
        ${avatar()}
        <div class="sr-chat-stack">
          <div class="sr-chat-sheet sr-chat-thinking">
            <span class="sr-chat-wait" data-chat-wait>${state.waitText}</span>
            <span class="sr-chat-progress" aria-hidden="true"><i></i></span>
          </div>
        </div>
      </div>`);
    }
    if (state.error) {
      parts.push(html`<div class="sr-chat-error" role="alert">${icon('exclamation-circle')}<span>${state.error.message}</span>
        ${state.error.retry ? html`<button type="button" class="sr-chat-retry" data-chat-retry>${icon('arrow-clockwise')} Gửi lại</button>` : ''}</div>`);
    }
    return parts;
  }

  function historyView() {
    if (state.history === null) return html`<div class="sr-chat-loading"><span class="sr-chat-progress" aria-hidden="true"><i></i></span>Đang tải lịch sử</div>`;
    if (state.historyError) return html`<div class="sr-chat-error" role="alert">${icon('exclamation-circle')}<span>${state.historyError}</span></div>`;
    if (!state.history.length) {
      return html`<div class="sr-chat-empty">
        <span class="sr-chat-empty-icon">${icon('clock-history')}</span>
        <p class="sr-chat-note">Chưa có cuộc trò chuyện nào. Lịch sử được giữ trên máy chủ trong phiên làm việc.</p>
      </div>`;
    }
    return html`<p class="sr-chat-section">Cuộc trò chuyện gần đây</p>
      <ul class="sr-chat-history">${state.history.map((c) => html`<li class="${c.id === state.conversation?.id ? 'is-current' : ''}">
        <button type="button" class="sr-chat-history-open" data-chat-open="${c.id}">
          <span class="sr-chat-history-title">${c.title}</span>
          <span class="sr-chat-history-time">${c.id === state.conversation?.id ? 'Đang mở, ' : ''}${formatRelative(c.updatedAt || c.createdAt)}</span>
        </button>
        <button type="button" class="sr-chat-icon is-small" data-chat-delete="${c.id}" title="Xóa cuộc trò chuyện">${icon('trash3')}<span class="visually-hidden">Xóa cuộc trò chuyện</span></button>
      </li>`)}</ul>`;
  }

  function render({ scroll = true } = {}) {
    setHtml(body, state.view === 'history' ? historyView() : chatView());
    // Chấm trạng thái: xanh khi dịch vụ AI dùng được, xám khi máy chủ báo chưa kết nối.
    root.classList.toggle('is-offline', state.unavailable);
    statusText.textContent = state.unavailable ? 'Chưa kết nối dịch vụ AI' : copy.subtitle;
    body.classList.toggle('is-welcome', state.view === 'chat' && !guest && !state.unavailable && !state.messages.length && !state.sending);
    if (historyButton) historyButton.setAttribute('aria-pressed', String(state.view === 'history'));
    if (form) {
      const disabled = state.sending || state.unavailable;
      input.disabled = state.unavailable;
      sendButton.disabled = disabled || !input.value.trim();
      form.hidden = state.view === 'history';
    }
    if (scroll && state.view === 'chat') body.scrollTop = body.scrollHeight;
  }

  function applyWide() {
    if (!wideButton) return;
    panel.classList.toggle('is-wide', state.wide);
    wideButton.setAttribute('aria-pressed', String(state.wide));
    const label = state.wide ? 'Thu nhỏ khung chat' : 'Phóng to khung chat';
    wideButton.title = label;
    setHtml(wideButton, html`${icon(state.wide ? 'arrows-angle-contract' : 'arrows-angle-expand')}<span class="visually-hidden">${label}</span>`);
  }

  function updateComposer() {
    if (!input) return;
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 132)}px`;
    const length = input.value.length;
    count.textContent = length > MAX_CHARS * 0.8 ? `${length}/${MAX_CHARS}` : '';
    sendButton.disabled = state.sending || state.unavailable || !input.value.trim();
  }

  function startWaiting() {
    stopWaiting();
    waitTimers = WAITING.map(([delay, text]) => setTimeout(() => {
      state.waitText = text;
      const el = body.querySelector('[data-chat-wait]');
      if (el) el.textContent = text;
    }, delay));
  }
  function stopWaiting() {
    waitTimers.forEach(clearTimeout);
    waitTimers = [];
  }

  // ---------------------------------------------------------- dữ liệu

  async function loadSaved() {
    if (state.loaded || guest) return;
    state.loaded = true;
    const saved = safeGet(storageKey);
    if (!saved) return;
    try {
      const conversation = await api.conversation(saved);
      state.conversation = conversation;
      state.messages = conversation.messages || [];
    } catch (error) {
      safeSet(storageKey, null);
      if (error?.code === 'ai_not_configured') state.unavailable = true;
    }
    render();
  }

  async function ensureConversation() {
    if (state.conversation) return state.conversation;
    state.conversation = await api.create({});
    safeSet(storageKey, state.conversation.id);
    return state.conversation;
  }

  async function send(text) {
    const content = text.trim();
    if (!content || state.sending || state.unavailable) return;
    if (content.length > MAX_CHARS) {
      state.error = { message: `Câu hỏi tối đa ${MAX_CHARS} ký tự.` };
      render();
      return;
    }
    const pending = { role: 'user', content, createdAt: new Date().toISOString() };
    state.error = null;
    state.sending = true;
    state.waitText = WAITING[0][1];
    state.view = 'chat';
    state.messages = [...state.messages, pending];
    input.value = '';
    updateComposer();
    render();
    startWaiting();
    try {
      let conversation = await ensureConversation();
      try {
        conversation = await api.send(conversation.id, content);
      } catch (error) {
        // Máy chủ khởi động lại hoặc hội thoại hết hạn: mở cuộc mới rồi gửi lại một lần.
        if (error?.status !== 404) throw error;
        state.conversation = null;
        conversation = await api.send((await ensureConversation()).id, content);
      }
      state.conversation = conversation;
      state.messages = conversation.messages || [];
      const last = state.messages[state.messages.length - 1];
      if (last?.role === 'assistant') announcer.textContent = `Trợ lý: ${plainText(last.content)}`;
    } catch (error) {
      state.messages = state.messages.filter((m) => m !== pending);
      if (error?.code === 'ai_not_configured') state.unavailable = true;
      state.error = { message: errorText(error), retry: !state.unavailable && error?.status !== 401 ? content : null };
      if (!input.value) input.value = content;
      updateComposer();
    } finally {
      stopWaiting();
      state.sending = false;
      render();
      if (state.open && window.matchMedia('(pointer: fine)').matches) input?.focus();
    }
  }

  async function copyAnswer(button) {
    const message = state.messages[Number(button.dataset.chatCopy)];
    if (!message) return;
    const text = plainText(message.content);
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      // trình duyệt chặn clipboard (http, iframe): dùng vùng chọn tạm
      const area = document.createElement('textarea');
      area.value = text;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.append(area);
      area.select();
      try { ok = document.execCommand('copy'); } catch { ok = false; }
      area.remove();
    }
    button.classList.toggle('is-done', ok);
    setHtml(button, html`${icon(ok ? 'check2' : 'x-lg')}<span class="visually-hidden">${ok ? 'Đã sao chép' : 'Không sao chép được'}</span>`);
    announcer.textContent = ok ? 'Đã sao chép câu trả lời' : 'Không sao chép được câu trả lời';
    setTimeout(() => {
      if (!button.isConnected) return;
      button.classList.remove('is-done');
      setHtml(button, html`${icon('copy')}<span class="visually-hidden">Sao chép câu trả lời</span>`);
    }, 1600);
  }

  async function showHistory() {
    state.view = 'history';
    state.history = null;
    state.historyError = null;
    render();
    try {
      state.history = await api.conversations();
    } catch (error) {
      state.history = [];
      state.historyError = errorText(error);
    }
    if (state.view === 'history') render({ scroll: false });
  }

  async function openConversation(conversationId) {
    try {
      const conversation = await api.conversation(conversationId);
      state.conversation = conversation;
      state.messages = conversation.messages || [];
      state.error = null;
      safeSet(storageKey, conversation.id);
    } catch (error) {
      state.error = { message: errorText(error) };
    }
    state.view = 'chat';
    render();
  }

  async function deleteConversation(conversationId) {
    try {
      await api.remove(conversationId);
    } catch {
      // đã hết hạn ở máy chủ thì coi như đã xóa
    }
    if (state.conversation?.id === conversationId) newConversation(false);
    await showHistory();
  }

  function newConversation(focus = true) {
    state.conversation = null;
    state.messages = [];
    state.error = null;
    state.view = 'chat';
    safeSet(storageKey, null);
    render();
    if (focus) input?.focus();
  }

  // ---------------------------------------------------------- mở/đóng

  function setOpen(open) {
    state.open = open;
    panel.hidden = !open;
    root.classList.toggle('is-open', open);
    launcher.setAttribute('aria-expanded', String(open));
    launcherText.textContent = open ? 'Thu gọn trợ lý AI SmartRent' : 'Mở trợ lý AI SmartRent';
    document.documentElement.classList.toggle('sr-chat-open', open);
    if (open) {
      render();
      loadSaved();
      (input || root.querySelector('[data-chat-close]')).focus();
    } else {
      launcher.focus();
    }
  }

  launcher.addEventListener('click', () => setOpen(!state.open));
  root.querySelector('[data-chat-close]').addEventListener('click', () => setOpen(false));
  panel.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      setOpen(false);
    }
  });
  wideButton?.addEventListener('click', () => {
    state.wide = !state.wide;
    safeSet(WIDE_KEY, state.wide ? '1' : null, 'local');
    applyWide();
  });
  historyButton?.addEventListener('click', () => (state.view === 'history' ? (state.view = 'chat', render()) : showHistory()));
  root.querySelector('[data-chat-new]')?.addEventListener('click', () => newConversation());

  body.addEventListener('click', (event) => {
    const target = event.target instanceof Element ? event.target : null;
    const suggest = target?.closest('[data-chat-suggest]');
    if (suggest) send(suggest.dataset.chatSuggest);
    if (target?.closest('[data-chat-retry]') && state.error?.retry) send(state.error.retry);
    const copyButton = target?.closest('[data-chat-copy]');
    if (copyButton) copyAnswer(copyButton);
    const open = target?.closest('[data-chat-open]');
    if (open) openConversation(open.dataset.chatOpen);
    const remove = target?.closest('[data-chat-delete]');
    if (remove) deleteConversation(remove.dataset.chatDelete);
    // Router xử lý link nội bộ; trên màn hình nhỏ đóng khung chat để thấy trang vừa mở.
    if (target?.closest('[data-chat-action]') && window.matchMedia('(max-width: 575.98px)').matches) setOpen(false);
  });

  if (form) {
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      send(input.value);
    });
    input.addEventListener('input', updateComposer);
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
        event.preventDefault();
        send(input.value);
      }
    });
  }

  applyWide();
  render();
  return {
    destroy() {
      stopWaiting();
      document.documentElement.classList.remove('sr-chat-open');
      root.remove();
    },
  };
}
