// Lỗi thống nhất cho cả mock và API thật, theo dạng RFC 7807 Problem Details (mặc định của ASP.NET Core).
// { type, title, status, detail, code, errors: { field: [message] }, traceId }

export class ApiError extends Error {
  constructor({ status = 0, code = 'unknown', title, detail, errors, traceId, cause } = {}) {
    super(detail || title || 'Đã có lỗi xảy ra.');
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.title = title || defaultTitle(status, code);
    this.detail = detail || '';
    this.fieldErrors = errors || {};
    this.traceId = traceId;
    if (cause) this.cause = cause;
  }

  get isValidation() {
    return this.status === 422 || this.status === 400 || this.code === 'validation_failed';
  }
  get isConflict() {
    return this.status === 409;
  }
  get isForbidden() {
    return this.status === 403;
  }
  get isNotFound() {
    return this.status === 404;
  }
  get isUnauthorized() {
    return this.status === 401;
  }
  get isNetwork() {
    return this.status === 0 && this.code !== 'aborted';
  }
  get isAborted() {
    return this.code === 'aborted';
  }
}

export function defaultTitle(status, code) {
  if (code === 'aborted') return 'Yêu cầu đã bị hủy.';
  if (code === 'timeout') return 'Máy chủ phản hồi quá lâu.';
  switch (status) {
    case 0: return 'Không kết nối được máy chủ.';
    case 400:
    case 422: return code === 'validation_failed' ? 'Dữ liệu chưa hợp lệ.' : 'Chưa thực hiện được.';
    case 401: return 'Phiên đăng nhập đã hết hạn.';
    case 403: return 'Bạn không có quyền thực hiện thao tác này.';
    case 404: return 'Không tìm thấy dữ liệu hoặc bạn không có quyền xem.';
    case 409: return 'Chưa thực hiện được.';
    case 429: return 'Bạn thao tác quá nhanh, vui lòng thử lại sau.';
    default: return status >= 500 ? 'Máy chủ gặp lỗi khi xử lý.' : 'Đã có lỗi xảy ra.';
  }
}

/** Câu hướng dẫn ngắn hiển thị cùng lỗi. */
export function errorHint(error) {
  if (!(error instanceof ApiError)) return 'Tải lại trang hoặc thử lại sau.';
  if (error.isNetwork || error.code === 'timeout') return 'Kiểm tra kết nối mạng rồi thử lại.';
  if (error.isUnauthorized) return 'Đăng nhập lại để tiếp tục.';
  if (error.isForbidden) return 'Liên hệ chủ trọ hoặc quản lý nếu bạn cần quyền này.';
  if (error.isConflict) return 'Nếu dữ liệu vừa thay đổi, tải lại trang rồi thử lại.';
  if (error.code === 'validation_failed') return 'Sửa các trường được đánh dấu rồi lưu lại.';
  if (error.isValidation) return 'Xử lý theo hướng dẫn ở trên rồi thực hiện lại.';
  return 'Thử lại sau ít phút.';
}
