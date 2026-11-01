export const qs = (selector, root = document) => root.querySelector(selector);
export const qsa = (selector, root = document) => [...root.querySelectorAll(selector)];

/** Gắn sự kiện theo ủy quyền; trả về hàm gỡ. */
export function on(root, event, selector, handler, options) {
  const listener = (e) => {
    const target = e.target instanceof Element ? e.target.closest(selector) : null;
    if (target && root.contains(target)) handler(e, target);
  };
  root.addEventListener(event, listener, options);
  return () => root.removeEventListener(event, listener, options);
}

export function debounce(fn, wait = 300) {
  let timer;
  const debounced = (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
  debounced.cancel = () => clearTimeout(timer);
  return debounced;
}

export const prefersReducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Đặt tiêu điểm sau khi đổi trang: ô có data-autofocus (ví dụ email ở trang đăng nhập), nếu không thì tiêu đề trang. */
export function focusFirst(root) {
  const el = root.querySelector('[data-autofocus]') || root.querySelector('h1, [tabindex="-1"]');
  if (el) {
    if (!el.hasAttribute('tabindex') && !/^(INPUT|SELECT|TEXTAREA|BUTTON|A)$/.test(el.tagName)) el.setAttribute('tabindex', '-1');
    el.focus({ preventScroll: true });
  }
}
