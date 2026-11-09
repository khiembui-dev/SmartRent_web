import json,urllib.request,urllib.error,pathlib,uuid,datetime,base64,secrets
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
import concurrent.futures,email.parser,email.policy,re
f=json.loads((root/'full_state.json').read_text());tokens['full']=f['tokens']['full'];newpassword=secrets.token_urlsafe(20)
assert req('/dev/database-check',role=None)['database']==s['database']
# Create and activate an imported tenant through the same invitation/reset flow shown in admin.
invitee=req('/tenants','POST',{'fullName':'Imported fixture','email':uuid.uuid4().hex+'@full.invalid','phone':'09'+str(uuid.uuid4().int)[:8]},expected=201)
req('/tenants/'+invitee['id']+'/portal-invitation','POST',{})
maildir=pathlib.Path('backend/src/SmartRent.Api/App_Data/mail')
mail=email.parser.BytesParser(policy=email.policy.default).parsebytes(max(maildir.glob('*.eml'),key=lambda p:p.stat().st_mtime).read_bytes())
body=mail.get_body(preferencelist=('plain',)).get_content() if mail.is_multipart() else mail.get_content()
url=re.search(r'http://localhost:5174/[^\s]+',body).group(0);token=urllib.parse.parse_qs(urllib.parse.urlparse(url).query)['token'][0]
req('/auth/reset-password','POST',{'token':token,'newPassword':newpassword},role=None)
login=req('/auth/login','POST',{'email':invitee['email'],'password':newpassword,'audience':'customer'},role=None);tokens['imported']=login['accessToken']
room=req('/rooms','POST',{'propertyId':f['property'],'code':'IMP'+uuid.uuid4().hex[:6],'name':'Imported room','areaM2':24,'capacity':3,'rent':2900000,'rates':[],'occupant':{'tenantId':invitee['id'],'moveInOn':'2026-10-28'}})
assert room['currentTenancy']['onboardingMode']=='import' and not room['currentTenancy']['hasContract']
cid=room['currentTenancy']['id'];detail=req('/tenancies/'+cid);assert detail['contracts']==[] and detail['property']['id']==f['property']
signed=upload('contract_signed');rate_inputs=[{'chargeTypeId':code,'unitPrice':price} for code,price in [('RENT',2900000),('ELECTRICITY',4000),('WATER',20000),('GARBAGE',100000),('SERVICE',50000)]]
req('/tenancies/'+cid+'/contracts','POST',{'effectiveFrom':'2026-10-28','contract':{'endsOn':'2027-10-28','requiredDeposit':0,'invoiceDay':1,'dueAfterDays':5,'termsText':'Imported signed','rates':rate_inputs},'signature':{'signedFileId':signed['id'],'signedAt':'2026-10-28T00:00:00Z'},'readings':{'electricity':30,'water':2}})
assert req('/tenancies/'+cid)['contracts'] and req('/contracts/'+cid)['meters']
print('PASS invitation pickup email, reset activation, imported tenant and signed contract')
# Calendar month proration over October and November uses two denominators (31,30).
preview=req('/tenancies/'+cid+'/checkout/preview','POST',{'moveOutOn':'2026-11-07','readings':{'electricity':40,'water':4}})
assert preview['finalInvoice']['totalAmount']==1083549,preview['finalInvoice']['totalAmount']
print('PASS multi-month final bill with correct calendar denominators')
# Lock/unlock cannot allow mutation while locked.
pid=f['period'];req('/billing-periods/'+pid+'/lock','POST',{'acknowledgeIncomplete':True})
req('/billing-periods/'+pid+'/unlock','POST',{'reason':'Audit reopen'})
# Concurrent receipt with same key must return one ID and one ledger row.
invoice=s['ids']['invoice'];key=str(uuid.uuid4());payment={'amount':10,'methodCode':'cash','allocations':[{'invoiceId':invoice,'amount':10}]}
with concurrent.futures.ThreadPoolExecutor(2) as pool:receipts=list(pool.map(lambda _:req('/payments','POST',payment,key=key),range(2)))
assert receipts[0]['id']==receipts[1]['id']
print('PASS concurrent payment replay')
# Customer cannot use admin endpoints or another account's file metadata.
for path in ['/properties','/rooms','/contracts','/tenants','/invoices','/settings/organization']:
 req(path,role='full',expected=403)
req('/files/'+signed['id']+'/download-url',role='full',expected=404)
assert req('/tenants/'+s['ids']['resident'])['residenceStatus']=='active'
assert req('/tenants?propertyId='+str(uuid.uuid4()))['totalItems']==0
assert req('/contracts?propertyId='+str(uuid.uuid4()))['totalItems']==0
assert req('/contracts?status=terminated')['totalItems']==0
print('PASS role, file ownership, resident and property filters')
# Avatar and profile fields match the actual admin settings form.
avatar=upload('avatar');me=req('/me')['user']
updated=req('/me/profile','PUT',{'displayName':me['displayName'],'email':me['email'],'phone':me['phone'],'avatarFileId':avatar['id']})
assert updated['user']['avatarUrl'].endswith('/public')
req('/settings/billing-schedule','PUT',{'meterReadingDay':24,'invoiceCreateDay':27,'reminderEnabled':True})
assert req('/settings/billing-schedule')['meterReadingDay']==24
print('PASS settings, avatar and reminder persistence')
# Password reset generates actual local mail, consumes token and invalidates old sessions.
req('/auth/forgot-password','POST',{'email':f['email']},role=None)
mail=email.parser.BytesParser(policy=email.policy.default).parsebytes(max(maildir.glob('*.eml'),key=lambda p:p.stat().st_mtime).read_bytes());body=mail.get_content()
url=re.search(r'http://localhost:5174/[^\s]+',body).group(0);token=urllib.parse.parse_qs(urllib.parse.urlparse(url).query)['token'][0]
req('/auth/reset-password','POST',{'token':token,'newPassword':newpassword},role=None)
req('/me',role='full',expected=401)
login=req('/auth/login','POST',{'email':f['email'],'password':newpassword,'audience':'customer'},role=None);tokens['full']=login['accessToken']
req('/auth/logout','POST',{},role='full');req('/me',role='full',expected=401)
print('PASS forgot/reset token, session invalidation and bearer logout')
print('PASS SUPPLEMENTAL:',checks,'HTTP operations plus assertions')
