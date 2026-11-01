// Xuất CSV đúng bộ lọc: ghi nhận yêu cầu xuất (export job) rồi tạo tệp từ TOÀN BỘ tập đã lọc
// bằng cách đọc lần lượt các trang của cùng endpoint danh sách.
import { exportsApi } from '../services/api.js';
import { toCsv, downloadText } from '../utils/csv.js';
import { todayIso } from '../utils/date.js';
import { errorDialog, toast } from './dialogs.js';

export async function exportList({ kind, fetchPage, filters, columns, filename }) {
  try {
    const rows = [];
    let page = 1;
    let totalPages = 1;
    do {
      // Đọc từng trang tối đa 200 dòng để có toàn bộ tập đã lọc, không chỉ trang đang xem.
      const result = await fetchPage({ ...filters, page, pageSize: 200 });
      rows.push(...result.items);
      totalPages = result.totalPages || 1;
      page += 1;
    } while (page <= totalPages && page <= 50);
    await exportsApi.create({ kind, format: 'csv', filters, rowCount: rows.length });
    downloadText(toCsv(rows, columns), `${filename || kind}-${todayIso()}.csv`);
    toast(`Đã xuất ${rows.length} dòng theo bộ lọc hiện tại`);
  } catch (error) {
    await errorDialog(error, 'Chưa xuất được dữ liệu');
  }
}
