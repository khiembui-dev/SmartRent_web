# Phần nền dùng chung

Người 1 giữ thư mục này. Người khác dùng lại, không tự viết bản riêng. Cần thêm gì thì báo Người 1.

| Thư mục | Chứa |
|---|---|
| `Auth/` | Người dùng hiện tại, đọc `X-Organization-Id`, kiểm tra thành viên, quyền, phạm vi cơ sở |
| `Errors/` | Trả lỗi dạng Problem Details, đổi mã SQLSTATE thành lỗi API |
| `Idempotency/` | Xử lý header `Idempotency-Key` |
| `Paging/` | Tham số `page`, `pageSize`, `sort`, `q` và response danh sách |
| `Transactions/` | Mở transaction, đặt `smartrent.actor_id`, `smartrent.reason`, `smartrent.correlation_id` |

Yêu cầu chi tiết: `docs/BACKEND_HANDOFF.md` mục 2 đến 6, `database/EF_CORE_NPGSQL.md` mục 4.
