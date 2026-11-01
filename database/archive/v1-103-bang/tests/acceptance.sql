-- Chạy sau 01/02/03 bằng psql -v ON_ERROR_STOP=1.
-- Mọi dữ liệu thử nằm trong transaction và ROLLBACK cuối file.
BEGIN;
SET LOCAL search_path=smartrent,public;
CREATE TEMP TABLE test_results (name text NOT NULL);
CREATE FUNCTION pg_temp.assert_true(p_condition boolean,p_name text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
 IF p_condition IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %',p_name; END IF;
 INSERT INTO test_results VALUES(p_name);
END $$;
CREATE FUNCTION pg_temp.expect_failure(p_sql text,p_state text,p_name text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE failed boolean:=false; actual_state text;
BEGIN
 BEGIN
   EXECUTE p_sql;
   SET CONSTRAINTS ALL IMMEDIATE;
 EXCEPTION WHEN OTHERS THEN
   GET STACKED DIAGNOSTICS actual_state=RETURNED_SQLSTATE;
   IF actual_state<>p_state THEN RAISE EXCEPTION 'FAIL: %, expected %, got %: %',p_name,p_state,actual_state,SQLERRM; END IF;
   failed:=true;
 END;
 SET CONSTRAINTS ALL DEFERRED;
 PERFORM pg_temp.assert_true(failed,p_name);
END $$;
DO $$
DECLARE
 u uuid:=gen_random_uuid(); org uuid:=gen_random_uuid(); org2 uuid:=gen_random_uuid();
 addr uuid:=gen_random_uuid(); prop uuid:=gen_random_uuid(); prop2 uuid:=gen_random_uuid();
 rt uuid:=gen_random_uuid(); rt2 uuid:=gen_random_uuid(); room uuid:=gen_random_uuid(); room2 uuid:=gen_random_uuid();
 tenant uuid:=gen_random_uuid(); foreign_tenant uuid:=gen_random_uuid(); allocation uuid:=gen_random_uuid(); stay uuid:=gen_random_uuid();
 contract uuid:=gen_random_uuid(); version uuid:=gen_random_uuid(); file uuid:=gen_random_uuid();
 plan uuid:=gen_random_uuid(); room_plan uuid:=gen_random_uuid(); period uuid:=gen_random_uuid(); period2 uuid:=gen_random_uuid();
 rent uuid; elec uuid; water uuid; service uuid; internet uuid; other uuid;
 rrent uuid:=gen_random_uuid(); relec uuid:=gen_random_uuid(); rwater uuid:=gen_random_uuid();
 rservice uuid:=gen_random_uuid(); rinternet uuid:=gen_random_uuid(); rother uuid:=gen_random_uuid();
 h uuid:=gen_random_uuid(); me uuid:=gen_random_uuid(); mw uuid:=gen_random_uuid();
 e0 uuid:=gen_random_uuid(); e1 uuid:=gen_random_uuid(); w0 uuid:=gen_random_uuid(); w1 uuid:=gen_random_uuid();
 invoice uuid:=gen_random_uuid(); il_e uuid:=gen_random_uuid(); il_w uuid:=gen_random_uuid(); occurrence uuid:=gen_random_uuid();
 payment uuid:=gen_random_uuid(); paykey uuid:=gen_random_uuid(); alloc uuid:=gen_random_uuid(); pending uuid:=gen_random_uuid();
 deposit_payment uuid:=gen_random_uuid(); deposit uuid:=gen_random_uuid(); offset_entry uuid:=gen_random_uuid();
 offset_alloc uuid:=gen_random_uuid(); refund uuid:=gen_random_uuid(); draft2 uuid:=gen_random_uuid();
 adjustment uuid:=gen_random_uuid(); count_result integer;
 held_allocation uuid:=gen_random_uuid(); hold uuid:=gen_random_uuid(); new_stay uuid:=gen_random_uuid();
 new_allocation uuid:=gen_random_uuid(); transfer_out uuid:=gen_random_uuid();
BEGIN
 INSERT INTO users(id,user_name,normalized_user_name,display_name) VALUES(u,'test-'||u,upper('test-'||u),'Chủ thử');
 INSERT INTO organizations(id,code,name) VALUES(org,'T-'||org,'Đơn vị thử'),(org2,'T-'||org2,'Đơn vị khác');
 PERFORM initialize_organization(org,u);
 INSERT INTO addresses(id,address_line,manual_locality) VALUES(addr,'Địa chỉ thử','Nhập tay');
 INSERT INTO properties(id,organization_id,code,name,address_id) VALUES
   (prop,org,'CS1','Cơ sở thử',addr),(prop2,org,'CS2','Cơ sở hai',addr);
 INSERT INTO property_billing_settings(property_id) VALUES(prop),(prop2);
 INSERT INTO room_types(id,organization_id,code,name) VALUES(rt,org,'STANDARD','Thường'),(rt2,org2,'OTHER','Khác');
 INSERT INTO rooms(id,property_id,room_type_id,code,name,area_m2,capacity,required_deposit) VALUES
   (room,prop,rt,'P101','Phòng 101',25,3,3000000),(room2,prop,rt,'P102','Phòng 102',25,3,3000000);
 PERFORM pg_temp.expect_failure(format('INSERT INTO rooms(property_id,room_type_id,code,name,area_m2,capacity) VALUES(%L,%L,''P101'',''Trùng'',20,2)',prop,rt),'23505','Mã phòng duy nhất trong cơ sở');
 PERFORM pg_temp.expect_failure(format('INSERT INTO rooms(property_id,room_type_id,code,name,area_m2,capacity) VALUES(%L,%L,''P999'',''Sai đơn vị'',20,2)',prop,rt2),'23514','Chặn room_type khác đơn vị');
 INSERT INTO tenants(id,organization_id,code,full_name,user_id) VALUES(tenant,org,'K001','Khách thử',u);
 INSERT INTO tenants(id,organization_id,code,full_name) VALUES(foreign_tenant,org2,'K002','Khách khác đơn vị');
 INSERT INTO room_allocations(id,room_id,starts_on,state) VALUES(allocation,room,'2026-01-01','reserved');
 INSERT INTO tenancies(id,allocation_id,representative_tenant_id,planned_move_in) VALUES(stay,allocation,tenant,'2026-01-01');
 INSERT INTO contracts(id,tenancy_id,code,created_by) VALUES(contract,stay,'HD-'||contract,u);
 INSERT INTO contract_versions(id,contract_id,version_no,effective_from,ends_on,required_deposit,invoice_day,due_after_days,proration_policy,terms_text)
 VALUES(version,contract,1,'2026-01-01','2027-01-01',3000000,1,7,'actual_days','Điều khoản thử');
 INSERT INTO stored_files(id,organization_id,storage_key,original_name,content_type,byte_size,scan_status)
 VALUES(file,org,'test/'||file,'contract.pdf','application/pdf',100,'clean');
 INSERT INTO contract_parties(contract_version_id,party_role,full_name_snapshot,address_snapshot) VALUES
   (version,'landlord','Chủ trọ','Địa chỉ chủ'),(version,'representative','Khách thử','Địa chỉ khách');
 INSERT INTO contract_files(contract_version_id,file_id,file_kind) VALUES(version,file,'signed');
 UPDATE contract_versions SET signed_at=now(),confirmed_by=u,signature_method='paper' WHERE id=version;
 PERFORM pg_temp.expect_failure(format('UPDATE contract_versions SET required_deposit=0 WHERE id=%L',version),'23514','Không sửa hợp đồng đã ký');
 SELECT id INTO rent FROM charge_types WHERE organization_id=org AND code='RENT';
 SELECT id INTO elec FROM charge_types WHERE organization_id=org AND code='ELECTRICITY';
 SELECT id INTO water FROM charge_types WHERE organization_id=org AND code='WATER';
 SELECT id INTO service FROM charge_types WHERE organization_id=org AND code='SERVICE';
 SELECT id INTO internet FROM charge_types WHERE organization_id=org AND code='INTERNET';
 SELECT id INTO other FROM charge_types WHERE organization_id=org AND code='OTHER';
 INSERT INTO rate_plans(id,property_id) VALUES(plan,prop);
 INSERT INTO charge_rates(id,rate_plan_id,charge_type_id,effective_from,unit_price,calculation_method,billing_cycle) VALUES
   (rrent,plan,rent,'2026-01-01',3000000,'fixed','monthly'),
   (relec,plan,elec,'2026-01-01',4000,'metered','monthly'),
   (rwater,plan,water,'2026-01-01',25000,'metered','monthly'),
   (rservice,plan,service,'2026-01-01',100000,'fixed','monthly'),
   (rinternet,plan,internet,'2026-01-01',50000,'fixed','monthly'),
   (rother,plan,other,'2026-01-01',30000,'fixed','once');
 INSERT INTO billing_periods(id,property_id,month_start) VALUES(period,prop,'2026-01-01'),(period2,prop2,'2026-01-01');
 INSERT INTO handovers(id,tenancy_id,kind,occurred_at,landlord_confirmed_by,confirmed_at)
 VALUES(h,stay,'checkin','2026-01-01 08:00+07',u,now());
 INSERT INTO meters(id,room_id,meter_kind,serial_number,installed_at) VALUES
   (me,room,'electricity','E-TEST','2026-01-01 00:00+07'),(mw,room,'water','W-TEST','2026-01-01 00:00+07');
 INSERT INTO meter_readings(id,meter_id,observed_at,reading_value,tenancy_id,handover_id,reading_kind,recorded_by) VALUES
   (e0,me,'2026-01-01 08:00+07',100,stay,h,'checkin',u),(w0,mw,'2026-01-01 08:00+07',10,stay,h,'checkin',u);
 INSERT INTO meter_readings(id,meter_id,observed_at,reading_value,tenancy_id,billing_period_id,reading_kind,recorded_by) VALUES
   (e1,me,'2026-01-31 18:00+07',200,stay,period,'periodic',u),(w1,mw,'2026-01-31 18:00+07',13,stay,period,'periodic',u);
 UPDATE tenancies SET status='active',actual_move_in='2026-01-01' WHERE id=stay;
 UPDATE room_allocations SET state='occupied' WHERE id=allocation;
 SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
 PERFORM pg_temp.assert_true((SELECT occupancy_status='occupied' FROM v_room_status WHERE id=room),'Trạng thái đang ở suy từ đợt thuê');
 PERFORM pg_temp.expect_failure(format('INSERT INTO room_allocations(room_id,starts_on,ends_on,state,hold_expires_at) VALUES(%L,''2026-01-15'',''2026-02-15'',''held'',now()+interval ''1 hour'')',room),'23P01','Giữ chỗ không chồng lịch thuê');
 PERFORM pg_temp.expect_failure(format('INSERT INTO meter_readings(meter_id,observed_at,reading_value,tenancy_id,reading_kind,recorded_by) VALUES(%L,''2026-02-01 08:00+07'',199,%L,''periodic'',%L)',me,stay,u),'23514','Chỉ số không giảm trong cùng chuỗi công tơ');
 INSERT INTO charge_instances(id,tenancy_id,charge_type_id) VALUES(occurrence,stay,other);
 INSERT INTO invoices(id,tenancy_id,billing_period_id,kind,service_from,service_to,idempotency_key,created_by)
 VALUES(invoice,stay,period,'periodic','2026-01-01','2026-02-01',gen_random_uuid(),u);
 INSERT INTO invoice_lines(invoice_id,line_no,charge_type_id,source_rate_id,description_snapshot,unit_snapshot,quantity,unit_price) VALUES
   (invoice,1,rent,rrent,'Thuê','tháng',1,3000000),(invoice,2,service,rservice,'Dịch vụ','phòng',1,100000),
   (invoice,3,internet,rinternet,'Internet','phòng',1,50000);
 INSERT INTO invoice_lines(invoice_id,line_no,charge_type_id,source_rate_id,charge_instance_id,description_snapshot,unit_snapshot,quantity,unit_price)
 VALUES(invoice,4,other,rother,occurrence,'Phí một lần','lần',1,30000);
 INSERT INTO invoice_lines(id,invoice_id,line_no,charge_type_id,source_rate_id,description_snapshot,unit_snapshot,quantity,unit_price) VALUES
   (il_e,invoice,5,elec,relec,'Điện','kWh',100,4000),(il_w,invoice,6,water,rwater,'Nước','m³',3,25000);
 INSERT INTO invoice_meter_segments(invoice_line_id,from_reading_id,to_reading_id) VALUES(il_e,e0,e1),(il_w,w0,w1);
 UPDATE invoices SET status='issued',code='INV-'||id,issued_on='2026-02-01',due_on='2026-02-08',issued_at=now(),issued_by=u WHERE id=invoice;
 PERFORM pg_temp.assert_true((SELECT amount=3655000 FROM v_invoice_totals WHERE invoice_id=invoice),'Ví dụ đặc tả: tổng 3.655.000 VND');
 INSERT INTO payments(id,tenant_id,amount,received_at,method_code,status,confirmed_by,confirmed_at,idempotency_key)
 VALUES(payment,tenant,2000000,now(),'cash','confirmed',u,now(),paykey);
 INSERT INTO payment_allocations(id,invoice_id,payment_id,kind,amount,allocated_by,idempotency_key)
 VALUES(alloc,invoice,payment,'apply',2000000,u,gen_random_uuid());
 SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
 PERFORM pg_temp.assert_true((SELECT outstanding_amount=1655000 AND payment_status='partial' AND is_overdue FROM v_invoice_balances WHERE invoice_id=invoice),'Thu 2.000.000: còn nợ 1.655.000 và vẫn quá hạn');
 PERFORM pg_temp.assert_true((SELECT outstanding_amount=1655000 FROM v_tenant_debts WHERE tenant_id=tenant),'Công nợ khách khớp hóa đơn');
 PERFORM pg_temp.expect_failure(format('INSERT INTO payments(tenant_id,amount,received_at,method_code,idempotency_key) VALUES(%L,2000000,now(),''cash'',%L)',tenant,paykey),'23505','Idempotency chặn thu trùng');
 PERFORM pg_temp.expect_failure(format('UPDATE payments SET amount=1 WHERE id=%L',payment),'23514','Không sửa tiền đã xác nhận');
 PERFORM pg_temp.expect_failure(format('UPDATE invoice_lines SET unit_price=0 WHERE id=%L',il_e),'23514','Không sửa dòng hóa đơn phát hành');
 PERFORM pg_temp.expect_failure(format('UPDATE invoices SET due_on=due_on+1 WHERE id=%L',invoice),'23514','Xác nhận thu không tăng hạn hóa đơn');
 PERFORM pg_temp.expect_failure(format('UPDATE meter_readings SET status=''void'',void_reason=''sửa'' WHERE id=%L',e1),'23514','Không đổi chỉ số đã dùng trong hóa đơn phát hành');
 PERFORM pg_temp.expect_failure(format('INSERT INTO payment_allocations(invoice_id,payment_id,kind,amount,allocated_by,idempotency_key) VALUES(%L,%L,''apply'',1,%L,gen_random_uuid())',invoice,payment,u),'23514','Không phân bổ vượt tiền nhận');
 INSERT INTO payments(id,tenant_id,amount,received_at,method_code,idempotency_key) VALUES(pending,tenant,1000000,now(),'bank_transfer',gen_random_uuid());
 PERFORM pg_temp.expect_failure(format('INSERT INTO payment_allocations(invoice_id,payment_id,kind,amount,allocated_by,idempotency_key) VALUES(%L,%L,''apply'',100000,%L,gen_random_uuid())',invoice,pending,u),'23514','Báo chuyển khoản chờ xác minh không thành đã thu');
 PERFORM pg_temp.expect_failure(format('UPDATE invoices SET status=''void'',voided_at=now(),voided_by=%L,void_reason=''nhập sai'' WHERE id=%L',u,invoice),'23514','Không hủy hóa đơn còn phân bổ thu');
 INSERT INTO invoices(id,tenancy_id,kind,service_from,service_to,idempotency_key,created_by)
 VALUES(draft2,stay,'one_time','2026-02-01','2026-02-02',gen_random_uuid(),u);
 PERFORM pg_temp.expect_failure(format('INSERT INTO invoice_lines(invoice_id,line_no,charge_type_id,source_rate_id,charge_instance_id,description_snapshot,unit_snapshot,quantity,unit_price) VALUES(%L,1,%L,%L,%L,''Lặp'',''lần'',1,30000)',draft2,other,rother,occurrence),'23505','Phí một lần không lập lại ở hóa đơn khác');
 PERFORM pg_temp.expect_failure(format('INSERT INTO invoices(tenancy_id,billing_period_id,kind,service_from,service_to,idempotency_key,created_by) VALUES(%L,%L,''periodic'',''2026-01-01'',''2026-02-01'',gen_random_uuid(),%L)',stay,period,u),'23505','Không lập hai hóa đơn gốc cùng đợt thuê/kỳ');
 PERFORM pg_temp.expect_failure(format('INSERT INTO invoices(tenancy_id,billing_period_id,kind,service_from,service_to,idempotency_key,created_by) VALUES(%L,%L,''final'',''2026-02-01'',''2026-02-02'',gen_random_uuid(),%L)',stay,period2,u),'23514','Kỳ tính tiền phải thuộc đúng cơ sở');
 INSERT INTO rate_plans(id,room_id) VALUES(room_plan,room);
 INSERT INTO charge_rates(rate_plan_id,charge_type_id,effective_from,unit_price,calculation_method,billing_cycle)
 VALUES(room_plan,water,'2026-02-01',0,'metered','monthly');
 PERFORM pg_temp.assert_true((SELECT unit_price=0 AND source_scope='room' FROM effective_rates(stay,'2026-02-01') WHERE charge_type_id=water),'Giá riêng bằng 0 ưu tiên và không bị coi là thiếu');
 PERFORM pg_temp.assert_true((SELECT amount=3655000 FROM v_invoice_totals WHERE invoice_id=invoice),'Đổi giá không sửa hóa đơn cũ');
 INSERT INTO invoices(id,tenancy_id,kind,original_invoice_id,service_from,service_to,idempotency_key,created_by)
 VALUES(adjustment,stay,'credit_adjustment',invoice,'2026-01-01','2026-02-01',gen_random_uuid(),u);
 INSERT INTO invoice_lines(invoice_id,line_no,charge_type_id,description_snapshot,unit_snapshot,quantity,unit_price)
 VALUES(adjustment,1,other,'Điều chỉnh giảm có căn cứ','lần',1,50000);
 UPDATE invoices SET status='issued',code='ADJ-'||id,issued_on='2026-02-02',due_on='2026-02-08',issued_at=now(),issued_by=u WHERE id=adjustment;
 PERFORM pg_temp.assert_true((SELECT receivable_amount=3605000 AND outstanding_amount=1605000 FROM v_invoice_balances WHERE invoice_id=invoice),'Điều chỉnh giảm liên kết làm giảm nợ, giữ số gốc');
 INSERT INTO payments(id,tenant_id,amount,received_at,method_code,status,confirmed_by,confirmed_at,idempotency_key)
 VALUES(deposit_payment,tenant,3000000,now(),'cash','confirmed',u,now(),gen_random_uuid());
 INSERT INTO deposit_entries(id,tenancy_id,payment_id,kind,amount,occurred_at,reason,confirmed_by,idempotency_key)
 VALUES(deposit,stay,deposit_payment,'receipt',3000000,now(),'Thu cọc',u,gen_random_uuid());
 PERFORM pg_temp.assert_true((SELECT held_amount=3000000 FROM v_deposit_balances WHERE tenancy_id=stay),'Cọc thực thu tách tiền thuê');
 PERFORM pg_temp.expect_failure(format('INSERT INTO deposit_entries(tenancy_id,payment_id,kind,amount,occurred_at,reason,confirmed_by,idempotency_key) VALUES(%L,%L,''offset'',3000001,now(),''Sai'',%L,gen_random_uuid())',stay,deposit_payment,u),'23514','Không rút cọc âm hoặc bù trừ thiếu phân bổ');
 INSERT INTO deposit_entries(id,tenancy_id,payment_id,kind,amount,occurred_at,reason,confirmed_by,idempotency_key)
 VALUES(offset_entry,stay,deposit_payment,'offset',100000,now(),'Bù trừ hóa đơn',u,gen_random_uuid());
 INSERT INTO payment_allocations(id,invoice_id,deposit_entry_id,kind,amount,allocated_by,idempotency_key)
 VALUES(offset_alloc,invoice,offset_entry,'apply',100000,u,gen_random_uuid());
 SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
 PERFORM pg_temp.assert_true((SELECT held_amount=2900000 FROM v_deposit_balances WHERE tenancy_id=stay),'Bù trừ 100.000 giảm cọc còn 2.900.000');
 PERFORM pg_temp.assert_true((SELECT outstanding_amount=1505000 FROM v_invoice_balances WHERE invoice_id=invoice),'Bù trừ cọc giảm nợ đúng 100.000');
 INSERT INTO payment_reversals(id,payment_id,amount,kind,occurred_at,method_code,reason,confirmed_by,idempotency_key)
 VALUES(refund,deposit_payment,200000,'refund',now(),'cash','Hoàn một phần cọc',u,gen_random_uuid());
 INSERT INTO deposit_entries(tenancy_id,payment_id,kind,amount,payment_reversal_id,occurred_at,reason,confirmed_by,idempotency_key)
 VALUES(stay,deposit_payment,'refund',200000,refund,now(),'Hoàn cọc',u,gen_random_uuid());
 SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
 PERFORM pg_temp.assert_true((SELECT held_amount=2700000 FROM v_deposit_balances WHERE tenancy_id=stay),'Hoàn cọc gắn giao dịch tiền ra');
 PERFORM pg_temp.assert_true((SELECT unapplied_amount=0 FROM v_payment_balances WHERE payment_id=deposit_payment),'Nguồn tiền cọc/hoàn/bù trừ cân đối');
 UPDATE billing_periods SET status='locked',locked_at=now(),locked_by=u WHERE id=period;
 PERFORM pg_temp.expect_failure(format('INSERT INTO meter_readings(meter_id,observed_at,reading_value,tenancy_id,billing_period_id,reading_kind,recorded_by) VALUES(%L,''2026-02-01 18:00+07'',201,%L,%L,''periodic'',%L)',me,stay,period,u),'23514','Khóa kỳ ngăn thêm chỉ số');
 PERFORM pg_temp.expect_failure(format('UPDATE billing_periods SET status=''open'',locked_at=NULL,locked_by=NULL WHERE id=%L',period),'23514','Mở khóa kỳ bắt buộc lý do');
 PERFORM set_config('smartrent.reason','Đối soát lại được duyệt',true);
 UPDATE billing_periods SET status='open',locked_at=NULL,locked_by=NULL WHERE id=period;
 PERFORM pg_temp.assert_true(invoice_date('2026-02-01',31)='2026-02-28','Ngày lập 31 lấy cuối tháng');
 PERFORM pg_temp.assert_true(invoice_date('2028-02-01',31)='2028-02-29','Tháng 2 năm nhuận');
 PERFORM pg_temp.assert_true(quick_contract_end_exclusive('2026-01-31',1)='2026-02-28','Cộng tháng xử lý ngày cuối tháng');
 -- Kết thúc thuê vẫn giữ cả lịch sử chiếm dụng lẫn nợ.
 UPDATE tenancies SET status='ended',actual_move_out='2026-02-01',end_reason='Trả còn nợ được duyệt',ended_by=u WHERE id=stay;
 UPDATE room_allocations SET state='completed',ends_on='2026-02-01' WHERE id=allocation;
 SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
 PERFORM pg_temp.assert_true((SELECT outstanding_amount=1505000 FROM v_tenant_debts WHERE tenant_id=tenant),'Khách rời vẫn giữ nợ');
 PERFORM pg_temp.expect_failure(format('INSERT INTO room_allocations(room_id,starts_on,ends_on,state) VALUES(%L,''2026-01-15'',''2026-01-20'',''reserved'')',room),'23P01','Không chèn chồng lịch sử đợt thuê đã kết thúc');
 INSERT INTO room_allocations(room_id,starts_on,ends_on,state,hold_expires_at)
 VALUES(room,'2026-02-01','2026-03-01','held',now()+interval '1 hour');
 PERFORM pg_temp.assert_true(true,'Ngày trả là biên mở: khách sau nhận cùng ngày không chồng');
 PERFORM pg_temp.assert_true((SELECT count(*)>0 FROM audit_logs WHERE organization_id=org),'Nhật ký tự động được ghi');
 -- Giữ chỗ hết hạn: worker đồng bộ reservation và lịch phòng.
 INSERT INTO room_allocations(id,room_id,starts_on,ends_on,state,hold_expires_at)
 VALUES(held_allocation,room2,'2026-03-01','2026-04-01','held','2020-01-01 00:00+07');
 INSERT INTO reservations(id,allocation_id,tenant_id,cancellation_terms,handled_by)
 VALUES(hold,held_allocation,tenant,'Điều kiện hủy thử',u);
 SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
 PERFORM pg_temp.expect_failure(format('UPDATE reservations SET status=''converted'' WHERE id=%L',hold),'23514','Không chuyển giữ chỗ thành thuê khi chưa có đợt thuê');
 SELECT expire_reservations() INTO count_result;
 SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
 PERFORM pg_temp.assert_true(count_result=1 AND (SELECT status='expired' FROM reservations WHERE id=hold)
   AND (SELECT state='released' FROM room_allocations WHERE id=held_allocation),'Worker hết hạn giải phóng giữ chỗ');
 -- Đảo bù trừ phải phục hồi cọc và nợ trong cùng transaction.
 INSERT INTO payment_allocations(invoice_id,deposit_entry_id,kind,amount,reverses_id,allocated_by,reason,idempotency_key)
 VALUES(invoice,offset_entry,'reversal',100000,offset_alloc,u,'Đảo bù trừ',gen_random_uuid());
 INSERT INTO deposit_entries(tenancy_id,payment_id,kind,amount,related_entry_id,occurred_at,reason,confirmed_by,idempotency_key)
 VALUES(stay,deposit_payment,'reversal',100000,offset_entry,now(),'Đảo bù trừ',u,gen_random_uuid());
 SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
 PERFORM pg_temp.assert_true((SELECT held_amount=2800000 FROM v_deposit_balances WHERE tenancy_id=stay)
   AND (SELECT outstanding_amount=1605000 FROM v_invoice_balances WHERE invoice_id=invoice),'Đảo bù trừ khôi phục đúng cọc và công nợ');
 -- Đợt nhập cũ cho phòng mới, để kiểm tra quan hệ chuyển và cọc độc lập ký/bàn giao.
 INSERT INTO room_allocations(id,room_id,starts_on,state) VALUES(new_allocation,room2,'2026-02-01','occupied');
 INSERT INTO tenancies(id,allocation_id,representative_tenant_id,status,planned_move_in,actual_move_in,onboarding_mode)
 VALUES(new_stay,new_allocation,tenant,'active','2026-02-01','2026-02-01','import');
 PERFORM pg_temp.expect_failure(format('INSERT INTO deposit_entries(tenancy_id,payment_id,kind,amount,occurred_at,reason,confirmed_by,idempotency_key) VALUES(%L,%L,''transfer_out'',1,now(),''Thiếu vế vào'',%L,gen_random_uuid())',stay,deposit_payment,u),'23514','Chuyển cọc thiếu vế đối ứng bị rollback');
 INSERT INTO deposit_entries(id,tenancy_id,payment_id,kind,amount,occurred_at,reason,confirmed_by,idempotency_key)
 VALUES(transfer_out,stay,deposit_payment,'transfer_out',500000,now(),'Chuyển phòng',u,gen_random_uuid());
 INSERT INTO deposit_entries(tenancy_id,payment_id,kind,amount,related_entry_id,occurred_at,reason,confirmed_by,idempotency_key)
 VALUES(new_stay,deposit_payment,'transfer_in',500000,transfer_out,now(),'Nhận cọc chuyển',u,gen_random_uuid());
 INSERT INTO room_transfers(old_tenancy_id,new_tenancy_id,transfer_on,reason,confirmed_by)
 VALUES(stay,new_stay,'2026-02-01','Chuyển phòng thử',u);
 SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
 PERFORM pg_temp.assert_true((SELECT held_amount=2300000 FROM v_deposit_balances WHERE tenancy_id=stay)
   AND (SELECT held_amount=500000 FROM v_deposit_balances WHERE tenancy_id=new_stay),'Chuyển cọc giữ nguồn tiền, cân hai đợt thuê');
 DELETE FROM invoices WHERE id=draft2;
 PERFORM pg_temp.assert_true(EXISTS (SELECT 1 FROM audit_logs WHERE table_name='invoices' AND action='DELETE'
   AND record_key->>'id'=draft2::text AND organization_id=org),'Xóa nháp vẫn ghi audit đúng đơn vị');
END $$;
SET CONSTRAINTS ALL IMMEDIATE;
SELECT count(*) AS passed_checks FROM test_results;
SELECT name AS passed FROM test_results ORDER BY name;
ROLLBACK;
