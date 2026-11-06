"""Kiểm thử HTTP + PostgreSQL thật. Chỉ tạo/xóa fixture UUID riêng, không sửa dữ liệu người dùng.
Chạy tại thư mục gốc: python backend/tests/ticket_flow.py
Yêu cầu Docker db đang chạy, API http://127.0.0.1:5080 đã build và áp dụng 06_ticket_backend.sql.
"""
import base64
import concurrent.futures
import hashlib
import json
import pathlib
import argparse
import tempfile
import secrets
import subprocess
import urllib.error
import urllib.request
import uuid

ROOT = pathlib.Path(__file__).resolve().parents[2]
BASE = "http://127.0.0.1:5080/api/v1"
ids = {k: str(uuid.uuid4()) for k in ["user", "stranger", "resident", "property", "room", "contract"]}
tokens = {k: secrets.token_urlsafe(32) for k in ["admin", "user", "stranger", "resident"]}
hashes = {k: hashlib.sha256(v.encode()).hexdigest().upper() for k, v in tokens.items()}
checks = 0
options = argparse.ArgumentParser()
options.add_argument("--keep",action="store_true",help="Giữ fixture để kiểm tra UI, xuất đường dẫn state local.")
options.add_argument("--cleanup",help="Dọn fixture của file state do --keep tạo.")
args = options.parse_args()


def sql(statement):
    result = subprocess.run(["docker", "compose", "exec", "-T", "db", "psql", "-U", "postgres",
                             "-d", "smartrent", "-v", "ON_ERROR_STOP=1", "-At"],
                            input=statement, text=True, capture_output=True, cwd=ROOT, encoding="utf-8")
    if result.returncode:
        raise RuntimeError(result.stderr)
    return result.stdout.strip()


def request(path, actor="user", method="GET", body=None, key=None, binary=None, mime=None, expected=200, with_status=False):
    global checks
    headers = {}
    if actor:
        headers["Authorization"] = "Bearer " + tokens[actor]
    if key:
        headers["Idempotency-Key"] = key
    data = binary if binary is not None else json.dumps(body).encode() if body is not None else None
    if data is not None:
        headers["Content-Type"] = mime or "application/json"
    req = urllib.request.Request(BASE + path, data=data, headers=headers, method=method)
    try:
        with urllib.request.urlopen(req, timeout=20) as response:
            status, content = response.status, response.read()
            content_type = response.headers.get("Content-Type", "")
    except urllib.error.HTTPError as error:
        status, content, content_type = error.code, error.read(), error.headers.get("Content-Type", "")
    assert status in (expected if isinstance(expected,tuple) else (expected,)), f"{method} {path}: {status}, expected {expected}: {content[:500]!r}"
    checks += 1
    value = json.loads(content) if "json" in content_type and content else content
    return (status,value) if with_status else value


def upload(payload, expected=200):
    boundary = "TicketTest" + uuid.uuid4().hex
    parts = []
    for name, value in [("purpose", "ticket"), ("visibility", "private")]:
        parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode())
    parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="test.png"\r\nContent-Type: image/png\r\n\r\n'.encode() + payload + b"\r\n")
    parts.append(f'--{boundary}--\r\n'.encode())
    return request("/files", method="POST", binary=b"".join(parts),
                   mime="multipart/form-data; boundary=" + boundary, expected=expected)


def cleanup_fixture():
    # Chỉ xóa UUID do chính lần chạy này tạo. Không xóa hoặc reset bảng/volume.
    user_ids = ",".join("'" + str(uuid.UUID(ids[k])) + "'" for k in ["user", "stranger", "resident"])
    for value in ids.values(): uuid.UUID(value)
    assert len(hashes["admin"])==64 and all(c in "0123456789ABCDEF" for c in hashes["admin"])
    storage = sql(f"SELECT storage_key FROM smartrent.files WHERE uploaded_by IN ({user_ids});")
    sql(f"""BEGIN; SET search_path=smartrent,public;
      DELETE FROM notifications WHERE recipient_id IN ({user_ids})
        OR url IN (SELECT '/admin/tickets/'||id::text FROM tickets WHERE room_id='{ids['room']}');
      DELETE FROM tickets WHERE room_id='{ids['room']}';
      DELETE FROM contracts WHERE id='{ids['contract']}';
      DELETE FROM files WHERE uploaded_by IN ({user_ids});
      DELETE FROM auth_tokens WHERE user_id IN ({user_ids}) OR token_hash='{hashes['admin']}';
      DELETE FROM rooms WHERE id='{ids['room']}';
      DELETE FROM properties WHERE id='{ids['property']}';
      DELETE FROM users WHERE id IN ({user_ids}); COMMIT;""")
    for key in storage.splitlines():
        if len(key)==32 and all(c in "0123456789abcdef" for c in key):
            (ROOT / "backend/src/SmartRent.Api/App_Data/ticket-files" / key).unlink(missing_ok=True)


if args.cleanup:
    state=json.loads(pathlib.Path(args.cleanup).read_text())
    ids,hashes=state["ids"],state["hashes"]
    cleanup_fixture()
    pathlib.Path(args.cleanup).unlink()
    print("Fixture cleaned.")
    raise SystemExit(0)

success=False
try:
    admin = sql("SELECT id FROM smartrent.users WHERE role='admin';")
    assert admin, "Cần tài khoản admin đã tạo trong database."
    setup = ["BEGIN; SET search_path=smartrent,public;"]
    for role in ["user", "stranger", "resident"]:
        setup.append(f"INSERT INTO users(id,display_name,email,password_hash,login_enabled) VALUES('{ids[role]}','Ticket integration {role}','{ids[role]}@test.invalid','DISABLED_INTEGRATION_PASSWORD',true);")
    for role, token_hash in hashes.items():
        uid = admin if role == "admin" else ids[role]
        setup.append(f"INSERT INTO auth_tokens(user_id,kind,token_hash,expires_at) VALUES('{uid}','session','{token_hash}',now()+interval '1 hour');")
    setup += [f"INSERT INTO properties(id,code,name,address_line,province) VALUES('{ids['property']}','IT-{uuid.uuid4().hex}','Ticket integration','Test','Test');",
              f"INSERT INTO rooms(id,property_id,code,name,area_m2,capacity) VALUES('{ids['room']}','{ids['property']}','IT1','Integration room',20,2);",
              f"INSERT INTO contracts(id,code,room_id,user_id,onboarding_mode,starts_on,move_in_on,occupants) VALUES('{ids['contract']}','IT-{uuid.uuid4().hex}','{ids['room']}','{ids['user']}','import',current_date,current_date,jsonb_build_array(jsonb_build_object('userId','{ids['resident']}','joinedOn',current_date)));",
              "COMMIT;"]
    sql("\n".join(setup))
    request("/tickets", actor=None, expected=401)
    request("/tickets", expected=403)
    request("/portal/tickets", actor="admin", expected=403)
    catalog = request("/portal/catalog")
    assert len(catalog["ticketCategories"]) == 4
    assert any(t["id"] == ids["contract"] for t in request("/portal/tenancies"))
    upload(b"not an image", expected=422)
    png = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a/r8AAAAASUVORK5CYII=")
    image = upload(png)
    body = dict(tenancyId=ids["contract"], categoryId="WATER", title="Integration leak",
                description="Test ticket", priority="normal", fileIds=[image["id"]])
    request("/portal/tickets", method="POST", body={**body, "title": ""}, expected=422)
    request("/portal/tickets", actor="stranger", method="POST", body=body, expected=422)
    key = str(uuid.uuid4())
    with concurrent.futures.ThreadPoolExecutor(2) as pool:
        created = list(pool.map(lambda _: request("/portal/tickets", method="POST", body=body, key=key), range(2)))
    ticket = created[0]
    assert ticket["id"] == created[1]["id"], "Idempotency không được tạo hai dòng."
    tid = ticket["id"]
    request("/portal/tickets", method="POST", body={**body, "title": "Different"}, key=key, expected=409)
    assert request("/tickets?status=open&q=Integration", actor="admin")["totalItems"] >= 1
    request("/tickets?sort=SQL-INJECTION", actor="admin", expected=422)
    request("/portal/tickets/" + tid, actor="stranger", expected=404)
    request("/portal/tickets/" + tid, actor="resident")
    request("/portal/tickets/" + tid + "/messages", method="POST", body=dict(body="fake internal", isInternal=True), expected=403)
    request("/tickets/" + tid + "/messages", actor="admin", method="POST", body=dict(body="SECRET_NOTE", isInternal=True))
    with concurrent.futures.ThreadPoolExecutor(2) as pool:
        list(pool.map(lambda n: request("/portal/tickets/" + tid + "/messages", method="POST", body=dict(body="Public " + str(n))), range(2)))
    detail = request("/portal/tickets/" + tid)
    assert len(detail["messages"]) == 2 and "SECRET_NOTE" not in json.dumps(detail)
    assert len(request("/tickets/" + tid, actor="admin")["messages"]) == 3
    grant = request("/files/" + image["id"] + "/download-url")
    content = request(grant["url"].removeprefix("/api/v1"), actor=None)
    assert content == png
    request("/files/" + image["id"] + "/download-url", actor="stranger", expected=404)
    request(grant["url"].removeprefix("/api/v1") + "tampered", actor=None, expected=404)
    def transition(action, **kwargs):
        return request("/tickets/" + tid + "/transitions", actor="admin", method="POST", body=dict(action=action, **kwargs))
    request("/tickets/" + tid + "/transitions", actor="admin", method="POST", body=dict(action="resolve", resolutionNotes="x"), expected=409)
    with concurrent.futures.ThreadPoolExecutor(2) as pool:
        raced=list(pool.map(lambda _: request("/tickets/"+tid+"/transitions",actor="admin",method="POST",
            body=dict(action="accept",expectedStatus="new"),expected=(200,409),with_status=True),range(2)))
    assert sorted(status for status,_ in raced)==[200,409], "Chỉ một thao tác từ status cũ được thành công."
    assigned=request("/tickets/" + tid + "/assign", actor="admin", method="POST", body=dict(userId=admin, expectedStatus="accepted",note="Inspect pipe"))
    assert any(e["kind"]=="assign" and e["reason"]=="Inspect pipe" for e in assigned["events"])
    transition("wait", reason="Waiting supplies", expectedStatus="accepted")
    transition("resume", expectedStatus="waiting")
    transition("resolve", resolutionNotes="Repaired pipe", expectedStatus="in_progress")
    request("/tickets/" + tid + "/transitions", actor="admin", method="POST", body=dict(action="close", expectedStatus="in_progress"), expected=409)
    request("/portal/tickets/" + tid + "/confirm", method="POST", body={})
    request("/portal/tickets/" + tid + "/messages", method="POST", body=dict(body="closed"), expected=409)
    reopened = request("/portal/tickets/" + tid + "/reopen", method="POST", body=dict(reason="Still leaking"))
    assert reopened["status"] == "accepted" and reopened["resolvedAt"] is None and reopened["closedAt"] is None
    assert any(e["kind"] == "reopen" and e["reason"] == "Still leaking" for e in reopened["events"])
    assert request("/notifications/unread-count", actor="admin")["unreadCount"] >= 1
    request("/notifications?pageSize=8", actor="admin")
    success=True
    print(f"PASS: {checks} HTTP checks plus ownership, idempotency, concurrent messages, JSON privacy, image access and history assertions.")
finally:
    if args.keep and success:
        state_path=pathlib.Path(tempfile.gettempdir()) / ("smartrent-ticket-fixture-"+uuid.uuid4().hex+".json")
        state_path.write_text(json.dumps(dict(ids=ids,hashes=hashes,tokens=tokens,ticketId=tid)),encoding="utf-8")
        print("UI fixture state:",state_path)
    else:
        cleanup_fixture()
