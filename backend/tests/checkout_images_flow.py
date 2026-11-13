"""Regression: same-day checkout + authenticated previews of hidden room images."""
import argparse,base64,datetime,json,pathlib,urllib.error,urllib.request,uuid
parser=argparse.ArgumentParser();parser.add_argument('--state',required=True);args=parser.parse_args()
s=json.loads(pathlib.Path(args.state).read_text());assert s['database'].startswith('smartrent_audit_') and ':5080/' not in s['base']
base=s['base'];checks=0
def req(path,method='GET',body=None,role='admin',expected=200,binary=None,mime=None,key=None):
 global checks
 headers={'Content-Type':mime or 'application/json'}
 if role:headers['Authorization']='Bearer '+s['tokens'][role]
 if key:headers['Idempotency-Key']=key
 try:
  with urllib.request.urlopen(urllib.request.Request(base+path,method=method,headers=headers,data=binary if binary is not None else json.dumps(body).encode() if body is not None else None),timeout=30) as r:status,raw=r.status,r.read()
 except urllib.error.HTTPError as e:status,raw=e.code,e.read()
 assert status==expected,(path,status,expected,raw[:600]);checks+=1
 return raw if raw.startswith(b'\x89PNG') else json.loads(raw) if raw else None
def upload(purpose):
 boundary='Image'+uuid.uuid4().hex;raw=b''
 for name,value in [('purpose',purpose),('visibility','public' if purpose=='room_image' else 'private')]:raw+=f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n{value}\r\n'.encode()
 image=base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a/r8AAAAASUVORK5CYII=')
 raw+=f'--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="regression.png"\r\nContent-Type: image/png\r\n\r\n'.encode()+image+f'\r\n--{boundary}--\r\n'.encode()
 return req('/files','POST',binary=raw,mime='multipart/form-data; boundary='+boundary)
assert req('/dev/database-check',role=None)['database']==s['database']
tag=uuid.uuid4().hex[:8];signed=upload('contract_signed')
p=req('/properties','POST',{'name':'Checkout regression '+tag,'address':{'line':'1 Audit','locality':'Audit','province':'Audit'},'rates':[]})
today=datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=7))).date();day=today.isoformat()
for mode in ['metered','already-billed','fixed-only','no-readings']:
 photo=upload('room_image')
 room=req('/rooms','POST',{'propertyId':p['id'],'code':'R'+mode[0]+tag,'name':'Hidden image room','areaM2':25,'capacity':2,'rent':2000000,'rates':[],'imageFileIds':[photo['id']]})
 assert room['listing']['status']=='hidden'
 req('/files/'+photo['id']+'/public',role=None,expected=404)
 req('/files/'+photo['id']+'/download-url',role=None,expected=401)
 req('/files/'+photo['id']+'/download-url',role='user',expected=404)
 preview=req('/files/'+photo['id']+'/download-url')
 assert req(preview['url'].removeprefix('/api/v1'),role=None).startswith(b'\x89PNG')
 t=req('/tenants','POST',{'fullName':'Same day '+mode+tag,'phone':'09'+str(uuid.uuid4().int%100000000).zfill(8)},expected=201)
 rates=[{'chargeTypeId':'RENT','unitPrice':2000000}]
 if mode in ['metered','already-billed']:rates += [{'chargeTypeId':'ELECTRICITY','unitPrice':4000},{'chargeTypeId':'WATER','unitPrice':20000}]
 body={'roomId':room['id'],'tenantId':t['id'],'moveInOn':day,
  'contract':{'endsOn':(today+datetime.timedelta(days=365)).isoformat(),'requiredDeposit':100000,'invoiceDay':1,'dueAfterDays':5,'termsText':'Regression','rates':rates},
  'signature':{'signedFileId':signed['id']},'deposit':{'amount':100000,'methodCode':'cash'}}
 if mode!='no-readings':body['readings']={'electricity':0,'water':0}
 created=req('/tenancies/check-in','POST',body,key=str(uuid.uuid4()));cid=created['contracts'][0]['id']
 old_debt=0
 if mode=='already-billed':
  period=req('/billing-periods','POST',{'propertyId':p['id'],'monthStart':day[:7]+'-01'})
  row=next(row for row in req('/billing-periods/'+period['id']+'/worksheet')['rows'] if row['tenancy']['id']==cid)
  observed=datetime.datetime.now(datetime.timezone.utc).isoformat()
  req('/meter-readings/batch','POST',{'billingPeriodId':period['id'],'items':[{'meterId':row['readings'][kind]['meterId'],'readingValue':5,'observedAt':observed} for kind in ['electricity','water']]},key=str(uuid.uuid4()))
  issue=req('/invoice-batches','POST',{'periodId':period['id'],'action':'issue','tenancyIds':[cid]},key=str(uuid.uuid4()))
  assert issue['summary']['succeeded']==1,issue
  invoices=req('/contracts/'+cid)['invoices'];old_debt=sum(i['outstandingAmount'] for i in invoices)
 reading={'electricity':7,'water':1} if mode!='no-readings' else {}
 if mode=='already-billed':reading={'electricity':12,'water':12}
 checkout={'moveOutOn':day,'readings':reading,'terminationReason':'Same-day regression','roomStatusAfter':'available','refund':{'methodCode':'bank_transfer','externalReference':'REFUND-'+tag+mode}}
 if old_debt:checkout['remainingDebtReason']='Regression: keep pre-existing issued invoice debt'
 for invalid in [(today-datetime.timedelta(days=1)).isoformat(),(today+datetime.timedelta(days=1)).isoformat()]:
  req('/tenancies/'+cid+'/checkout/preview','POST',{**checkout,'moveOutOn':invalid},expected=422)
 preview=req('/tenancies/'+cid+'/checkout/preview','POST',checkout)
 expected=48000 if mode=='metered' else 168000 if mode=='already-billed' else 0
 assert preview['finalInvoice']['totalAmount']==expected,preview
 assert not any(line['category']=='rent' for line in preview['finalInvoice']['lines'])
 result=req('/tenancies/'+cid+'/checkout','POST',checkout,key=str(uuid.uuid4()))
 assert result['depositRefund']==max(0,100000-old_debt-expected) and result['remainingDebt']==max(0,old_debt+expected-100000),result
 assert req('/contracts/'+cid)['tenancy']['status']=='ended'
 assert req('/rooms/'+room['id'])['occupancyStatus']=='available'
 assert req('/tenancies/'+cid+'/checkout','POST',checkout)['finalInvoiceId']==result['finalInvoiceId']
 final=req('/invoices/'+result['finalInvoiceId']);assert final['totalAmount']==expected
 if not old_debt:assert final['outstandingAmount']==0
print('PASS CHECKOUT/IMAGES:',checks,'HTTP checks: same-day metered/fixed/zero settlement, refund reference, replay, dates and hidden image permissions.')
