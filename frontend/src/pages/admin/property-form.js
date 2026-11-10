// Thêm/sửa cơ sở: tên, địa chỉ và bảng giá dùng làm nguồn kế thừa cho phòng.
import { RATE_FIELDS } from '../../components/admin-kit.js';
import { toast } from '../../components/dialogs.js';
import { bindForm, enhance, formAlert, renderFields } from '../../components/form.js';
import { errorState, icon, link, loadingBlock, note, pageHeader } from '../../components/ui.js';
import { propertiesApi } from '../../services/api.js';
import { session } from '../../services/session.js';
import { html, setHtml } from '../../utils/html.js';
import { mapUrlError } from '../../utils/maps.js';
import { dataChanged, getCatalog } from './common.js';

export default async function PropertyFormPage(ctx) {
  const id = ctx.params.id;
  const isEdit = Boolean(id);
  ctx.setTitle(isEdit ? 'Sửa cơ sở' : 'Thêm cơ sở');
  setHtml(ctx.outlet, loadingBlock(8));
  let property = null;
  let catalog;
  try {
    [catalog, property] = await Promise.all([getCatalog(), isEdit ? propertiesApi.get(id) : null]);
  } catch (error) {
    setHtml(ctx.outlet, errorState(error));
    return;
  }

  const infoFields = [
    { name: 'name', label: 'Tên cơ sở', required: true, placeholder: 'Ví dụ: Nhà trọ Bình Thạnh', maxLength: 120 },
    { name: 'address.line', label: 'Số nhà, tên đường', required: true, placeholder: 'Ví dụ: 12 Nguyễn Gia Trí' },
    { name: 'address.locality', label: 'Phường/xã, quận/huyện', col: 'col-md-6', optional: true },
    { name: 'address.province', label: 'Tỉnh/thành phố', col: 'col-md-6', required: true },
    { name: 'mapUrl', label: 'Liên kết Google Maps', type: 'url', optional: true, maxLength: 4096, validate: (v) => mapUrlError(v), help: 'Dán liên kết chia sẻ vị trí chính xác. Mọi phòng thuộc cơ sở dùng chung vị trí này.' },
    { name: 'mapEmbedUrl', label: 'URL nhúng Google Maps', type: 'url', optional: true, maxLength: 4096, validate: (v) => mapUrlError(v, true), help: 'Không bắt buộc. Maps → Chia sẻ → Nhúng bản đồ: lấy URL trong src, không dán toàn bộ iframe. Không có URL nhúng thì khách vẫn mở được liên kết vị trí.' },
    { name: 'description', label: 'Giới thiệu cơ sở', type: 'textarea', optional: true, maxLength: 3000 },
  ];
  const rateFields = RATE_FIELDS.map((r) => ({ name: `rate.${r.code}`, label: `${r.label} (${r.unit})`, type: 'money', required: true, col: 'col-md-6', min: 0 }));
  const fields = [...infoFields, ...rateFields];
  const values = { name: property?.name, address: property?.address, mapUrl: property?.mapUrl, mapEmbedUrl: property?.mapEmbedUrl, description: property?.description, rate: property?.prices };
  const back = isEdit ? `/admin/properties/${id}` : '/admin/properties';

  setHtml(ctx.outlet, html`${pageHeader({
    title: isEdit ? `Sửa ${property.name}` : 'Thêm cơ sở',
    breadcrumbs: [{ label: 'Cơ sở', href: '/admin/properties' }, { label: isEdit ? property.name : 'Thêm cơ sở' }],
  })}
  <form id="property-form" class="ad-form" novalidate>
    <div class="ad-form-main">
      ${formAlert()}
      <section class="sr-panel"><div class="sr-panel-head"><h2>Thông tin cơ sở</h2></div><div class="sr-panel-body">${renderFields(infoFields, values)}</div></section>
      <section class="sr-panel"><div class="sr-panel-head"><h2>Giá điện, nước và dịch vụ</h2><span class="sr-panel-note">Nhập 0 nếu không thu khoản đó</span></div>
        <div class="sr-panel-body">${renderFields(rateFields, values)}
          ${isEdit ? html`<div class="mt-3">${note('Giá mới áp dụng từ hôm nay cho các kỳ chưa tạo hóa đơn. Hóa đơn đã phát hành và hợp đồng đã chốt giá không đổi.')}</div>` : ''}</div></section>
      <div class="ad-savebar">
        <a class="btn btn-outline-secondary" href="${link(back)}">Hủy</a>
        <button type="submit" class="btn btn-primary">${icon('check2')} ${isEdit ? 'Lưu thay đổi' : 'Thêm cơ sở'}</button>
      </div>
    </div>
  </form>`);

  const form = ctx.outlet.querySelector('form');
  ctx.onCleanup(await enhance(form));
  const binding = bindForm(form, {
    fields,
    onSubmit: async (v) => {
      const charge = (code) => catalog.chargeTypes.find((c) => c.code === code);
      const body = { ...v, rates: RATE_FIELDS.map((r) => ({ chargeTypeId: charge(r.code).id, unitPrice: v.rate[r.code] })) };
      delete body.rate;
      if (isEdit) Object.assign(body, { code: property.code, contactName: property.contactName, phone: property.phone, email: property.email });
      const saved = isEdit ? await propertiesApi.update(id, body) : await propertiesApi.create(body);
      binding.reset();
      await session.reload();
      dataChanged();
      toast(isEdit ? 'Đã lưu thay đổi' : `Đã thêm ${saved.name}`);
      ctx.navigate(`/admin/properties/${saved.id}`);
    },
  });
  ctx.onCleanup(() => binding.destroy());
}
