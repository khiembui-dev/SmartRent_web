// Biểu đồ Chart.js theo quy ước trực quan hóa:
// - Bảng màu phân loại đã kiểm định (validate_palette: sáng/tối, CVD, độ tương phản) — thứ tự cố định, màu đi theo thực thể.
// - Cột ≤ 24px, đầu cột bo 4px, khe 2px màu nền giữa các đoạn chồng; đường 2px; lưới mảnh, đặc, mờ.
// - ≥ 2 chuỗi luôn có chú giải; mỗi biểu đồ có bảng số liệu tương đương (không chỉ dựa vào tooltip).
import {
  BarController, BarElement, CategoryScale, Chart, Filler, Legend, LinearScale, LineController, LineElement, PointElement, Tooltip,
} from 'chart.js';
import { html, setHtml } from '../utils/html.js';

Chart.register(BarController, BarElement, CategoryScale, LinearScale, LineController, LineElement, PointElement, Tooltip, Legend, Filler);

const PALETTE = {
  light: { series: ['#00809c', '#d07a12', '#6b5cd6', '#d4507a'], surface: '#ffffff', grid: '#e6ece9', axis: '#c9d4cf', ink: '#16262b', ink2: '#3d5157', muted: '#5e7075' },
  dark: { series: ['#2593ad', '#cf7d25', '#7f72dc', '#d85f80'], surface: '#152528', grid: '#233a3e', axis: '#35514f', ink: '#e4ecea', ink2: '#c3d1ce', muted: '#9fb2af' },
};

const mode = () => (document.documentElement.getAttribute('data-bs-theme') === 'dark' ? 'dark' : 'light');
const compact = new Intl.NumberFormat('vi-VN', { notation: 'compact', maximumFractionDigits: 1 });
const full = new Intl.NumberFormat('vi-VN');

function baseOptions(theme, { yFormat, stacked, percent }) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    animation: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? false : { duration: 350 },
    interaction: { mode: 'index', intersect: false },
    layout: { padding: { top: 4, right: 8 } },
    plugins: {
      legend: {
        position: 'top', align: 'start',
        labels: { color: theme.ink2, boxWidth: 12, boxHeight: 12, usePointStyle: true, padding: 14, font: { family: 'Be Vietnam Pro', size: 12 } },
      },
      tooltip: {
        backgroundColor: theme.surface, titleColor: theme.muted, bodyColor: theme.ink, borderColor: theme.axis, borderWidth: 1, padding: 10,
        titleFont: { family: 'Be Vietnam Pro', size: 11, weight: '500' }, bodyFont: { family: 'Be Vietnam Pro', size: 12, weight: '600' },
        usePointStyle: true, boxWidth: 8, boxHeight: 2,
        callbacks: { label: (ctx) => ` ${yFormat(ctx.parsed.y)}  ${ctx.dataset.label}` },
      },
    },
    scales: {
      x: { stacked, grid: { display: false }, border: { color: theme.axis }, ticks: { color: theme.muted, font: { family: 'Be Vietnam Pro', size: 11 } } },
      y: {
        stacked, beginAtZero: true, max: percent ? 100 : undefined, border: { display: false },
        grid: { color: theme.grid, lineWidth: 1, drawTicks: false },
        ticks: { color: theme.muted, padding: 8, font: { family: 'Be Vietnam Pro', size: 11 }, callback: (v) => (percent ? `${v}%` : compact.format(v)), maxTicksLimit: 6 },
      },
    },
  };
}

/**
 * series: [{ label, data: number[] }] — màu theo vị trí cố định trong mảng (thực thể giữ màu khi lọc).
 */
export function createChart(canvas, { type = 'bar', labels, series, stacked = false, percent = false, format = 'money' }) {
  const theme = PALETTE[mode()];
  const yFormat = (v) => (v == null ? '—' : percent ? `${full.format(v)}%` : format === 'money' ? `${full.format(v)} đ` : full.format(v));
  const datasets = series.map((s, i) => {
    const color = theme.series[s.slot ?? i];
    if (type === 'line') {
      return {
        label: s.label, data: s.data, borderColor: color, backgroundColor: `${color}1a`, borderWidth: 2, tension: 0.25, fill: series.length === 1,
        pointRadius: 4, pointHoverRadius: 5, pointBackgroundColor: color, pointBorderColor: theme.surface, pointBorderWidth: 2, spanGaps: true,
        pointStyle: 'line',
      };
    }
    const isTop = (ctx) => {
      if (!stacked) return true;
      // Bo đầu cột chỉ ở đoạn trên cùng có giá trị.
      const later = series.slice(i + 1).some((other) => (other.data[ctx.dataIndex] || 0) > 0);
      return !later;
    };
    return {
      label: s.label, data: s.data, backgroundColor: color, maxBarThickness: 24, borderSkipped: false,
      borderRadius: (ctx) => (isTop(ctx) ? { topLeft: 4, topRight: 4, bottomLeft: 0, bottomRight: 0 } : 0),
      borderColor: theme.surface, borderWidth: stacked ? { top: 2, left: 0, right: 0, bottom: 0 } : 0,
      pointStyle: 'rect',
    };
  });
  const options = baseOptions(theme, { yFormat, stacked, percent });
  if (series.length < 2) options.plugins.legend.display = false;
  const chart = new Chart(canvas, { type, data: { labels, datasets }, options });
  // Theo dõi đổi chủ đề sáng/tối: vẽ lại bằng bước màu của chế độ mới (không tự đảo màu).
  const observer = new MutationObserver(() => {
    const next = PALETTE[mode()];
    chart.data.datasets.forEach((ds, i) => {
      const color = next.series[series[i].slot ?? i];
      if (type === 'line') Object.assign(ds, { borderColor: color, backgroundColor: `${color}1a`, pointBackgroundColor: color, pointBorderColor: next.surface });
      else Object.assign(ds, { backgroundColor: color, borderColor: next.surface });
    });
    Object.assign(chart.options, baseOptions(next, { yFormat, stacked, percent }));
    if (series.length < 2) chart.options.plugins.legend.display = false;
    chart.update('none');
  });
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-bs-theme'] });
  return { chart, destroy: () => { observer.disconnect(); chart.destroy(); } };
}

/**
 * Vẽ biểu đồ kèm bảng số liệu tương đương (mở bằng <details>), trả hàm hủy.
 */
export function chartWithTable(container, { title, caption, labels, series, type, stacked, percent, format = 'money', height = 260 }) {
  const fmt = (v) => (v == null ? '—' : percent ? `${full.format(v)}%` : format === 'money' ? `${full.format(v)} đ` : full.format(v));
  setHtml(container, html`<figure class="m-0">
    ${title ? html`<figcaption class="fw-semibold mb-1">${title}</figcaption>` : ''}
    ${caption ? html`<p class="small text-muted-sr mb-2">${caption}</p>` : ''}
    <div class="sr-chart" style="height:${height}px"><canvas role="img" aria-label="${title || 'Biểu đồ'}"></canvas></div>
    <details class="mt-2 small"><summary class="text-muted-sr">Xem bảng số liệu</summary>
      <div class="table-responsive mt-2"><table class="table table-sm mb-0">
        <thead><tr><th scope="col">Mốc</th>${series.map((s) => html`<th scope="col" class="text-end">${s.label}</th>`)}</tr></thead>
        <tbody>${labels.map((l, i) => html`<tr><th scope="row" class="fw-normal">${l}</th>${series.map((s) => html`<td class="text-end num">${fmt(s.data[i])}</td>`)}</tr>`)}</tbody>
      </table></div>
    </details>
  </figure>`);
  return createChart(container.querySelector('canvas'), { type, labels, series, stacked, percent, format }).destroy;
}
