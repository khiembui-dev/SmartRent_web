"""Xuất từ điển từ catalog PostgreSQL; không cần dependency ngoài Python + psql."""
import argparse
import json
import os
from pathlib import Path
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]
SQL = """
SELECT json_build_object(
 'tables',(SELECT json_agg(x ORDER BY x.name) FROM (
   SELECT c.relname AS name,
    (SELECT json_agg(json_build_object(
       'name',a.attname,'type',format_type(a.atttypid,a.atttypmod),
       'nullable',NOT a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid),'identity',a.attidentity)
       ORDER BY a.attnum)
     FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
     WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) AS columns,
    (SELECT json_agg(json_build_object('name',co.conname,'type',co.contype,'definition',pg_get_constraintdef(co.oid))
       ORDER BY co.contype,co.conname) FROM pg_constraint co WHERE co.conrelid=c.oid) AS constraints,
    (SELECT json_agg(indexdef ORDER BY indexname) FROM pg_indexes WHERE schemaname=n.nspname AND tablename=c.relname) AS indexes
   FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
   WHERE n.nspname='smartrent' AND c.relkind='r') x),
 'views',(SELECT json_agg(json_build_object('name',table_name) ORDER BY table_name)
    FROM information_schema.views WHERE table_schema='smartrent'));
"""


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--psql", default="psql")
    parser.add_argument("--database", required=True)
    args = parser.parse_args()
    result = subprocess.run([args.psql,"-X","-A","-t","-v","ON_ERROR_STOP=1","-d",args.database,"-c",SQL],
        env={**os.environ,"PGCLIENTENCODING":"UTF8"},capture_output=True,encoding="utf-8",check=True)
    catalog = json.loads(result.stdout)
    descriptions = {}
    source = (ROOT / "THIET_KE_DATABASE.md").read_text(encoding="utf-8")
    for line in source.splitlines():
        if line.startswith("| `"):
            cells = line.split("|")
            for name in re.findall(r"`([a-z_]+)`",cells[1]):
                descriptions[name] = cells[2].strip().replace("`","")
    unknown = [t["name"] for t in catalog["tables"] if t["name"] not in descriptions]
    if unknown:
        raise RuntimeError("Missing table description: " + ", ".join(unknown))
    lines = ["# Từ điển dữ liệu SmartRent", "",
        "Sinh trực tiếp từ catalog PostgreSQL sau khi cài 01–03; đối chiếu cùng DDL khi thay đổi schema.","",
        f"**{len(catalog['tables'])} bảng, {len(catalog['views'])} view.** Mỗi bảng bên dưới ghi đầy đủ cột, khóa và index.","",
        "UUID ↔ Guid; numeric ↔ decimal; date ↔ DateOnly; timestamptz ↔ DateTime UTC; bytea ↔ byte[].", "",
        "`NULL = Có` nghĩa là trường tùy chọn. Thời gian *_on dùng ngày; *_at dùng thời điểm UTC.",
        "`snapshot` là giá trị tại thời điểm ký/phát hành, giữ nguyên khi danh mục thay đổi.",
        "`idempotency_key` là khóa do client/server giữ ổn định khi thử lại cùng yêu cầu.",
        "Các FK mặc định NO ACTION; chỉ các quan hệ có ON DELETE CASCADE ghi rõ mới được xóa dây chuyền.","",
        "## Mục lục", ""]
    lines += [f"- [{t['name']}](#{t['name']})" for t in catalog["tables"]]
    for table in catalog["tables"]:
        name = table["name"]
        lines += ["",f"## {name}","",descriptions[name],"",
                  "| Cột | PostgreSQL | NULL | Default / identity |",
                  "|---|---|---|---|"]
        for col in table["columns"]:
            default = col["default"] or "—"
            if col["identity"]:
                default = "GENERATED " + ("ALWAYS" if col["identity"]=="a" else "BY DEFAULT") + " AS IDENTITY"
            lines.append(f"| `{col['name']}` | `{col['type']}` | {'Có' if col['nullable'] else 'Không'} | `{default}` |")
        lines += ["","**PK, FK, UNIQUE, CHECK, EXCLUDE:**", ""]
        for constraint in table["constraints"] or []:
            lines.append(f"- `{constraint['name']}`: `{constraint['definition'].replace(chr(10),' ')}`")
        lines += ["","<details><summary>Indexes</summary>","","```sql"]
        lines += [(index+";") for index in table["indexes"] or []]
        lines += ["```","","</details>"]
    lines += ["","## Views", ""] + ["- `"+view["name"]+"`" for view in catalog["views"]]
    (ROOT/"TU_DIEN_DU_LIEU.md").write_text("\n".join(lines)+"\n",encoding="utf-8")


if __name__=="__main__":
    main()
