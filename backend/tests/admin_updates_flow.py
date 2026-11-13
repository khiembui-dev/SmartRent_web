import json,urllib.request,urllib.error,pathlib,uuid,datetime,base64,secrets,re,subprocess
import argparse
parser=argparse.ArgumentParser(description="Regression against the original API source with an isolated database.")
parser.add_argument('--state',required=True,help='Temporary local audit state; never commit this file.')
args=parser.parse_args();state_file=pathlib.Path(args.state);root=state_file.parent
s=json.loads(state_file.read_text());
assert s['database'].startswith('smartrent_audit_') and ':5080/' not in s['base'], 'Refusing normal application database/API.'
base=s['base'];tokens=s['tokens'];checks=0
state={}
def req(path,method='GET',body=None,role='admin',key=None,expected=200,binary=None,mime=None):
 global checks
 headers={'Content-Type':mime or 'application/json'}
 if role:headers['Authorization']='Bearer '+tokens[role]
 if key:headers['Idempotency-Key']=key
 request=urllib.request.Request(base+path,method=method,headers=headers,data=binary if binary is not None else json.dumps(body).encode() if body is not None else None)
 try:
  with urllib.request.urlopen(request,timeout=30) as r:status,content=r.status,r.read()
 except urllib.error.HTTPError as e:status,content=e.code,e.read()
 if status!=expected:raise AssertionError(f'{method} {path}: expected {expected}, got {status} {content[:1000]!r}')
 checks+=1
 return json.loads(content) if content else None
def upload(purpose,role='admin'):
 boundary='Full'+uuid.uuid4().hex;data=b''
 for k,v in [('purpose',purpose),('visibility','public' if purpose=='room_image' else 'private')]:data+=f'--{boundary}\r\nContent-Disposition: form-data; name="{k}"\r\n\r\n{v}\r\n'.encode()
 payload=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a/r8AAAAASUVORK5CYII=')
 data+=f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="photo.png"\r\nContent-Type: image/png\r\n\r\n'.encode()+payload+f'\r\n--{boundary}--\r\n'.encode()
 return req('/files',method='POST',role=role,binary=data,mime='multipart/form-data; boundary='+boundary)

assert req('/dev/database-check',role=None)['database']==s['database']
from urllib.parse import urlencode
tag=uuid.uuid4().hex[:8]
units=req('/public/administrative-units',role=None)['provinces']
assert len(units)==34 and sum(len(p['wards']) for p in units)==3321
province=next(p for p in units if p['code']=='79'); ward=province['wards'][0]
address={'houseNumber':'12/5','street':'Nguyễn Gia Trí','provinceCode':province['code'],'wardCode':ward['code']}
p=req('/properties','POST',{'name':'Address audit '+tag,'address':address,'rates':[]})
assert p['address']['line']=='12/5 Nguyễn Gia Trí' and p['address']['province']==province['name']
body={'propertyId':p['id'],'code':'ADR'+tag,'name':'Phòng bình yên '+tag,'areaM2':30,'capacity':3,'rent':3000000,'rates':[],'operatingStatus':'available','listing':{'status':'published','title':'Phòng bình yên '+tag}}
r=req('/rooms','POST',body);rid=r['id'];slug=r['listing']['slug']
public=req('/public/rooms/'+slug,role=None)
assert public['property']['addressLine']=='12/5 Nguyễn Gia Trí' and public['provinceCode']=='79'
# A property pin follows its address; editing the address cannot retain a stale pin.
pin='https://www.google.com/maps/place/Ben+Thanh/'
patched=req('/properties/'+p['id'],'PUT',{'name':p['name'],'address':{**address,'mapUrl':pin},'rates':[]})
assert patched['mapUrl']==pin
patched=req('/properties/'+p['id'],'PUT',{'name':p['name'],'address':{**address,'houseNumber':'14'},'rates':[]})
assert patched['mapUrl'] is None
own={**address,'houseNumber':'20','street':'Điện Biên Phủ','wardCode':province['wards'][1]['code']}
updated=req('/rooms/'+rid,'PUT',{**body,'addressOverride':own})
public=req('/public/rooms/'+slug,role=None)
assert public['property']['addressLine']=='20 Điện Biên Phủ' and public['locality']==province['wards'][1]['name']
assert 'query=' in public['mapUrl'] and '20%20' in public['mapUrl']
# Invalid ward/province combinations cannot partially save other room changes.
req('/rooms/'+rid,'PUT',{**body,'name':'MUST ROLLBACK','addressOverride':{**own,'wardCode':units[0]['wards'][0]['code']}},expected=422)
assert req('/rooms/'+rid)['name']==body['name']
def search(**kw): return req('/public/rooms?'+urlencode(kw),role=None)
assert any(x['id']==rid for x in search(q='binh yen '+tag,province='79',locality=own['wardCode'],priceMin=3000000,priceMax=3000000,areaMin=30,capacity=3)['items'])
assert not search(q=tag,priceMax=2999999)['items']
assert not search(q=tag,capacity=4)['items']
assert not search(q=tag,province='01')['items']
assert not search(q=tag,amenities='MISSING_AMENITY')['items']
req('/public/rooms?priceMin=4000000&priceMax=3000000',role=None,expected=422)
assert search(q=tag,page=999)['page']==1
req('/rooms/'+rid,'PUT',{**body,'operatingStatus':'reserved','statusReason':'Đã cọc giữ phòng','addressOverride':own})
assert req('/rooms/'+rid)['occupancyStatus']=='reserved' and not search(q=tag)['items']
assert search(ids=rid)['items'][0]['availability']['status']=='on_hold'
dash=req('/dashboard?propertyId='+p['id'])
assert dash['rooms']['available']==0 and dash['rooms']['reserved']==1 and dash['rooms']['occupied']==0
assert len(req('/rooms?forContract=true&propertyId='+p['id'])['items'])==1
t=req('/tenants','POST',{'fullName':'Chưa có ngày sinh '+tag,'phone':'0901234567'},expected=201)
assert t['dateOfBirth'] is None
for term in ['Chưa có ngày sinh '+tag,'chua co ngay sinh '+tag]:
 assert any(x['id']==t['id'] for x in req('/tenants?'+urlencode({'availableForContract':'true','q':term}))['items'])
assert any(x['id']==t['id'] for x in req('/tenants?availableForContract=true&pageSize=200')['items'])
assert not any(x['id']==s['ids']['user'] for x in req('/tenants?availableForContract=true&pageSize=200')['items'])
signed=upload('contract_signed');today=datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=7))).date()
check={'roomId':rid,'tenantId':t['id'],'moveInOn':today.isoformat(),
 'contract':{'endsOn':(today+datetime.timedelta(days=365)).isoformat(),'requiredDeposit':0,'invoiceDay':1,'dueAfterDays':5,'termsText':'Audit signed','rates':[{'chargeTypeId':'RENT','unitPrice':3000000}]},
 'signature':{'signedFileId':signed['id']},'readings':{'electricity':0,'water':0}}
bad={**check,'signature':{'signedFileId':str(uuid.uuid4())}}
req('/tenancies/check-in','POST',bad,expected=422)
assert req('/rooms/'+rid)['operatingStatus']=='reserved', 'Failed check-in must restore manual hold.'
contract=req('/tenancies/check-in','POST',check,key=str(uuid.uuid4()))
assert req('/rooms/'+rid)['occupancyStatus']=='occupied'
assert not any(x['id']==t['id'] for x in req('/tenants?availableForContract=true&pageSize=200')['items'])
assert not req('/rooms?forContract=true&propertyId='+p['id'])['items']
req('/rooms/'+rid+'/status','POST',{'status':'reserved','reason':'Cannot reserve occupied room'},expected=422)
schedule=req('/settings/billing-schedule')
try:
 req('/settings/billing-schedule','PUT',{'meterReadingDay':30,'invoiceCreateDay':31,'reminderEnabled':True})
 assert req('/settings/billing-schedule')['invoiceCreateDay']==31
 req('/settings/billing-schedule','PUT',{'meterReadingDay':31,'invoiceCreateDay':30,'reminderEnabled':True},expected=422)
 req('/settings/billing-schedule','PUT',{'meterReadingDay':32,'invoiceCreateDay':32,'reminderEnabled':True},expected=422)
 # Execute the production Dashboard SQL with a fixed clock; this checks its real
 # month-end rule, including February/leap years, without changing the machine clock.
 req('/settings/billing-schedule','PUT',{'meterReadingDay':31,'invoiceCreateDay':31,'reminderEnabled':True})
 source=(pathlib.Path(__file__).resolve().parents[1]/'src/SmartRent.Api/Features/Dashboard/DashboardOverviewQuery.cs').read_text(encoding='utf-8')
 dashboard_sql=re.search(r'private const string Sql = """\s*(.*?)\s*""";',source,re.S)[1]
 for day,expected in [('2027-02-27',False),('2027-02-28',True),('2028-02-28',False),('2028-02-29',True),('2026-11-29',False),('2026-11-30',True),('2027-01-30',False),('2027-01-31',True)]:
  query=dashboard_sql.replace('now()',f"'{day}T12:00:00+07:00'::timestamptz").replace('@month_start',f"'{day[:7]}-01'").replace('@property_id',f"'{p['id']}'::uuid")
  result=subprocess.run(['docker','compose','exec','-T','db','psql','-U','postgres','-d',s['database'],'-Atq','-v','ON_ERROR_STOP=1'],input=query,encoding='utf-8',capture_output=True,check=True)
  assert json.loads(result.stdout)['billing']['schedule']['readingDue']==expected, day
finally: req('/settings/billing-schedule','PUT',schedule)
print('PASS ADMIN UPDATES:',checks,'HTTP operations: eligible tenants, optional DOB check-in, atomic holds, addresses, search, dashboard, 31-day schedule')
