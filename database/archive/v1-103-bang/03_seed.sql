-- Chỉ danh mục hệ thống; không có mật khẩu, tài khoản demo hay thông tin địa giới cũ.
BEGIN;
SET LOCAL search_path = smartrent, public;
INSERT INTO payment_methods(code,name) VALUES
 ('cash','Tiền mặt'),('bank_transfer','Chuyển khoản'),('other','Khác') ON CONFLICT DO NOTHING;
INSERT INTO roles(id,name,normalized_name,concurrency_stamp)
VALUES ('00000000-0000-0000-0000-000000000001','SystemAdmin','SYSTEMADMIN',gen_random_uuid()::text)
ON CONFLICT DO NOTHING;
INSERT INTO permissions(code,description) VALUES
 ('properties.read','Xem cơ sở'),('properties.write','Tạo/sửa cơ sở'),
 ('rooms.read','Xem phòng'),('rooms.write','Quản lý phòng/giá/tin đăng'),
 ('inquiries.read','Xem yêu cầu thuê'),('inquiries.write','Xử lý yêu cầu/lịch xem/giữ chỗ'),
 ('tenants.read','Xem khách'),('tenants.write','Quản lý hồ sơ khách'),('tenants.identity.read','Xem giấy tờ riêng tư'),
 ('contracts.read','Xem hợp đồng'),('contracts.write','Soạn/gia hạn hợp đồng'),('contracts.sign','Xác nhận bản ký'),
 ('tenancies.checkin','Nhận phòng'),('tenancies.transfer','Chuyển phòng'),('tenancies.checkout','Trả phòng'),
 ('tenancies.close_with_debt','Đóng đợt thuê còn nợ'),
 ('meters.read','Xem công tơ/chỉ số'),('meters.write','Ghi/chỉnh chỉ số'),('meters.replace','Thay công tơ'),
 ('billing.read','Xem kỳ tính tiền'),('billing.lock','Khóa kỳ'),('billing.unlock','Mở khóa kỳ có lý do'),
 ('invoices.read','Xem hóa đơn'),('invoices.write','Lập hóa đơn nháp'),('invoices.issue','Phát hành hóa đơn'),
 ('invoices.adjust','Lập chứng từ điều chỉnh'),('invoices.void','Hủy hóa đơn'),
 ('payments.read','Xem thu tiền'),('payments.report','Báo thanh toán'),('payments.confirm','Xác nhận tiền thực thu'),
 ('payments.reverse','Đảo/hoàn tiền'),('payments.allocate','Phân bổ tiền'),
 ('deposits.read','Xem sổ cọc'),('deposits.receive','Thu/bổ sung cọc'),('deposits.refund','Hoàn cọc'),
 ('deposits.offset','Bù trừ cọc'),('deposits.transfer','Chuyển cọc giữa đợt thuê'),
 ('tickets.read','Xem ticket'),('tickets.write','Tạo/trao đổi ticket'),('tickets.assign','Phân công ticket'),
 ('tickets.close','Giải quyết/đóng/mở lại ticket'),('expenses.read','Xem chi phí'),('expenses.write','Ghi/đảo chi phí'),
 ('reports.read','Xem báo cáo'),('reports.export','Xuất dữ liệu đúng phạm vi'),
 ('members.read','Xem nhân sự'),('members.manage','Quản lý nhân sự/vai trò/phạm vi'),
 ('settings.manage','Quản lý cấu hình'),('audit.read','Xem nhật ký'),('ai.read','Hỏi AI trong phạm vi được phép'),
 ('integrations.manage','Cấu hình tích hợp') ON CONFLICT DO NOTHING;

-- Gọi một lần sau khi tạo organization và user chủ trọ bằng UserManager.
-- Hàm không tạo user, không gán SystemAdmin và không thay thế kiểm tra quyền ở API.
CREATE FUNCTION initialize_organization(p_organization uuid,p_owner uuid) RETURNS void LANGUAGE plpgsql
SET search_path = smartrent, pg_temp AS $$
DECLARE owner_role uuid; manager_role uuid; staff_role uuid; member uuid;
BEGIN
 INSERT INTO organization_settings(organization_id) VALUES(p_organization) ON CONFLICT DO NOTHING;
 INSERT INTO business_roles(organization_id,code,name) VALUES(p_organization,'owner','Chủ trọ')
   ON CONFLICT (organization_id,code) DO UPDATE SET name=excluded.name RETURNING id INTO owner_role;
 INSERT INTO business_roles(organization_id,code,name) VALUES(p_organization,'manager','Quản lý')
   ON CONFLICT (organization_id,code) DO UPDATE SET name=excluded.name RETURNING id INTO manager_role;
 INSERT INTO business_roles(organization_id,code,name) VALUES(p_organization,'staff','Nhân viên')
   ON CONFLICT (organization_id,code) DO UPDATE SET name=excluded.name RETURNING id INTO staff_role;
 INSERT INTO business_role_permissions SELECT owner_role,code FROM permissions ON CONFLICT DO NOTHING;
 INSERT INTO business_role_permissions SELECT manager_role,code FROM permissions
   WHERE code NOT IN ('members.manage','settings.manage','integrations.manage','payments.reverse','deposits.refund','billing.unlock') ON CONFLICT DO NOTHING;
 INSERT INTO business_role_permissions SELECT staff_role,code FROM permissions
   WHERE code IN ('properties.read','rooms.read','inquiries.read','inquiries.write','tenants.read','meters.read','meters.write',
     'billing.read','invoices.read','payments.read','payments.report','tickets.read','tickets.write') ON CONFLICT DO NOTHING;
 INSERT INTO organization_memberships(organization_id,user_id,property_scope) VALUES(p_organization,p_owner,'all')
   ON CONFLICT (organization_id,user_id) DO UPDATE SET status='active',property_scope='all' RETURNING id INTO member;
 INSERT INTO membership_roles(membership_id,role_id) VALUES(member,owner_role) ON CONFLICT DO NOTHING;
 INSERT INTO charge_types(organization_id,code,name,category,unit_label) VALUES
   (p_organization,'RENT','Tiền thuê','rent','tháng'),(p_organization,'ELECTRICITY','Điện','electricity','kWh'),
   (p_organization,'WATER','Nước','water','m³'),(p_organization,'SERVICE','Dịch vụ','service','phòng'),
   (p_organization,'INTERNET','Internet','service','phòng'),(p_organization,'GARBAGE','Rác','service','phòng'),
   (p_organization,'OTHER','Phí khác','other','lần'),(p_organization,'COMPENSATION','Bồi thường','compensation','lần') ON CONFLICT DO NOTHING;
 INSERT INTO ticket_categories(organization_id,code,name) VALUES
   (p_organization,'ELECTRICAL','Điện'),(p_organization,'PLUMBING','Nước'),(p_organization,'REPAIR','Sửa chữa'),
   (p_organization,'OTHER','Khác') ON CONFLICT DO NOTHING;
 INSERT INTO sla_policies(organization_id,priority,target_hours) VALUES
   (p_organization,'urgent',4),(p_organization,'high',12),(p_organization,'normal',48),(p_organization,'low',96) ON CONFLICT DO NOTHING;
 INSERT INTO expense_categories(organization_id,code,name) VALUES
   (p_organization,'REPAIR','Sửa chữa'),(p_organization,'UTILITY','Điện nước đầu vào'),
   (p_organization,'OPERATION','Vận hành'),(p_organization,'OTHER','Khác') ON CONFLICT DO NOTHING;
END $$;
COMMIT;
