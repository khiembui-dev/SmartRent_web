"""Export the actual installed PostgreSQL schema to a dictionary and ER diagrams."""
from pathlib import Path
import argparse,json,os,shutil,subprocess

BASE=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser()
p.add_argument('--database',required=True)
p.add_argument('--host',default='127.0.0.1')
p.add_argument('--port',default='55440')
p.add_argument('--user',default='postgres')
a=p.parse_args()
psql=shutil.which('psql') or r'C:\Program Files\PostgreSQL\16\bin\psql.exe'
env={**os.environ,'PGHOST':a.host,'PGPORT':a.port,'PGUSER':a.user,'PGCLIENTENCODING':'UTF8'}
query="""
SELECT jsonb_build_object(
'tables',(SELECT jsonb_agg(jsonb_build_object('name',c.relname,'description',obj_description(c.oid),'columns',
 (SELECT jsonb_agg(jsonb_build_object('name',att.attname,'type',format_type(att.atttypid,att.atttypmod),'nullable',NOT att.attnotnull,
 'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY att.attnum)
 FROM pg_attribute att LEFT JOIN pg_attrdef d ON d.adrelid=att.attrelid AND d.adnum=att.attnum WHERE att.attrelid=c.oid AND att.attnum>0 AND NOT att.attisdropped),
 'constraints',(SELECT jsonb_agg(jsonb_build_object('name',con.conname,'type',con.contype,'definition',pg_get_constraintdef(con.oid))) FROM pg_constraint con WHERE con.conrelid=c.oid),
 'indexes',(SELECT jsonb_agg(indexdef) FROM pg_indexes WHERE schemaname='smartrent' AND tablename=c.relname)) ORDER BY c.relname)
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='smartrent' AND c.relkind='r'),
'views',(SELECT jsonb_agg(jsonb_build_object('name',viewname,'definition',definition) ORDER BY viewname) FROM pg_views WHERE schemaname='smartrent'),
'foreignKeys',(SELECT jsonb_agg(jsonb_build_object('child',ch.relname,'parent',pa.relname,'definition',pg_get_constraintdef(co.oid),'columns',
 (SELECT jsonb_agg(at.attname) FROM unnest(co.conkey) k JOIN pg_attribute at ON at.attrelid=ch.oid AND at.attnum=k)))
 FROM pg_constraint co JOIN pg_class ch ON ch.oid=co.conrelid JOIN pg_class pa ON pa.oid=co.confrelid JOIN pg_namespace n ON n.oid=ch.relnamespace WHERE n.nspname='smartrent' AND co.contype='f'),
'triggers',(SELECT count(*) FROM pg_trigger tr JOIN pg_class c ON c.oid=tr.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='smartrent' AND NOT tr.tgisinternal)
);
"""
r=subprocess.run([psql,'-X','-Atq','-v','ON_ERROR_STOP=1','-d',a.database],input=query,encoding='utf-8',capture_output=True,env=env,check=True)
data=json.loads(r.stdout)
assert len(data['tables'])==13
(BASE/'schema.catalog.json').write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def cell(value): return str(value if value is not None else '—').replace('|','\\|').replace('\n',' ')
lines=['# Từ điển database hiện tại','',f"Sinh trực tiếp từ PostgreSQL: {len(data['tables'])} bảng, {len(data['views'])} view. Đơn vị tiền VND (numeric nguyên), chỉ số điện nước có 3 chữ số thập phân.",'']
for table in data['tables']:
    lines += ['## '+table['name'],'',table['description'] or '', '', '| Cột | Kiểu | Null | Mặc định / công thức |','|---|---|---|---|']
    for col in table['columns']:
        lines.append(f"| `{col['name']}` | `{col['type']}` | {'Có' if col['nullable'] else 'Không'} | {cell(col['default'])} |")
    lines += ['', 'Ràng buộc:', '']
    lines += ['- `'+cell(c['definition'])+'`' for c in table['constraints'] or []]
    lines += ['', 'Chỉ mục:', '']+['- `'+cell(i)+'`' for i in table['indexes'] or []]+['']
lines += ['## Views','']+['- `'+v['name']+'`' for v in data['views']]+['']
(BASE/'TU_DIEN_DU_LIEU.md').write_text('\n'.join(lines),encoding='utf-8')
groups={
 'Tài khoản và dùng chung':['users','auth_tokens','files','settings','notifications'],
 'Cơ sở, phòng và giá':['properties','rooms'],
 'Lịch xem và đề nghị':['bookings'],
 'Thuê và hợp đồng':['contracts'],
 'Điện nước và hóa đơn':['billing_periods','invoices'],
 'Thanh toán và tiền cọc':['payments'],
 'Hỗ trợ':['tickets'],
}
assert set(sum(groups.values(),[]))=={t['name'] for t in data['tables']}
tables={t['name']:t for t in data['tables']}
erd=['# Sơ đồ database — 13 bảng','','Một admin và các user. Dữ liệu lặp đã gộp thành JSONB trong bảng chính; xem JSON_DATA.md để biết cấu trúc. Đường nối dưới đây là khóa ngoại cột; các ID bên trong JSONB được trigger kiểm tra, không phải khóa ngoại tự động của PostgreSQL.','']
for group,names in groups.items():
    erd += ['## '+group,'','| Bảng | Dùng cho |','|---|---|']
    erd += [f"| `{n}` | {tables[n]['description']} |" for n in names]
    erd += ['','```mermaid','flowchart LR']
    for n in names: erd.append(f'  {n}["{n}"]')
    keys=[fk for fk in data['foreignKeys'] if fk['child'] in names and fk['parent']!=fk['child']]
    for fk in keys:
        erd.append(f"  {fk['child']} -->|{', '.join(fk['columns'])}| {fk['parent']}")
    erd += ['```','']
(BASE/'ERD.md').write_text('\n'.join(erd),encoding='utf-8')
print(json.dumps({'tables':len(data['tables']),'views':len(data['views']),'foreignKeys':len(data['foreignKeys']),'triggers':data['triggers']}))
