"""Mapping giao diện hiện tại sang baseline 13 bảng; danh sách con dùng JSONB."""
FEATURES = {
 'auth': [
  ('Đăng nhập riêng admin/khách; chỉ 1 admin; đăng ký luôn là user', 'users.role users.email users.password_hash users.is_active users.id users.login_enabled'),
  ('Đăng xuất, đổi mật khẩu và hủy phiên cũ', 'users.security_stamp auth_tokens.kind auth_tokens.token_hash auth_tokens.revoked_at'),
  ('Quên/đặt lại mật khẩu, lời mời khách tạo tài khoản', 'auth_tokens.kind auth_tokens.expires_at auth_tokens.consumed_at'),
 ],
 'public': [
  ('Trang chủ, lọc phòng theo cơ sở/giá/diện tích/tiện nghi/trạng thái', 'properties.province rooms.area_m2 rooms.room_type_code rooms.listing_status rooms.rates properties.rates rooms.amenities'),
  ('Chi tiết phòng, bộ ảnh, ảnh bìa, video, nội quy, địa chỉ/bản đồ', 'rooms.listing_slug rooms.listing_description rooms.video_url rooms.rules_text rooms.images files.storage_key properties.address_line'),
  ('Giá thuê/điện/nước/phí dịch vụ/cọc trên phòng và trang chủ', 'rooms.rates properties.rates rooms.required_deposit'),
  ('Liên hệ và chân trang lấy điện thoại/email mới của admin', 'users.display_name users.phone users.email settings.business_name properties.name'),
 ],
 'properties': [
  ('Thêm/sửa cơ sở, địa chỉ, tìm kiếm', 'properties.code properties.name properties.address_line properties.locality properties.province'),
  ('Giá cơ sở có lịch sử, lưu JSONB, phòng kế thừa; giá 0 khác chưa đặt', 'rooms.rates properties.rates'),
  ('Ngừng/kích hoạt, xóa khi chưa có phòng', 'properties.is_active properties.inactive_reason rooms.property_id'),
 ],
 'rooms': [
  ('Thêm/sửa phòng, diện tích, sức chứa, tầng, giá và cọc', 'rooms.property_id rooms.code rooms.name rooms.area_m2 rooms.capacity rooms.floor_label rooms.required_deposit rooms.rates properties.rates'),
  ('Tiện ích: chọn/bỏ chọn và thêm tiện ích mới', 'properties.amenity_options rooms.amenities'),
  ('Tải/xóa ảnh, chọn ảnh bìa, thứ tự ảnh', 'files.visibility files.purpose rooms.images'),
  ('Đăng/ẩn tin và URL công khai', 'rooms.listing_status rooms.listing_slug rooms.published_at'),
  ('Trạng thái khai thác; lịch sử lý do; không đặt occupied bằng tay', 'rooms.operating_status rooms.status_reason contracts.status rooms.status_history'),
  ('Nhập phòng đã có khách, thiếu hợp đồng; bổ sung hợp đồng/gỡ nhập nhầm', 'contracts.onboarding_mode contracts.onboarding_gaps contracts.move_in_on contracts.status contracts.id contracts.initial_readings'),
  ('Hiển thị/hủy giữ chỗ; không tạo đợt thuê trùng thời gian', 'bookings.room_id bookings.hold_from bookings.hold_to bookings.hold_expires_at bookings.hold_reason contracts.booking_id'),
  ('Xem khách hiện tại, hợp đồng, ticket của phòng', 'contracts.user_id contracts.id tickets.room_id'),
 ],
 'viewings': [
  ('Khách đăng nhập gửi giờ muốn xem, số người và ghi chú; chưa giữ phòng', 'bookings.user_id bookings.room_id bookings.preferred_viewing_at bookings.occupants bookings.message'),
  ('Xem lịch khách đã gửi, danh sách yêu cầu chờ, từ chối', 'bookings.status bookings.contact_name bookings.phone bookings.email bookings.decision_notes'),
  ('Xếp lịch; thời lượng; đã xem/không đến/hủy; ghi kết quả', 'bookings.appointments'),
  ('Tạo hồ sơ và hợp đồng từ yêu cầu đã xem', 'bookings.user_id users.id contracts.booking_id contracts.id'),
 ],
 'tenants': [
  ('Thêm/sửa hồ sơ, ngày sinh, địa chỉ, liên hệ khẩn cấp, ghi chú', 'users.display_name users.date_of_birth users.address_line users.emergency_contact_name users.emergency_contact_phone users.notes'),
  ('Tìm/lọc users theo phòng, tình trạng ở và login_enabled; cảnh báo trùng', 'users.phone users.email users.id contracts.user_id contracts.status'),
  ('Xem giấy tờ đã che và trạng thái xác minh (không có form quản lý giấy tờ)', 'users.identity_documents'),
  ('Tài khoản khách, lần đăng nhập, đặt mật khẩu, mời đăng ký', 'users.last_login_at users.is_active users.password_hash auth_tokens.kind users.id users.login_enabled'),
  ('Duyệt/từ chối đề nghị sửa hồ sơ, lý do phản hồi', 'bookings.kind bookings.changes bookings.status bookings.reviewed_by bookings.decision_notes'),
  ('Hồ sơ liên kết phòng/hợp đồng/hóa đơn/cọc/ticket', 'contracts.user_id contracts.id invoices.contract_id payments.contract_id tickets.contract_id'),
 ],
 'contracts': [
  ('Tạo hợp đồng hoặc bổ sung cho khách đang ở, ngày bắt đầu/kết thúc', 'contracts.id contracts.versions contracts.ends_on contracts.onboarding_mode'),
  ('Chốt tiền thuê, phí, mức cọc, ngày lập và hạn thanh toán', 'contracts.versions contracts.required_deposit'),
  ('Bản đã ký, điều khoản, bên ký; thêm/xóa tệp bổ sung', 'contracts.versions contracts.attachments files.storage_key'),
  ('Gia hạn tạo phiên bản mới, giữ nguyên bản cũ', 'contracts.versions contracts.ends_on'),
  ('Người đại diện/người ở cùng là quan hệ thuê, không thêm role đăng nhập', 'contracts.user_id contracts.occupants'),
  ('Bàn giao hiển thị chỉ số đầu vào và hiện trạng tài sản', 'contracts.checkin_handover contracts.initial_readings'),
  ('Thu cọc lúc ký hoặc thu thêm, xem đã thu/giữ/hoàn/bù trừ', 'payments.amount payments.kind payments.id'),
  ('Khách gửi/hủy đề nghị gia hạn/trả phòng; admin duyệt/từ chối', 'bookings.kind bookings.desired_on bookings.message bookings.status bookings.decision_notes'),
  ('Trả phòng: số cuối, hóa đơn cuối (kể cả tháng đã thu), bù cọc, hoàn cọc, lý do còn nợ', 'contracts.initial_readings contracts.final_readings invoices.kind invoices.metered_only payments.allocations payments.method contracts.checkout_summary contracts.remaining_debt_reason contracts.move_out_on'),
  ('Kết thúc/lưu trữ; hết hạn vẫn đang ở; danh sách sắp hết hạn', 'contracts.move_out_on contracts.ended_reason contracts.archived_at contracts.ends_on contracts.status'),
 ],
 'billing': [
  ('Mở/chọn tháng theo cơ sở, bảng tiến độ tính tiền', 'billing_periods.property_id billing_periods.month_start contracts.status invoices.period_id'),
  ('Số điện/nước đầu-cuối trên hóa đơn nháp, lịch sử sửa số; nhập hàng loạt', 'contracts.initial_readings invoices.electricity_start invoices.water_start invoices.electricity_end invoices.water_end invoices.readings_history invoices.period_id'),
  ('Sửa chỉ số trên nháp và thêm readings_history; bất biến khi phát hành', 'invoices.electricity_start invoices.electricity_end invoices.water_start invoices.water_end invoices.readings_history invoices.lines'),
  ('Khóa/mở khóa tháng có lý do', 'billing_periods.status billing_periods.locked_by billing_periods.unlock_reason billing_periods.history'),
  ('Tạo/phát hành một hoặc nhiều hóa đơn; kết quả lỗi theo phòng', 'invoices.idempotency_key invoices.request_hash invoices.status invoices.total_amount'),
  ('Tính lẻ tháng, phí một lần, giá theo hợp đồng > phòng > cơ sở', 'invoices.lines contracts.versions rooms.rates properties.rates'),
 ],
 'invoices': [
  ('Tìm/lọc theo tháng, phòng, khách, nợ, quá hạn, nháp/hủy', 'invoices.period_id invoices.contract_id invoices.due_on invoices.status payments.allocations'),
  ('Dòng hóa đơn, số điện nước, giá đã chốt và bản in', 'invoices.lines invoices.customer_snapshot'),
  ('Phát hành nháp/xóa nháp/hủy có lý do, giữ lịch sử', 'invoices.status invoices.issued_by invoices.void_reason invoices.voided_at'),
  ('Khách báo chuyển khoản, thời điểm, mã giao dịch, ảnh biên lai', 'payments.intended_invoice_id payments.received_at payments.external_reference payments.status payments.proof_file_ids'),
  ('Admin xác nhận/từ chối, nhận toàn bộ hoặc một phần', 'payments.confirmed_by payments.confirmed_at payments.reason payments.allocations'),
  ('Hoàn tác khoản thu bằng dòng đảo, trả lại nợ', 'payments.reverses_id payments.idempotency_key payments.request_hash'),
  ('Thông tin ngân hàng mặc định và nội dung chuyển khoản; chưa tích hợp ngân hàng', 'settings.bank_name settings.bank_account_number settings.bank_account_name invoices.code'),
  ('Hiển thị điều chỉnh có trong chứng từ; giao diện không có form tạo điều chỉnh', 'invoices.adjusts_invoice_id invoices.kind invoices.lines'),
 ],
 'tickets': [
  ('Khách gửi hỗ trợ, loại, mức độ, tiêu đề, nội dung và ảnh', 'tickets.category_code tickets.priority tickets.title tickets.description tickets.contract_id tickets.attachment_file_ids'),
  ('Hộp thư, tìm/lọc, người xử lý admin, thời hạn', 'tickets.status tickets.assigned_to tickets.due_at tickets.priority'),
  ('Tiếp nhận/xử lý/chờ/giải quyết/đóng/mở lại; khách xác nhận', 'tickets.status tickets.waiting_reason tickets.resolution_notes tickets.resolved_at tickets.closed_at'),
  ('Trao đổi và ghi chú nội bộ; không trả ghi chú nội bộ cho khách', 'tickets.messages'),
  ('Tiến độ ticket của khách và lịch sử đổi trạng thái', 'tickets.history'),
 ],
 'account': [
  ('Khách xem hồ sơ/giấy tờ che, đề nghị sửa phone/email và hủy', 'users.id users.identity_documents bookings.changes bookings.status'),
  ('Admin sửa tên/email/phone/avatar; đổi mật khẩu', 'users.display_name users.email users.phone users.avatar_file_id users.password_hash files.purpose'),
  ('Lịch nhắc nhập số/tạo hóa đơn, ngày 1–28, bật/tắt', 'settings.meter_reading_day settings.invoice_create_day settings.reminder_enabled'),
 ],
 'notifications': [
  ('Thông báo trong chuông và trang khách; số chưa đọc, đánh dấu một/tất cả', 'notifications.recipient_id notifications.event_key notifications.title notifications.body notifications.url notifications.read_at'),
 ],
 'exports': [
  ('Xuất CSV khách/hóa đơn và in trực tiếp; không lưu tác vụ xuất', 'users.id invoices.id invoices.lines payments.allocations'),
 ],
 'dashboard': [
  ('Tổng quan, sơ đồ phòng, tiến độ tháng, 6 tháng thu/nợ và các việc cần làm; dùng truy vấn tổng hợp', 'rooms.id contracts.status bookings.hold_expires_at invoices.status payments.allocations payments.kind tickets.status bookings.status bookings.appointments contracts.ends_on settings.reminder_enabled'),
 ],
}

PAGE_GROUPS = {'auth/login.js': ['auth'], 'auth/register.js': ['auth'], 'auth/forgot.js': ['auth'], 'auth/reset.js': ['auth'], 'customer/home/index.js': ['public'], 'customer/contact.js': ['public'], 'customer/rooms/list.js': ['public', 'viewings'], 'customer/rooms/detail.js': ['public', 'viewings'], 'customer/invoices/list.js': ['auth', 'invoices'], 'customer/invoices/detail.js': ['auth', 'invoices'], 'customer/tickets/list.js': ['auth', 'tickets'], 'customer/tickets/new.js': ['auth', 'tickets'], 'customer/tickets/detail.js': ['auth', 'tickets'], 'customer/contract.js': ['auth', 'contracts'], 'customer/account.js': ['auth', 'account'], 'shared/notifications.js': ['notifications'], 'admin/dashboard.js': ['dashboard', 'notifications'], 'admin/properties.js': ['properties'], 'admin/property-form.js': ['properties'], 'admin/property-detail.js': ['properties', 'rooms'], 'admin/rooms.js': ['rooms'], 'admin/room-form.js': ['rooms', 'properties', 'tenants'], 'admin/room-detail.js': ['rooms', 'contracts', 'tickets'], 'admin/viewings.js': ['viewings'], 'admin/tenants.js': ['tenants', 'exports'], 'admin/tenant-detail.js': ['tenants', 'contracts', 'invoices', 'tickets'], 'admin/contracts.js': ['contracts'], 'admin/contract-new.js': ['contracts', 'tenants', 'rooms'], 'admin/contract-detail.js': ['contracts', 'invoices'], 'admin/billing.js': ['billing'], 'admin/invoices.js': ['invoices', 'exports'], 'admin/invoice-detail.js': ['invoices'], 'admin/tickets.js': ['tickets'], 'admin/settings.js': ['account', 'auth']}
