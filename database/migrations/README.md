# Migration

Từ khi team bắt đầu code backend, không sửa `01_schema.sql` đến `04_import_tools.sql` nữa. Mọi thay đổi cấu trúc là một file mới ở đây.

1. Người giữ schema tạo file đánh số tăng dần: `0001_them_cot_ghi_chu.sql`. Bọc trong `BEGIN; ... COMMIT;`, dùng `SET LOCAL search_path = smartrent, public;`. Thêm bảng thì phải có `COMMENT ON TABLE`.
2. Thêm một dòng `\i` vào `database/docker/init.sql`, đúng thứ tự, trước dữ liệu mẫu.
3. Chạy `python database/tests/run_checks.py`; script tự chạy các file trong thư mục này.
4. Đưa lên Git. Mỗi người lấy về rồi chạy `docker compose down -v` và `docker compose up -d`.

File đã đưa lên Git thì không sửa nữa: sai thì viết file mới. Trên database đã có dữ liệu thật, chạy đúng các file chưa áp dụng, không chạy lại từ đầu.
