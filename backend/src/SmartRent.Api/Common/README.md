# Phần nền dùng chung

| Phần | Trách nhiệm hiện tại |
|---|---|
| Auth | Đúng cửa admin/user, phiên, login_enabled/is_active và ownership |
| Errors | Problem Details, đổi SQLSTATE/lỗi nghiệp vụ thành lỗi API |
| Idempotency | Key/hash trên invoices và payments; trả kết quả cũ hoặc 409 |
| Paging | page/pageSize/sort/q và dữ liệu danh sách |
| Transactions | Khóa dòng, cập nhật JSONB, SET LOCAL smartrent.user_id, xử lý lỗi Commit |

Hệ thống chỉ có một admin và các user. Cơ sở là dữ liệu của chủ trọ, không phải phạm vi tổ chức/phân quyền riêng. Header organization còn trong adapter frontend nếu cần chỉ là tương thích DTO; không dùng để quyết định quyền.

Không đưa toàn bộ JSONB chứa bản ký, ghi chú hoặc tin nhắn nội bộ vào DTO khách. Xem [bàn giao](../../../../docs/BACKEND_HANDOFF.md) và [quy tắc dữ liệu](../../../../database/THIET_KE_DATABASE.md).
