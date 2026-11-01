"""Xuất từ điển từ catalog PostgreSQL; không cần dependency ngoài Python + psql."""
import argparse
import json
import os
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]
SQL = """
SELECT json_build_object(
 'tables',(SELECT json_agg(x ORDER BY x.name) FROM (
   SELECT c.relname AS name, obj_description(c.oid) AS description,
    (SELECT json_agg(json_build_object(
       'name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'comment',col_description(c.oid,a.attnum),
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
    FROM information_schema.views WHERE table_schema='smartrent'),
 'functions',(SELECT json_agg(p.proname ORDER BY p.proname) FROM (SELECT DISTINCT proname FROM pg_proc
    WHERE pronamespace='smartrent'::regnamespace AND prorettype<>'trigger'::regtype) p));
"""


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--psql", default="psql")
    parser.add_argument("--database", required=True)
    args = parser.parse_args()
    result = subprocess.run([args.psql,"-X","-A","-t","-v","ON_ERROR_STOP=1","-d",args.database,"-c",SQL],
        env={**os.environ,"PGCLIENTENCODING":"UTF8"},capture_output=True,encoding="utf-8",check=True)
    catalog = json.loads(result.stdout)
    # Mô tả bảng lấy từ COMMENT ON TABLE trong 01_schema.sql; thiếu là lỗi để tài liệu không bị bỏ sót.
    unknown = [t["name"] for t in catalog["tables"] if not t["description"]]
    if unknown:
        raise RuntimeError("Missing COMMENT ON TABLE: " + ", ".join(unknown))
    lines = ["# Từ điển dữ liệu SmartRent", "",
        "Sinh trực tiếp từ catalog PostgreSQL bằng tools/export_dictionary.py; không sửa tay.","",
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
        lines += ["",f"## {name}","",table["description"],"",
                  "| Cột | PostgreSQL | NULL | Default / identity |",
                  "|---|---|---|---|"]
        for col in table["columns"]:
            default = col["default"] or "—"
            if col["identity"]:
                default = "GENERATED " + ("ALWAYS" if col["identity"]=="a" else "BY DEFAULT") + " AS IDENTITY"
            note = f" {col['comment']}" if col["comment"] else ""
            lines.append(f"| `{col['name']}` | `{col['type']}` | {'Có' if col['nullable'] else 'Không'} | `{default}`{note} |")
        lines += ["","**PK, FK, UNIQUE, CHECK, EXCLUDE:**", ""]
        for constraint in table["constraints"] or []:
            lines.append(f"- `{constraint['name']}`: `{constraint['definition'].replace(chr(10),' ')}`")
        lines += ["","<details><summary>Indexes</summary>","","```sql"]
        lines += [(index+";") for index in table["indexes"] or []]
        lines += ["```","","</details>"]
    lines += ["","## Views", ""] + ["- `"+view["name"]+"`" for view in catalog["views"]]
    lines += ["","## Hàm", ""] + ["- `"+name+"`" for name in catalog["functions"]]
    (ROOT/"TU_DIEN_DU_LIEU.md").write_text("\n".join(lines)+"\n",encoding="utf-8")


if __name__=="__main__":
    main()
