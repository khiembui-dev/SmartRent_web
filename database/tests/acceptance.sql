-- Kiểm thử nghiệp vụ theo đúng luồng website. Chạy sau 01, 02, 03, 04 bằng psql -v ON_ERROR_STOP=1.
-- Mọi dữ liệu thử nằm trong transaction và ROLLBACK cuối file.
BEGIN;
SET LOCAL search_path = smartrent, public;
CREATE TEMP TABLE test_results (name text NOT NULL);

CREATE FUNCTION pg_temp.assert_true(p_condition boolean, p_name text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF p_condition IS DISTINCT FROM true THEN RAISE EXCEPTION 'FAIL: %', p_name; END IF;
  INSERT INTO test_results VALUES (p_name);
END $$;

CREATE FUNCTION pg_temp.expect_failure(p_sql text, p_state text, p_name text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE failed boolean := false; actual_state text;
BEGIN
  BEGIN
    EXECUTE p_sql;
    SET CONSTRAINTS ALL IMMEDIATE;
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS actual_state = RETURNED_SQLSTATE;
    IF actual_state <> p_state THEN
      RAISE EXCEPTION 'FAIL: %, expected %, got %: %', p_name, p_state, actual_state, SQLERRM;
    END IF;
    failed := true;
  END;
  SET CONSTRAINTS ALL DEFERRED;
  PERFORM pg_temp.assert_true(failed, p_name);
END $$;

DO $$
DECLARE
  u uuid := gen_random_uuid(); customer uuid := gen_random_uuid(); org uuid := gen_random_uuid(); org2 uuid := gen_random_uuid();
  prop uuid := gen_random_uuid(); prop2 uuid := gen_random_uuid();
  rt uuid; rt2 uuid := gen_random_uuid();
  room uuid := gen_random_uuid(); room2 uuid := gen_random_uuid(); room3 uuid := gen_random_uuid(); empty_room uuid := gen_random_uuid();
  tenant uuid := gen_random_uuid(); tenant2 uuid := gen_random_uuid(); foreign_tenant uuid := gen_random_uuid(); resident uuid := gen_random_uuid();
  inquiry uuid := gen_random_uuid(); viewing uuid := gen_random_uuid();
  stay_id uuid := gen_random_uuid(); contract uuid := gen_random_uuid(); version uuid := gen_random_uuid();
  file uuid := gen_random_uuid(); public_file uuid := gen_random_uuid();
  period uuid := gen_random_uuid(); period2 uuid := gen_random_uuid(); period_feb uuid := gen_random_uuid();
  rent uuid; elec uuid; water uuid; service uuid; internet uuid; other uuid; opening uuid;
  rrent uuid := gen_random_uuid(); relec uuid := gen_random_uuid(); rwater uuid := gen_random_uuid();
  rservice uuid := gen_random_uuid(); rinternet uuid := gen_random_uuid(); rother uuid := gen_random_uuid();
  h uuid := gen_random_uuid(); me uuid := gen_random_uuid(); mw uuid := gen_random_uuid();
  e0 uuid := gen_random_uuid(); e1 uuid := gen_random_uuid(); w0 uuid := gen_random_uuid(); w1 uuid := gen_random_uuid();
  e2 uuid := gen_random_uuid(); w2 uuid := gen_random_uuid();
  invoice uuid := gen_random_uuid(); il_e uuid := gen_random_uuid(); il_w uuid := gen_random_uuid(); occurrence uuid := gen_random_uuid();
  payment uuid := gen_random_uuid(); paykey uuid := gen_random_uuid(); alloc uuid := gen_random_uuid(); pending uuid := gen_random_uuid();
  deposit_payment uuid := gen_random_uuid(); deposit uuid := gen_random_uuid(); offset_entry uuid := gen_random_uuid();
  offset_alloc uuid := gen_random_uuid(); refund uuid := gen_random_uuid(); draft2 uuid := gen_random_uuid();
  adjustment uuid := gen_random_uuid(); final_invoice uuid := gen_random_uuid(); rent_final uuid := gen_random_uuid();
  fl_e uuid := gen_random_uuid(); fl_w uuid := gen_random_uuid();
  import_stay uuid := gen_random_uuid(); opening_invoice uuid := gen_random_uuid(); ticket uuid := gen_random_uuid(); message uuid := gen_random_uuid();
  contract2 uuid := gen_random_uuid(); version2 uuid := gen_random_uuid();
  extra_rate uuid := gen_random_uuid(); settlement uuid := gen_random_uuid(); checkout_handover uuid := gen_random_uuid();
BEGIN
  -- ---------------------------------------------------------------- Thiết lập cơ sở, phòng (khu Cơ sở, Phòng)
  INSERT INTO users(id, user_name, normalized_user_name, email, normalized_email, display_name, phone_number)
  VALUES (u, 'chu', 'CHU', 'chu@example.com', 'CHU@EXAMPLE.COM', 'Chủ thử', '0900000001'),
         (customer, 'khach', 'KHACH', 'khach@example.com', 'KHACH@EXAMPLE.COM', 'Khách thử', '0900000002');
  INSERT INTO organizations(id, code, name) VALUES (org, 'T-' || org, 'Đơn vị thử'), (org2, 'T-' || org2, 'Đơn vị khác');
  PERFORM initialize_organization(org, u);
  PERFORM pg_temp.assert_true((SELECT count(*) = 9 FROM charge_types WHERE organization_id = org), 'Khởi tạo đơn vị có đủ khoản thu');
  PERFORM pg_temp.assert_true((SELECT count(*) = 14 FROM amenities WHERE organization_id = org), 'Khởi tạo đơn vị có sẵn tiện ích');
  PERFORM pg_temp.assert_true((SELECT count(*) = 3 FROM business_roles WHERE organization_id = org), 'Khởi tạo đơn vị có ba vai trò');
  PERFORM pg_temp.assert_true((SELECT bool_and(permission_code <> 'payments.reverse') FROM business_role_permissions p JOIN business_roles b ON b.id = p.role_id
                               WHERE b.organization_id = org AND b.code = 'manager'), 'Quản lý không có quyền đảo tiền');
  PERFORM pg_temp.expect_failure(format('UPDATE organization_settings SET invoice_create_day = 10, meter_reading_day = 20 WHERE organization_id = %L', org), '23514', 'Ngày tạo hóa đơn không trước ngày nhập số');
  PERFORM pg_temp.assert_true(normalize_text('Đỗ Thị Bích') = 'do thi bich', 'Tìm không dấu chuẩn hóa đúng tiếng Việt');
  PERFORM pg_temp.assert_true(next_document_no(org, 'invoice') = 1 AND next_document_no(org, 'invoice') = 2, 'Bộ đếm cấp mã tăng dần');

  INSERT INTO properties(id, organization_id, code, name, address_line, locality, province) VALUES
    (prop, org, 'CS1', 'Cơ sở thử', 'Địa chỉ', 'Phường', 'Thành phố'), (prop2, org, 'CS2', 'Cơ sở hai', 'Địa chỉ', 'Phường', 'Thành phố');
  SELECT id INTO rt FROM room_types WHERE organization_id = org AND code = 'STANDARD';
  INSERT INTO room_types(id, organization_id, code, name) VALUES (rt2, org2, 'OTHER', 'Khác');
  INSERT INTO rooms(id, property_id, room_type_id, code, name, area_m2, capacity, required_deposit) VALUES
    (room, prop, rt, 'P101', 'Phòng 101', 25, 3, 3000000), (room2, prop, rt, 'P102', 'Phòng 102', 25, 3, 3000000),
    (room3, prop, rt, 'P103', 'Phòng 103', 25, 3, 3000000), (empty_room, prop, rt, 'P104', 'Phòng 104', 25, 3, 3000000);
  PERFORM pg_temp.expect_failure(format('INSERT INTO rooms(property_id, room_type_id, code, name, area_m2, capacity) VALUES (%L, %L, ''P101'', ''Trùng'', 20, 2)', prop, rt), '23505', 'Mã phòng duy nhất trong cơ sở');
  PERFORM pg_temp.expect_failure(format('INSERT INTO rooms(property_id, room_type_id, code, name, area_m2, capacity) VALUES (%L, %L, ''P999'', ''Sai đơn vị'', 20, 2)', prop, rt2), '23514', 'Chặn nối dữ liệu khác đơn vị');
  PERFORM pg_temp.assert_true((SELECT occupancy_status = 'available' FROM v_room_status WHERE id = room), 'Tạo phòng không tự phát sinh thuê');

  SELECT id INTO rent FROM charge_types WHERE organization_id = org AND code = 'RENT';
  SELECT id INTO elec FROM charge_types WHERE organization_id = org AND code = 'ELECTRICITY';
  SELECT id INTO water FROM charge_types WHERE organization_id = org AND code = 'WATER';
  SELECT id INTO service FROM charge_types WHERE organization_id = org AND code = 'SERVICE';
  SELECT id INTO internet FROM charge_types WHERE organization_id = org AND code = 'INTERNET';
  SELECT id INTO other FROM charge_types WHERE organization_id = org AND code = 'OTHER';
  SELECT id INTO opening FROM charge_types WHERE organization_id = org AND code = 'OPENING_BALANCE';
  INSERT INTO charge_rates(id, property_id, charge_type_id, effective_from, unit_price, calculation_method, billing_cycle) VALUES
    (rrent, prop, rent, '2026-01-01', 3000000, 'fixed', 'monthly'), (relec, prop, elec, '2026-01-01', 4000, 'metered', 'monthly'),
    (rwater, prop, water, '2026-01-01', 25000, 'metered', 'monthly'), (rservice, prop, service, '2026-01-01', 100000, 'fixed', 'monthly'),
    (rinternet, prop, internet, '2026-01-01', 50000, 'fixed', 'monthly'), (rother, prop, other, '2026-01-01', 30000, 'fixed', 'once');
  PERFORM pg_temp.expect_failure(format('INSERT INTO charge_rates(property_id, charge_type_id, effective_from, unit_price, calculation_method) VALUES (%L, %L, ''2026-03-01'', 1, ''metered'')', prop, elec), '23P01', 'Giá cùng khoản không chồng khoảng ngày');
  PERFORM pg_temp.expect_failure(format('INSERT INTO charge_rates(property_id, room_id, charge_type_id, effective_from, unit_price, calculation_method) VALUES (%L, %L, %L, ''2030-01-01'', 1, ''fixed'')', prop, room, service), '23514', 'Một dòng giá chỉ thuộc một phạm vi');
  PERFORM pg_temp.expect_failure(format('UPDATE charge_rates SET unit_price = 1 WHERE id = %L', relec), '23514', 'Đổi giá không sửa dòng cũ');

  INSERT INTO room_listings(room_id, slug, title, status, published_at, video_url) VALUES
    (room, 'p101', 'Phòng 101', 'published', now(), '/videos/tour.mp4'), (room2, 'p102', 'Phòng 102', 'published', now(), NULL),
    (room3, 'p103', 'Phòng 103', 'hidden', NULL, NULL);
  PERFORM pg_temp.assert_true((SELECT count(*) = 2 FROM v_public_rooms WHERE organization_id = org), 'Trang Thuê phòng chỉ hiện tin đang công khai');
  PERFORM pg_temp.assert_true((SELECT v.rent = 3000000 AND v.video_url IS NOT NULL FROM v_public_rooms v WHERE v.slug = 'p101'), 'Tin công khai có giá thuê và video');

  -- ---------------------------------------------------------------- Khách đăng ký và đặt lịch xem phòng
  INSERT INTO tenants(id, organization_id, code, full_name, user_id, phone, email) VALUES
    (tenant, org, 'K001', 'Nguyễn Văn Khách', customer, '0900000002', 'khach@example.com'), (tenant2, org, 'K002', 'Khách hai', NULL, '0900000003', NULL),
    (resident, org, 'K003', 'Người ở cùng', NULL, NULL, NULL);
  INSERT INTO tenants(id, organization_id, code, full_name) VALUES (foreign_tenant, org2, 'K099', 'Khách khác đơn vị');
  PERFORM pg_temp.assert_true((SELECT residence_status = 'none' AND has_portal_account FROM v_tenant_status WHERE tenant_id = tenant), 'Tài khoản tự đăng ký hiện là Chưa thuê');
  PERFORM pg_temp.assert_true(EXISTS (SELECT 1 FROM tenants WHERE normalize_text(full_name) LIKE '%van khach%'), 'Tìm được khách bằng chữ không dấu');
  INSERT INTO rental_inquiries(id, code, room_id, tenant_id, contact_name, phone, preferred_viewing_at, occupants)
  VALUES (inquiry, 'YC-0001', room, tenant, 'Nguyễn Văn Khách', '0900000002', now() + interval '1 day', 2);
  PERFORM pg_temp.expect_failure(format('INSERT INTO rental_inquiries(code, room_id, tenant_id, contact_name, phone) VALUES (''YC-0002'', %L, %L, ''Khách'', ''0900'')', room, tenant), '23505', 'Không đặt trùng lịch cùng phòng khi yêu cầu còn mở');
  PERFORM pg_temp.expect_failure(format('INSERT INTO rental_inquiries(code, room_id, contact_name) VALUES (''YC-0003'', %L, ''Khách'')', room), '23514', 'Yêu cầu phải có điện thoại hoặc email');
  PERFORM pg_temp.expect_failure(format('INSERT INTO rental_inquiries(code, room_id, tenant_id, contact_name, phone) VALUES (''YC-0004'', %L, %L, ''Khách'', ''0900'')', room2, foreign_tenant), '23514', 'Yêu cầu không gắn khách đơn vị khác');
  PERFORM pg_temp.assert_true((SELECT count(*) = 2 FROM v_public_rooms WHERE organization_id = org), 'Đặt lịch xem không đổi trạng thái phòng');
  INSERT INTO room_viewings(id, inquiry_id, starts_at, ends_at, host_user_id) VALUES (viewing, inquiry, now() + interval '1 day', now() + interval '1 day 30 minutes', u);
  UPDATE room_viewings SET status = 'completed', result_notes = 'Khách ưng phòng' WHERE id = viewing;
  UPDATE rental_inquiries SET status = 'approved' WHERE id = inquiry;

  -- ---------------------------------------------------------------- Tạo hợp đồng là nhận phòng
  UPDATE rooms SET operating_status = 'maintenance' WHERE id = room2;
  PERFORM pg_temp.expect_failure(format('INSERT INTO tenancies(room_id, representative_tenant_id, status, planned_move_in, actual_move_in) VALUES (%L, %L, ''active'', ''2026-01-01'', ''2026-01-01'')', room2, tenant2), '23514', 'Phòng bảo trì không nhận khách');
  UPDATE rooms SET operating_status = 'available' WHERE id = room2;
  PERFORM pg_temp.expect_failure(format('INSERT INTO tenancies(room_id, representative_tenant_id, planned_move_in) VALUES (%L, %L, ''2026-01-01'')', room, foreign_tenant), '23514', 'Đợt thuê không gắn khách đơn vị khác');
  INSERT INTO tenancies(id, room_id, representative_tenant_id, inquiry_id, planned_move_in) VALUES (stay_id, room, tenant, inquiry, '2026-01-01');
  PERFORM pg_temp.expect_failure(format('INSERT INTO tenancies(room_id, representative_tenant_id, planned_move_in) VALUES (%L, %L, ''2026-01-15'')', room, tenant2), '23P01', 'Hai khách không nhận cùng phòng trùng thời gian');
  PERFORM pg_temp.expect_failure(format('INSERT INTO tenancies(room_id, representative_tenant_id, planned_move_in) VALUES (%L, %L, ''2026-01-15'')', room2, tenant), '23505', 'Một đại diện chỉ một đợt thuê đang hoạt động');
  PERFORM pg_temp.expect_failure(format('UPDATE tenancies SET status = ''active'', actual_move_in = ''2026-01-01'' WHERE id = %L', stay_id), '23514', 'Nhận phòng thiếu hợp đồng ký và bàn giao bị chặn');
  INSERT INTO contracts(id, tenancy_id, code, created_by) VALUES (contract, stay_id, 'HD-' || contract, u);
  INSERT INTO contract_versions(id, contract_id, version_no, effective_from, ends_on, required_deposit, invoice_day, due_after_days, proration_policy, terms_text)
  VALUES (version, contract, 1, '2026-01-01', '2027-01-01', 3000000, 1, 7, 'actual_days', 'Điều khoản thử');
  INSERT INTO stored_files(id, organization_id, storage_key, original_name, content_type, byte_size, scan_status, purpose)
  VALUES (file, org, 'test/' || file, 'contract.pdf', 'application/pdf', 100, 'clean', 'contract_signed');
  INSERT INTO stored_files(id, organization_id, storage_key, original_name, content_type, byte_size, scan_status, visibility)
  VALUES (public_file, org, 'test/' || public_file, 'a.jpg', 'image/jpeg', 100, 'clean', 'public');
  PERFORM pg_temp.expect_failure(format('UPDATE contract_versions SET signed_at = now(), confirmed_by = %L, signature_method = ''paper'' WHERE id = %L', u, version), '23514', 'Ký hợp đồng bắt buộc có bản ký');
  INSERT INTO contract_parties(contract_version_id, party_role, full_name_snapshot, address_snapshot) VALUES
    (version, 'landlord', 'Chủ trọ', 'Địa chỉ chủ'), (version, 'representative', 'Khách thử', 'Địa chỉ khách');
  INSERT INTO contract_files(contract_version_id, file_id, file_kind) VALUES (version, file, 'signed');
  UPDATE contract_versions SET signed_at = now(), confirmed_by = u, signature_method = 'paper' WHERE id = version;
  PERFORM pg_temp.expect_failure(format('UPDATE contract_versions SET required_deposit = 0 WHERE id = %L', version), '23514', 'Không sửa hợp đồng đã ký');
  PERFORM pg_temp.expect_failure(format('DELETE FROM contract_files WHERE contract_version_id = %L', version), '23514', 'Không gỡ tệp của bản đã ký');
  INSERT INTO contract_attachments(contract_id, file_id, note, added_by) VALUES (contract, public_file, 'Phụ lục ảnh', u);
  PERFORM pg_temp.assert_true(EXISTS (SELECT 1 FROM contract_attachments WHERE contract_id = contract), 'Bổ sung tệp vào hồ sơ sau khi ký');

  INSERT INTO billing_periods(id, property_id, month_start) VALUES (period, prop, '2026-01-01'), (period2, prop2, '2026-01-01'), (period_feb, prop, '2026-02-01');
  INSERT INTO handovers(id, tenancy_id, kind, occurred_at, landlord_confirmed_by, confirmed_at) VALUES (h, stay_id, 'checkin', '2026-01-01 08:00+07', u, now());
  INSERT INTO handover_items(handover_id, name, quantity, condition_notes) VALUES (h, 'Giường 1m6', 1, 'Tốt');
  INSERT INTO meters(id, room_id, meter_kind, serial_number, installed_at) VALUES
    (me, room, 'electricity', 'E-TEST', '2026-01-01 00:00+07'), (mw, room, 'water', 'W-TEST', '2026-01-01 00:00+07');
  PERFORM pg_temp.expect_failure(format('INSERT INTO meters(room_id, meter_kind, serial_number, installed_at) VALUES (%L, ''water'', ''W2'', ''2026-02-01 00:00+07'')', room), '23P01', 'Mỗi phòng một công tơ đang dùng cho mỗi loại');
  PERFORM pg_temp.expect_failure(format('UPDATE tenancies SET status = ''active'', actual_move_in = ''2026-01-01'' WHERE id = %L', stay_id), '23514', 'Nhận phòng thiếu chỉ số đầu bị chặn, không coi là 0');
  INSERT INTO meter_readings(id, meter_id, observed_at, reading_value, tenancy_id, handover_id, reading_kind, recorded_by) VALUES
    (e0, me, '2026-01-01 08:00+07', 100, stay_id, h, 'checkin', u), (w0, mw, '2026-01-01 08:00+07', 10, stay_id, h, 'checkin', u);
  INSERT INTO meter_readings(id, meter_id, observed_at, reading_value, tenancy_id, billing_period_id, reading_kind, recorded_by) VALUES
    (e1, me, '2026-01-31 18:00+07', 200, stay_id, period, 'periodic', u), (w1, mw, '2026-01-31 18:00+07', 13, stay_id, period, 'periodic', u);
  UPDATE tenancies SET status = 'active', actual_move_in = '2026-01-01' WHERE id = stay_id;
  UPDATE rental_inquiries SET status = 'converted' WHERE id = inquiry;
  INSERT INTO tenancy_residents(tenancy_id, tenant_id, joined_on, relationship) VALUES (stay_id, resident, '2026-01-01', 'Bạn');
  SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
  PERFORM pg_temp.assert_true((SELECT occupancy_status = 'occupied' AND active_tenant_id = tenant FROM v_room_status WHERE id = room), 'Đã thuê suy từ đợt thuê, không lưu trên phòng');
  PERFORM pg_temp.assert_true((SELECT residence_status = 'active' FROM v_tenant_status WHERE tenant_id = tenant), 'Khách chuyển sang Đang thuê');
  PERFORM pg_temp.assert_true((SELECT residence_status = 'active' FROM v_tenant_status WHERE tenant_id = resident), 'Người ở cùng cũng là đang ở');
  PERFORM pg_temp.assert_true((SELECT count(*) = 1 FROM v_public_rooms WHERE organization_id = org), 'Phòng đã thuê biến mất khỏi trang Thuê phòng');
  PERFORM pg_temp.expect_failure(format('UPDATE rooms SET operating_status = ''inactive'' WHERE id = %L', room), '23514', 'Không ngừng khai thác phòng đang có người');
  PERFORM pg_temp.expect_failure(format('DELETE FROM rooms WHERE id = %L', room), '23503', 'Không xóa phòng đã có lịch sử thuê');
  PERFORM pg_temp.expect_failure(format('INSERT INTO meter_readings(meter_id, observed_at, reading_value, tenancy_id, reading_kind, recorded_by) VALUES (%L, ''2026-02-01 08:00+07'', 199, %L, ''periodic'', %L)', me, stay_id, u), '23514', 'Chỉ số không nhỏ hơn số trước');

  -- ---------------------------------------------------------------- Tính tiền và hóa đơn (ví dụ đối chiếu của đặc tả)
  INSERT INTO charge_instances(id, tenancy_id, charge_type_id) VALUES (occurrence, stay_id, other);
  INSERT INTO invoices(id, tenancy_id, billing_period_id, kind, service_from, service_to, idempotency_key, created_by)
  VALUES (invoice, stay_id, period, 'periodic', '2026-01-01', '2026-02-01', gen_random_uuid(), u);
  INSERT INTO invoice_lines(invoice_id, line_no, charge_type_id, source_rate_id, description_snapshot, unit_snapshot, quantity, unit_price) VALUES
    (invoice, 1, rent, rrent, 'Thuê', 'tháng', 1, 3000000), (invoice, 2, service, rservice, 'Dịch vụ', 'phòng', 1, 100000),
    (invoice, 3, internet, rinternet, 'Internet', 'phòng', 1, 50000);
  INSERT INTO invoice_lines(invoice_id, line_no, charge_type_id, source_rate_id, charge_instance_id, description_snapshot, unit_snapshot, quantity, unit_price)
  VALUES (invoice, 4, other, rother, occurrence, 'Phí một lần', 'lần', 1, 30000);
  INSERT INTO invoice_lines(id, invoice_id, line_no, charge_type_id, source_rate_id, description_snapshot, unit_snapshot, quantity, unit_price) VALUES
    (il_e, invoice, 5, elec, relec, 'Điện', 'kWh', 100, 4000), (il_w, invoice, 6, water, rwater, 'Nước', 'm³', 3, 25000);
  PERFORM pg_temp.expect_failure(format('UPDATE invoices SET status = ''issued'', code = ''X'', issued_on = ''2026-02-01'', due_on = ''2026-02-08'', issued_at = now(), issued_by = %L WHERE id = %L', u, invoice), '23514', 'Không phát hành khi thiếu chỉ số điện nước');
  INSERT INTO invoice_meter_segments(invoice_line_id, from_reading_id, to_reading_id) VALUES (il_e, e0, e1), (il_w, w0, w1);
  UPDATE invoices SET status = 'issued', code = 'INV-' || id, issued_on = '2026-02-01', due_on = '2026-02-08', issued_at = now(), issued_by = u WHERE id = invoice;
  PERFORM pg_temp.assert_true((SELECT amount = 3655000 FROM v_invoice_totals WHERE invoice_id = invoice), 'Ví dụ đặc tả: tổng 3.655.000 đồng');

  INSERT INTO payments(id, code, tenant_id, amount, received_at, method_code, status, confirmed_by, confirmed_at, idempotency_key)
  VALUES (payment, 'PT-1', tenant, 2000000, now(), 'cash', 'confirmed', u, now(), paykey);
  INSERT INTO payment_allocations(id, invoice_id, payment_id, kind, amount, allocated_by, idempotency_key)
  VALUES (alloc, invoice, payment, 'apply', 2000000, u, gen_random_uuid());
  SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
  PERFORM pg_temp.assert_true((SELECT outstanding_amount = 1655000 AND payment_status = 'partial' AND is_overdue FROM v_invoice_balances WHERE invoice_id = invoice), 'Thu 2.000.000: còn 1.655.000 và vẫn quá hạn');
  PERFORM pg_temp.assert_true((SELECT outstanding_amount = 1655000 AND overdue_count = 1 FROM v_tenant_debts WHERE tenant_id = tenant), 'Công nợ khách khớp hóa đơn');
  PERFORM pg_temp.expect_failure(format('INSERT INTO payments(code, tenant_id, amount, received_at, method_code, idempotency_key) VALUES (''PT-2'', %L, 2000000, now(), ''cash'', %L)', tenant, paykey), '23505', 'Gửi lại cùng yêu cầu không thu trùng');
  PERFORM pg_temp.expect_failure(format('UPDATE payments SET amount = 1 WHERE id = %L', payment), '23514', 'Không sửa tiền đã xác nhận');
  PERFORM pg_temp.expect_failure(format('UPDATE invoice_lines SET unit_price = 0 WHERE id = %L', il_e), '23514', 'Không sửa dòng hóa đơn đã phát hành');
  PERFORM pg_temp.expect_failure(format('UPDATE invoices SET due_on = due_on + 1 WHERE id = %L', invoice), '23514', 'Xác nhận thu không tăng hạn hóa đơn');
  PERFORM pg_temp.expect_failure(format('UPDATE meter_readings SET status = ''void'', void_reason = ''sửa'' WHERE id = %L', e1), '23514', 'Số đã lên hóa đơn phát hành không sửa được');
  PERFORM pg_temp.expect_failure(format('INSERT INTO payment_allocations(invoice_id, payment_id, kind, amount, allocated_by, idempotency_key) VALUES (%L, %L, ''apply'', 1, %L, gen_random_uuid())', invoice, payment, u), '23514', 'Không phân bổ vượt tiền nhận');

  INSERT INTO payments(id, code, tenant_id, amount, received_at, method_code, external_reference, reported_by, idempotency_key)
  VALUES (pending, 'PT-3', tenant, 1655000, now(), 'bank_transfer', 'FT123', customer, gen_random_uuid());
  INSERT INTO payment_intended_invoices(payment_id, invoice_id) VALUES (pending, invoice);
  PERFORM pg_temp.assert_true((SELECT outstanding_amount = 1655000 FROM v_invoice_balances WHERE invoice_id = invoice), 'Báo chuyển khoản chưa xác minh không trừ nợ');
  PERFORM pg_temp.expect_failure(format('INSERT INTO payment_allocations(invoice_id, payment_id, kind, amount, allocated_by, idempotency_key) VALUES (%L, %L, ''apply'', 100000, %L, gen_random_uuid())', invoice, pending, u), '23514', 'Tiền chờ xác minh không phân bổ được');
  PERFORM pg_temp.expect_failure(format('UPDATE invoices SET status = ''void'', voided_at = now(), voided_by = %L, void_reason = ''nhập sai'' WHERE id = %L', u, invoice), '23514', 'Không hủy hóa đơn còn phân bổ thu');
  UPDATE payments SET status = 'rejected', rejection_reason = 'Không thấy tiền về' WHERE id = pending;
  PERFORM pg_temp.assert_true((SELECT unapplied_amount = 0 FROM v_payment_balances WHERE payment_id = pending), 'Từ chối báo chuyển khoản không tạo số dư');

  INSERT INTO invoices(id, tenancy_id, kind, service_from, service_to, idempotency_key, created_by)
  VALUES (draft2, stay_id, 'one_time', '2026-02-01', '2026-02-02', gen_random_uuid(), u);
  PERFORM pg_temp.expect_failure(format('INSERT INTO invoice_lines(invoice_id, line_no, charge_type_id, source_rate_id, charge_instance_id, description_snapshot, unit_snapshot, quantity, unit_price) VALUES (%L, 1, %L, %L, %L, ''Lặp'', ''lần'', 1, 30000)', draft2, other, rother, occurrence), '23505', 'Phí một lần không lặp ở hóa đơn khác');
  PERFORM pg_temp.expect_failure(format('INSERT INTO invoices(tenancy_id, billing_period_id, kind, service_from, service_to, idempotency_key, created_by) VALUES (%L, %L, ''periodic'', ''2026-01-01'', ''2026-02-01'', gen_random_uuid(), %L)', stay_id, period, u), '23505', 'Không lập hai hóa đơn tháng cùng đợt thuê');
  PERFORM pg_temp.expect_failure(format('INSERT INTO invoices(tenancy_id, billing_period_id, kind, service_from, service_to, idempotency_key, created_by) VALUES (%L, %L, ''final'', ''2026-02-01'', ''2026-02-02'', gen_random_uuid(), %L)', stay_id, period2, u), '23514', 'Tháng tính tiền phải đúng cơ sở');

  INSERT INTO charge_rates(id, room_id, charge_type_id, effective_from, unit_price, calculation_method) VALUES (extra_rate, room, water, '2026-02-01', 0, 'metered');
  PERFORM pg_temp.assert_true((SELECT unit_price = 0 AND source_scope = 'room' FROM effective_rates(stay_id, '2026-02-01') WHERE charge_type_id = water), 'Giá riêng bằng 0 vẫn được ưu tiên');
  PERFORM pg_temp.assert_true((SELECT unit_price = 25000 AND source_scope = 'property' FROM room_rates(room3, '2026-02-01') WHERE charge_type_id = water), 'Phòng không có giá riêng kế thừa giá cơ sở');
  PERFORM pg_temp.assert_true((SELECT amount = 3655000 FROM v_invoice_totals WHERE invoice_id = invoice), 'Đổi giá không sửa hóa đơn cũ');
  DELETE FROM charge_rates WHERE id = extra_rate;
  PERFORM pg_temp.assert_true(NOT EXISTS (SELECT 1 FROM charge_rates WHERE id = extra_rate), 'Giá nhập nhầm chưa dùng thì xóa được');
  PERFORM pg_temp.expect_failure(format('DELETE FROM charge_rates WHERE id = %L', relec), '23503', 'Giá đã lên hóa đơn không xóa được');

  INSERT INTO invoices(id, tenancy_id, kind, original_invoice_id, service_from, service_to, idempotency_key, created_by)
  VALUES (adjustment, stay_id, 'credit_adjustment', invoice, '2026-01-01', '2026-02-01', gen_random_uuid(), u);
  INSERT INTO invoice_lines(invoice_id, line_no, charge_type_id, description_snapshot, unit_snapshot, quantity, unit_price)
  VALUES (adjustment, 1, other, 'Điều chỉnh giảm có căn cứ', 'lần', 1, 50000);
  UPDATE invoices SET status = 'issued', code = 'ADJ-' || id, issued_on = '2026-02-02', due_on = '2026-02-08', issued_at = now(), issued_by = u WHERE id = adjustment;
  PERFORM pg_temp.assert_true((SELECT receivable_amount = 3605000 AND outstanding_amount = 1605000 FROM v_invoice_balances WHERE invoice_id = invoice), 'Điều chỉnh giảm liên kết làm giảm nợ, giữ số gốc');

  -- ---------------------------------------------------------------- Cọc: yêu cầu, thực thu, bù trừ, hoàn
  INSERT INTO payments(id, code, tenant_id, amount, received_at, method_code, status, confirmed_by, confirmed_at, idempotency_key)
  VALUES (deposit_payment, 'PT-4', tenant, 3000000, now(), 'cash', 'confirmed', u, now(), gen_random_uuid());
  INSERT INTO deposit_entries(id, tenancy_id, payment_id, kind, amount, occurred_at, reason, confirmed_by, idempotency_key)
  VALUES (deposit, stay_id, deposit_payment, 'receipt', 3000000, now(), 'Thu cọc', u, gen_random_uuid());
  PERFORM pg_temp.assert_true((SELECT held_amount = 3000000 FROM v_deposit_balances WHERE tenancy_id = stay_id), 'Cọc thực thu tách khỏi tiền thuê');
  PERFORM pg_temp.expect_failure(format('INSERT INTO deposit_entries(tenancy_id, payment_id, kind, amount, occurred_at, reason, confirmed_by, idempotency_key) VALUES (%L, %L, ''offset'', 3000001, now(), ''Sai'', %L, gen_random_uuid())', stay_id, deposit_payment, u), '23514', 'Không bù trừ quá số cọc đang giữ');
  INSERT INTO deposit_entries(id, tenancy_id, payment_id, kind, amount, occurred_at, reason, confirmed_by, idempotency_key)
  VALUES (offset_entry, stay_id, deposit_payment, 'offset', 100000, now(), 'Bù trừ hóa đơn', u, gen_random_uuid());
  INSERT INTO payment_allocations(id, invoice_id, deposit_entry_id, kind, amount, allocated_by, idempotency_key)
  VALUES (offset_alloc, invoice, offset_entry, 'apply', 100000, u, gen_random_uuid());
  SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
  PERFORM pg_temp.assert_true((SELECT held_amount = 2900000 FROM v_deposit_balances WHERE tenancy_id = stay_id), 'Bù trừ 100.000 giảm cọc còn 2.900.000');
  PERFORM pg_temp.assert_true((SELECT outstanding_amount = 1505000 FROM v_invoice_balances WHERE invoice_id = invoice), 'Bù trừ cọc giảm nợ đúng 100.000');
  INSERT INTO payment_reversals(id, payment_id, amount, kind, occurred_at, method_code, reason, confirmed_by, idempotency_key)
  VALUES (refund, deposit_payment, 200000, 'refund', now(), 'cash', 'Hoàn một phần cọc', u, gen_random_uuid());
  INSERT INTO deposit_entries(tenancy_id, payment_id, kind, amount, payment_reversal_id, occurred_at, reason, confirmed_by, idempotency_key)
  VALUES (stay_id, deposit_payment, 'refund', 200000, refund, now(), 'Hoàn cọc', u, gen_random_uuid());
  SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
  PERFORM pg_temp.assert_true((SELECT held_amount = 2700000 FROM v_deposit_balances WHERE tenancy_id = stay_id), 'Hoàn cọc gắn giao dịch tiền ra');
  PERFORM pg_temp.assert_true((SELECT unapplied_amount = 0 FROM v_payment_balances WHERE payment_id = deposit_payment), 'Nguồn tiền cọc, hoàn, bù trừ cân đối');
  PERFORM pg_temp.expect_failure(format('DELETE FROM deposit_entries WHERE id = %L', deposit), '23514', 'Sổ cọc chỉ ghi thêm');
  INSERT INTO payment_allocations(invoice_id, deposit_entry_id, kind, amount, reverses_id, allocated_by, reason, idempotency_key)
  VALUES (invoice, offset_entry, 'reversal', 100000, offset_alloc, u, 'Đảo bù trừ', gen_random_uuid());
  INSERT INTO deposit_entries(tenancy_id, payment_id, kind, amount, related_entry_id, occurred_at, reason, confirmed_by, idempotency_key)
  VALUES (stay_id, deposit_payment, 'reversal', 100000, offset_entry, now(), 'Đảo bù trừ', u, gen_random_uuid());
  SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
  PERFORM pg_temp.assert_true((SELECT held_amount = 2800000 FROM v_deposit_balances WHERE tenancy_id = stay_id)
    AND (SELECT outstanding_amount = 1605000 FROM v_invoice_balances WHERE invoice_id = invoice), 'Đảo bù trừ khôi phục đúng cọc và công nợ');

  -- ---------------------------------------------------------------- Khóa tháng, ngày
  UPDATE billing_periods SET status = 'locked', locked_at = now(), locked_by = u WHERE id = period;
  PERFORM pg_temp.expect_failure(format('INSERT INTO meter_readings(meter_id, observed_at, reading_value, tenancy_id, billing_period_id, reading_kind, recorded_by) VALUES (%L, ''2026-02-01 18:00+07'', 201, %L, %L, ''checkout'', %L)', me, stay_id, period, u), '23514', 'Khóa tháng chặn thêm chỉ số');
  PERFORM pg_temp.expect_failure(format('UPDATE billing_periods SET status = ''open'', locked_at = NULL, locked_by = NULL WHERE id = %L', period), '23514', 'Mở khóa tháng bắt buộc lý do');
  PERFORM set_config('smartrent.reason', 'Đối soát lại được duyệt', true);
  UPDATE billing_periods SET status = 'open', locked_at = NULL, locked_by = NULL WHERE id = period;
  PERFORM pg_temp.assert_true(invoice_date('2026-02-01', 31) = '2026-02-28', 'Ngày lập 31 lấy cuối tháng');
  PERFORM pg_temp.assert_true(invoice_date('2028-02-01', 31) = '2028-02-29', 'Tháng 2 năm nhuận');
  PERFORM pg_temp.assert_true(quick_contract_end_exclusive('2026-01-31', 1) = '2026-02-28', 'Cộng tháng xử lý ngày cuối tháng');

  -- ---------------------------------------------------------------- Hợp đồng hết hạn, ticket, đề nghị của khách
  PERFORM pg_temp.assert_true((SELECT status IN ('active','expired') AND display_end_on = '2026-12-31' FROM v_contract_status WHERE contract_id = contract), 'Ngày cuối hợp đồng hiển thị là ngày trước ends_on');
  INSERT INTO tenancy_requests(tenancy_id, request_type, desired_on, requested_by) VALUES (stay_id, 'renewal', '2027-06-30', customer);
  PERFORM pg_temp.expect_failure(format('INSERT INTO tenancy_requests(tenancy_id, request_type, desired_on, requested_by) VALUES (%L, ''renewal'', ''2027-07-30'', %L)', stay_id, customer), '23505', 'Không gửi trùng đề nghị đang chờ');
  INSERT INTO tenant_profile_change_requests(tenant_id, requested_by, proposed_phone, proposed_emergency_contact_name)
  VALUES (tenant, customer, '0900000099', 'Người thân');
  PERFORM pg_temp.expect_failure(format('INSERT INTO tenant_profile_change_requests(tenant_id, requested_by, proposed_phone) VALUES (%L, %L, ''0900'')', tenant, customer), '23505', 'Mỗi khách một đề nghị sửa hồ sơ đang chờ');
  INSERT INTO tickets(id, code, room_id, tenancy_id, category_id, title, description, reported_by)
  VALUES (ticket, 'SC-0001', room, stay_id, (SELECT id FROM ticket_categories WHERE organization_id = org AND code = 'PLUMBING'), 'Vòi nước rò', 'Vòi bếp rò nước', customer);
  INSERT INTO ticket_messages(id, ticket_id, author_id, body, is_internal) VALUES (message, ticket, u, 'Ghi chú nội bộ', true);
  PERFORM pg_temp.expect_failure(format('INSERT INTO tickets(code, room_id, tenancy_id, category_id, title, description, reported_by) VALUES (''SC-0002'', %L, %L, (SELECT id FROM ticket_categories WHERE organization_id = %L LIMIT 1), ''x'', ''x'', %L)', room2, stay_id, org, customer), '23514', 'Ticket phải đúng phòng của đợt thuê');
  INSERT INTO ticket_events(ticket_id, event_type, old_status, new_status, actor_id) VALUES (ticket, 'status_changed', 'new', 'accepted', u);
  PERFORM pg_temp.expect_failure(format('UPDATE ticket_events SET reason = ''sửa'' WHERE ticket_id = %L', ticket), '23514', 'Lịch sử ticket chỉ ghi thêm');

  -- ---------------------------------------------------------------- Trả phòng khi tháng đã có hóa đơn: hóa đơn cuối chỉ tính điện nước
  INSERT INTO handovers(id, tenancy_id, kind, occurred_at, landlord_confirmed_by, confirmed_at) VALUES (checkout_handover, stay_id, 'checkout', '2026-01-31 20:00+07', u, now());
  INSERT INTO meter_readings(id, meter_id, observed_at, reading_value, tenancy_id, handover_id, reading_kind, recorded_by) VALUES
    (e2, me, '2026-01-31 20:00+07', 203, stay_id, checkout_handover, 'checkout', u), (w2, mw, '2026-01-31 20:00+07', 14, stay_id, checkout_handover, 'checkout', u);
  INSERT INTO invoices(id, tenancy_id, kind, service_from, service_to, idempotency_key, created_by)
  VALUES (final_invoice, stay_id, 'final', '2026-01-31', '2026-02-01', gen_random_uuid(), u);
  INSERT INTO invoice_lines(id, invoice_id, line_no, charge_type_id, source_rate_id, description_snapshot, unit_snapshot, quantity, unit_price) VALUES
    (fl_e, final_invoice, 1, elec, relec, 'Điện', 'kWh', 3, 4000), (fl_w, final_invoice, 2, water, rwater, 'Nước', 'm³', 1, 25000);
  INSERT INTO invoice_meter_segments(invoice_line_id, from_reading_id, to_reading_id) VALUES (fl_e, e1, e2), (fl_w, w1, w2);
  UPDATE invoices SET status = 'issued', code = 'FIN-' || id, issued_on = '2026-02-01', due_on = '2026-02-08', issued_at = now(), issued_by = u WHERE id = final_invoice;
  PERFORM pg_temp.assert_true((SELECT amount = 37000 FROM v_invoice_totals WHERE invoice_id = final_invoice), 'Hóa đơn cuối chỉ điện nước phát hành được dù trùng ngày hóa đơn tháng');
  INSERT INTO invoices(id, tenancy_id, kind, service_from, service_to, idempotency_key, created_by)
  VALUES (rent_final, stay_id, 'final', '2026-01-20', '2026-02-01', gen_random_uuid(), u);
  INSERT INTO invoice_lines(invoice_id, line_no, charge_type_id, source_rate_id, description_snapshot, unit_snapshot, quantity, unit_price)
  VALUES (rent_final, 1, rent, rrent, 'Thuê', 'tháng', 1, 3000000);
  PERFORM pg_temp.expect_failure(format('UPDATE invoices SET status = ''issued'', code = ''FIN2'', issued_on = ''2026-02-01'', due_on = ''2026-02-08'', issued_at = now(), issued_by = %L WHERE id = %L', u, rent_final), '23514', 'Tiền thuê một ngày không thu hai lần');

  INSERT INTO checkout_settlements(id, tenancy_id, checkout_handover_id, status, allow_remaining_debt, remaining_debt_reason, confirmed_by, confirmed_at)
  VALUES (settlement, stay_id, checkout_handover, 'confirmed', true, 'Khách cam kết trả sau', u, now());
  UPDATE tenancies SET status = 'ended', actual_move_out = '2026-02-01', end_reason = 'Trả còn nợ được duyệt', ended_by = u WHERE id = stay_id;
  UPDATE contracts SET terminated_on = '2026-02-01', termination_reason = 'Khách trả phòng', terminated_by = u, terminated_at = now() WHERE id = contract;
  SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
  PERFORM pg_temp.assert_true((SELECT outstanding_amount = 1642000 FROM v_tenant_debts WHERE tenant_id = tenant), 'Khách rời vẫn giữ nợ');
  PERFORM pg_temp.assert_true((SELECT status = 'terminated' FROM v_contract_status WHERE contract_id = contract), 'Hợp đồng chuyển chấm dứt');
  PERFORM pg_temp.assert_true((SELECT residence_status = 'former' FROM v_tenant_status WHERE tenant_id = tenant), 'Khách chuyển sang Đã trả phòng');
  PERFORM pg_temp.assert_true((SELECT occupancy_status = 'available' FROM v_room_status WHERE id = room), 'Phòng trở lại còn trống');
  PERFORM pg_temp.assert_true(EXISTS (SELECT 1 FROM v_public_rooms WHERE slug = 'p101'), 'Phòng trống lại hiện ở trang Thuê phòng');
  PERFORM pg_temp.expect_failure(format('INSERT INTO tenancies(room_id, representative_tenant_id, planned_move_in) VALUES (%L, %L, ''2026-01-15'')', room, tenant2), '23P01', 'Không chèn chồng lịch sử đợt thuê đã kết thúc');
  INSERT INTO tenancies(room_id, representative_tenant_id, planned_move_in) VALUES (room, tenant2, '2026-02-01');
  PERFORM pg_temp.assert_true(true, 'Ngày trả là biên mở: khách sau vào cùng ngày không chồng');

  -- ---------------------------------------------------------------- Khách đang ở nhập từ sổ cũ, chưa có hợp đồng (mục Đã thuê ở form phòng)
  INSERT INTO tenancies(id, room_id, representative_tenant_id, status, planned_move_in, actual_move_in, onboarding_mode)
  VALUES (import_stay, room2, resident, 'active', '2026-02-01', '2026-02-01', 'import');
  SET CONSTRAINTS ALL IMMEDIATE; SET CONSTRAINTS ALL DEFERRED;
  PERFORM pg_temp.assert_true((SELECT occupancy_status = 'occupied' FROM v_room_status WHERE id = room2), 'Khách nhập từ form phòng không cần hợp đồng giả');
  INSERT INTO invoices(id, tenancy_id, kind, billing_period_id, service_from, service_to, idempotency_key, created_by)
  VALUES (opening_invoice, import_stay, 'periodic', period_feb, '2026-02-01', '2026-03-01', gen_random_uuid(), u);
  INSERT INTO invoice_lines(invoice_id, line_no, charge_type_id, source_rate_id, description_snapshot, unit_snapshot, quantity, unit_price)
  VALUES (opening_invoice, 1, rent, rrent, 'Thuê', 'tháng', 1, 3000000);
  PERFORM pg_temp.expect_failure(format('UPDATE invoices SET status = ''issued'', code = ''X2'', issued_on = ''2026-03-01'', due_on = ''2026-03-08'', issued_at = now(), issued_by = %L WHERE id = %L', u, opening_invoice), '23514', 'Chưa có hợp đồng ký thì không phát hành hóa đơn tháng');

  -- Bổ sung hợp đồng thật đã hết hạn mà khách vẫn ở: hợp đồng không tự trả phòng.
  INSERT INTO contracts(id, tenancy_id, code, created_by) VALUES (contract2, import_stay, 'HD-' || contract2, u);
  INSERT INTO contract_versions(id, contract_id, version_no, effective_from, ends_on, required_deposit, invoice_day, due_after_days, proration_policy, terms_text)
  VALUES (version2, contract2, 1, '2026-02-01', '2026-03-01', 0, 1, 7, 'actual_days', 'Điều khoản thử');
  INSERT INTO contract_parties(contract_version_id, party_role, full_name_snapshot, address_snapshot) VALUES
    (version2, 'landlord', 'Chủ trọ', 'Địa chỉ chủ'), (version2, 'representative', 'Khách', 'Địa chỉ khách');
  INSERT INTO contract_files(contract_version_id, file_id, file_kind) VALUES (version2, file, 'signed');
  UPDATE contract_versions SET signed_at = now(), confirmed_by = u, signature_method = 'paper' WHERE id = version2;
  PERFORM pg_temp.assert_true((SELECT status = 'expired' AND still_occupied_after_expiry AND NOT expiring FROM v_contract_status WHERE contract_id = contract2), 'Hết hạn hợp đồng không tự trả phòng');
  PERFORM pg_temp.assert_true((SELECT occupancy_status = 'occupied' FROM v_room_status WHERE id = room2), 'Khách vẫn ở sau khi hợp đồng hết hạn');

  -- ---------------------------------------------------------------- Xóa phòng trống, nhật ký
  INSERT INTO meters(room_id, meter_kind, serial_number, installed_at) VALUES (empty_room, 'electricity', 'E-EMPTY', now());
  INSERT INTO charge_rates(room_id, charge_type_id, effective_from, unit_price, calculation_method) VALUES (empty_room, rent, '2026-01-01', 2000000, 'fixed');
  INSERT INTO room_listings(room_id, slug, title) VALUES (empty_room, 'p104', 'Phòng 104');
  INSERT INTO room_amenities(room_id, amenity_id) SELECT empty_room, id FROM amenities WHERE organization_id = org LIMIT 1;
  INSERT INTO room_status_events(room_id, new_status, reason, changed_by) VALUES (empty_room, 'maintenance', 'Sơn lại', u);
  DELETE FROM rooms WHERE id = empty_room;
  PERFORM pg_temp.assert_true(NOT EXISTS (SELECT 1 FROM meters WHERE room_id = empty_room), 'Xóa phòng chưa có lịch sử xóa luôn dữ liệu đi kèm');
  PERFORM pg_temp.expect_failure(format('INSERT INTO tenant_identity_documents(tenant_id, document_type, number_ciphertext, number_fingerprint, number_last4, front_file_id) VALUES (%L, ''cccd'', ''x'', ''fp'', ''1234'', %L)', tenant, public_file), '23514', 'Ảnh giấy tờ bắt buộc riêng tư');
  INSERT INTO email_outbox(organization_id, to_email, template_code, subject, body, dedupe_key) VALUES (org, 'a@example.com', 'invoice', 'Hóa đơn', 'Nội dung', 'invoice:1');
  PERFORM pg_temp.expect_failure(format('INSERT INTO email_outbox(organization_id, to_email, template_code, subject, body, dedupe_key) VALUES (%L, ''a@example.com'', ''invoice'', ''x'', ''x'', ''invoice:1'')', org), '23505', 'Không gửi trùng email cùng sự kiện');
  PERFORM pg_temp.assert_true((SELECT count(*) > 0 FROM audit_logs WHERE organization_id = org), 'Nhật ký tự động được ghi');
  PERFORM pg_temp.assert_true(EXISTS (SELECT 1 FROM audit_logs WHERE table_name = 'rooms' AND action = 'DELETE' AND record_key->>'id' = empty_room::text AND organization_id = org), 'Xóa phòng vẫn ghi nhật ký đúng đơn vị');
END $$;
SET CONSTRAINTS ALL IMMEDIATE;
SELECT count(*) AS passed_checks FROM test_results;
SELECT name AS passed FROM test_results ORDER BY name;
ROLLBACK;
