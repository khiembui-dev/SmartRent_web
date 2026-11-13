-- Chỉ dùng local/test. Hash cố ý không đăng nhập được; tệp chỉ là metadata.
BEGIN;
SET search_path=smartrent,public;
DO $$
DECLARE admin_id uuid; customer uuid; roommate uuid; prospect uuid; prop uuid; room uuid;
 photo uuid; signed_file uuid; contract uuid; period uuid; invoice uuid; ticket uuid; prices jsonb;
BEGIN
 INSERT INTO users(role,display_name,email,password_hash,login_enabled) VALUES('admin','Chủ trọ mẫu','admin@example.test','DISABLED_DEMO_NO_LOGIN_HASH',true) RETURNING id INTO admin_id;
 INSERT INTO users(code,display_name,email,password_hash,login_enabled,phone) VALUES('KH-001','Khách thuê mẫu','user@example.test','DISABLED_DEMO_NO_LOGIN_HASH',true,'0900000002') RETURNING id INTO customer;
 INSERT INTO users(code,display_name,email,password_hash,login_enabled) VALUES('KH-002','Người ở cùng','roommate@example.test','DISABLED_DEMO_NO_LOGIN_HASH',true) RETURNING id INTO roommate;
 INSERT INTO users(code,display_name,phone) VALUES('KH-003','Khách chưa kích hoạt','0900000004') RETURNING id INTO prospect;
 prices='[
 {"id":"rent-1","code":"RENT","name":"Tiền phòng","category":"rent","unit":"tháng","method":"fixed","cycle":"monthly","unitPrice":3000000,"effectiveFrom":"2026-01-01"},
 {"id":"electric-1","code":"ELECTRICITY","name":"Tiền điện","category":"electricity","unit":"kWh","method":"metered","cycle":"monthly","unitPrice":4000,"effectiveFrom":"2026-01-01"},
 {"id":"water-1","code":"WATER","name":"Tiền nước","category":"water","unit":"m³","method":"metered","cycle":"monthly","unitPrice":20000,"effectiveFrom":"2026-01-01"}]';
 INSERT INTO properties(code,name,address_line,province,rates,amenity_options) VALUES('CS01','Nhà trọ mẫu','Địa chỉ minh họa','TP.HCM',prices,'[{"code":"WIFI","name":"Wi-Fi","icon":"wifi"},{"code":"AC","name":"Máy lạnh","icon":"snow"}]') RETURNING id INTO prop;
 INSERT INTO files(uploaded_by,storage_key,file_name,content_type,byte_size,visibility,purpose,scan_status)
 VALUES(admin_id,'demo/room.jpg','room.jpg','image/jpeg',0,'public','room_image','clean') RETURNING id INTO photo;
 INSERT INTO files(uploaded_by,storage_key,file_name,content_type,byte_size,purpose,scan_status)
 VALUES(admin_id,'demo/signed.pdf','signed.pdf','application/pdf',0,'contract_signed','clean') RETURNING id INTO signed_file;
 INSERT INTO rooms(property_id,code,name,area_m2,capacity,required_deposit,amenities,images,rates,listing_slug,listing_title,listing_status,published_at)
 VALUES(prop,'A101','Phòng mẫu',25,2,3000000,'[{"code":"WIFI","name":"Wi-Fi","icon":"wifi"}]',
 jsonb_build_array(jsonb_build_object('fileId',photo,'caption','Ảnh minh họa','sortOrder',0,'isCover',true)),prices,'phong-a101','Phòng A101','published',now()) RETURNING id INTO room;
 INSERT INTO rooms(property_id,code,name,area_m2,capacity) VALUES(prop,'A102','Phòng trống',25,2),(prop,'A103','Phòng trống khác',22,2);
 INSERT INTO contracts(code,room_id,user_id,starts_on,move_in_on,initial_readings,occupants,versions)
 VALUES('HDTH-001',room,customer,'2026-09-01','2026-09-01',
 '{"electricity":{"value":100,"observedAt":"2026-09-01T01:00:00Z"},"water":{"value":20,"observedAt":"2026-09-01T01:00:00Z"}}',
 jsonb_build_array(jsonb_build_object('userId',roommate,'joinedOn','2026-09-01','relationship','Ở cùng')),
 jsonb_build_array(jsonb_build_object('id','v1','versionNo',1,'effectiveFrom','2026-09-01','endsOn','2027-09-01','requiredDeposit',3000000,'invoiceDay',1,'dueAfterDays',5,'termsText','Điều khoản mẫu','signedAt','2026-09-01T01:00:00Z','signedBy',admin_id,'fileIds',jsonb_build_array(signed_file),'rates',prices,'partiesSnapshot',jsonb_build_object('customer','Khách thuê mẫu')))) RETURNING id INTO contract;
 -- A101 đã có hợp đồng nên tin tự tạm ẩn (sync_room_listing); A102 còn trống là tin đang công khai.
 UPDATE rooms SET listing_slug='phong-a102',listing_title='Phòng A102',listing_status='published',published_at=now(),
  images=jsonb_build_array(jsonb_build_object('fileId',photo,'caption','Ảnh minh họa','sortOrder',0,'isCover',true))
 WHERE property_id=prop AND code='A102';
 INSERT INTO billing_periods(property_id,month_start) VALUES(prop,'2026-09-01') RETURNING id INTO period;
 INSERT INTO invoices(code,contract_id,period_id,service_from,service_to,electricity_start,electricity_end,electricity_from_at,electricity_to_at,water_start,water_end,water_from_at,water_to_at,lines)
 VALUES('HD-001',contract,period,'2026-09-01','2026-10-01',100,150,'2026-09-01T01:00Z','2026-09-30T11:00Z',20,25,'2026-09-01T01:00Z','2026-09-30T11:00Z',
 '[{"id":"rent","code":"RENT","category":"rent","description":"Tiền phòng tháng 9","unit":"tháng","quantity":1,"unitPrice":3000000},
 {"id":"electric","code":"ELECTRICITY","category":"electricity","description":"Điện tháng 9","unit":"kWh","quantity":50,"unitPrice":4000},
 {"id":"water","code":"WATER","category":"water","description":"Nước tháng 9","unit":"m³","quantity":5,"unitPrice":20000}]') RETURNING id INTO invoice;
 UPDATE invoices SET status='issued',issued_on='2026-10-01',due_on='2026-10-06',issued_at=now(),issued_by=admin_id WHERE id=invoice;
 INSERT INTO payments(code,user_id,contract_id,intended_invoice_id,amount,method,status,confirmed_at,confirmed_by,allocations)
 VALUES('PT-001',customer,contract,invoice,1000000,'cash','confirmed',now(),admin_id,jsonb_build_array(jsonb_build_object('invoiceId',invoice,'amount',1000000)));
 INSERT INTO payments(code,user_id,contract_id,intended_invoice_id,amount,method,external_reference,submitted_by,allocations)
 VALUES('PT-002',customer,contract,invoice,2300000,'bank_transfer','DEMO-BANK-001',customer,jsonb_build_array(jsonb_build_object('invoiceId',invoice,'amount',2300000)));
 INSERT INTO payments(code,user_id,contract_id,kind,amount,method,status,confirmed_at,confirmed_by)
 VALUES('COC-001',customer,contract,'deposit_receipt',3000000,'cash','confirmed',now(),admin_id);
 INSERT INTO bookings(code,user_id,room_id,contact_name,occupants,preferred_viewing_at,appointments)
 SELECT 'LX-001',prospect,id,'Khách mới',2,now()+interval '1 day',
 jsonb_build_array(jsonb_build_object('id','appointment-1','startsAt',now()+interval '1 day','endsAt',now()+interval '1 day 30 minutes','hostId',admin_id,'status','scheduled')) FROM rooms WHERE code='A102';
 INSERT INTO bookings(code,user_id,kind,status,changes) VALUES('YC-001',customer,'profile_change','pending','{"phone":{"from":"0900000002","to":"0900000009"}}');
 INSERT INTO bookings(code,user_id,contract_id,kind,status,desired_on) VALUES('YC-002',customer,contract,'renewal','pending','2028-09-01');
 INSERT INTO tickets(code,room_id,contract_id,reported_by,assigned_to,category_code,title,description,due_at,messages)
 VALUES('SC-001',room,contract,customer,admin_id,'WATER','Rò nước','Nhờ kiểm tra',now()+interval '2 days',
 jsonb_build_array(jsonb_build_object('id','m1','authorId',admin_id,'body','Tôi sẽ kiểm tra','createdAt',now(),'isInternal',false,'fileIds','[]'::jsonb),
 jsonb_build_object('id','m2','authorId',admin_id,'body','Ghi chú nội bộ','createdAt',now(),'isInternal',true,'fileIds','[]'::jsonb))) RETURNING id INTO ticket;
 INSERT INTO notifications(recipient_id,event_key,title,body,url) VALUES(customer,'invoice:HD-001','Hóa đơn mới','Hóa đơn tháng 9','/invoices/'||invoice),(admin_id,'ticket:SC-001','Sự cố mới','Khách báo rò nước','/admin/tickets/'||ticket);
END $$;
COMMIT;
