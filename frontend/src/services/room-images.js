import { config } from '../config.js';
import { filesApi } from './api.js';

// Link công khai chỉ dùng cho tin đã đăng. Admin lấy link có hạn qua API xác thực để xem cả phòng ẩn.
// Không mở quyền public cho phòng đang ẩn và không gắn Bearer token rõ vào src của ảnh.
export async function roomImagePreview(url, options = {}) {
  if (!url) return null;
  const match = /\/api\/v1\/files\/([0-9a-f-]{36})\/public(?:\?|$)/i.exec(url);
  if (!match || config.isMock) return url;
  try {
    const result = await filesApi.downloadUrl(match[1], options);
    return result.url?.startsWith('/api/') ? config.apiBaseUrl + result.url : result.url;
  } catch { return null; } // Tệp thiếu hoặc bị từ chối: hiện thông báo/placeholder, không làm hỏng form.
}

export function roomImagesPreview(images, options = {}) {
  return Promise.all(images.map(async image => ({ ...image, url: await roomImagePreview(image.url, options) })));
}
