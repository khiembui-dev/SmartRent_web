BEGIN;
SET search_path=smartrent,public;
INSERT INTO settings(id) VALUES(1);
-- Các loại phí/tiện ích nằm trong properties/rooms; không nạp bảng danh mục riêng.
-- Danh mục ticket cố định: ELECTRICITY, WATER, INTERNET, OTHER.
COMMIT;
