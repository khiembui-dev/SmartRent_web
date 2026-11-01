-- MẪU NHẬP DỮ LIỆU THẬT. Sửa các giá trị bên dưới thành dữ liệu thật rồi chạy một lần:
--   psql -X -d smartrent -v ON_ERROR_STOP=1 -f database/05_du_lieu_thuc.sql
--
-- Cả file là một giao dịch: một dòng sai thì không có gì được ghi, sửa xong chạy lại từ đầu.
-- Tên và số dưới đây chỉ để minh họa, không phải người thật. Mã (NHATRO, CS1, 101, KH001...) tự đặt, miễn không trùng.
BEGIN;
SET LOCAL search_path = smartrent, public;

-- 1. Đơn vị và chủ trọ. Tài khoản chưa có mật khẩu: đăng nhập lần đầu bằng chức năng Quên mật khẩu.
SELECT import_organization(
  p_code        => 'NHATRO',
  p_name        => 'Nhà trọ Mẫu',
  p_owner_email => 'chutro@example.com',
  p_owner_name  => 'Tên Chủ Trọ',
  p_owner_phone => '0900000000'
);

-- 2. Tài khoản ngân hàng hiện ở trang thanh toán của khách.
SELECT import_bank_account('NHATRO', 'Tên ngân hàng', '0000000000', 'TEN CHU TAI KHOAN');

-- 3. Cơ sở và bảng giá. Giá 0 là miễn phí; bỏ tham số là khoản đó không thu.
SELECT import_property(
  p_org            => 'NHATRO',
  p_code           => 'CS1',
  p_name           => 'Nhà trọ Mẫu cơ sở 1',
  p_address_line   => 'Số nhà, tên đường',
  p_locality       => 'Phường, quận',
  p_province       => 'TP. Hồ Chí Minh',
  p_electricity    => 3500,
  p_water          => 20000,
  p_garbage        => 20000,
  p_service        => 100000,
  p_internet       => 0,
  p_effective_from => DATE '2026-01-01',
  p_invoice_day    => 28,
  p_due_after_days => 7
);

-- 4. Phòng. Mỗi phòng tự có giá thuê, hai công tơ và tin đăng ở trang Thuê phòng.
SELECT import_room(p_org => 'NHATRO', p_property => 'CS1', p_code => '101', p_area_m2 => 18, p_capacity => 2, p_rent => 3000000,
                   p_floor => 'Tầng 1', p_amenities => ARRAY['Máy lạnh', 'WC riêng', 'Wi-Fi'], p_effective_from => DATE '2026-01-01');
SELECT import_room(p_org => 'NHATRO', p_property => 'CS1', p_code => '102', p_area_m2 => 20, p_capacity => 2, p_rent => 3300000,
                   p_floor => 'Tầng 1', p_room_type => 'SINGLE', p_amenities => ARRAY['Máy lạnh', 'Ban công', 'Wi-Fi'], p_effective_from => DATE '2026-01-01');
SELECT import_room(p_org => 'NHATRO', p_property => 'CS1', p_code => '201', p_area_m2 => 24, p_capacity => 3, p_rent => 3800000,
                   p_floor => 'Tầng 2', p_room_type => 'LOFT', p_amenities => ARRAY['Gác lửng', 'WC riêng', 'Máy lạnh'], p_effective_from => DATE '2026-01-01');

-- Ảnh phòng: đường dẫn tới ảnh đã có. Ảnh đầu tiên thành ảnh bìa.
SELECT import_room_image('NHATRO', 'CS1', '101', '/images/rooms/studio-bright.jpg', 'Không gian phòng');

-- 5. Khách.
SELECT import_tenant('NHATRO', 'KH001', 'Tên Khách Đại Diện', '0900000001', 'khach1@example.com');
SELECT import_tenant('NHATRO', 'KH002', 'Tên Người Ở Cùng', '0900000002');

-- 6. Khách đang ở: ngày vào, số điện nước ở lần chốt gần nhất, tiền cọc đang giữ.
SELECT import_tenancy(
  p_org               => 'NHATRO',
  p_property          => 'CS1',
  p_room              => '101',
  p_tenant            => 'KH001',
  p_move_in           => DATE '2026-03-01',
  p_electricity_start => 1250,
  p_water_start       => 86,
  p_deposit_held      => 3000000
);
SELECT import_resident('NHATRO', 'CS1', '101', 'KH002', DATE '2026-03-01', 'Bạn cùng phòng');

-- 7. Hợp đồng đã ký. Bắt buộc có bản scan thì phòng mới lập được hóa đơn tháng.
SELECT import_contract(
  p_org              => 'NHATRO',
  p_property         => 'CS1',
  p_room             => '101',
  p_code             => 'HD-NHATRO-0001',
  p_starts_on        => DATE '2026-03-01',
  p_last_day         => DATE '2027-02-28',
  p_rent             => 3000000,
  p_required_deposit => 3000000,
  p_signed_file      => 'contracts/HD-NHATRO-0001.pdf'
);

-- 8. Nợ cũ từ sổ tay, nếu có.
SELECT import_opening_balance('NHATRO', 'CS1', '101', 500000, DATE '2026-11-05', 'Tiền phòng tháng 10 còn thiếu theo sổ cũ');

-- 9. Giấy tờ tùy thân là tùy chọn. Bỏ ghi chú 2 dòng dưới và đặt khóa riêng; số giấy tờ được mã hóa, không lưu dạng rõ.
-- SELECT set_config('smartrent.identity_key', 'KHOA_BI_MAT', true);
-- SELECT import_identity_document('NHATRO', 'KH001', '001000000000', 'cccd', DATE '2022-01-01', 'Cục Cảnh sát QLHC về TTXH');

COMMIT;

-- Kiểm tra nhanh sau khi nhập.
SELECT p.code AS co_so, r.code AS phong, s.occupancy_status AS trang_thai, t.full_name AS khach
FROM smartrent.v_room_status s
JOIN smartrent.rooms r ON r.id = s.id
JOIN smartrent.properties p ON p.id = r.property_id
LEFT JOIN smartrent.tenants t ON t.id = s.active_tenant_id
ORDER BY p.code, r.code;
