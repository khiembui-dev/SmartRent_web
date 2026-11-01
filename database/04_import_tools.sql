-- Công cụ nhập dữ liệu thật bằng SQL: gọi theo mã dễ hiểu thay vì UUID, tự tạo các dòng đi kèm
-- và đi qua toàn bộ ràng buộc như dữ liệu từ website. Xem cách dùng ở 05_du_lieu_thuc.sql.
-- Không có hàm nào nhận mật khẩu: tài khoản tạo ở đây đăng nhập lần đầu bằng chức năng Quên mật khẩu.
BEGIN;
SET LOCAL search_path = smartrent, public;

CREATE FUNCTION import_organization_id(p_org text) RETURNS uuid LANGUAGE plpgsql STABLE AS $$
DECLARE result uuid;
BEGIN
  SELECT id INTO result FROM smartrent.organizations WHERE code = p_org;
  IF result IS NULL THEN RAISE EXCEPTION 'Không có đơn vị mã %', p_org USING ERRCODE = '23503'; END IF;
  RETURN result;
END $$;

-- Người được ghi là đã thực hiện: chủ trọ của đơn vị.
CREATE FUNCTION import_actor(p_org text) RETURNS uuid LANGUAGE plpgsql STABLE AS $$
DECLARE result uuid;
BEGIN
  SELECT m.user_id INTO result
  FROM smartrent.organization_memberships m
  JOIN smartrent.membership_roles mr ON mr.membership_id = m.id
  JOIN smartrent.business_roles b ON b.id = mr.role_id
  WHERE m.organization_id = smartrent.import_organization_id(p_org) AND b.code = 'owner' AND m.status = 'active'
  ORDER BY m.joined_at LIMIT 1;
  IF result IS NULL THEN RAISE EXCEPTION 'Đơn vị % chưa có chủ trọ', p_org USING ERRCODE = '23503'; END IF;
  RETURN result;
END $$;

CREATE FUNCTION import_room_id(p_org text, p_property text, p_room text) RETURNS uuid LANGUAGE plpgsql STABLE AS $$
DECLARE result uuid;
BEGIN
  SELECT r.id INTO result FROM smartrent.rooms r JOIN smartrent.properties p ON p.id = r.property_id
  WHERE p.organization_id = smartrent.import_organization_id(p_org) AND p.code = p_property AND r.code = p_room;
  IF result IS NULL THEN RAISE EXCEPTION 'Không có phòng % ở cơ sở %', p_room, p_property USING ERRCODE = '23503'; END IF;
  RETURN result;
END $$;

CREATE FUNCTION import_tenant_id(p_org text, p_tenant text) RETURNS uuid LANGUAGE plpgsql STABLE AS $$
DECLARE result uuid;
BEGIN
  SELECT id INTO result FROM smartrent.tenants
  WHERE organization_id = smartrent.import_organization_id(p_org) AND code = p_tenant;
  IF result IS NULL THEN RAISE EXCEPTION 'Không có khách mã %', p_tenant USING ERRCODE = '23503'; END IF;
  RETURN result;
END $$;

CREATE FUNCTION import_active_tenancy(p_org text, p_property text, p_room text) RETURNS uuid LANGUAGE plpgsql STABLE AS $$
DECLARE result uuid;
BEGIN
  SELECT id INTO result FROM smartrent.tenancies
  WHERE room_id = smartrent.import_room_id(p_org, p_property, p_room) AND status = 'active';
  IF result IS NULL THEN RAISE EXCEPTION 'Phòng % chưa có khách đang ở', p_room USING ERRCODE = '23503'; END IF;
  RETURN result;
END $$;

CREATE FUNCTION import_charge_type(p_organization uuid, p_code text) RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT id FROM smartrent.charge_types WHERE organization_id = p_organization AND code = p_code
$$;

CREATE FUNCTION import_slug(p_text text) RETURNS text LANGUAGE sql IMMUTABLE AS $$
  SELECT trim(both '-' FROM regexp_replace(smartrent.normalize_text(p_text), '[^a-z0-9]+', '-', 'g'))
$$;

-- Tạo đơn vị và tài khoản chủ trọ, rồi khởi tạo quyền, khoản thu, loại phòng, tiện ích, SLA.
CREATE FUNCTION import_organization(
  p_code text, p_name text, p_owner_email text, p_owner_name text, p_owner_phone text,
  p_legal_name text DEFAULT NULL, p_tax_code text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SET search_path = smartrent, public, pg_temp AS $$
DECLARE org uuid; owner uuid;
BEGIN
  SELECT id INTO owner FROM users WHERE normalized_email = upper(p_owner_email);
  IF owner IS NULL THEN
    INSERT INTO users(user_name, normalized_user_name, email, normalized_email, email_confirmed, security_stamp,
                      concurrency_stamp, phone_number, display_name)
    VALUES (p_owner_email, upper(p_owner_email), p_owner_email, upper(p_owner_email), true, gen_random_uuid()::text,
            gen_random_uuid()::text, p_owner_phone, p_owner_name)
    RETURNING id INTO owner;
  END IF;
  INSERT INTO organizations(code, name, legal_name, tax_code, phone, email)
  VALUES (p_code, p_name, p_legal_name, p_tax_code, p_owner_phone, p_owner_email) RETURNING id INTO org;
  PERFORM initialize_organization(org, owner);
  RETURN org;
END $$;

CREATE FUNCTION import_bank_account(p_org text, p_bank_name text, p_account_number text, p_account_holder text, p_is_default boolean DEFAULT true)
RETURNS uuid LANGUAGE sql AS $$
  INSERT INTO smartrent.bank_accounts(organization_id, bank_name, account_number, account_holder, is_default)
  VALUES (smartrent.import_organization_id(p_org), p_bank_name, p_account_number, p_account_holder, p_is_default)
  RETURNING id
$$;

-- Thêm một dòng giá cơ sở. Giá NULL nghĩa là khoản này không áp dụng; giá 0 là miễn phí và vẫn được ghi.
CREATE FUNCTION import_property_rate(p_organization uuid, p_property uuid, p_code text, p_price numeric, p_from date, p_method text)
RETURNS void LANGUAGE plpgsql SET search_path = smartrent, public, pg_temp AS $$
BEGIN
  IF p_price IS NULL THEN RETURN; END IF;
  INSERT INTO charge_rates(property_id, charge_type_id, effective_from, unit_price, calculation_method, billing_cycle, proration_mode)
  VALUES (p_property, import_charge_type(p_organization, p_code), p_from, p_price, p_method, 'monthly', 'full_period');
END $$;

CREATE FUNCTION import_property(
  p_org text, p_code text, p_name text, p_address_line text, p_locality text, p_province text,
  p_electricity numeric, p_water numeric,
  p_garbage numeric DEFAULT NULL, p_service numeric DEFAULT NULL, p_internet numeric DEFAULT NULL,
  p_effective_from date DEFAULT NULL, p_invoice_day integer DEFAULT 28, p_due_after_days integer DEFAULT 7,
  p_contact_name text DEFAULT NULL, p_phone text DEFAULT NULL, p_email text DEFAULT NULL, p_description text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SET search_path = smartrent, public, pg_temp AS $$
DECLARE org uuid := import_organization_id(p_org); property uuid; rate_from date := coalesce(p_effective_from, vn_today());
BEGIN
  INSERT INTO properties(organization_id, code, name, address_line, locality, province, invoice_day, due_after_days,
                         contact_name, phone, email, description)
  VALUES (org, p_code, p_name, p_address_line, p_locality, p_province, p_invoice_day, p_due_after_days,
          p_contact_name, p_phone, p_email, p_description)
  RETURNING id INTO property;
  PERFORM import_property_rate(org, property, 'ELECTRICITY', p_electricity, rate_from, 'metered');
  PERFORM import_property_rate(org, property, 'WATER', p_water, rate_from, 'metered');
  PERFORM import_property_rate(org, property, 'GARBAGE', p_garbage, rate_from, 'fixed');
  PERFORM import_property_rate(org, property, 'SERVICE', p_service, rate_from, 'fixed');
  PERFORM import_property_rate(org, property, 'INTERNET', p_internet, rate_from, 'fixed');
  RETURN property;
END $$;

-- Tạo phòng kèm giá thuê, hai công tơ, tiện ích và tin đăng. Giống hệt khi thêm phòng trên website.
CREATE FUNCTION import_room(
  p_org text, p_property text, p_code text, p_area_m2 numeric, p_capacity integer, p_rent numeric,
  p_deposit numeric DEFAULT NULL, p_floor text DEFAULT NULL, p_name text DEFAULT NULL, p_description text DEFAULT NULL,
  p_rules text DEFAULT NULL, p_room_type text DEFAULT 'STANDARD', p_amenities text[] DEFAULT '{}',
  p_status text DEFAULT 'available', p_publish boolean DEFAULT true, p_effective_from date DEFAULT NULL,
  p_meters_installed_on date DEFAULT DATE '2000-01-01'
) RETURNS uuid LANGUAGE plpgsql SET search_path = smartrent, public, pg_temp AS $$
DECLARE
  org uuid := import_organization_id(p_org); property properties%ROWTYPE; room uuid; room_type uuid; amenity text; amenity_id uuid;
  title text;
BEGIN
  SELECT * INTO property FROM properties WHERE organization_id = org AND code = p_property;
  IF property.id IS NULL THEN RAISE EXCEPTION 'Không có cơ sở %', p_property USING ERRCODE = '23503'; END IF;
  SELECT id INTO room_type FROM room_types WHERE organization_id = org AND code = p_room_type;
  IF room_type IS NULL THEN RAISE EXCEPTION 'Không có loại phòng %', p_room_type USING ERRCODE = '23503'; END IF;

  INSERT INTO rooms(property_id, room_type_id, code, name, floor_label, area_m2, capacity, description, rules_text,
                    required_deposit, operating_status)
  VALUES (property.id, room_type, p_code, coalesce(p_name, 'Phòng ' || p_code), p_floor, p_area_m2, p_capacity,
          p_description, p_rules, coalesce(p_deposit, p_rent), p_status)
  RETURNING id INTO room;

  INSERT INTO charge_rates(room_id, charge_type_id, effective_from, unit_price, calculation_method, billing_cycle, proration_mode)
  VALUES (room, import_charge_type(org, 'RENT'), coalesce(p_effective_from, vn_today()), p_rent, 'fixed', 'monthly', 'actual_days');

  INSERT INTO meters(room_id, meter_kind, serial_number, installed_at) VALUES
    (room, 'electricity', 'DT-' || property.code || p_code || '-01', p_meters_installed_on::timestamptz),
    (room, 'water', 'DN-' || property.code || p_code || '-01', p_meters_installed_on::timestamptz);

  FOREACH amenity IN ARRAY p_amenities LOOP
    SELECT id INTO amenity_id FROM amenities WHERE organization_id = org AND (code = amenity OR normalize_text(name) = normalize_text(amenity));
    IF amenity_id IS NULL THEN
      INSERT INTO amenities(organization_id, code, name)
      VALUES (org, upper(replace(import_slug(amenity), '-', '_')), amenity) RETURNING id INTO amenity_id;
    END IF;
    INSERT INTO room_amenities(room_id, amenity_id) VALUES (room, amenity_id) ON CONFLICT DO NOTHING;
  END LOOP;

  title := coalesce(p_name, 'Phòng ' || p_code) || ' ' || p_area_m2::numeric(8,0) || ' m² – ' || property.locality;
  INSERT INTO room_listings(room_id, slug, title, description, status, published_at)
  VALUES (room, import_slug(p_org || '-' || property.code || '-' || p_code), title, p_description,
          CASE WHEN p_publish THEN 'published' ELSE 'draft' END, CASE WHEN p_publish THEN now() END);
  RETURN room;
END $$;

-- Gắn ảnh phòng đã có sẵn trên kho tệp hoặc thư mục public. Ảnh đầu tiên của phòng tự thành ảnh bìa.
CREATE FUNCTION import_room_image(p_org text, p_property text, p_room text, p_url text, p_caption text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SET search_path = smartrent, public, pg_temp AS $$
DECLARE org uuid := import_organization_id(p_org); room uuid := import_room_id(p_org, p_property, p_room); file uuid; position integer;
BEGIN
  INSERT INTO stored_files(organization_id, storage_key, original_name, content_type, purpose, visibility, scan_status, uploaded_by)
  VALUES (org, p_url, regexp_replace(p_url, '^.*/', ''), 'image/jpeg', 'room_image', 'public', 'clean', import_actor(p_org))
  RETURNING id INTO file;
  SELECT count(*) INTO position FROM room_images WHERE room_id = room;
  INSERT INTO room_images(room_id, file_id, sort_order, is_cover, caption) VALUES (room, file, position + 1, position = 0, p_caption);
  RETURN file;
END $$;

CREATE FUNCTION import_tenant(
  p_org text, p_code text, p_full_name text, p_phone text, p_email text DEFAULT NULL, p_date_of_birth date DEFAULT NULL,
  p_address_line text DEFAULT NULL, p_emergency_name text DEFAULT NULL, p_emergency_phone text DEFAULT NULL, p_notes text DEFAULT NULL
) RETURNS uuid LANGUAGE sql AS $$
  INSERT INTO smartrent.tenants(organization_id, code, full_name, phone, email, date_of_birth, address_line,
                                emergency_contact_name, emergency_contact_phone, notes)
  VALUES (smartrent.import_organization_id(p_org), p_code, p_full_name, p_phone, p_email, p_date_of_birth, p_address_line,
          p_emergency_name, p_emergency_phone, p_notes)
  RETURNING id
$$;

-- Số giấy tờ được mã hóa bằng khóa đặt trong phiên: SELECT set_config('smartrent.identity_key', 'khóa của bạn', false);
-- Không có khóa thì hàm từ chối, không bao giờ lưu số dạng rõ. Khóa này phải trùng với khóa backend dùng để giải mã.
CREATE FUNCTION import_identity_document(
  p_org text, p_tenant text, p_number text, p_type text DEFAULT 'cccd',
  p_issued_on date DEFAULT NULL, p_issuing_authority text DEFAULT NULL, p_expires_on date DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SET search_path = smartrent, public, pg_temp AS $$
DECLARE secret text := nullif(current_setting('smartrent.identity_key', true), ''); result uuid;
BEGIN
  IF secret IS NULL THEN
    RAISE EXCEPTION 'Chưa đặt smartrent.identity_key; không lưu số giấy tờ dạng rõ' USING ERRCODE = '23514';
  END IF;
  INSERT INTO tenant_identity_documents(tenant_id, document_type, number_ciphertext, number_fingerprint, number_last4,
                                        issued_on, issuing_authority, expires_on, verified_by, verified_at)
  VALUES (import_tenant_id(p_org, p_tenant), p_type, pgp_sym_encrypt(p_number, secret),
          encode(hmac(p_number, secret, 'sha256'), 'hex'), right(p_number, 4),
          p_issued_on, p_issuing_authority, p_expires_on, import_actor(p_org), now())
  RETURNING id INTO result;
  RETURN result;
END $$;

-- Khách đang ở từ trước khi dùng hệ thống: tạo đợt thuê import, số điện nước đầu và tiền cọc đã nhận.
CREATE FUNCTION import_tenancy(
  p_org text, p_property text, p_room text, p_tenant text, p_move_in date,
  p_electricity_start numeric, p_water_start numeric,
  p_deposit_held numeric DEFAULT 0, p_deposit_method text DEFAULT 'cash', p_notes text DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SET search_path = smartrent, public, pg_temp AS $$
DECLARE
  org uuid := import_organization_id(p_org); actor uuid := import_actor(p_org); room uuid := import_room_id(p_org, p_property, p_room);
  tenant uuid := import_tenant_id(p_org, p_tenant); property uuid; tenancy uuid; payment uuid; meter record;
  observed timestamptz := (p_move_in::timestamp + time '08:00') AT TIME ZONE 'Asia/Ho_Chi_Minh';
BEGIN
  SELECT property_id INTO property FROM rooms WHERE id = room;
  INSERT INTO tenancies(room_id, representative_tenant_id, status, planned_move_in, actual_move_in, onboarding_mode, created_by)
  VALUES (room, tenant, 'active', p_move_in, p_move_in, 'import', actor) RETURNING id INTO tenancy;

  FOR meter IN SELECT id, meter_kind FROM meters WHERE room_id = room AND removed_at IS NULL LOOP
    INSERT INTO meter_readings(meter_id, observed_at, reading_value, tenancy_id, reading_kind, notes, recorded_by)
    VALUES (meter.id, observed, CASE meter.meter_kind WHEN 'electricity' THEN p_electricity_start ELSE p_water_start END,
            tenancy, 'baseline', p_notes, actor);
  END LOOP;

  IF coalesce(p_deposit_held, 0) > 0 THEN
    INSERT INTO payments(code, tenant_id, property_id, amount, received_at, method_code, status, confirmed_by, confirmed_at,
                         reported_by, notes, idempotency_key)
    VALUES ('PT-NHAP-' || lpad(next_document_no(org, 'payment_import')::text, 5, '0'), tenant, property, p_deposit_held,
            observed, p_deposit_method, 'confirmed', actor, now(), actor, 'Tiền cọc chuyển từ sổ cũ', gen_random_uuid())
    RETURNING id INTO payment;
    INSERT INTO deposit_entries(tenancy_id, payment_id, kind, amount, occurred_at, reason, confirmed_by, idempotency_key)
    VALUES (tenancy, payment, 'receipt', p_deposit_held, observed, 'Tiền cọc chuyển từ sổ cũ', actor, gen_random_uuid());
  END IF;
  RETURN tenancy;
END $$;

CREATE FUNCTION import_resident(p_org text, p_property text, p_room text, p_tenant text, p_joined_on date, p_relationship text DEFAULT NULL)
RETURNS uuid LANGUAGE sql AS $$
  INSERT INTO smartrent.tenancy_residents(tenancy_id, tenant_id, joined_on, relationship)
  VALUES (smartrent.import_active_tenancy(p_org, p_property, p_room), smartrent.import_tenant_id(p_org, p_tenant), p_joined_on, p_relationship)
  RETURNING id
$$;

-- Hợp đồng giấy đã ký của khách đang ở. p_signed_file là đường dẫn bản scan trên kho tệp.
-- Có hợp đồng thì phòng mới lập được hóa đơn tháng, đúng quy tắc của website.
CREATE FUNCTION import_contract(
  p_org text, p_property text, p_room text, p_code text, p_starts_on date, p_last_day date,
  p_rent numeric, p_required_deposit numeric, p_signed_file text,
  p_terms text DEFAULT 'Theo hợp đồng giấy đã ký.', p_signed_on date DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql SET search_path = smartrent, public, pg_temp AS $$
DECLARE
  org uuid := import_organization_id(p_org); actor uuid := import_actor(p_org);
  tenancy tenancies%ROWTYPE; property properties%ROWTYPE; tenant tenants%ROWTYPE; contract uuid; version uuid; file uuid;
  landlord text;
BEGIN
  SELECT * INTO tenancy FROM tenancies WHERE id = import_active_tenancy(p_org, p_property, p_room);
  SELECT p.* INTO property FROM properties p JOIN rooms r ON r.property_id = p.id WHERE r.id = tenancy.room_id;
  SELECT * INTO tenant FROM tenants WHERE id = tenancy.representative_tenant_id;
  SELECT coalesce(legal_name, name) INTO landlord FROM organizations WHERE id = org;

  INSERT INTO contracts(tenancy_id, code, created_by) VALUES (tenancy.id, p_code, actor) RETURNING id INTO contract;
  INSERT INTO contract_versions(contract_id, version_no, effective_from, ends_on, required_deposit, invoice_day, due_after_days,
                                proration_policy, terms_text, change_reason)
  VALUES (contract, 1, p_starts_on, p_last_day + 1, p_required_deposit, property.invoice_day, property.due_after_days,
          property.proration_policy, p_terms, 'Nhập từ hợp đồng giấy')
  RETURNING id INTO version;
  INSERT INTO contract_parties(contract_version_id, party_role, full_name_snapshot, address_snapshot, tenant_id) VALUES
    (version, 'landlord', landlord, property.address_line || ', ' || property.locality || ', ' || property.province, NULL),
    (version, 'representative', tenant.full_name, coalesce(tenant.address_line, 'Chưa ghi'), tenant.id);
  INSERT INTO stored_files(organization_id, storage_key, original_name, content_type, purpose, visibility, scan_status, uploaded_by)
  VALUES (org, p_signed_file, regexp_replace(p_signed_file, '^.*/', ''), 'application/pdf', 'contract_signed', 'private', 'clean', actor)
  RETURNING id INTO file;
  INSERT INTO contract_files(contract_version_id, file_id, file_kind) VALUES (version, file, 'signed');
  INSERT INTO charge_rates(contract_version_id, charge_type_id, effective_from, unit_price, calculation_method, billing_cycle, proration_mode)
  VALUES (version, import_charge_type(org, 'RENT'), p_starts_on, p_rent, 'fixed', 'monthly', 'actual_days');
  UPDATE contract_versions
  SET signed_at = (coalesce(p_signed_on, p_starts_on)::timestamp + time '08:00') AT TIME ZONE 'Asia/Ho_Chi_Minh',
      confirmed_by = actor, signature_method = 'paper'
  WHERE id = version;
  RETURN contract;
END $$;

-- Nợ cũ từ sổ tay. Tạo chứng từ riêng để nợ hiện đúng ở hóa đơn, công nợ khách và tổng quan.
CREATE FUNCTION import_opening_balance(
  p_org text, p_property text, p_room text, p_amount numeric, p_due_on date,
  p_description text DEFAULT 'Số dư nợ chuyển từ sổ cũ'
) RETURNS uuid LANGUAGE plpgsql SET search_path = smartrent, public, pg_temp AS $$
DECLARE
  org uuid := import_organization_id(p_org); actor uuid := import_actor(p_org);
  tenancy uuid := import_active_tenancy(p_org, p_property, p_room); invoice uuid; today date := vn_today();
BEGIN
  IF p_amount <= 0 THEN RAISE EXCEPTION 'Số dư đầu kỳ phải lớn hơn 0' USING ERRCODE = '23514'; END IF;
  INSERT INTO invoices(tenancy_id, kind, service_from, service_to, notes, idempotency_key, created_by)
  VALUES (tenancy, 'opening_balance', today, today + 1, p_description, gen_random_uuid(), actor) RETURNING id INTO invoice;
  INSERT INTO invoice_lines(invoice_id, line_no, charge_type_id, source_scope, description_snapshot, unit_snapshot, quantity, unit_price)
  VALUES (invoice, 1, import_charge_type(org, 'OPENING_BALANCE'), 'manual', p_description, 'lần', 1, p_amount);
  UPDATE invoices
  SET status = 'issued', code = 'DK-' || p_org || '-' || lpad(next_document_no(org, 'opening_balance')::text, 4, '0'),
      issued_on = least(today, p_due_on), due_on = p_due_on, issued_at = now(), issued_by = actor
  WHERE id = invoice;
  RETURN invoice;
END $$;
COMMIT;
