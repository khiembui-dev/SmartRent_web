"""Read current sources, trace route imports, verify the schema against reviewed page features.
Standard library only. Run: python database/tools/audit_source.py
This is a traceability check, not a substitute for API integration tests.
"""
from pathlib import Path
import hashlib
import json
import re
from coverage_spec import FEATURES, PAGE_GROUPS

ROOT = Path(__file__).resolve().parents[2]
DB = ROOT / 'database'
SRC = ROOT / 'frontend/src'
texts = {}
for base in (SRC, ROOT / 'backend/src'):
    for p in sorted(base.rglob('*')):
        if p.suffix in {'.js','.html','.scss','.cs','.csproj','.json'} and not {'obj','bin','node_modules'} & set(p.parts):
            texts[p.resolve()] = p.read_text(encoding='utf-8-sig')
schema = (DB / '01_schema.sql').read_text(encoding='utf-8')
tables = {}
for match in re.finditer(r'CREATE TABLE (\w+) \((.*?)\n\);', schema, re.S):
    tables[match[1]] = re.findall(r'^  (\w+)\s+(?:uuid|text|varchar|numeric|integer|smallint|bigint|boolean|date|timestamptz|jsonb|inet)\b', match[2], re.M)
assert len(tables) == 13, f'Unexpected table count: {len(tables)}'
used_tables = set()
for group, features in FEATURES.items():
    for feature, refs in features:
        for ref in refs.split():
            table, col = ref.split('.')
            assert col in tables.get(table, []), f'Missing {ref}: {feature}'
            used_tables.add(table)
assert set(tables) == used_tables, f'Tables with no current feature: {set(tables)-used_tables}'

routes_text = (SRC / 'router/routes.js').read_text(encoding='utf-8')
routes = []
for line in routes_text.splitlines():
    m = re.search(r"(?:admin|site|member)\('([^']+)'|path: '([^']+)'", line)
    module = re.search(r"import\('../pages/([^']+)'\)", line)
    if m and module and (m[1] or m[2]) != '*':
        routes.append({'path':m[1] or m[2], 'module':module[1]})

CALLS = re.compile(r'\b(\w+Api)\.(\w+)\s*\(')
def calls(text):
    return sorted({'.'.join(m) for m in CALLS.findall(text)})
def dependencies(p, seen=None):
    seen = set() if seen is None else seen
    if p in seen or p not in texts or '/mocks/' in p.as_posix() or p.name == 'api.js':
        return seen
    seen.add(p)
    for spec in re.findall(r"(?:from\s+|import\s*\(?)[\"'](\.[^\"']+)[\"']", texts[p]):
        dep = (p.parent / spec.split('?')[0]).resolve()
        dependencies(dep, seen)
    return seen

for route in routes:
    module = route['module']
    assert module in PAGE_GROUPS, f'Unreviewed route {route}'
    path = (SRC / 'pages' / module).resolve()
    route['groups'] = PAGE_GROUPS[module]
    route['directCalls'] = calls(texts[path])
    deps = dependencies(path)
    route['reachableFiles'] = sorted(p.relative_to(ROOT).as_posix() for p in deps)
    route['sharedCalls'] = sorted(set(calls('\n'.join(texts[p] for p in deps))) - set(route['directCalls']))
    route['fields'] = sorted(set(re.findall(r"name:\s*['\"]([^'\"]+)['\"]", texts[path])))
    route['columns'] = sorted({ref for g in route['groups'] for _, refs in FEATURES[g] for ref in refs.split()})
assert len(routes) == 40, f'Route count changed: {len(routes)}'

ui_text = '\n'.join(t for p,t in texts.items() if p.is_relative_to(SRC) and '/mocks/' not in p.as_posix() and p.name != 'api.js')
used_calls = set(calls(ui_text))
api_text = texts[(SRC / 'services/api.js').resolve()]
all_methods = set()
current = None
for line in api_text.splitlines():
    group = re.match(r'export const (\w+Api)',line)
    if group: current = group[1]
    method = re.match(r'  (\w+):',line)
    if method and current: all_methods.add(current+'.'+method[1])
assert not used_calls-all_methods, used_calls-all_methods
manifest = {
 'scope':'Current routed pages and their UI helpers; legacy mock handlers do not define the database scope.',
 'sourceFiles':[{'path':p.relative_to(ROOT).as_posix(),'lines':len(t.splitlines()),'sha256':hashlib.sha256(t.encode()).hexdigest()} for p,t in texts.items()],
 'tableCount':len(tables),'routeCount':len(routes),'featureCount':sum(map(len,FEATURES.values())),
 'routes':routes,'usedServiceMethods':sorted(used_calls),'unusedServiceMethods':sorted(all_methods-used_calls),
 'features':FEATURES,
}
(DB / 'SOURCE_AUDIT.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
lines=['# Đối chiếu trang hiện tại với database','',
 f'Kiểm tra {len(routes)} route, {sum(map(len,FEATURES.values()))} chức năng và {len(tables)} bảng. Tất cả bảng đều có chức năng hiện tại sử dụng.',
 '', 'Nguồn: `frontend/src/router/routes.js`, nội dung trang, component dùng chung, services, mock handler/engine để hiểu hành vi. Baseline 13 bảng thu gọn ngày 04/11/2026; frontend vẫn chạy mock. Trang dùng các DTO cũ cần adapter khi nối SQL mới.',
 '', '**Giới hạn:** đối chiếu cột xác nhận có chỗ lưu dữ liệu. Kiểm thử SQL xác nhận các ràng buộc. Chưa phải xác nhận backend API thật đã hoạt động; backend hiện là khung.',
 '', '## Từng route', '', '| Route | Source trang | Nhóm chức năng | Kết quả |','|---|---|---|---|']
for r in routes:
    lines.append(f"| `{r['path']}` | `{r['module']}` | {', '.join(r['groups'])} | Đủ cột theo checklist |")
for group, features in FEATURES.items():
    lines += ['', '## '+group, '', '| Chức năng đang có | Nơi lưu |','|---|---|']
    for feature, refs in features:
        lines.append('| '+feature+' | '+', '.join('`'+ref+'`' for ref in refs.split())+' |')
lines += ['', '## API còn trong source nhưng không được giao diện gọi', '',
 'Các phương thức dưới đây không phải lý do để thêm bảng. Không xóa chúng khỏi source trong công việc database này. Có thể là API cũ hoặc nhánh chưa có trang. Phân tích dựa vào lời gọi trực tiếp bằng tên; các trường động và component chia sẻ được ghi riêng trong SOURCE_AUDIT.json.', '',
 ', '.join('`'+m+'`' for m in sorted(all_methods-used_calls)), '',
 'Không tạo bảng tổ chức/thành viên/phân quyền, AI, tích hợp ngân hàng/ký điện tử, SMTP, chiến dịch nhắc nợ, hàng đợi mail, backup, chi phí hoặc quản lý tài sản phòng: hiện không có trang/form sử dụng các phân hệ đó.', '',
 'Hồ sơ khách ở users; bàn giao và người ở cùng trong contracts; chỉ số và dòng tiền trong invoices; lịch hẹn/giữ chỗ/đề nghị trong bookings; trao đổi hỗ trợ trong tickets.messages. Lịch sử cần hiển thị nằm trên hồ sơ tương ứng. Batch trả kết quả ngay; CSV không lưu tác vụ.', '']
(DB / 'DOI_CHIEU_TUNG_TRANG.md').write_text('\n'.join(lines),encoding='utf-8')
print(json.dumps({'files':len(texts),'lines':sum(len(t.splitlines()) for t in texts.values()),'routes':len(routes),'features':manifest['featureCount'],'tables':len(tables),'usedMethods':len(used_calls),'unusedMethods':len(all_methods-used_calls)}))
