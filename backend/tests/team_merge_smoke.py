"""HTTP integration checks against the UUID fixture from ticket_flow.py --keep.

Run: python backend/tests/team_merge_smoke.py --state <local-state.json>
The supplied state contains temporary tokens. Never commit or print its contents.
Only fixture bookings/periods are created; ticket_flow.py --cleanup removes them.
"""
import argparse
import datetime
import json
import os
import pathlib
import secrets
import subprocess
import urllib.error
import urllib.request
import uuid

parser = argparse.ArgumentParser()
parser.add_argument("--state", required=True)
args = parser.parse_args()
state = json.loads(pathlib.Path(args.state).read_text(encoding="utf-8"))
ids, tokens = state["ids"], state["tokens"]
base = os.environ.get("SMARTRENT_TEST_API_URL", "http://127.0.0.1:5080/api/v1")
root = os.environ.get("SMARTRENT_COMPOSE_ROOT", str(pathlib.Path(__file__).resolve().parents[2]))
checks = 0


def request(path, actor="admin", method="GET", body=None, expected=200, token=None):
    global checks
    headers = {"Content-Type": "application/json"}
    if token or actor:
        headers["Authorization"] = "Bearer " + (token or tokens[actor])
    req = urllib.request.Request(base + path, headers=headers, method=method,
                                 data=json.dumps(body).encode() if body is not None else None)
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            status, data = r.status, r.read()
    except urllib.error.HTTPError as e:
        status, data = e.code, e.read()
    assert status == expected, f"{method} {path}: expected {expected}, got {status}: {data[:500]!r}"
    checks += 1
    return json.loads(data) if data else None


def sql(statement):
    r = subprocess.run(["docker", "compose", "exec", "-T", "db", "psql", "-U", "postgres",
                        "-d", "smartrent", "-v", "ON_ERROR_STOP=1", "-At"],
                       input=statement, text=True, capture_output=True, cwd=root, encoding="utf-8")
    assert r.returncode == 0, r.stderr
    return r.stdout.strip()


# Every imported module must share the same SQL-backed session and role checks.
for path in ["/tenants", "/contracts", "/viewings", "/inquiries", "/billing-periods", "/invoices"]:
    request(path, actor=None, expected=401)
    request(path, actor="user", expected=403)
    result = request(path)
    assert isinstance(result["items"], list)
for path in ["/portal/profile", "/portal/tenancies", "/portal/overview", "/portal/invoices", "/portal/payments", "/portal/requests"]:
    request(path, actor=None, expected=401)
    request(path, actor="user")
    request(path, actor="admin", expected=403)

tenant = request("/tenants/" + ids["user"])
assert tenant["hasPortalAccount"] and tenant["tenancies"]
assert all(k in tenant for k in ["profileChangeRequests", "tickets", "invoices", "outstandingAmount"])
contract = request("/contracts/" + ids["contract"])
assert contract["tenant"]["id"] == ids["user"] and contract["deposit"]["held"] == 0
assert all(k in contract for k in ["roomInfo", "tenancy", "requests", "invoices", "versions"])
page = request("/contracts?tenantId=" + ids["user"])
assert page["totalItems"] == 1 and page["totalPages"] == 1
assert request("/contracts?roomId=" + ids["room"])["totalItems"] == 1
request("/viewings?from=2026-01-01T00%3A00%3A00%2B07%3A00")
assert isinstance(request("/portal/catalog", actor="user")["bankAccounts"], list)
assert isinstance(request("/portal/profile", actor="user")["profiles"][0]["changeRequests"], list)
request("/portal/tenancies/" + ids["contract"], actor="stranger", expected=404)
resident = request("/portal/tenancies", actor="resident")[0]
assert resident["role"] == "resident" and not resident["financeVisible"]
assert request("/portal/tenancies/" + ids["contract"], actor="resident")["contracts"][0]["versions"] == []

# Fixture-only worksheet and viewing writes exercise JSONB SQL and UTC conversion.
month = datetime.date.today().replace(day=1).isoformat()
period = request("/billing-periods", method="POST", body={"propertyId": ids["property"], "monthStart": month})
sheet = request("/billing-periods/" + period["id"] + "/worksheet")
assert len(sheet["rows"]) == 1 and sheet["rows"][0]["tenancy"]["id"] == ids["contract"]
assert sheet["stats"]["tenancyCount"] == 1
request("/billing-periods", method="POST", body={"propertyId": ids["property"], "monthStart": month}, expected=409)
booking_id = str(uuid.uuid4())
sql(f"""SET search_path=smartrent,public;
 INSERT INTO bookings(id,code,user_id,room_id,kind,status,contact_name,occupants)
 VALUES('{booking_id}','IT-{booking_id}','{ids['stranger']}','{ids['room']}','viewing','new','Integration visitor',1);""")
request("/inquiries/" + booking_id + "/viewings", method="POST", body={
    "startsAt": "2026-11-10T09:00:00+07:00", "endsAt": "2026-11-10T10:00:00+07:00"})
viewing = next(v for v in request("/viewings")["items"] if v["inquiryId"] == booking_id)
assert viewing["date"] == "2026-11-10" and viewing["inquiry"]["room"]["id"] == ids["room"]
request("/viewings/" + viewing["id"] + "/result", method="POST", body={"status": "completed", "resultNotes": "Visited"})

# Register/login use frontend field names, the runtime database role, and real hashes.
email = str(uuid.uuid4()) + "@test.invalid"
password = secrets.token_urlsafe(18)
try:
    auth = request("/auth/register", actor=None, method="POST", body={
        "fullName": "Integration signup", "email": email, "password": password, "acceptedTerms": True})
    me = request("/me", actor=None, token=auth["accessToken"])
    assert me["user"]["role"] == "user"
    request("/auth/login", actor=None, method="POST", body={"email": email, "password": password, "audience": "admin"}, expected=403)
    login = request("/auth/login", actor=None, method="POST", body={"email": email, "password": password, "audience": "customer"})
    updated = request("/me/profile", actor=None, token=login["accessToken"], method="PUT", body={"fullName": "Integration updated"})
    assert updated["user"]["displayName"] == "Integration updated"
    request("/me/change-password", actor=None, token=login["accessToken"], method="POST", body={
        "currentPassword": password, "newPassword": password + "New"})
    request("/me", actor=None, token=login["accessToken"], expected=401)
finally:
    # Email is a generated UUID, never a pre-existing account.
    sql(f"""SET search_path=smartrent,public;
      DELETE FROM auth_tokens WHERE user_id IN (SELECT id FROM users WHERE email='{email}');
      DELETE FROM users WHERE email='{email}';""")
print(f"PASS: {checks} team integration HTTP checks, DTO assertions, role isolation and fixture writes.")
