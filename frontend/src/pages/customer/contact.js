// Trang Liên hệ: điện thoại và email lấy từ tài khoản chủ trọ, sửa ở mục Cài đặt của admin là đổi ở đây.
import { errorState, icon, loadingBlock } from '../../components/ui.js';
import { publicApi } from '../../services/api.js';
import { formatPhone } from '../../utils/format.js';
import { html, setHtml } from '../../utils/html.js';
import { pageHead } from './common.js';

function contactBlock(org) {
  return html`<section class="cu-contact">
    <div class="cu-contact-main">
      <h2>${org.name}</h2>
      ${org.contactName ? html`<p class="cu-contact-person">${org.contactName}</p>` : ''}
      ${org.phone ? html`<a class="cu-contact-line" href="tel:${org.phone}">${icon('telephone')}<span>${formatPhone(org.phone)}</span></a>` : ''}
      ${org.email ? html`<a class="cu-contact-line" href="mailto:${org.email}">${icon('envelope')}<span>${org.email}</span></a>` : ''}
      ${!org.phone && !org.email ? html`<p class="cu-text">Chưa có thông tin liên hệ.</p>` : ''}
    </div>
    ${org.properties.length ? html`<ul class="cu-contact-places">${org.properties.map((p) => html`<li>
      <strong>${p.name}</strong>
      <span>${[p.addressLine, p.locality, p.province].filter(Boolean).join(', ')}</span>
    </li>`)}</ul>` : ''}
  </section>`;
}

export default async function ContactPage(ctx) {
  ctx.setTitle('Liên hệ');
  setHtml(ctx.outlet, html`<div class="cu-page cu-medium" data-root>${loadingBlock(5)}</div>`);
  const root = ctx.outlet.querySelector('[data-root]');
  let info;
  try {
    info = await publicApi.contactInfo();
  } catch (error) {
    if (error?.isAborted || ctx.signal.aborted) return;
    setHtml(root, errorState(error));
    return;
  }
  if (ctx.signal.aborted) return;
  setHtml(root, html`${pageHead({ title: 'Liên hệ', subtitle: 'Gọi hoặc gửi email cho chủ trọ khi bạn cần hỏi về phòng.' })}${info.organizations.map(contactBlock)}`);
}
