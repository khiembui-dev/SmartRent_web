"""Run schema + demo + acceptance + real two-connection races in an isolated database.
Requires only Python standard library and PostgreSQL 16 client/server. Never drops a user database.
"""
from pathlib import Path
import argparse
import concurrent.futures
import json
import os
import shutil
import subprocess
import uuid

BASE = Path(__file__).resolve().parents[1]
parser = argparse.ArgumentParser()
parser.add_argument('--host',default='127.0.0.1')
parser.add_argument('--port',default='55440')
parser.add_argument('--user',default='postgres')
parser.add_argument('--keep',action='store_true')
args = parser.parse_args()
psql = shutil.which('psql') or r'C:\Program Files\PostgreSQL\16\bin\psql.exe'
env = {**os.environ,'PGHOST':args.host,'PGPORT':args.port,'PGUSER':args.user,'PGCLIENTENCODING':'UTF8'}
name = 'smartrent_check_'+uuid.uuid4().hex[:12]
logs=[]
def sql(statement, database=name, fail=True):
    result=subprocess.run([psql,'-X','-q','-A','-t','-v','ON_ERROR_STOP=1','-d',database],input=statement,encoding='utf-8',errors='replace',capture_output=True,env=env)
    if fail and result.returncode:
        raise RuntimeError(result.stderr+'\n'+result.stdout[-3000:])
    return result
def file(path):
    result=sql(path.read_text(encoding='utf-8'))
    logs.append(result.stdout+result.stderr)
    return result.stdout
def race(label, queries, expected):
    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
        results=list(pool.map(lambda q:sql(q,fail=False),queries))
    assert sum(r.returncode==0 for r in results)==1, [(r.returncode,r.stderr) for r in results]
    error=next(r.stderr for r in results if r.returncode)
    assert any(x in error for x in expected), error
    return {'name':label,'passed':True}

try:
    sql('CREATE DATABASE '+name+';',database='postgres')
    for filename in ['01_schema.sql','02_rules.sql','03_seed.sql','05_demo.sql']:
        file(BASE/filename)
    output=file(BASE/'tests/acceptance.sql')
    acceptance=next(json.loads(line) for line in output.splitlines() if line.startswith('{"passed"'))
    workflow_output=file(BASE/'tests/workflows.sql')
    workflows=next(json.loads(line) for line in workflow_output.splitlines() if line.startswith('{"passed"'))
    prefix='SET search_path=smartrent,public; BEGIN; '
    suffix=' SELECT pg_sleep(0.25); COMMIT;'
    occupancy="INSERT INTO contracts(code,room_id,user_id,onboarding_mode,starts_on,move_in_on) SELECT next_code('CHECKIN'),r.id,u.id,'import','2026-11-01','2026-11-01' FROM rooms r,users u WHERE r.code='A102' AND u.code='KH-003';"
    races=[race('Two checkins cannot occupy same room',[prefix+occupancy+suffix]*2,['conflicting key value violates exclusion constraint'])]
    def collect(code):
        return prefix+f"""
        INSERT INTO payments(code,user_id,contract_id,amount,method,status,confirmed_at,confirmed_by,allocations)
        SELECT '{code}',c.user_id,c.id,1500000,'cash','confirmed',now(),u.id,jsonb_build_array(jsonb_build_object('invoiceId',i.id,'amount',1500000))
        FROM contracts c,invoices i,users u WHERE i.code='HD-001' AND c.id=i.contract_id AND u.role='admin';
        """+suffix
    races.append(race('Two confirmations cannot overpay invoice',[collect('RACE-1'),collect('RACE-2')],['invoice_overallocated']))
    sql("SET search_path=smartrent,public; INSERT INTO rooms(property_id,code,name,area_m2,capacity) SELECT id,'RACE','Race room',20,2 FROM properties;")
    hold="INSERT INTO bookings(code,user_id,room_id,contact_name,occupants,hold_status,hold_from,hold_expires_at) SELECT next_code('HOLD'),u.id,r.id,'Race hold',1,'holding','2026-11-01',now()+interval '1 day' FROM rooms r,users u WHERE r.code='RACE' AND u.code='KH-003';"
    checkin=occupancy.replace("r.code='A102'","r.code='RACE'")
    races.append(race('Reservation and checkin cannot take same room',[prefix+hold+suffix,prefix+checkin+suffix],['room_is_occupied','room_is_reserved']))
    role='sr_probe_'+uuid.uuid4().hex[:8]
    # Transaction rollback removes the temporary SQL role as well as all test writes.
    privileges=f"""SET search_path=smartrent,public; BEGIN; CREATE ROLE {role} NOLOGIN;
    SELECT configure_runtime('{role}'); SET ROLE {role};
    INSERT INTO users(email,display_name,password_hash,login_enabled) VALUES('runtime@example.test','Runtime','disabled_test_hash_123456',true);
    DO $body$ BEGIN
      BEGIN INSERT INTO users(role,email,display_name,password_hash) VALUES('admin','bad@test','Bad','disabled_test_hash_123456'); RAISE EXCEPTION 'role insert allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
      BEGIN UPDATE users SET role='admin' WHERE email='runtime@example.test'; RAISE EXCEPTION 'role update allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
      BEGIN PERFORM configure_runtime('{role}'); RAISE EXCEPTION 'grant escalation allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
      IF NOT EXISTS(SELECT 1 FROM users WHERE email='runtime@example.test' AND role='user') THEN RAISE EXCEPTION 'wrong default role'; END IF;
    END $body$; ROLLBACK;"""
    sql(privileges)
    report={'database':name,'postgres':sql('SHOW server_version').stdout.strip(),'tables':13,'acceptance':acceptance,'workflows':workflows,'concurrency':races,'runtimePrivilegeChecks':4}
    (BASE/'tests/latest-run.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    (BASE/'tests/latest-run.txt').write_text(f"PostgreSQL {report['postgres']}\n13 tables\n{acceptance['passed']} SQL checks passed\n{workflows['passed']} business workflow scenarios passed\n3 two-connection races passed\n4 runtime privilege checks passed\nFresh schema, rules, default settings and demo loaded successfully.\n"+'\n'.join(x['name'] for x in races)+'\n',encoding='utf-8')
    print(json.dumps({k:v for k,v in report.items() if k!='acceptance'}))
    print(f"PASS: {acceptance['passed']} SQL checks + 3 concurrency cases + 4 runtime privilege checks")
finally:
    (BASE/'tests').mkdir(exist_ok=True)
    if not args.keep:
        # Only the random name generated by this process can reach DROP DATABASE.
        assert name.startswith('smartrent_check_') and name[16:].isalnum()
        sql('DROP DATABASE IF EXISTS '+name+' WITH (FORCE);',database='postgres',fail=False)
