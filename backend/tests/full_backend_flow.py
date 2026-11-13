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
try:
 # Verify that the API actually uses the isolated database before any writes.
 assert req('/dev/database-check',role=None)['database']==s['database']
 # Source under test is the actual root API; only database is isolated.
 for path in ['/properties','/rooms','/public/filters','/public/rooms','/public/contact-info','/catalog']:
  req(path)
 print('PASS housing read APIs')
 tag=uuid.uuid4().hex[:8];rates=[{'chargeTypeId':code,'unitPrice':price} for code,price in [('ELECTRICITY',4000),('WATER',20000),('GARBAGE',100000),('SERVICE',50000),('INTERNET',0)]]
 p=req('/properties','POST',{'name':'Full flow '+tag,'address':{'line':'10 Test','province':'Test City','locality':'Audit'},'rates':rates});state['property']=p['id']
 assert p['prices']['WATER']==20000
 amenity=req('/catalog/amenities','POST',{'name':'Full wifi '+tag})
 image=upload('room_image');signed=upload('contract_signed');state['image']=image['id']
 r=req('/rooms','POST',{'propertyId':p['id'],'code':'R'+tag[:5],'name':'Full room','areaM2':25,'capacity':3,'rent':3000000,'requiredDeposit':3000000,'rates':rates,'amenityIds':[amenity['id']],'imageFileIds':[image['id']],'operatingStatus':'available'})
 state['room']=r['id'];assert r['currentRent']==3000000 and r['images'] and r['amenities']
 req('/rooms/'+r['id']+'/listing','PUT',{'status':'published','title':'Full room listing','description':'Live SQL listing'})
 detail=req('/rooms/'+r['id']);slug=detail['listing']['slug'];state['slug']=slug
 public=req('/public/rooms/'+slug,role=None);assert public['rent']==3000000
 request=urllib.request.urlopen(base+'/files/'+image['id']+'/public');assert request.status==200
 assert any(x['slug']==slug for x in req('/public/rooms',role=None)['items'])
 print('PASS create property, room, amenity, upload, publish and public photo')
 email=tag+'@full.invalid';password=secrets.token_urlsafe(20)
 auth=req('/auth/register','POST',{'fullName':'Full customer','email':email,'password':password,'acceptedTerms':True},role=None);tokens['full']=auth['accessToken'];state['user']=auth['user']['id'];state['email']=email;state['password']=password
 viewing_day=(datetime.datetime.now(datetime.timezone(datetime.timedelta(hours=7))).date()+datetime.timedelta(days=1)).isoformat()
 inquiry=req('/portal/inquiries','POST',{'slug':slug,'contactName':'Full customer','occupants':2,'phone':'0900000000','preferredViewingAt':viewing_day+'T20:00:00+07:00'},role='full')
 req('/inquiries/'+inquiry['id']+'/decision','POST',{'action':'accept'})
 viewing=next(x for x in req('/viewings')['items'] if x['inquiryId']==inquiry['id'])
 req('/viewings/'+viewing['id']+'/result','POST',{'status':'completed','resultNotes':'Too early'},expected=422)
 print('PASS register, book by slug and manage viewing')
 # Người đứng tên hợp đồng cần số điện thoại Việt Nam và ngày sinh đủ 18 tuổi (ContractTenantRules).
 req('/tenants/'+state['user'],'PUT',{'fullName':'Full customer','email':state['email'],'phone':'0900000000','dateOfBirth':'1998-05-20'})
 check={'roomId':r['id'],'tenantId':state['user'],'moveInOn':'2026-10-28','inquiryId':inquiry['id'],
  'contract':{'endsOn':'2027-10-28','requiredDeposit':3000000,'invoiceDay':1,'dueAfterDays':5,'termsText':'Signed agreement','rates':[{'chargeTypeId':'RENT','unitPrice':3000000},*rates]},
  'signature':{'signedFileId':signed['id'],'signedAt':'2026-10-28T00:00:00Z'},'readings':{'electricity':100,'water':20},'deposit':{'amount':3000000,'methodCode':'cash'}}
 key=str(uuid.uuid4());contract=req('/tenancies/check-in','POST',check,key=key);cid=contract['contracts'][0]['id'];state['contract']=cid
 assert req('/tenancies/check-in','POST',check,key=key)['id']==cid
 req('/tenancies/check-in','POST',{**check,'handover':{'notes':'different'}},key=key,expected=409)
 assert req('/contracts/'+cid)['meters'];assert req('/portal/tenancies',role='full')[0]['financeVisible']
 # Có hợp đồng thì tin tự tạm ẩn, không đăng lại được và phòng không chuyển cơ sở được.
 room=req('/rooms/'+r['id']);assert room['listing']['status']=='hidden' and room['listing']['lockedByContract'] and room['canChangeProperty'] is False,room['listing']
 assert not any(x['slug']==slug for x in req('/public/rooms',role=None)['items'])
 req('/rooms/'+r['id']+'/listing','PUT',{'status':'published','title':'Full room listing'},expected=422)
 print('PASS signed check-in, deposit and idempotency')
 period=req('/billing-periods','POST',{'propertyId':p['id'],'monthStart':'2026-10-01'});pid=period['id'];state['period']=pid
 sheet=req('/billing-periods/'+pid+'/worksheet');row=sheet['rows'][0];assert row['readings']['electricity']['previous']['value']==100
 batch={'billingPeriodId':pid,'items':[{'meterId':row['readings'][kind]['meterId'],'readingValue':value,'observedAt':'2026-10-31T11:00:00Z'} for kind,value in [('electricity',110),('water',22)]]}
 req('/meter-readings/batch','POST',batch,key=str(uuid.uuid4()));sheet=req('/billing-periods/'+pid+'/worksheet');assert sheet['rows'][0]['group']=='draft'
 inv=sheet['rows'][0]['invoice']['id'];state['invoice']=inv
 req('/meter-readings/'+inv+'/correct','POST',{'meterKind':'water','readingValue':23,'reason':'Correct water'})
 sheet=req('/billing-periods/'+pid+'/worksheet');assert sheet['rows'][0]['readings']['water']['current']['value']==23 and sheet['rows'][0]['readings']['electricity']['current']['value']==110
 batch=req('/invoice-batches','POST',{'periodId':pid,'action':'issue','tenancyIds':[cid]},key=str(uuid.uuid4()));assert batch['summary']['succeeded']==1,batch
 invoice=req('/invoices/'+inv);assert invoice['meterSegments'] and invoice['totalAmount']==506452,invoice['totalAmount']
 assert invoice['totalAmount']==req('/portal/invoices/'+inv,role='full')['totalAmount']
 print('PASS meter read, water-only correction, real prices/proration, issue invoice')
 paybody={'amount':100000,'methodCode':'cash','tenantId':state['user'],'allocations':[{'invoiceId':inv,'amount':100000}],'confirmNow':True};key=str(uuid.uuid4())
 pay=req('/payments','POST',paybody,key=key);assert req('/payments','POST',paybody,key=key)['id']==pay['id']
 proof=upload('payment_proof','full');reported=req('/portal/payments','POST',{'amount':406452,'receivedAt':'2026-11-06T19:00:00+07:00','externalReference':'Full-'+tag,'invoiceIds':[inv],'fileIds':[proof['id']]},role='full',key=str(uuid.uuid4()))
 req('/payments/'+reported['id']+'/confirm','POST',{'allocations':[{'invoiceId':inv,'amount':406452}]})
 assert req('/invoices/'+inv)['outstandingAmount']==0
 req('/payment-allocations/'+pay['id']+'/reverse','POST',{'reason':'Undo cash'})
 customer=req('/portal/invoices/'+inv,role='full');assert customer['paidAmount']==406452 and customer['outstandingAmount']==100000
 assert sum(x['amount']-x['reversedAmount'] for x in customer['allocations'] if not x['reversesId'])==customer['paidAmount']
 req('/payments/'+reported['id']+'/reject','POST',{'reason':'Already confirmed'},expected=409)
 print('PASS collect, prevent duplicate, confirm transfer +07:00 and reverse receipt')
 # New contract version uses exactly the existing frontend payload.
 v=req('/contracts/'+cid+'/versions','POST',{'effectiveFrom':'2027-10-28','endsOn':'2028-10-28','requiredDeposit':3000000,'invoiceDay':1,'dueAfterDays':5,'termsText':'Renewed','rates':[{'chargeTypeId':'RENT','unitPrice':3100000},*rates]})
 version=next(x for x in v['versions'] if not x['isSigned']);assert version['rates'][0]['chargeType']['code']=='RENT'
 req('/contracts/'+cid+'/versions/'+version['id']+'/sign','POST',{'signedFileId':signed['id'],'signedAt':'2026-11-06T12:00:00Z'})
 assert req('/contracts/'+cid)['displayEndOn']=='2028-10-27'
 print('PASS renewal version and signing')
 preview=req('/tenancies/'+cid+'/checkout/preview','POST',{'moveOutOn':'2026-11-07','readings':{'electricity':120,'water':25}})
 assert preview['finalInvoice']['totalAmount']==710000,preview
 final=req('/tenancies/'+cid+'/checkout','POST',{'moveOutOn':'2026-11-07','readings':{'electricity':120,'water':25},'terminationReason':'Full checkout','roomStatusAfter':'available','refund':{'methodCode':'cash'}})
 assert final['depositRefund']==2190000,final
 replay=req('/tenancies/'+cid+'/checkout','POST',{'moveOutOn':'2026-11-07','readings':{'electricity':120,'water':25},'terminationReason':'Full checkout','roomStatusAfter':'available','refund':{'methodCode':'cash'}})
 assert replay['finalInvoiceId']==final['finalInvoiceId'] and replay['depositRefund']==final['depositRefund']
 assert req('/rooms/'+r['id'])['occupancyStatus']=='available'
 # Kết thúc và trả phòng: phòng trống lại thì tin tự công khai lại.
 room=req('/rooms/'+r['id']);assert room['listing']['status']=='published' and not room['listing']['lockedByContract'],room['listing']
 assert any(x['slug']==slug for x in req('/public/rooms',role=None)['items'])
 req('/contracts/'+cid+'/archive','POST',{})
 assert req('/contracts/'+cid)['status']=='archived'
 print('PASS checkout preview matches issued final, deposit offset/refund, release room')
 change=req('/portal/profile-change-requests','POST',{'changes':{'phone':'0900111222','email':email},'reason':'New phone'},role='full')
 req('/profile-change-requests/'+change['id']+'/approve','POST',{'reviewNotes':'Approved'})
 assert req('/tenants/'+state['user'])['email']==email
 print('PASS profile change preserves omitted email')
 dead=req('/rooms','POST',{'propertyId':p['id'],'code':'EMPTY'+tag[:5],'name':'Empty room','areaM2':20,'capacity':2,'rent':2000000,'rates':[]})
 req('/rooms/'+dead['id']+'/status','POST',{'status':'maintenance','reason':'Repair'})
 req('/rooms/'+dead['id'],'DELETE');req('/properties/'+p['id']+'/deactivate','POST',{'reason':'Closed'});req('/properties/'+p['id']+'/activate','POST',{})
 req('/exports','POST',{'kind':'invoices','format':'csv'})
 print('PASS room status/delete, property state and CSV permission')
 print('PASS FULL FLOW:',checks,'HTTP operations plus assertions')
 state['checks']=checks
finally:
 state['tokens']={'full':tokens.get('full')};(root/'full_state.json').write_text(json.dumps(state),encoding='utf-8')
