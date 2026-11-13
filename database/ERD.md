# Sơ đồ database — 13 bảng nghiệp vụ + 2 bảng ApiPay

```mermaid
erDiagram
  users ||--o{ apipay_requests : requests
  invoices ||--o{ apipay_requests : payment_requests
  apipay_requests |o--o{ apipay_events : matches
  payments |o--o| apipay_events : records
```

`apipay_requests` lưu mã nội dung/QR cho hóa đơn; `apipay_events` lưu webhook đã xác minh, khóa duy nhất `transaction_id`. Chỉ worker đối soát thành công mới ghi `payments`. Chi tiết schema và trạng thái: [`14_apipay.sql`](14_apipay.sql), [hướng dẫn ApiPay](../docs/APIPAY.md). Các sơ đồ bên dưới mô tả 13 bảng nghiệp vụ giữ nguyên.

Một admin và các user. Dữ liệu lặp đã gộp thành JSONB trong bảng chính; xem JSON_DATA.md để biết cấu trúc. Đường nối dưới đây là khóa ngoại cột; các ID bên trong JSONB được trigger kiểm tra, không phải khóa ngoại tự động của PostgreSQL.

## Tài khoản và dùng chung

| Bảng | Dùng cho |
|---|---|
| `users` | Tài khoản và toàn bộ hồ sơ khách, kể cả khách chưa kích hoạt đăng nhập. |
| `auth_tokens` | Phiên đăng nhập, đặt lại mật khẩu và lời mời; chỉ lưu hash token. |
| `files` | Metadata tệp dùng chung; nội dung nhị phân ở storage. |
| `settings` | Cấu hình thương hiệu, lịch nhắc và ngân hàng mặc định. |
| `notifications` | Thông báo và trạng thái đọc theo tài khoản. |

```mermaid
flowchart LR
  users["users"]
  auth_tokens["auth_tokens"]
  files["files"]
  settings["settings"]
  notifications["notifications"]
  settings -->|updated_by| users
  auth_tokens -->|user_id| users
  files -->|uploaded_by| users
  notifications -->|recipient_id| users
  users -->|avatar_file_id| files
```

## Cơ sở, phòng và giá

| Bảng | Dùng cho |
|---|---|
| `properties` | Cơ sở, danh mục tiện ích và bảng giá mặc định dạng JSONB. |
| `rooms` | Phòng cùng tin đăng, tiện ích, ảnh, giá riêng và lịch sử trạng thái. |

```mermaid
flowchart LR
  properties["properties"]
  rooms["rooms"]
  rooms -->|property_id| properties
```

## Lịch xem và đề nghị

| Bảng | Dùng cho |
|---|---|
| `bookings` | Yêu cầu, lịch xem, giữ chỗ và đề nghị của khách, phân biệt bằng kind. |

```mermaid
flowchart LR
  bookings["bookings"]
  bookings -->|user_id| users
  bookings -->|room_id| rooms
  bookings -->|reviewed_by| users
  bookings -->|contract_id| contracts
```

## Thuê và hợp đồng

| Bảng | Dùng cho |
|---|---|
| `contracts` | Một hồ sơ thuê và hợp đồng; chứa gia hạn, bản ký, người ở cùng, bàn giao. |

```mermaid
flowchart LR
  contracts["contracts"]
  contracts -->|room_id| rooms
  contracts -->|user_id| users
  contracts -->|booking_id| bookings
```

## Điện nước và hóa đơn

| Bảng | Dùng cho |
|---|---|
| `billing_periods` | Kỳ tháng theo cơ sở và trạng thái khóa, kể cả tháng chưa có hóa đơn. |
| `invoices` | Hóa đơn cùng chỉ số điện nước, lịch sử sửa số và toàn bộ dòng tính tiền. |

```mermaid
flowchart LR
  billing_periods["billing_periods"]
  invoices["invoices"]
  billing_periods -->|property_id| properties
  billing_periods -->|locked_by| users
  invoices -->|contract_id| contracts
  invoices -->|period_id| billing_periods
  invoices -->|issued_by| users
```

## Thanh toán và tiền cọc

| Bảng | Dùng cho |
|---|---|
| `payments` | Sổ thanh toán và cọc; phân bổ vào hóa đơn nằm trong JSONB. |

```mermaid
flowchart LR
  payments["payments"]
  payments -->|user_id| users
  payments -->|contract_id| contracts
  payments -->|intended_invoice_id| invoices
  payments -->|submitted_by| users
  payments -->|confirmed_by| users
```

## Hỗ trợ

| Bảng | Dùng cho |
|---|---|
| `tickets` | Sự cố cùng loại, tệp, hội thoại và tiến độ trong một bảng. |

```mermaid
flowchart LR
  tickets["tickets"]
  tickets -->|room_id| rooms
  tickets -->|contract_id| contracts
  tickets -->|reported_by| users
  tickets -->|assigned_to| users
```
