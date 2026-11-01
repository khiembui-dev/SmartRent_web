// Đối chiếu ba nơi khai báo API: route của mock, docs/api/openapi.yaml và các lời gọi trong src/services/api.js.
// Báo lỗi nếu một thao tác có ở nơi này mà thiếu ở nơi khác. Chạy: npm run check:contract
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const memory = new Map();
globalThis.localStorage = { getItem: (k) => (memory.has(k) ? memory.get(k) : null), setItem: (k, v) => memory.set(k, String(v)), removeItem: (k) => memory.delete(k) };

const { listRoutes } = await import('../src/mocks/server.js');
const read = (rel) => fs.readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');

// Chuẩn hóa tên tham số đường dẫn để so khớp: /rooms/:id, /rooms/{id}, /rooms/${id(roomId)} → /rooms/{}
const norm = (path) => path.replace(/:\w+|\{\w+\}|\$\{[^}]+\}/g, '{}');

const mock = new Set(listRoutes().map((r) => `${r.method} ${norm(r.path)}`));

const spec = new Set();
let current = null;
for (const line of read('../../docs/api/openapi.yaml').split(/\r?\n/)) {
  const path = line.match(/^ {2}"?(\/api\/[^":]+)"?:$/);
  if (path) { current = path[1]; continue; }
  if (/^\S/.test(line)) current = null;
  const method = current && line.match(/^ {4}(get|post|put|patch|delete):$/);
  if (method) spec.add(`${method[1].toUpperCase()} ${norm(current)}`);
}

// Mọi lời gọi http.<method>('/api/...') trong src/ (api.js và lớp phiên đăng nhập).
const client = new Set();
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => (d.isDirectory() ? walk(`${dir}/${d.name}`) : d.name.endsWith('.js') ? [`${dir}/${d.name}`] : []));
for (const file of walk(fileURLToPath(new URL('../src', import.meta.url))).filter((f) => !f.includes('/mocks/'))) {
  for (const m of fs.readFileSync(file, 'utf8').matchAll(/http\.(get|post|put|patch|delete)\(\s*[`'](\/api\/[^`']+)[`']/g)) client.add(`${m[1].toUpperCase()} ${norm(m[2])}`);
}

// "{}" là một đoạn đường dẫn bất kỳ (ID hoặc đoạn động như /catalog/${kind}).
const pattern = (key) => new RegExp(`^${key.split('{}').map((part) => part.replace(/[.*+?^$()|[\]\\]/g, '\\$&')).join('[^/]+')}$`);
const covers = (key, set) => set.has(key) || [...set].some((x) => pattern(key).test(x) || pattern(x).test(key));
const diff = (a, b) => [...a].filter((x) => !covers(x, b)).sort();
const problems = [
  ['Có trong mock nhưng thiếu trong openapi.yaml', diff(mock, spec)],
  ['Có trong openapi.yaml nhưng mock chưa có', diff(spec, mock)],
  ['api.js gọi nhưng mock chưa có', diff(client, mock)],
  ['api.js gọi nhưng openapi.yaml chưa có', diff(client, spec)],
].filter(([, list]) => list.length);

console.log(`Mock: ${mock.size} thao tác, openapi.yaml: ${spec.size}, api.js gọi: ${client.size}.`);
const unused = diff(mock, client);
if (unused.length) console.log(`Thông tin: ${unused.length} thao tác chưa được giao diện gọi qua api.js (chỉ dùng nội bộ/kiểm thử): ${unused.join(', ')}`);
if (problems.length) {
  for (const [title, list] of problems) console.log(`\n${title} (${list.length}):\n  ${list.join('\n  ')}`);
  process.exit(1);
}
console.log('Hợp đồng khớp: mọi thao tác của mock và api.js đều có trong openapi.yaml.');
