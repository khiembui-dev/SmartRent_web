\set ON_ERROR_STOP on
SET search_path=smartrent,public;
BEGIN;
DO $$
DECLARE admin_id uuid; cid uuid; uid uuid; iid uuid; original payments; offset_id uuid; version jsonb; new_file uuid;
BEGIN
 SELECT id INTO admin_id FROM users WHERE role='admin';
 SELECT id,user_id INTO cid,uid FROM contracts WHERE code='HDTH-001';
 SELECT id INTO iid FROM invoices WHERE code='HD-001';
 UPDATE payments SET status='confirmed',confirmed_at=now(),confirmed_by=admin_id WHERE code='PT-002' RETURNING * INTO original;
 SET CONSTRAINTS ALL IMMEDIATE;
 IF NOT EXISTS(SELECT 1 FROM v_invoice_balances WHERE id=iid AND outstanding_amount=0) THEN RAISE EXCEPTION 'confirm failed'; END IF;
 SET CONSTRAINTS ALL DEFERRED;
 INSERT INTO payments(code,user_id,contract_id,kind,reverses_id,status,amount,method,external_reference,confirmed_by,confirmed_at,reason,allocations)
 VALUES('REV-001',uid,cid,'receipt_reversal',original.id,'confirmed',2300000,'bank_transfer','UNDO-DEMO',admin_id,now(),'Undo payment',original.allocations);
 SET CONSTRAINTS ALL IMMEDIATE;
 IF NOT EXISTS(SELECT 1 FROM v_invoice_balances WHERE id=iid AND outstanding_amount=2300000) THEN RAISE EXCEPTION 'reversal failed'; END IF;
 SET CONSTRAINTS ALL DEFERRED;
 INSERT INTO payments(code,user_id,contract_id,kind,status,amount,confirmed_by,confirmed_at,allocations)
 VALUES('OFFSET-001',uid,cid,'deposit_offset','confirmed',200000,admin_id,now(),jsonb_build_array(jsonb_build_object('invoiceId',iid,'amount',200000))) RETURNING id INTO offset_id;
 SET CONSTRAINTS ALL IMMEDIATE;
 IF NOT EXISTS(SELECT 1 FROM v_deposit_balances WHERE contract_id=cid AND held=2800000) THEN RAISE EXCEPTION 'offset failed'; END IF;
 SET CONSTRAINTS ALL DEFERRED;
 INSERT INTO payments(code,user_id,contract_id,kind,reverses_id,status,amount,confirmed_by,confirmed_at,reason,allocations)
 VALUES('UNDO-OFFSET',uid,cid,'deposit_offset_reversal',offset_id,'confirmed',200000,admin_id,now(),'Undo deposit offset',jsonb_build_array(jsonb_build_object('invoiceId',iid,'amount',200000)));
 SET CONSTRAINTS ALL IMMEDIATE;
 IF NOT EXISTS(SELECT 1 FROM v_deposit_balances WHERE contract_id=cid AND held=3000000) THEN RAISE EXCEPTION 'reverse offset failed'; END IF;
 SET CONSTRAINTS ALL DEFERRED;
 INSERT INTO files(uploaded_by,storage_key,file_name,content_type,byte_size,purpose,scan_status)
 VALUES(admin_id,'test/renewal.pdf','renewal.pdf','application/pdf',0,'contract_signed','clean') RETURNING id INTO new_file;
 SELECT versions->0 INTO version FROM contracts WHERE id=cid;
 version=version||jsonb_build_object('id','v2','versionNo',2,'effectiveFrom','2027-09-01','endsOn','2028-09-01','signedAt',now(),'changeReason','Renewal','fileIds',jsonb_build_array(new_file));
 UPDATE contracts SET versions=versions||jsonb_build_array(version) WHERE id=cid;
 IF NOT EXISTS(SELECT 1 FROM contracts WHERE id=cid AND jsonb_array_length(versions)=2 AND ends_on='2028-09-01') THEN RAISE EXCEPTION 'renewal failed'; END IF;
END $$;
ROLLBACK;

BEGIN;
DO $$
DECLARE cid uuid; pid uuid; iid uuid;
BEGIN
 SELECT id INTO cid FROM contracts WHERE code='HDTH-001';
 INSERT INTO billing_periods(property_id,month_start) SELECT id,'2026-10-01' FROM properties RETURNING id INTO pid;
 INSERT INTO invoices(code,contract_id,period_id,service_from,service_to,electricity_start,electricity_end,electricity_from_at,electricity_to_at)
 VALUES('DRAFT-READING',cid,pid,'2026-10-01','2026-11-01',150,170,'2026-09-30T11:00Z','2026-10-31T11:00Z') RETURNING id INTO iid;
 UPDATE invoices SET electricity_end=175,correction_reason='Correct actual reading' WHERE id=iid;
 IF NOT EXISTS(SELECT 1 FROM invoices WHERE id=iid AND electricity_end=175 AND jsonb_array_length(readings_history)=1 AND readings_history->0->>'electricityEnd'='170.000') THEN RAISE EXCEPTION 'reading correction history failed'; END IF;
END $$;
ROLLBACK;

CREATE FUNCTION pg_temp.checkout_after_monthly(usage_amount numeric) RETURNS void LANGUAGE plpgsql AS $$
DECLARE admin_id uuid; cid uuid; uid uuid; old_invoice uuid; final_invoice uuid; pid uuid; final_amount numeric; water_usage numeric;
BEGIN
 SELECT id INTO admin_id FROM users WHERE role='admin';
 SELECT id,user_id INTO cid,uid FROM contracts WHERE code='HDTH-001';
 SELECT id INTO old_invoice FROM invoices WHERE code='HD-001';
 INSERT INTO billing_periods(property_id,month_start) SELECT id,'2026-10-01' FROM properties RETURNING id INTO pid;
 water_usage=CASE WHEN usage_amount>0 THEN 1 ELSE 0 END;
 final_amount=usage_amount*4000+water_usage*20000;
 INSERT INTO invoices(code,contract_id,period_id,kind,metered_only,service_from,service_to,
 electricity_start,electricity_end,electricity_from_at,electricity_to_at,water_start,water_end,water_from_at,water_to_at,lines)
 VALUES('FINAL-001',cid,pid,'final',true,'2026-09-30','2026-10-01',150,150+usage_amount,'2026-09-30T11:00Z','2026-10-01T02:00Z',25,25+water_usage,'2026-09-30T11:00Z','2026-10-01T02:00Z',
 jsonb_build_array(jsonb_build_object('id','electric','code','ELECTRICITY','category','electricity','description','Final electricity','unit','kWh','quantity',usage_amount,'unitPrice',4000),
 jsonb_build_object('id','water','code','WATER','category','water','description','Final water','unit','m3','quantity',water_usage,'unitPrice',20000))) RETURNING id INTO final_invoice;
 UPDATE invoices SET status='issued',issued_on='2026-10-01',due_on='2026-10-06',issued_at=now(),issued_by=admin_id WHERE id=final_invoice;
 IF final_amount=0 AND NOT EXISTS(SELECT 1 FROM v_invoice_balances WHERE id=final_invoice AND payment_status='paid' AND outstanding_amount=0) THEN RAISE EXCEPTION 'zero invoice must be paid'; END IF;
 INSERT INTO payments(code,user_id,contract_id,kind,status,amount,confirmed_by,confirmed_at,allocations)
 VALUES('CHECKOUT-OFFSET',uid,cid,'deposit_offset','confirmed',2300000,admin_id,now(),jsonb_build_array(jsonb_build_object('invoiceId',old_invoice,'amount',2300000)));
 IF final_amount>0 THEN
  INSERT INTO payments(code,user_id,contract_id,kind,status,amount,confirmed_by,confirmed_at,allocations)
  VALUES('CHECKOUT-FINAL',uid,cid,'deposit_offset','confirmed',final_amount,admin_id,now(),jsonb_build_array(jsonb_build_object('invoiceId',final_invoice,'amount',final_amount)));
 END IF;
 INSERT INTO payments(code,user_id,contract_id,kind,status,amount,method,confirmed_by,confirmed_at,reason)
 VALUES('CHECKOUT-REFUND',uid,cid,'deposit_refund','confirmed',700000-final_amount,'cash',admin_id,now(),'Return remaining deposit');
 UPDATE contracts SET status='ended',move_out_on='2026-10-01',ended_reason='Checkout',
 occupants=(SELECT jsonb_agg(x||jsonb_build_object('leftOn','2026-10-01')) FROM jsonb_array_elements(occupants) x),
 final_readings=jsonb_build_object('electricity',jsonb_build_object('value',150+usage_amount,'observedAt','2026-10-01T02:00Z'),'water',jsonb_build_object('value',25+water_usage,'observedAt','2026-10-01T02:00Z')),
 checkout_summary=jsonb_build_object('finalAmount',final_amount,'offset',2300000+final_amount,'refund',700000-final_amount) WHERE id=cid;
 SET CONSTRAINTS ALL IMMEDIATE;
 IF EXISTS(SELECT 1 FROM v_invoice_balances WHERE contract_id=cid AND outstanding_amount<>0) THEN RAISE EXCEPTION 'checkout debt mismatch'; END IF;
 IF NOT EXISTS(SELECT 1 FROM v_deposit_balances WHERE contract_id=cid AND held=0 AND refunded=700000-final_amount) THEN RAISE EXCEPTION 'checkout deposit mismatch'; END IF;
 IF NOT EXISTS(SELECT 1 FROM v_room_occupancy WHERE code='A101' AND occupancy_status='available') THEN RAISE EXCEPTION 'room not released'; END IF;
END $$;
BEGIN;
SELECT pg_temp.checkout_after_monthly(10);
ROLLBACK;
BEGIN;
SELECT pg_temp.checkout_after_monthly(0);
ROLLBACK;

BEGIN;
DO $$
DECLARE bid uuid; cid uuid; admin_id uuid;
BEGIN
 SELECT id INTO admin_id FROM users WHERE role='admin';
 UPDATE bookings SET appointments=jsonb_set(appointments,'{0,status}','"completed"'),status='completed' WHERE code='LX-001' RETURNING id INTO bid;
 UPDATE bookings SET hold_status='holding',hold_from='2026-11-01',hold_expires_at=now()+interval '1 day' WHERE id=bid;
 INSERT INTO contracts(code,user_id,room_id,booking_id,onboarding_mode,starts_on,move_in_on)
 SELECT 'FROM-BOOKING',user_id,room_id,id,'import','2026-11-01','2026-11-01' FROM bookings WHERE id=bid RETURNING id INTO cid;
 IF NOT EXISTS(SELECT 1 FROM bookings WHERE id=bid AND status='converted' AND hold_status='converted' AND jsonb_array_length(history)>=2) THEN RAISE EXCEPTION 'booking conversion failed'; END IF;
 UPDATE users SET phone='0900000009' WHERE code='KH-001' AND phone='0900000002';
 UPDATE bookings SET status='approved',reviewed_by=admin_id,reviewed_at=now(),decision_notes='Approved phone change' WHERE code='YC-001';
 IF NOT EXISTS(SELECT 1 FROM users WHERE code='KH-001' AND phone='0900000009') THEN RAISE EXCEPTION 'profile update failed'; END IF;
 SET CONSTRAINTS ALL IMMEDIATE;
END $$;
ROLLBACK;
SELECT '{"passed":10,"scenarios":["confirm receipt","reverse receipt","offset deposit","reverse deposit offset","renew signed version","correct embedded reading","checkout after monthly invoice","zero-usage checkout","viewing and hold to contract","approve profile change"]}';
