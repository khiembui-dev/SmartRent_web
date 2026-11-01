// Tiện ích tạo lỗi/kiểm tra dữ liệu cho handler mock, trả cùng dạng Problem Details như backend.
import { ApiError } from '../services/errors.js';
import { foldVietnamese } from '../utils/format.js';
import { isIsoDate } from '../utils/date.js';

export function fail(status, code, detail, errors) {
  throw new ApiError({ status, code, detail, errors });
}

export const notFound = (what = 'dữ liệu') => fail(404, 'not_found', `Không tìm thấy ${what} hoặc bạn không có quyền xem.`);
export const conflict = (code, detail, errors) => fail(409, code, detail, errors);
export const rule = (code, detail, errors) => fail(422, code, detail, errors);

/** Gom lỗi theo trường rồi ném một lần (422 validation_failed). */
export function validator() {
  const errors = {};
  const add = (field, message) => {
    (errors[field] ||= []).push(message);
  };
  const api = {
    errors,
    add,
    required(field, value, label) {
      if (value == null || (typeof value === 'string' && !value.trim()) || (Array.isArray(value) && !value.length)) {
        add(field, `${label} là bắt buộc.`);
        return false;
      }
      return true;
    },
    date(field, value, label, { required = true } = {}) {
      if (value == null || value === '') {
        if (required) add(field, `${label} là bắt buộc.`);
        return false;
      }
      if (!isIsoDate(value)) {
        add(field, `${label} phải có dạng YYYY-MM-DD.`);
        return false;
      }
      return true;
    },
    money(field, value, label, { min = 0, required = true, positive = false } = {}) {
      if (value == null || value === '') {
        if (required) add(field, `${label} là bắt buộc.`);
        return false;
      }
      if (!Number.isSafeInteger(value)) {
        add(field, `${label} phải là số tiền nguyên (VND).`);
        return false;
      }
      if (positive && value <= 0) {
        add(field, `${label} phải lớn hơn 0.`);
        return false;
      }
      if (value < min) {
        add(field, `${label} không được nhỏ hơn ${min}.`);
        return false;
      }
      return true;
    },
    number(field, value, label, { min, max, required = true, decimals } = {}) {
      if (value == null || value === '') {
        if (required) add(field, `${label} là bắt buộc.`);
        return false;
      }
      if (typeof value !== 'number' || !Number.isFinite(value)) {
        add(field, `${label} phải là số.`);
        return false;
      }
      if (min != null && value < min) add(field, `${label} không được nhỏ hơn ${min}.`);
      if (max != null && value > max) add(field, `${label} không được lớn hơn ${max}.`);
      if (decimals != null && Math.round(value * 10 ** decimals) !== value * 10 ** decimals) {
        add(field, `${label} tối đa ${decimals} chữ số thập phân.`);
      }
      return !errors[field];
    },
    reason(field, value, label = 'Lý do') {
      if (!value || !String(value).trim()) add(field, `${label} là bắt buộc cho thao tác này.`);
      else if (String(value).trim().length < 5) add(field, `${label} cần ít nhất 5 ký tự để người khác hiểu được.`);
    },
    email(field, value, { required = false } = {}) {
      if (!value) {
        if (required) add(field, 'Email là bắt buộc.');
        return;
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) add(field, 'Email chưa đúng định dạng.');
    },
    phone(field, value, { required = false } = {}) {
      if (!value) {
        if (required) add(field, 'Số điện thoại là bắt buộc.');
        return;
      }
      if (!/^(\+84|0)\d{9,10}$/.test(String(value).replace(/[\s.-]/g, ''))) add(field, 'Số điện thoại chưa đúng định dạng Việt Nam.');
    },
    oneOf(field, value, allowed, label) {
      if (!allowed.includes(value)) add(field, `${label} không hợp lệ.`);
    },
    check() {
      if (Object.keys(errors).length) {
        throw new ApiError({ status: 422, code: 'validation_failed', detail: 'Một số trường chưa hợp lệ.', errors });
      }
    },
  };
  return api;
}

// ---- Danh sách: lọc, tìm, sắp xếp, phân trang trên TOÀN BỘ tập dữ liệu ----

export function textMatch(haystack, q) {
  if (!q) return true;
  const needle = foldVietnamese(q.trim());
  return haystack.some((value) => value != null && foldVietnamese(value).includes(needle));
}

function getPath(obj, path) {
  return path.split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), obj);
}

export function sortItems(items, sort, allowed) {
  if (!sort) return items;
  const desc = sort.startsWith('-');
  const field = desc ? sort.slice(1) : sort;
  if (allowed && !allowed.includes(field)) {
    fail(400, 'invalid_sort', `Không hỗ trợ sắp xếp theo "${field}".`, { sort: [`Giá trị cho phép: ${allowed.join(', ')}`] });
  }
  const collator = new Intl.Collator('vi', { numeric: true, sensitivity: 'base' });
  return [...items].sort((a, b) => {
    const va = getPath(a, field);
    const vb = getPath(b, field);
    let r;
    if (va == null && vb == null) r = 0;
    else if (va == null) r = 1;
    else if (vb == null) r = -1;
    else if (typeof va === 'number' && typeof vb === 'number') r = va - vb;
    else if (typeof va === 'boolean') r = Number(va) - Number(vb);
    else r = collator.compare(String(va), String(vb));
    return desc ? -r : r;
  });
}

export function paginate(items, query, { totalAll, defaultSize = 20 } = {}) {
  const pageSize = Math.min(Math.max(Number(query.pageSize) || defaultSize, 1), 200);
  const totalItems = items.length;
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const page = Math.min(Math.max(Number(query.page) || 1, 1), totalPages);
  return {
    items: items.slice((page - 1) * pageSize, page * pageSize),
    page,
    pageSize,
    totalItems,
    totalPages,
    totalAll: totalAll ?? totalItems,
  };
}

/** Chuỗi xử lý danh sách chuẩn: lọc → tìm → sắp xếp → trang. */
export function listResponse(all, query, { filter, search, sortable, defaultSort, summarize } = {}) {
  let items = filter ? all.filter(filter) : all;
  if (query.q && search) items = items.filter((item) => textMatch(search(item), query.q));
  items = sortItems(items, query.sort || defaultSort, sortable);
  const page = paginate(items, query, { totalAll: all.length });
  return summarize ? { ...page, summary: summarize(items) } : page;
}

export const asBool = (v) => v === true || v === 'true' || v === '1' || v === 1;
export const asArray = (v) => (v == null || v === '' ? [] : Array.isArray(v) ? v : String(v).split(','));
