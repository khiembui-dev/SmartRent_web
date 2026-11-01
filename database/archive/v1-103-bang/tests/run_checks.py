"""Kiểm tra trên database tạm riêng; dùng psql, không cần thư viện Python ngoài.

python database/tests/run_checks.py --psql "C:/Program Files/PostgreSQL/16/bin/psql.exe"
Dùng PGHOST/PGPORT/PGUSER/PGPASSWORD hoặc pgpass để kết nối; role cần CREATEDB.
Database thử được đặt tên ngẫu nhiên và chỉ database do lượt chạy này tạo mới bị xóa.
"""
from __future__ import annotations

import argparse
import os
from pathlib import Path
import subprocess
import sys
import uuid

ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser()
    parser.add_argument("--psql", default="psql")
    parser.add_argument("--keep", action="store_true", help="Giữ database thử để kiểm tra")
    args = parser.parse_args()
    database = "smartrent_test_" + uuid.uuid4().hex
    base = [args.psql, "-X", "-q", "-A", "-t", "-v", "ON_ERROR_STOP=1", "-v", "VERBOSITY=verbose"]
    env = {**os.environ, "PGCLIENTENCODING": "UTF8"}

    def run(sql: str | None = None, file: Path | None = None, db: str = database, check: bool = True):
        command = [*base, "-d", db]
        command += ["-f", str(file)] if file else ["-c", sql or ""]
        result = subprocess.run(command, env=env, capture_output=True, encoding="utf-8", errors="replace")
        if check and result.returncode:
            raise RuntimeError(result.stderr + result.stdout)
        return result

    def race(first_sql: str, second_sql: str, error_code: str, label: str):
        # Marker chỉ xuất hiện sau INSERT đầu tiên; câu lệnh thứ hai thực sự tranh chấp khóa.
        process = subprocess.Popen([*base, "-d", database], env=env, stdin=subprocess.PIPE,
                                   stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                   encoding="utf-8", errors="replace")
        process.stdin.write("BEGIN;\n" + first_sql + ";\n\\echo locked\nSELECT pg_sleep(1.5);\nCOMMIT;\n")
        process.stdin.close()
        marker = process.stdout.readline().strip()
        if marker != "locked":
            raise RuntimeError("First writer failed: " + marker + process.stderr.read())
        second = run(second_sql, check=False)
        process.wait(timeout=30)
        first_error = process.stderr.read()
        if process.returncode or second.returncode == 0 or error_code not in second.stderr:
            raise RuntimeError(label + " failed: " + first_error + second.stderr)
        print("PASS concurrent: " + label)

    created = False
    try:
        run(f'CREATE DATABASE "{database}" TEMPLATE template0 ENCODING \'UTF8\'', db="postgres")
        created = True
        for script in ("01_schema.sql", "02_rules.sql", "03_seed.sql"):
            run(file=ROOT / script)
        acceptance = run(file=ROOT / "tests" / "acceptance.sql")
        print("Acceptance checks: " + acceptance.stdout.strip().splitlines()[0])

        ids = [str(uuid.uuid4()) for _ in range(10)]
        org, address, prop, rt, room, user, tenant, alloc, stay, payment = ids
        run(f"""
        SET search_path=smartrent,public;
        INSERT INTO organizations(id,code,name) VALUES('{org}','RACE','Race');
        INSERT INTO addresses(id,address_line) VALUES('{address}','Race address');
        INSERT INTO properties(id,organization_id,code,name,address_id) VALUES('{prop}','{org}','P','Property','{address}');
        INSERT INTO room_types(id,organization_id,code,name) VALUES('{rt}','{org}','R','Room type');
        INSERT INTO rooms(id,property_id,room_type_id,code,name,area_m2,capacity) VALUES('{room}','{prop}','{rt}','R','Room',20,2);
        INSERT INTO users(id,display_name) VALUES('{user}','Race operator');
        INSERT INTO tenants(id,organization_id,code,full_name) VALUES('{tenant}','{org}','T','Race tenant');
        """)
        race(
            f"INSERT INTO smartrent.room_allocations(room_id,starts_on,ends_on,state) VALUES('{room}','2030-01-01','2030-02-01','reserved')",
            f"INSERT INTO smartrent.room_allocations(room_id,starts_on,ends_on,state) VALUES('{room}','2030-01-15','2030-02-15','reserved')",
            "23P01", "hai kết nối không thể giữ/nhận cùng phòng trong thời gian chồng nhau")
        run(f"""
        SET search_path=smartrent,public;
        INSERT INTO room_allocations(id,room_id,starts_on,state) VALUES('{alloc}','{room}','2032-01-01','reserved');
        INSERT INTO tenancies(id,allocation_id,representative_tenant_id,planned_move_in) VALUES('{stay}','{alloc}','{tenant}','2032-01-01');
        INSERT INTO payments(id,tenant_id,amount,received_at,method_code,status,confirmed_by,confirmed_at,idempotency_key)
          VALUES('{payment}','{tenant}',100,now(),'cash','confirmed','{user}',now(),gen_random_uuid());
        """)
        deposit_sql = f"""INSERT INTO smartrent.deposit_entries(tenancy_id,payment_id,kind,amount,occurred_at,reason,confirmed_by,idempotency_key)
          VALUES('{stay}','{payment}','receipt',75,now(),'Concurrent test','{user}',gen_random_uuid())"""
        race(deposit_sql, deposit_sql, "23514", "hai kết nối không thể phân bổ cọc vượt cùng khoản thu")
        stats = run("""SELECT json_build_object(
          'postgres',version(),
          'tables',(SELECT count(*) FROM information_schema.tables WHERE table_schema='smartrent' AND table_type='BASE TABLE'),
          'views',(SELECT count(*) FROM information_schema.views WHERE table_schema='smartrent'),
          'foreign_keys',(SELECT count(*) FROM pg_constraint WHERE contype='f' AND connamespace='smartrent'::regnamespace),
          'checks',(SELECT count(*) FROM pg_constraint WHERE contype='c' AND connamespace='smartrent'::regnamespace),
          'exclusions',(SELECT count(*) FROM pg_constraint WHERE contype='x' AND connamespace='smartrent'::regnamespace));""")
        print(stats.stdout.strip())
        print("PASS: installation, acceptance, and concurrency checks")
    finally:
        if created and not args.keep:
            run(f'DROP DATABASE "{database}" WITH (FORCE)', db="postgres")
        elif created:
            print("Kept test database: " + database)


if __name__ == "__main__":
    main()
