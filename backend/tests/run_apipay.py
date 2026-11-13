"""Focused ApiPay regressions on the current source + a disposable PostgreSQL database.

Run from repo root: python backend/tests/run_apipay.py
Uses fake HttpClient, never calls a bank or prints credentials. The normal DB is read for schema only.
"""
import json
import os
import pathlib
import re
import subprocess
import uuid

ROOT = pathlib.Path(__file__).resolve().parents[2]
database = "smartrent_audit_" + uuid.uuid4().hex[:12]
assert re.fullmatch(r"smartrent_audit_[a-f0-9]{12}", database)
connection = os.environ.get("ConnectionStrings__SmartRent")
if not connection:
    private_file = pathlib.Path(os.environ["APPDATA"]) / "Microsoft/UserSecrets/smartrent-api/secrets.json"
    connection = json.loads(private_file.read_text(encoding="utf-8-sig"))["ConnectionStrings:SmartRent"]
isolated = re.sub(r"(?i)Database=[^;]+", "Database=" + database, connection)
if isolated == connection or database not in isolated:
    raise SystemExit("Cannot isolate database connection.")


def docker(*args, data=None):
    result = subprocess.run(["docker", "compose", "exec", "-T", "db", *args], input=data, capture_output=True, cwd=ROOT)
    if result.returncode:
        raise RuntimeError(result.stderr.decode("utf-8", errors="replace"))
    return result.stdout


subprocess.run(["dotnet", "build", "backend/SmartRent.sln", "--no-restore", "-p:UseAppHost=false"], cwd=ROOT, check=True)
schema = docker("pg_dump", "-U", "postgres", "-d", "smartrent", "--schema-only", "--no-owner")
created = False
try:
    docker("createdb", "-U", "postgres", database)
    created = True
    for content in [schema] + [(ROOT / "database" / name).read_bytes() for name in ["14_apipay.sql", "16_apipay_invoice_content.sql", "16_apipay_invoice_content.sql", "03_seed.sql", "05_demo.sql"]]:
        docker("psql", "-U", "postgres", "-d", database, "-v", "ON_ERROR_STOP=1", data=content)
    env = dict(os.environ, SMARTRENT_APIPAY_TEST_CONNECTION=isolated)
    subprocess.run(["dotnet", "test", "backend/tests/SmartRent.Api.Tests", "--no-build", "--filter", "FullyQualifiedName~ApiPay"], cwd=ROOT, env=env, check=True)
    subprocess.run([os.sys.executable, "backend/tests/apipay_http.py"], cwd=ROOT, env=env, check=True)
finally:
    if created:
        docker("dropdb", "-U", "postgres", "--force", database)
