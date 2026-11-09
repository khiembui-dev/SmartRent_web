"""Run real HTTP/SQL regressions against the root source with a disposable database.

From repository root: python backend/tests/run_full_backend.py
Stop the normal backend before building (Windows locks running assemblies).
The normal database/configuration is never reset or seeded by this script.
"""
import hashlib
import json
import os
import pathlib
import re
import secrets
import socket
import subprocess
import sys
import tempfile
import time
import urllib.request
import uuid

ROOT = pathlib.Path(__file__).resolve().parents[2]
database = "smartrent_audit_" + uuid.uuid4().hex[:12]
assert re.fullmatch(r"smartrent_audit_[a-f0-9]{12}", database)
connection = os.environ.get("ConnectionStrings__SmartRent")
if not connection:
    private_file = pathlib.Path(os.environ.get("APPDATA", "")) / "Microsoft/UserSecrets/smartrent-api/secrets.json"
    if not private_file.exists():
        raise SystemExit("Set ConnectionStrings__SmartRent or configure .NET User Secrets first.")
    connection = json.loads(private_file.read_text(encoding="utf-8-sig"))["ConnectionStrings:SmartRent"]
isolated_connection = re.sub(r"(?i)Database=[^;]+", "Database=" + database, connection)
if isolated_connection == connection or database not in isolated_connection:
    raise SystemExit("Cannot isolate the database connection.")
with socket.socket() as sock:
    if sock.connect_ex(("127.0.0.1", 5082)) == 0:
        raise SystemExit("Port 5082 is already used. Stop the previous audit API first.")


def docker(*args, data=None):
    r = subprocess.run(["docker", "compose", "exec", "-T", "db", *args], input=data,
                       capture_output=True, cwd=ROOT)
    if r.returncode:
        raise RuntimeError(r.stderr.decode("utf-8", errors="replace"))
    return r.stdout


def sql(statement):
    return docker("psql", "-U", "postgres", "-d", database, "-v", "ON_ERROR_STOP=1", "-At",
                  data=statement.encode("utf-8")).decode("utf-8").strip()


subprocess.run(["dotnet", "build", "backend/SmartRent.sln", "--no-restore", "-p:UseAppHost=false"],
               cwd=ROOT, check=True)
schema = docker("pg_dump", "-U", "postgres", "-d", "smartrent", "--schema-only", "--no-owner")
api = None
created = False
fixture = None
mail_directory=ROOT / "backend/src/SmartRent.Api/App_Data/mail"
existing_mail=set(mail_directory.glob("*.eml"))
try:
    docker("createdb", "-U", "postgres", database)
    created = True
    docker("psql", "-U", "postgres", "-d", database, "-v", "ON_ERROR_STOP=1", data=schema)
    for name in ["03_seed.sql", "05_demo.sql"]:
        sql((ROOT / "database" / name).read_text(encoding="utf-8-sig"))
    ids = json.loads(sql("""select jsonb_build_object(
      'admin',(select id from smartrent.users where role='admin'),
      'user',(select id from smartrent.users where code='KH-001'),
      'resident',(select id from smartrent.users where code='KH-002'),
      'property',(select id from smartrent.properties where code='CS01'),
      'contract',(select id from smartrent.contracts where code='HDTH-001'),
      'invoice',(select id from smartrent.invoices where code='HD-001'))::text"""))
    tokens = {role: secrets.token_urlsafe(32) for role in ["admin", "user", "resident"]}
    for role, token in tokens.items():
        sql("insert into smartrent.auth_tokens(user_id,kind,token_hash,expires_at) "
            "values('%s','session','%s',now()+interval '2 hours')" %
            (ids[role], hashlib.sha256(token.encode()).hexdigest().upper()))
    env = dict(os.environ, ConnectionStrings__SmartRent=isolated_connection,
               ASPNETCORE_ENVIRONMENT="Development", SMARTRENT_TEST_DATABASE=database,
               SMARTRENT_TEST_API_URL="http://127.0.0.1:5082/api/v1", SMARTRENT_COMPOSE_ROOT=str(ROOT),
               Email__UsePickup="true")
    with tempfile.TemporaryDirectory(prefix="smartrent_flow_") as directory:
        state_file = pathlib.Path(directory) / "state.json"
        state_file.write_text(json.dumps(dict(database=database, base=env["SMARTRENT_TEST_API_URL"],
                                              ids=ids, tokens=tokens)), encoding="utf-8")
        with open(pathlib.Path(directory) / "api.log", "w", encoding="utf-8") as log:
            api = subprocess.Popen(["dotnet", str(ROOT / "backend/src/SmartRent.Api/bin/Debug/net10.0/SmartRent.Api.dll"),
                                    "--urls", "http://127.0.0.1:5082", "--contentRoot",
                                    str(ROOT / "backend/src/SmartRent.Api")], cwd=ROOT, env=env,
                                   stdout=log, stderr=subprocess.STDOUT)
            for _ in range(100):
                if api.poll() is not None:
                    raise RuntimeError("Audit API failed to start.")
                try:
                    with urllib.request.urlopen(env["SMARTRENT_TEST_API_URL"] + "/dev/database-check", timeout=1) as r:
                        assert json.load(r)["database"] == database
                    break
                except OSError:
                    time.sleep(0.1)
            else:
                raise RuntimeError("Audit API startup timed out.")
            for test in ["full_backend_flow.py", "backend_edge_flow.py", "public_listing_flow.py"]:
                subprocess.run([sys.executable, "backend/tests/" + test, "--state", str(state_file)],
                               cwd=ROOT, env=env, check=True)
            ticket = subprocess.run([sys.executable, "backend/tests/ticket_flow.py", "--keep"],
                                    cwd=ROOT, env=env, check=True, capture_output=True, text=True, encoding="utf-8")
            print(ticket.stdout, end="")
            fixture = re.search(r"UI fixture state:\s*(.+)", ticket.stdout)[1].strip()
            subprocess.run([sys.executable, "backend/tests/team_merge_smoke.py", "--state", fixture],
                           cwd=ROOT, env=env, check=True)
            # Release the log/DLL handles before TemporaryDirectory cleanup on Windows.
            api.terminate()
            api.wait(timeout=10)
            api=None
    print("PASS: all workflow, public listing, Ticket and integration suites against the original source and isolated PostgreSQL.")
finally:
    if api:
        api.terminate()
        try:
            api.wait(timeout=10)
        except subprocess.TimeoutExpired:
            api.kill()
            api.wait()
    if created:
        # Remove only files whose UUID keys were created inside this disposable database.
        keys = sql("select storage_key from smartrent.files where storage_key ~ '^[a-f0-9]{32}$'").splitlines()
        for key in keys:
            if re.fullmatch(r"[a-f0-9]{32}", key):
                (ROOT / "backend/src/SmartRent.Api/App_Data/ticket-files" / key).unlink(missing_ok=True)
        # Password links in local pickup messages must not be left behind by regressions.
        for path in set(mail_directory.glob("*.eml"))-existing_mail:
            path.unlink(missing_ok=True)
        if fixture:
            pathlib.Path(fixture).unlink(missing_ok=True)
        docker("dropdb", "-U", "postgres", "--force", database)
