// Ô chọn có tìm kiếm (Tom Select). Hỗ trợ nguồn từ xa qua service đã đăng ký (data-remote="tenants" ...).
import TomSelect from 'tom-select/base';
import TomSelectRemove from 'tom-select/dist/esm/plugins/remove_button/plugin.js';
import 'tom-select/dist/css/tom-select.bootstrap5.min.css';
import { escapeHtml } from '../utils/html.js';
import { roomsApi, tenantsApi } from '../services/api.js';

TomSelect.define('remove_button', TomSelectRemove);

// Nguồn tìm kiếm từ xa: tìm trên toàn bộ tập ở máy chủ, không chỉ các dòng đã tải.
const REMOTES = {
  contractTenants: async (q) => (await tenantsApi.list({ q, availableForContract: true, pageSize: 50 })).items.map((t) => ({ value: t.id, text: t.fullName, sub: [t.code, t.phone].filter(Boolean).join(' · ') })),
  tenants: async (q) => (await tenantsApi.list({ q, pageSize: 20 })).items.map((t) => ({ value: t.id, text: t.fullName, sub: [t.code, t.phone, t.currentTenancy?.room?.code].filter(Boolean).join(', ') })),
  rooms: async (q) => (await roomsApi.list({ q, pageSize: 20 })).items.map((r) => ({ value: r.id, text: `${r.code} – ${r.property.name}`, sub: r.occupancyStatus })),
};

export function initTomSelects(root) {
  const instances = [];
  root.querySelectorAll('select[data-tomselect]').forEach((el) => {
    if (el.tomselect) return;
    // Tom Select chuyển thuộc tính for sang ô tìm kiếm, nên lấy nhãn trước khi khởi tạo.
    const label = el.labels?.[0]?.textContent?.trim() || 'Chọn';
    const remote = el.dataset.remote ? REMOTES[el.dataset.remote] : null;
    const options = {
      create: el.dataset.create === 'true',
      allowEmptyOption: true,
      maxOptions: 200,
      plugins: el.multiple ? ['remove_button'] : [],
      render: {
        option: (data, escape) => `<div>${escape(data.text)}${data.sub ? `<span class="sr-opt-sub">${escape(data.sub)}</span>` : ''}</div>`,
        no_results: () => '<div class="no-results p-2 small text-muted">Không có kết quả phù hợp</div>',
        option_create: (data, escape) => `<div class="create">Thêm <strong>${escape(data.input)}</strong>…</div>`,
      },
      onInitialize() {
        // Giữ dòng phụ cho option đã có sẵn trong HTML.
        [...el.options].forEach((o) => {
          if (o.dataset.sub && this.options[o.value]) this.options[o.value].sub = o.dataset.sub;
        });
      },
      // Tom Select tự phát input/change trên select gốc. Không phát lần hai vì
      // dropdown phụ thuộc sẽ bị reset và API có thể bị gọi trùng.
    };
    if (remote) {
      Object.assign(options, {
        valueField: 'value', labelField: 'text', searchField: ['text', 'sub'], loadThrottle: 300,
        load: (query, callback) => remote(query).then(callback).catch(() => callback()),
        // Mở ô chọn là tải được khách, không bắt buộc phải biết tên để gõ trước.
        preload: 'focus',
        shouldLoad: () => true,
      });
    }
    const ts = new TomSelect(el, options);
    ts.control_input.setAttribute('aria-label', label);
    instances.push(ts);
  });
  return () => instances.forEach((ts) => ts.destroy());
}

export { escapeHtml };
