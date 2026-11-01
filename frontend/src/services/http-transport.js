// Transport gọi backend ASP.NET Core thật (VITE_DATA_SOURCE=api). Không có fallback sang mock khi lỗi.
import { config } from '../config.js';
import { toQueryString } from '../utils/query.js';
import { ApiError } from './errors.js';

/**
 * ASP.NET Core trả khóa lỗi PascalCase ("Contract.EndsOn", "Lines[0].Amount") → đổi sang dạng form dùng
 * ("contract.endsOn", "lines.0.amount") để gắn lỗi đúng ô.
 */
function normalizeErrors(errors) {
  if (!errors || typeof errors !== 'object') return undefined;
  const out = {};
  for (const [key, messages] of Object.entries(errors)) {
    const camel = key.replace(/^\$\./, '').replace(/\[(\d+)\]/g, '.$1').split('.').map((part) => part.replace(/^[A-Z]/, (c) => c.toLowerCase())).join('.');
    out[camel] = Array.isArray(messages) ? messages : [String(messages)];
  }
  return out;
}

export async function httpTransport({ method, path, query, body, idempotencyKey, signal, timeoutMs, headers = {} }) {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs ?? config.apiTimeoutMs);
  const forwardAbort = () => controller.abort();
  signal?.addEventListener('abort', forwardAbort, { once: true });

  const init = { method, headers: { Accept: 'application/json', ...headers }, credentials: 'include', signal: controller.signal };
  if (idempotencyKey) init.headers['Idempotency-Key'] = idempotencyKey;
  if (body instanceof FormData) init.body = body;
  else if (body !== undefined && method !== 'GET') {
    init.headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(`${config.apiBaseUrl}${path}${toQueryString(query)}`, init);
  } catch (cause) {
    if (controller.signal.aborted) throw new ApiError({ status: 0, code: timedOut ? 'timeout' : 'aborted', cause });
    throw new ApiError({ status: 0, code: 'network', detail: 'Không kết nối được máy chủ API. Kiểm tra VITE_API_BASE_URL, CORS và trạng thái backend.', cause });
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', forwardAbort);
  }

  if (response.status === 204) return null;
  const type = response.headers.get('content-type') || '';
  const data = type.includes('json') ? await response.json().catch(() => null) : await response.text();
  if (!response.ok) {
    throw new ApiError({
      status: response.status,
      code: data?.code || (response.status === 422 || response.status === 400 ? 'validation_failed' : `http_${response.status}`),
      title: data?.title,
      detail: data?.detail,
      errors: normalizeErrors(data?.errors),
      traceId: data?.traceId || response.headers.get('x-correlation-id') || undefined,
    });
  }
  return data;
}
