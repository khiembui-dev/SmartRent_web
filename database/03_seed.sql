-- Danh mục hệ thống và hàm khởi tạo đơn vị. Không có mật khẩu, tài khoản mẫu hay dữ liệu giả.
BEGIN;
SET LOCAL search_path = smartrent, public;

INSERT INTO payment_methods(code, name) VALUES
  ('cash', 'Tiền mặt'), ('bank_transfer', 'Chuyển khoản'), ('other', 'Khác')
ON CONFLICT DO NOTHING;

INSERT INTO roles(id, name, normalized_name, concurrency_stamp)
VALUES ('00000000-0000-0000-0000-000000000001', 'SystemAdmin', 'SYSTEMADMIN', gen_random_uuid()::text)
ON CONFLICT DO NOTHING;

-- Đúng các mã quyền mà router và API của website đang kiểm tra.
INSERT INTO permissions(code, description) VALUES
  ('properties.read', 'Xem cơ sở'), ('properties.write', 'Tạo, sửa cơ sở'),
  ('rooms.read', 'Xem phòng'), ('rooms.write', 'Quản lý phòng, giá, tin đăng'),
  ('inquiries.read', 'Xem lịch xem phòng'), ('inquiries.write', 'Xử lý yêu cầu và xếp lịch xem phòng'),
  ('tenants.read', 'Xem khách'), ('tenants.write', 'Quản lý hồ sơ khách'), ('tenants.identity.read', 'Xem giấy tờ riêng tư'),
  ('contracts.read', 'Xem hợp đồng'), ('contracts.write', 'Soạn, gia hạn hợp đồng'), ('contracts.sign', 'Xác nhận bản ký'),
  ('tenancies.checkin', 'Tạo hợp đồng, nhận phòng'), ('tenancies.checkout', 'Trả phòng'),
  ('tenancies.close_with_debt', 'Đóng đợt thuê còn nợ'),
  ('meters.read', 'Xem chỉ số'), ('meters.write', 'Ghi, sửa chỉ số'),
  ('billing.read', 'Xem tính tiền phòng'), ('billing.lock', 'Khóa tháng'), ('billing.unlock', 'Mở khóa tháng có lý do'),
  ('invoices.read', 'Xem hóa đơn'), ('invoices.write', 'Lập hóa đơn nháp'), ('invoices.issue', 'Phát hành hóa đơn'),
  ('invoices.adjust', 'Lập chứng từ điều chỉnh'), ('invoices.void', 'Hủy hóa đơn'),
  ('payments.read', 'Xem thu tiền'), ('payments.report', 'Báo thanh toán'), ('payments.confirm', 'Xác nhận tiền thực thu'),
  ('payments.reverse', 'Đảo, hoàn tiền'), ('payments.allocate', 'Phân bổ tiền'),
  ('deposits.read', 'Xem cọc'), ('deposits.receive', 'Thu, bổ sung cọc'), ('deposits.refund', 'Hoàn cọc'), ('deposits.offset', 'Bù trừ cọc'),
  ('tickets.read', 'Xem ticket'), ('tickets.write', 'Tạo, trao đổi ticket'), ('tickets.assign', 'Phân công ticket'),
  ('tickets.close', 'Giải quyết, đóng, mở lại ticket'),
  ('reports.export', 'Xuất dữ liệu đúng phạm vi'),
  ('members.read', 'Xem nhân sự'), ('members.manage', 'Quản lý nhân sự, vai trò, phạm vi'),
  ('settings.manage', 'Quản lý cấu hình đơn vị')
ON CONFLICT DO NOTHING;

-- Gọi một lần sau khi tạo organization và tài khoản chủ trọ.
-- Hàm không tạo tài khoản, không gán SystemAdmin và không thay thế kiểm tra quyền ở API.
CREATE FUNCTION initialize_organization(p_organization uuid, p_owner uuid) RETURNS void LANGUAGE plpgsql
SET search_path = smartrent, public, pg_temp AS $$
DECLARE owner_role uuid; manager_role uuid; staff_role uuid; member uuid;
BEGIN
  INSERT INTO organization_settings(organization_id) VALUES (p_organization) ON CONFLICT DO NOTHING;

  INSERT INTO business_roles(organization_id, code, name, is_system) VALUES (p_organization, 'owner', 'Chủ trọ', true)
    ON CONFLICT (organization_id, code) DO UPDATE SET name = excluded.name RETURNING id INTO owner_role;
  INSERT INTO business_roles(organization_id, code, name, is_system) VALUES (p_organization, 'manager', 'Quản lý', true)
    ON CONFLICT (organization_id, code) DO UPDATE SET name = excluded.name RETURNING id INTO manager_role;
  INSERT INTO business_roles(organization_id, code, name, is_system) VALUES (p_organization, 'staff', 'Nhân viên', true)
    ON CONFLICT (organization_id, code) DO UPDATE SET name = excluded.name RETURNING id INTO staff_role;

  INSERT INTO business_role_permissions SELECT owner_role, code FROM permissions ON CONFLICT DO NOTHING;
  INSERT INTO business_role_permissions SELECT manager_role, code FROM permissions
    WHERE code NOT IN ('members.manage','settings.manage','payments.reverse','deposits.refund','billing.unlock') ON CONFLICT DO NOTHING;
  INSERT INTO business_role_permissions SELECT staff_role, code FROM permissions
    WHERE code IN ('properties.read','rooms.read','inquiries.read','inquiries.write','tenants.read','meters.read','meters.write',
                   'billing.read','invoices.read','payments.read','payments.report','tickets.read','tickets.write') ON CONFLICT DO NOTHING;

  INSERT INTO organization_memberships(organization_id, user_id, property_scope) VALUES (p_organization, p_owner, 'all')
    ON CONFLICT (organization_id, user_id) DO UPDATE SET status = 'active', property_scope = 'all' RETURNING id INTO member;
  INSERT INTO membership_roles(membership_id, role_id) VALUES (member, owner_role) ON CONFLICT DO NOTHING;

  INSERT INTO charge_types(organization_id, code, name, category, unit_label) VALUES
    (p_organization, 'RENT', 'Tiền thuê', 'rent', 'tháng'),
    (p_organization, 'ELECTRICITY', 'Điện', 'electricity', 'kWh'),
    (p_organization, 'WATER', 'Nước', 'water', 'm³'),
    (p_organization, 'SERVICE', 'Dịch vụ', 'service', 'phòng'),
    (p_organization, 'INTERNET', 'Internet', 'service', 'phòng'),
    (p_organization, 'GARBAGE', 'Rác', 'service', 'phòng'),
    (p_organization, 'OTHER', 'Phí khác', 'other', 'lần'),
    (p_organization, 'COMPENSATION', 'Bồi thường', 'compensation', 'lần'),
    (p_organization, 'OPENING_BALANCE', 'Số dư đầu kỳ', 'other', 'lần')
  ON CONFLICT DO NOTHING;

  INSERT INTO room_types(organization_id, code, name) VALUES
    (p_organization, 'STANDARD', 'Phòng tiêu chuẩn'),
    (p_organization, 'SINGLE', 'Phòng đơn'),
    (p_organization, 'LOFT', 'Phòng có gác'),
    (p_organization, 'FAMILY', 'Căn hộ mini')
  ON CONFLICT DO NOTHING;

  INSERT INTO amenities(organization_id, code, name, icon)
  SELECT p_organization, a.code, a.name, a.icon FROM (VALUES
    ('AC', 'Máy lạnh', 'snow'), ('HEATER', 'Nóng lạnh', 'thermometer-sun'), ('WC', 'WC riêng', 'droplet'),
    ('LOFT', 'Gác lửng', 'ladder'), ('WINDOW', 'Cửa sổ thoáng', 'window'), ('BALCONY', 'Ban công', 'flower1'),
    ('KITCHEN', 'Bếp riêng', 'fire'), ('WASHER', 'Máy giặt chung', 'basket'), ('PARKING', 'Chỗ để xe', 'bicycle'),
    ('WIFI', 'Wi-Fi', 'wifi'), ('CAMERA', 'Camera an ninh', 'camera-video'), ('FREE_HOURS', 'Giờ giấc tự do', 'clock'),
    ('ELEVATOR', 'Thang máy', 'building-up'), ('FURNITURE', 'Nội thất cơ bản', 'lamp')
  ) a(code, name, icon) ON CONFLICT DO NOTHING;

  INSERT INTO ticket_categories(organization_id, code, name) VALUES
    (p_organization, 'ELECTRICAL', 'Điện'), (p_organization, 'PLUMBING', 'Nước'),
    (p_organization, 'REPAIR', 'Sửa chữa'), (p_organization, 'OTHER', 'Khác')
  ON CONFLICT DO NOTHING;

  INSERT INTO sla_policies(organization_id, priority, target_hours) VALUES
    (p_organization, 'urgent', 4), (p_organization, 'high', 12),
    (p_organization, 'normal', 48), (p_organization, 'low', 96)
  ON CONFLICT DO NOTHING;
END $$;
COMMIT;
