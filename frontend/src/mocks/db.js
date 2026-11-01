// Kho dữ liệu mô phỏng trong trình duyệt. Chỉ dùng khi VITE_DATA_SOURCE=mock.
// Dữ liệu được lưu trong localStorage để thao tác giữ nguyên khi tải lại; resetData() xóa và tạo lại từ seed.

import { buildSeed, SEED_VERSION } from './seed.js';

const STORAGE_KEY = 'smartrent.mock.db';
const MAX_PERSISTED_FILE_BYTES = 180 * 1024;

let data = null;
// Nội dung tệp tải lên lớn chỉ giữ trong bộ nhớ của tab; sau khi tải lại trang sẽ hiện "thiếu tệp" đúng như rủi ro thật.
const volatileFiles = new Map();

function load() {
  try {
    const text = localStorage.getItem(STORAGE_KEY);
    if (text) {
      const parsed = JSON.parse(text);
      if (parsed?.meta?.seedVersion === SEED_VERSION) return parsed;
    }
  } catch {
    // dữ liệu hỏng hoặc localStorage bị chặn: tạo lại
  }
  return buildSeed();
}

export function getData() {
  if (!data) {
    data = load();
    persist();
  }
  return data;
}

export function commit(next) {
  data = next;
  persist();
}

function persist() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (error) {
    // Hết dung lượng: vẫn chạy trong bộ nhớ, báo ra console để người kiểm thử biết.
    console.warn('[mock] Không lưu được dữ liệu demo vào localStorage:', error);
  }
}

export function resetData() {
  volatileFiles.clear();
  data = buildSeed();
  persist();
  return data;
}

export function storeFileContent(fileId, dataUrl, size) {
  if (size <= MAX_PERSISTED_FILE_BYTES) return { dataUrl, persisted: true };
  volatileFiles.set(fileId, dataUrl);
  return { dataUrl: null, persisted: false };
}

export function fileContent(file) {
  if (!file) return null;
  if (file.dataUrl) return file.dataUrl;
  return volatileFiles.get(file.id) || null;
}

export function storageInfo() {
  try {
    const text = localStorage.getItem(STORAGE_KEY) || '';
    return { bytes: text.length * 2, key: STORAGE_KEY };
  } catch {
    return { bytes: 0, key: STORAGE_KEY };
  }
}
