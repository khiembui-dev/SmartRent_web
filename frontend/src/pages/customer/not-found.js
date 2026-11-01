import { link } from '../../components/ui.js';
import { session } from '../../services/session.js';
import { html, setHtml } from '../../utils/html.js';

export default function NotFoundPage(ctx) {
  ctx.setTitle('Không tìm thấy trang');
  setHtml(ctx.outlet, html`<div class="cu-page cu-narrow text-center">
    <div class="sr-doors justify-content-center mb-4" style="grid-template-columns:repeat(3,56px);justify-content:center">
      <span class="sr-door is-occupied" style="height:84px">4</span><span class="sr-door is-inactive" style="height:84px">0</span><span class="sr-door is-occupied" style="height:84px">4</span>
    </div>
    <h1 class="h2">Không có phòng nào ở địa chỉ này</h1>
    <p class="text-ink-2">Đường dẫn có thể đã đổi hoặc bị gõ nhầm.</p>
    <div class="d-flex gap-2 justify-content-center">
      <a class="btn btn-primary" href="${link(session.isAuthenticated ? session.homePath() : '/')}">Về trang chính</a>
      <a class="btn btn-outline-primary" href="${link('/rooms')}">Tìm phòng</a>
    </div>
  </div>`);
}
