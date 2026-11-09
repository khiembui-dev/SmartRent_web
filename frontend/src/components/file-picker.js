// Mở bộ chọn tệp ngay trong click/keydown của người dùng. Không await/import/setTimeout
// trước khi mở: trình duyệt có thể làm mất quyền user activation và chặn hộp thoại.
export function openFilePicker(input) {
  if (!input?.isConnected || input.disabled || input.type !== 'file') return false;
  if (typeof input.showPicker === 'function') {
    try {
      input.showPicker();
      return true;
    } catch {
      // Trình duyệt chưa hỗ trợ đầy đủ showPicker vẫn có cách chọn tệp truyền thống.
    }
  }
  input.click();
  return true;
}

// Dùng event delegation để cả nhãn FilePond được dựng lại sau upload cũng hoạt động.
// getInput luôn trả input đang gắn trên DOM, không dùng input gốc đã bị FilePond thay thế.
export function bindFilePicker(root, selector, getInput) {
  const activate = (event) => {
    const trigger = event.target?.closest?.(selector);
    if (!trigger || !root.contains(trigger)) return;
    if (event.type === 'keydown' && !['Enter', ' '].includes(event.key)) return;
    event.preventDefault();
    event.stopPropagation(); // Tránh label mặc định mở thêm một hộp thoại lần thứ hai.
    openFilePicker(getInput());
  };
  root.addEventListener('click', activate, true);
  root.addEventListener('keydown', activate, true);
  return () => {
    root.removeEventListener('click', activate, true);
    root.removeEventListener('keydown', activate, true);
  };
}
