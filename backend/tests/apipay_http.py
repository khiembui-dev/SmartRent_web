"""HTTP pipeline checks on run_apipay.py's disposable database; never call ApiPay servers."""
import hashlib
import hmac
import json
import os
import pathlib
import re
import secrets
import socket
import subprocess
import tempfile
import time
import urllib.error
import urllib.request
import uuid

ROOT = pathlib.Path(__file__).resolve().parents[2]
connection = os.environ["SMARTRENT_APIPAY_TEST_CONNECTION"]
database = re.search(r"(?i)Database=([^;]+)", connection)[1]
assert re.fullmatch(r"smartrent_audit_[a-f0-9]{12}", database)
BASE = "http://127.0.0.1:5083/api/v1"
WEBHOOK_SECRET = "apipay-http-fixture-only"
checks = 0


def sql(statement):
    p = subprocess.run(["docker", "compose", "exec", "-T", "db", "psql", "-U", "postgres", "-d", database,
                        "-v", "ON_ERROR_STOP=1", "-At"], input=statement.encode(), capture_output=True, cwd=ROOT, check=True)
    return p.stdout.decode("utf-8").strip()


def request(path, method="GET", raw=None, token=None, signature=None, https=False, webhook_port=False):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = "Bearer " + token
    if signature:
        headers["ApiPay-Signature"] = signature
    if https:
        headers["X-Forwarded-Proto"] = "https"
    try:
        target = BASE.replace(':5083/', ':5084/') if webhook_port else BASE
        with urllib.request.urlopen(urllib.request.Request(target + path, data=raw, method=method, headers=headers), timeout=9) as response:
            return response.status, response.read()
    except urllib.error.HTTPError as e:
        return e.code, e.read()


def expect(status, path, **kwargs):
    global checks
    actual, body = request(path, **kwargs)
    assert actual == status, (path, actual, status)
    checks += 1
    return body


def signed(raw):
    return hmac.new(WEBHOOK_SECRET.encode(), raw, hashlib.sha256).hexdigest()


for number in [5083,5084]:
    with socket.socket() as port:
        if port.connect_ex(("127.0.0.1", number)) == 0:
            raise SystemExit("ApiPay test port is already in use; stop the previous test API.")

ids = json.loads(sql("""select jsonb_build_object('admin',(select id from smartrent.users where role='admin'),
 'user',(select id from smartrent.users where code='KH-001'),
 'invoice',(select id from smartrent.invoices where code='HD-001'))::text"""))
tokens = {role: secrets.token_urlsafe(32) for role in ["admin", "user"]}
for role, token in tokens.items():
    sql("insert into smartrent.auth_tokens(user_id,kind,token_hash,expires_at) values('%s','session','%s',now()+interval '1 hour')" %
        (ids[role], hashlib.sha256(token.encode()).hexdigest().upper()))

env = dict(os.environ, ConnectionStrings__SmartRent=connection, ASPNETCORE_ENVIRONMENT="Development",
           APIPAY_ENABLED="true", APIPAY_ACCESS_KEY="http-fixture-access", APIPAY_SECRET_KEY="http-fixture-secret",
           APIPAY_WEBHOOK_SECRET=WEBHOOK_SECRET, APIPAY_WEBHOOK_URL="https://fixture.invalid/api/v1/apipay/webhook",
           APIPAY_WEBHOOK_LISTENER_PORT="5084",
           APIPAY_TRUSTED_PROXIES="127.0.0.1,::1")
with tempfile.TemporaryDirectory(prefix="smartrent_apipay_http_") as directory:
    with open(pathlib.Path(directory) / "api.log", "w", encoding="utf-8") as log:
        api = subprocess.Popen(["dotnet", str(ROOT / "backend/src/SmartRent.Api/bin/Debug/net10.0/SmartRent.Api.dll"),
                                "--urls", "http://127.0.0.1:5083;http://127.0.0.1:5084", "--contentRoot", str(ROOT / "backend/src/SmartRent.Api")],
                               cwd=ROOT, env=env, stdout=log, stderr=subprocess.STDOUT)
        try:
            for _ in range(80):
                if api.poll() is not None:
                    raise RuntimeError("ApiPay test API did not start.")
                try:
                    status, _ = request("/dev/database-check")
                    if status == 200:
                        break
                except OSError:
                    time.sleep(0.1)
            else:
                raise RuntimeError("ApiPay test API startup timed out.")
            payment = "/portal/apipay/invoices/" + ids["invoice"] + "/payment-request"
            expect(401, payment)
            expect(403, payment, token=tokens["admin"])
            state = json.loads(expect(200, payment, token=tokens["user"]))
            assert state["available"] and state["pendingManual"] and state["request"] is None
            expect(404, "/portal/apipay/invoices/" + str(uuid.uuid4()) + "/payment-request", token=tokens["user"])
            # Demo invoice has a pending manual report: POST cannot call provider or create another QR.
            expect(409, payment, method="POST", raw=b'{"amount":1}', token=tokens["user"])
            expect(401, "/admin/apipay/events")
            expect(403, "/admin/apipay/events", token=tokens["user"])
            expect(200, "/admin/apipay/events", token=tokens["admin"])
            expect(400, "/apipay/webhook", method="POST", raw=b"not json")  # HTTP is not sufficient.
            expect(401, "/apipay/webhook", method="POST", raw=b"not json", https=True)
            expect(401, "/apipay/webhook", method="POST", raw=b"not json", signature="0"*64, https=True)
            expect(400, "/apipay/webhook", method="POST", raw=b"not json", signature=signed(b"not json"), https=True)
            expect(404, "/dev/database-check", webhook_port=True)
            expect(404, "/portal/invoices/"+ids["invoice"], token=tokens["user"], webhook_port=True)
            expect(404, "/apipay/webhook", webhook_port=True)
            expect(401, "/apipay/webhook", method="POST", raw=b"not json", https=True, webhook_port=True)
            expect(404, "/apipay/webhook?unexpected=1", method="POST", raw=b"not json", https=True, webhook_port=True)
            test = b'{"event":"transaction.in","liveTest":true,"data":{}}'
            ignored = json.loads(expect(200, "/apipay/webhook", method="POST", raw=test, signature=signed(test), https=True))
            assert ignored["ignored"]
            transaction = str(uuid.uuid4())
            event = {"event": "transaction.in", "data": {"transactionId": transaction, "referenceCode": "HTTP-"+uuid.uuid4().hex,
                     "amount": "100000", "type": "IN", "content": "HTTP-FIXTURE", "transactionDate": "2026-11-13T09:30:00Z",
                     "bankAccountPublicId": "other-bank-fixture"}}
            raw = json.dumps(event).encode()
            expect(200, "/apipay/webhook", method="POST", raw=raw, signature=signed(raw), https=True)
            assert sql("select count(*) from smartrent.apipay_events where transaction_id='%s'" % transaction) == "1"
            expect(200, "/apipay/webhook", method="POST", raw=raw, signature=signed(raw), https=True)
            event["data"]["amount"] = "1"
            changed = json.dumps(event).encode()
            expect(409, "/apipay/webhook", method="POST", raw=changed, signature=signed(changed), https=True)
            for _ in range(50):
                if sql("select state from smartrent.apipay_events where transaction_id='%s'" % transaction) == "ignored":
                    break
                time.sleep(0.1)
            else:
                raise AssertionError("Hosted worker did not consume durable inbox.")
            assert sql("select payment_id is null from smartrent.apipay_events where transaction_id='%s'" % transaction) == "t"
            print("PASS APIPAY HTTP: %d checks, authentication/roles, raw HMAC, trusted HTTPS proxy, durable ACK, replay and hosted worker." % checks)
        finally:
            api.terminate()
            try:
                api.wait(timeout=10)
            except subprocess.TimeoutExpired:
                api.kill()
                api.wait()
