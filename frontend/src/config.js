// Cấu hình công khai đọc từ biến VITE_* (xem .env.example). Không chứa secret.
// import.meta.env có trong Vite; script kiểm thử Node (scripts/) chạy không có Vite nên dùng {}.
const env = import.meta.env || {};

function parseLatency(value) {
  const [min, max] = String(value || '150,450').split(',').map((v) => Number(v.trim()));
  return [Number.isFinite(min) ? min : 150, Number.isFinite(max) ? max : 450];
}

const dataSource = env.VITE_DATA_SOURCE || 'mock';
if (!['mock', 'api'].includes(dataSource)) {
  throw new Error(`VITE_DATA_SOURCE phải là "mock" hoặc "api", nhận "${dataSource}".`);
}

export const config = Object.freeze({
  appName: 'SmartRent',
  dataSource,
  apiBaseUrl: String(env.VITE_API_BASE_URL || '').replace(/\/+$/, ''),
  apiTimeoutMs: Number(env.VITE_API_TIMEOUT_MS) || 15000,
  mockLatency: parseLatency(env.VITE_MOCK_LATENCY),
  basePath: env.BASE_URL || '/',
  timeZone: 'Asia/Ho_Chi_Minh',
  isMock: dataSource === 'mock',
});
