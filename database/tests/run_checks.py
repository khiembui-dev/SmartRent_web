"""Kiểm tra trên database tạm riêng; chỉ cần Python và psql.

python database/tests/run_checks.py --psql "C:/Program Files/PostgreSQL/16/bin/psql.exe"
Dùng PGHOST/PGPORT/PGUSER/PGPASSWORD hoặc pgpass để kết nối; role cần quyền CREATEDB.
Database thử có tên ngẫu nhiên và chỉ database do lượt chạy này tạo mới bị xóa.
"""
from __future__ import annotations

import argparse
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import uuid

ROOT = Path(__file__).resolve().parents[1]
SCRIPTS = [ROOT / name for name in ("01_schema.sql", "02_rules.sql", "03_seed.sql", "04_import_tools.sql")]
SCRIPTS += sorted((ROOT / "migrations").glob("*.sql"))


def main() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    parser = argparse.ArgumentParser()
    parser.add_argument("--psql", default="psql")
    parser.add_argument("--node", default="node", help="Node.js dùng để đối chiếu với engine của website")
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
        # Dấu "locked" chỉ xuất hiện sau câu lệnh đầu; câu thứ hai thật sự tranh chấp khóa.
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
        print("PASS đồng thời: " + label)

    def compare_with_website():
        # Nạp toàn bộ dữ liệu do website sinh ra vào database riêng, rồi đối chiếu từng con số với engine của website.
        sample_db = database + "_mau"
        run(f'CREATE DATABASE "{sample_db}" TEMPLATE template0 ENCODING \'UTF8\'', db="postgres")
        try:
            for script in (*SCRIPTS, ROOT / "06_du_lieu_mau.sql"):
                run(file=script, db=sample_db)
            print("Dữ liệu website qua hết ràng buộc: 06_du_lieu_mau.sql")
            compare = subprocess.run([args.node, str(ROOT / "tests" / "compare_with_website.mjs")], env=env,
                                     capture_output=True, encoding="utf-8", errors="replace")
            if compare.returncode:
                raise RuntimeError(compare.stderr)
            with tempfile.TemporaryDirectory() as folder:
                sql = Path(folder) / "so_sanh.sql"
                sql.write_text(compare.stdout, encoding="utf-8")
                rows = run(file=sql, db=sample_db).stdout.strip().splitlines()
            mismatches = [line for line in rows if "_lech|" in line and not line.endswith("|0")]
            details = [line for line in rows if line.startswith("chi_tiet")]
            for line in rows:
                print("  " + line)
            if mismatches or details:
                raise RuntimeError("Lệch với website: " + "; ".join(mismatches + details))
            print("PASS: mọi số liệu của database khớp engine của website")
        finally:
            run(f'DROP DATABASE IF EXISTS "{sample_db}" WITH (FORCE)', db="postgres")

    created = False
    try:
        run(f'CREATE DATABASE "{database}" TEMPLATE template0 ENCODING \'UTF8\'', db="postgres")
        created = True
        for script in SCRIPTS:
            run(file=script)
        acceptance = run(file=ROOT / "tests" / "acceptance.sql")
        print("Kiểm thử nghiệp vụ đạt: " + acceptance.stdout.strip().splitlines()[0])

        # Mẫu nhập dữ liệu thật phải chạy được nguyên trạng rồi khớp với các view của website.
        run(file=ROOT / "05_du_lieu_thuc.sql")
        real = run("""SET search_path = smartrent, public;
          SELECT json_build_object(
            'phong', (SELECT count(*) FROM rooms),
            'dang_o', (SELECT count(*) FROM v_room_status WHERE occupancy_status = 'occupied'),
            'phong_cong_khai', (SELECT count(*) FROM v_public_rooms),
            'coc_dang_giu', (SELECT sum(held_amount) FROM v_deposit_balances),
            'cong_no', (SELECT sum(outstanding_amount) FROM v_tenant_debts),
            'hop_dong', (SELECT string_agg(status, ',') FROM v_contract_status),
            'gia_thue_101', (SELECT unit_price FROM effective_rates((SELECT id FROM tenancies LIMIT 1), vn_today()) er
                             JOIN charge_types c ON c.id = er.charge_type_id WHERE c.code = 'RENT'),
            'nguon_gia_thue', (SELECT source_scope FROM effective_rates((SELECT id FROM tenancies LIMIT 1), vn_today()) er
                               JOIN charge_types c ON c.id = er.charge_type_id WHERE c.code = 'RENT'));""")
        print("Mẫu dữ liệu thật: " + real.stdout.strip().splitlines()[-1])

        run("""SET search_path = smartrent, public;
          SELECT set_config('smartrent.identity_key', 'khoa-thu', false);
          SELECT import_identity_document('NHATRO', 'KH001', '001000000123', 'cccd');""")
        identity = run("""SET search_path = smartrent, public;
          SELECT number_last4 || ' ' || (pgp_sym_decrypt(number_ciphertext, 'khoa-thu') = '001000000123')
                 || ' ' || (position('001000000123' IN encode(number_ciphertext, 'escape')) = 0)
          FROM tenant_identity_documents;""")
        print("Giấy tờ mã hóa (4 số cuối, giải mã đúng, không lộ số rõ): " + identity.stdout.strip().splitlines()[-1])
        refused = run("SELECT smartrent.import_identity_document('NHATRO', 'KH002', '001000000999')", check=False)
        if refused.returncode == 0:
            raise RuntimeError("Không có khóa mà vẫn lưu được số giấy tờ")
        print("PASS: không có khóa thì từ chối lưu số giấy tờ")

        ids = [str(uuid.uuid4()) for _ in range(7)]
        org, prop, room, user, tenant_a, tenant_b, payment = ids
        run(f"""
        SET search_path = smartrent, public;
        INSERT INTO users(id, display_name) VALUES ('{user}', 'Race operator');
        INSERT INTO organizations(id, code, name) VALUES ('{org}', 'RACE', 'Race');
        SELECT initialize_organization('{org}', '{user}');
        INSERT INTO properties(id, organization_id, code, name, address_line, locality, province)
          VALUES ('{prop}', '{org}', 'P', 'Property', 'Line', 'Locality', 'Province');
        INSERT INTO rooms(id, property_id, room_type_id, code, name, area_m2, capacity)
          SELECT '{room}', '{prop}', id, 'R', 'Room', 20, 2 FROM room_types WHERE organization_id = '{org}' AND code = 'STANDARD';
        INSERT INTO tenants(id, organization_id, code, full_name) VALUES ('{tenant_a}', '{org}', 'A', 'A'), ('{tenant_b}', '{org}', 'B', 'B');
        """)
        race(
            f"INSERT INTO smartrent.tenancies(room_id, representative_tenant_id, planned_move_in) VALUES ('{room}', '{tenant_a}', '2030-01-01')",
            f"INSERT INTO smartrent.tenancies(room_id, representative_tenant_id, planned_move_in) VALUES ('{room}', '{tenant_b}', '2030-02-01')",
            "23P01", "hai kết nối không thể nhận cùng một phòng")
        run(f"""
        SET search_path = smartrent, public;
        INSERT INTO payments(id, code, tenant_id, amount, received_at, method_code, status, confirmed_by, confirmed_at, idempotency_key)
          VALUES ('{payment}', 'RACE-1', '{tenant_a}', 100, now(), 'cash', 'confirmed', '{user}', now(), gen_random_uuid());
        """)
        stay = run(f"SELECT id FROM smartrent.tenancies WHERE representative_tenant_id = '{tenant_a}'").stdout.strip().splitlines()[-1]
        deposit_sql = f"""INSERT INTO smartrent.deposit_entries(tenancy_id, payment_id, kind, amount, occurred_at, reason, confirmed_by, idempotency_key)
          VALUES ('{stay}', '{payment}', 'receipt', 75, now(), 'Concurrent test', '{user}', gen_random_uuid())"""
        race(deposit_sql, deposit_sql, "23514", "hai kết nối không thể dùng vượt cùng một khoản thu")

        stats = run("""SELECT json_build_object(
          'postgres', version(),
          'tables', (SELECT count(*) FROM information_schema.tables WHERE table_schema = 'smartrent' AND table_type = 'BASE TABLE'),
          'views', (SELECT count(*) FROM information_schema.views WHERE table_schema = 'smartrent'),
          'primary_keys', (SELECT count(*) FROM pg_constraint WHERE contype = 'p' AND connamespace = 'smartrent'::regnamespace),
          'foreign_keys', (SELECT count(*) FROM pg_constraint WHERE contype = 'f' AND connamespace = 'smartrent'::regnamespace),
          'checks', (SELECT count(*) FROM pg_constraint WHERE contype = 'c' AND connamespace = 'smartrent'::regnamespace),
          'unique', (SELECT count(*) FROM pg_constraint WHERE contype = 'u' AND connamespace = 'smartrent'::regnamespace),
          'exclusions', (SELECT count(*) FROM pg_constraint WHERE contype = 'x' AND connamespace = 'smartrent'::regnamespace),
          'triggers', (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid WHERE c.relnamespace = 'smartrent'::regnamespace AND NOT t.tgisinternal),
          'tables_without_pk', (SELECT count(*) FROM pg_class c WHERE c.relkind = 'r' AND c.relnamespace = 'smartrent'::regnamespace
                                 AND NOT EXISTS (SELECT 1 FROM pg_constraint k WHERE k.conrelid = c.oid AND k.contype = 'p')),
          'tables_without_comment', (SELECT count(*) FROM pg_class c WHERE c.relkind = 'r' AND c.relnamespace = 'smartrent'::regnamespace
                                     AND obj_description(c.oid) IS NULL));""")
        print(stats.stdout.strip())
        compare_with_website()
        print("PASS: cài đặt, nghiệp vụ, mẫu dữ liệu thật, đồng thời và đối chiếu website")
    finally:
        if created and not args.keep:
            run(f'DROP DATABASE "{database}" WITH (FORCE)', db="postgres")
        elif created:
            print("Giữ database thử: " + database)


if __name__ == "__main__":
    main()
