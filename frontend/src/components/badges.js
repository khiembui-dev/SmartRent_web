// Nhãn trạng thái tách theo từng đối tượng (đặc tả §6.1). Không dùng chung một nhãn cho nhiều nghĩa.
import { html } from '../utils/html.js';

export const LABELS = {
  occupancy: {
    occupied: ['Đã thuê', 'door'], available: ['Còn trống', 'wash'], maintenance: ['Bảo trì', 'warn'], inactive: ['Ngừng khai thác', 'muted'],
  },
  operating: { available: ['Đang khai thác', 'ok'], maintenance: ['Bảo trì', 'warn'], inactive: ['Ngừng khai thác', 'muted'] },
  listing: { draft: ['Tin nháp', 'muted'], published: ['Đang công khai', 'ok'], hidden: ['Tạm ẩn', 'warn'] },
  publicAvailability: {
    available: ['Còn trống', 'ok'], occupied: ['Đang có người ở', 'door'], on_hold: ['Đang giữ chỗ', 'wash'], reserved: ['Đã có người đặt', 'wash'], unavailable: ['Tạm ngừng', 'muted'],
  },
  allocation: {
    held: ['Giữ chỗ', 'wash'], reserved: ['Thuê dự kiến', 'info'], occupied: ['Đang ở', 'door'], completed: ['Đã thuê xong', 'muted'], released: ['Đã giải phóng', 'muted'],
  },
  inquiry: {
    new: ['Mới', 'info'], accepted: ['Đã tiếp nhận', 'door'], consulting: ['Đang tư vấn', 'door'], viewing: ['Hẹn xem', 'wash'], approved: ['Chấp nhận', 'ok'],
    rejected: ['Từ chối', 'danger'], cancelled: ['Khách hủy', 'muted'], converted: ['Đã chuyển thành thuê', 'ok'],
  },
  viewing: { scheduled: ['Đã hẹn', 'info'], completed: ['Đã xem', 'ok'], cancelled: ['Đã hủy', 'muted'], no_show: ['Khách không đến', 'warn'] },
  reservation: { holding: ['Đang giữ', 'wash'], converted: ['Đã nhận phòng', 'ok'], expired: ['Hết hạn', 'muted'], cancelled: ['Đã hủy', 'muted'] },
  tenancy: { planned: ['Dự kiến', 'info'], active: ['Đang ở', 'door'], ended: ['Đã kết thúc', 'muted'], cancelled: ['Đã hủy', 'muted'] },
  residence: { active: ['Đang ở', 'door'], planned: ['Sắp vào ở', 'info'], former: ['Đã rời', 'muted'], none: ['Chưa thuê', 'muted'] },
  contract: {
    draft: ['Nháp', 'muted'], signed: ['Đã ký, chờ hiệu lực', 'info'], active: ['Hiệu lực', 'ok'], expired: ['Hết hạn', 'warn'], terminated: ['Đã chấm dứt', 'muted'], archived: ['Lưu trữ', 'muted'],
  },
  invoiceStatus: { draft: ['Nháp', 'muted'], issued: ['Đã phát hành', 'door'], void: ['Đã hủy', 'muted'] },
  invoicePayment: { unpaid: ['Chưa thu', 'danger'], partial: ['Thu một phần', 'warn'], paid: ['Đã thu đủ', 'ok'] },
  invoiceKind: {
    periodic: ['Định kỳ', 'muted'], final: ['Hóa đơn cuối', 'muted'], one_time: ['Phát sinh riêng', 'muted'], replacement: ['Thay thế', 'info'],
    debit_adjustment: ['Điều chỉnh tăng', 'warn'], credit_adjustment: ['Điều chỉnh giảm', 'ok'],
  },
  payment: { pending: ['Chờ xác minh', 'wash'], confirmed: ['Đã xác nhận', 'ok'], rejected: ['Từ chối', 'danger'] },
  period: { open: ['Đang mở', 'ok'], locked: ['Đã khóa', 'muted'] },
  ticket: {
    new: ['Mới', 'info'], accepted: ['Đã tiếp nhận', 'door'], in_progress: ['Đang xử lý', 'door'], waiting: ['Chờ bổ sung', 'wash'], resolved: ['Đã giải quyết', 'ok'], closed: ['Đã đóng', 'muted'],
  },
  priority: { urgent: ['Khẩn cấp', 'danger'], high: ['Cao', 'warn'], normal: ['Bình thường', 'info'], low: ['Thấp', 'muted'] },
  request: { pending: ['Chờ xử lý', 'wash'], approved: ['Đã chấp nhận', 'info'], rejected: ['Từ chối', 'danger'], cancelled: ['Đã hủy', 'muted'], completed: ['Hoàn tất', 'ok'] },
  requestType: { renewal: ['Gia hạn', 'door'], transfer: ['Chuyển phòng', 'info'], checkout: ['Trả phòng', 'warn'] },
  profileRequest: { pending: ['Chờ duyệt', 'wash'], approved: ['Đã duyệt', 'ok'], rejected: ['Từ chối', 'danger'], cancelled: ['Đã hủy', 'muted'] },
  member: { invited: ['Đã mời', 'info'], active: ['Hoạt động', 'ok'], suspended: ['Tạm khóa', 'danger'], left: ['Đã nghỉ', 'muted'] },
  delivery: { pending: ['Chờ gửi', 'info'], sending: ['Đang gửi', 'info'], sent: ['Đã gửi (mô phỏng)', 'ok'], failed: ['Lỗi', 'danger'] },
  job: { running: ['Đang chạy', 'info'], succeeded: ['Thành công', 'ok'], failed: ['Lỗi', 'danger'] },
  export: { pending: ['Chờ máy chủ (mô phỏng)', 'wash'], running: ['Đang tạo', 'info'], succeeded: ['Đã tạo', 'ok'], failed: ['Lỗi', 'danger'] },
  integration: { not_configured: ['Chưa kết nối', 'muted'], configured_simulated: ['Đã lưu cấu hình (mô phỏng)', 'wash'] },
  scan: { pending: ['Đang quét', 'info'], clean: ['An toàn', 'ok'], rejected: ['Bị chặn', 'danger'], missing: ['Thiếu tệp', 'danger'] },
  meterKind: { electricity: ['Điện', 'wash'], water: ['Nước', 'info'] },
  readingKind: { baseline: ['Chốt đầu', 'muted'], periodic: ['Theo kỳ', 'door'], checkin: ['Nhận phòng', 'info'], checkout: ['Trả phòng', 'warn'], replacement: ['Thay công tơ', 'warn'] },
  handover: { checkin: ['Nhận phòng', 'info'], checkout: ['Trả phòng', 'warn'], transfer_in: ['Chuyển đến', 'door'], transfer_out: ['Chuyển đi', 'muted'] },
  depositKind: {
    receipt: ['Nhận cọc', 'ok'], refund: ['Hoàn cọc', 'warn'], offset: ['Bù trừ vào nợ', 'info'], transfer_in: ['Chuyển đến', 'door'], transfer_out: ['Chuyển đi', 'muted'], reversal: ['Đảo bút toán', 'danger'],
  },
  worksheetGroup: {
    missing_readings: ['Thiếu chỉ số', 'warn'], blocked: ['Bị chặn', 'danger'], ready: ['Đủ dữ liệu, chưa lập', 'info'], draft: ['Hóa đơn nháp', 'muted'],
    issued_unpaid: ['Đã phát hành, chưa thu', 'danger'], issued_partial: ['Còn nợ', 'warn'], paid: ['Đã thu đủ', 'ok'],
  },
  batchItem: { pending: ['Đang chờ', 'info'], succeeded: ['Thành công', 'ok'], failed: ['Lỗi', 'danger'], skipped: ['Bỏ qua', 'muted'] },
};

export function label(domain, value) {
  return LABELS[domain]?.[value]?.[0] ?? value ?? '—';
}

export function badge(domain, value, { title } = {}) {
  if (value == null) return html`<span class="text-muted-sr">—</span>`;
  const [text, tone] = LABELS[domain]?.[value] || [value, 'muted'];
  return html`<span class="sr-badge tone-${tone}" ${title ? html`title="${title}"` : ''}>${text}</span>`;
}

export function options(domain) {
  return Object.entries(LABELS[domain]).map(([value, [text]]) => ({ value, label: text }));
}

export const METHOD_LABELS = { cash: 'Tiền mặt', bank_transfer: 'Chuyển khoản', other: 'Khác' };
export const SCOPE_LABELS = { contract: 'Theo hợp đồng', room: 'Giá riêng phòng', property: 'Giá cơ sở', manual: 'Nhập tay' };
export const CALC_LABELS = { fixed: 'Cố định', metered: 'Theo chỉ số', per_person: 'Theo người', per_quantity: 'Theo số lượng' };
export const CYCLE_LABELS = { monthly: 'Hằng tháng', once: 'Một lần' };
export const PRORATION_LABELS = { full_period: 'Trọn kỳ', actual_days: 'Theo ngày ở' };
export const POLICY_LABELS = { actual_days: 'Chia theo số ngày thực ở', full_month: 'Tính trọn tháng' };
