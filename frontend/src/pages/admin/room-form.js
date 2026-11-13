// Thêm/sửa phòng: chọn cơ sở, thông tin phòng, giá và trạng thái, giá điện nước (kế thừa từ cơ sở rồi sửa được), tiện ích, ảnh.
// Giá trùng giá cơ sở được giữ là "kế thừa" nên phòng tự theo khi cơ sở đổi giá; giá khác đi thành giá riêng của phòng.
import { priceText, ROOM_RATE_FIELDS } from '../../components/admin-kit.js';
import { confirmDialog, errorDialog, reasonDialog, runAction, toast } from '../../components/dialogs.js';
import { bindForm, enhance, FormError, formAlert, renderField, renderFields } from '../../components/form.js';
import { asset, errorState, icon, link, loadingBlock, note, pageHeader, plate } from '../../components/ui.js';
import { catalogApi, propertiesApi, roomsApi } from '../../services/api.js';
import { session } from '../../services/session.js';
import { todayIso } from '../../utils/date.js';
import { slugify } from '../../utils/format.js';
import { formatNumber, formatVnd, parseVnd } from '../../utils/money.js';
import { html, setHtml } from '../../utils/html.js';
import { dataChanged, getCatalog, invalidateCatalog } from './common.js';
import { tenantFormModal } from './tenant-dialogs.js';
import { mountAddressEditor } from '../../components/address-editor.js';

const STATUS_OPTIONS = [
  { value: 'available', label: 'Sẵn sàng cho thuê' },
  { value: 'occupied', label: 'Đã thuê' },
  { value: 'reserved', label: 'Đang cọc giữ phòng' },
  { value: 'maintenance', label: 'Đang bảo trì' },
  { value: 'inactive', label: 'Ngừng khai thác' },
];

export default async function RoomFormPage(ctx) {
  const id = ctx.params.id;
  const isEdit = Boolean(id);
  ctx.setTitle(isEdit ? 'Sửa phòng' : 'Thêm phòng');
  setHtml(ctx.outlet, loadingBlock(10));
  const org = session.organization;
  let catalog;
  let room = null;
  try {
    [catalog, room] = await Promise.all([getCatalog({ fresh: true }), isEdit ? roomsApi.get(id) : null]);
  } catch (error) {
    setHtml(ctx.outlet, errorState(error));
    return;
  }
  if (!org.properties.length) {
    setHtml(ctx.outlet, errorState(new Error('Cần tạo cơ sở trước khi thêm phòng.')));
    return;
  }

  const initialProperty = room?.property.id || ctx.query.propertyId || session.propertyId || org.properties[0].id;
  if (!catalog.roomTypes.length) catalog.roomTypes.push({ id: 'STANDARD', name: 'Phòng tiêu chuẩn' });
  let propertyPrices = {};
  let loadedProperty = null;
  let addressEditor = null;
  const charge = (code) => catalog.chargeTypes.find((c) => c.code === code);
  const effective = (code) => room?.rates.effective.find((r) => r.chargeType.code === code);
  const rent = effective('RENT')?.unitPrice;
  const roomRate = Object.fromEntries(ROOM_RATE_FIELDS.map((r) => [r.code, effective(r.code)?.unitPrice]));
  // "Đã thuê" không phải nhãn lưu trên phòng: chọn mục này tạo đợt thuê cho khách, phòng đang có khách thì khóa ở đây.
  const occupied = room?.occupancyStatus === 'occupied';
  const canAssign = session.can('tenancies.checkin');
  const today = todayIso();
  // Phòng từng có hợp đồng giữ cơ sở cũ: hóa đơn và kỳ tính tiền đã gắn với cơ sở đó.
  const propertyLocked = isEdit && room?.canChangeProperty === false;
  // Tin đăng đi theo hợp đồng: có người thuê thì tự tạm ẩn, trả phòng thì tự công khai lại.
  const listingLocked = Boolean(room?.listing?.lockedByContract || occupied);

  const infoFields = [
    { name: 'propertyId', label: 'Cơ sở', type: 'select', required: true, placeholderOption: false, disabled: propertyLocked, options: org.properties.map((p) => ({ value: p.id, label: p.name })),
      help: propertyLocked ? 'Phòng đã có hợp đồng nên giữ cơ sở hiện tại (hóa đơn, kỳ tính tiền đã gắn với cơ sở này).'
        : isEdit ? 'Đổi cơ sở sẽ chuyển phòng sang cơ sở mới; giá chưa đặt riêng cho phòng sẽ theo bảng giá của cơ sở mới.' : '' },
    { name: 'code', label: 'Mã phòng', required: true, col: 'col-md-4', placeholder: 'A101', maxLength: 20 },
    { name: 'name', label: 'Tên phòng', required: true, col: 'col-md-8', placeholder: 'Phòng A101' },
    { name: 'areaM2', label: 'Diện tích', type: 'decimal', decimals: 2, unit: 'm²', required: true, col: 'col-md-4', min: 1, max: 500 },
    { name: 'capacity', label: 'Số người tối đa', type: 'number', required: true, col: 'col-md-4', min: 1, max: 20, default: 2 },
    { name: 'floorLabel', label: 'Tầng hoặc khu', optional: true, col: 'col-md-4', placeholder: 'Tầng 1' },
    { name: 'roomTypeId', label: 'Loại phòng', type: 'select', required: true, options: catalog.roomTypes.map((t) => ({ value: t.id, label: t.name })), default: catalog.roomTypes[0]?.id },
    { name: 'description', label: 'Thông tin thêm', type: 'textarea', rows: 3, optional: true, placeholder: 'Hướng phòng, ban công, ghi chú cho khách xem phòng…' },
    { name: 'rulesText', label: 'Quy định phòng', type: 'textarea', rows: 3, optional: true, maxLength: 5000, help: 'Hiển thị ở mục Quy định trên trang khách.' },
  ];
  const priceFields = [
    { name: 'rent', label: 'Giá phòng mỗi tháng', type: 'money', required: true, positive: true, col: 'col-md-6' },
    { name: 'requiredDeposit', label: 'Tiền cọc đề xuất', type: 'money', required: true, col: 'col-md-6', help: 'Mức cọc thật ghi trên từng hợp đồng.' },
    { name: 'operatingStatus', label: 'Trạng thái phòng', type: 'radio', options: STATUS_OPTIONS.filter((o) => o.value !== 'occupied' || occupied || canAssign), default: 'available', disabled: occupied || Boolean(room?.calendar?.length), help: room?.calendar?.length ? 'Phòng đang giữ chỗ theo lịch xem. Hủy giữ chỗ ở Lịch xem phòng trước khi đổi trạng thái.' : 'Đang cọc giữ phòng là trạng thái ghi nhận thủ công; tiền cọc được ghi riêng khi lập hợp đồng.' },
  ];
  const occupantFields = occupied ? [] : [
    { name: 'occupant.tenantId', label: 'Khách đang thuê', type: 'tomselect', remote: 'tenants', placeholderOption: 'Gõ tên hoặc số điện thoại' },
    { name: 'occupant.moveInOn', label: 'Ngày vào ở', type: 'date', col: 'col-md-4', max: today, default: today },
    { name: 'occupant.readings.electricity', label: 'Số điện lúc vào ở', type: 'decimal', decimals: 3, min: 0, unit: 'kWh', col: 'col-md-4', optional: true },
    { name: 'occupant.readings.water', label: 'Số nước lúc vào ở', type: 'decimal', decimals: 3, min: 0, unit: 'm³', col: 'col-md-4', optional: true },
  ];
  const rateFields = ROOM_RATE_FIELDS.map((r) => ({ name: `rate.${r.code}`, label: `${r.label} (${r.unit})`, type: 'money', optional: true, col: 'col-md-6' }));
  const listingFields = [
    { name: 'listing.title', label: 'Tiêu đề trên trang khách', optional: true, maxLength: 200, help: 'Để trống để dùng tên phòng và cơ sở.' },
    { name: 'listing.description', label: 'Mô tả đăng cho khách', type: 'textarea', optional: true, maxLength: 10000, help: 'Để trống để dùng Thông tin thêm ở trên. Nội dung riêng tại đây được ưu tiên hiển thị.' },
    { name: 'listing.status', label: 'Trạng thái tin đăng', type: 'select', required: true, placeholderOption: false, default: 'draft',
      options: [{ value: 'draft', label: 'Bản nháp' }, { value: 'hidden', label: 'Tạm ẩn' }, { value: 'published', label: 'Đang công khai', disabled: listingLocked }],
      help: listingLocked ? 'Phòng đang có người thuê nên tin tự tạm ẩn. Khi kết thúc và trả phòng, tin tự công khai lại.'
        : 'Có người thuê thì tin tự tạm ẩn; trả phòng thì tự công khai lại. Tin chỉ hiện khi phòng còn trống và cơ sở hoạt động.' },
  ];
  const fields = [...infoFields, ...priceFields, ...rateFields, ...occupantFields, ...listingFields];
  const values = {
    propertyId: initialProperty, code: room?.code, name: room?.name, areaM2: room?.areaM2, capacity: room?.capacity, floorLabel: room?.floorLabel,
    description: room?.description, rent, requiredDeposit: room?.requiredDeposit, operatingStatus: occupied ? 'occupied' : room?.occupancyStatus || room?.operatingStatus, rate: roomRate,
    roomTypeId: room?.roomType?.id, rulesText: room?.rulesText, listing: room?.listing || { status: 'draft' },
  };
  const back = isEdit ? `/admin/rooms/${id}` : '/admin/rooms';
  const selectedAmenities = new Set(room?.amenities.map((a) => a.id || a.code) || []);

  const amenityChip = (a) => html`<label class="ad-chip"><input type="checkbox" value="${a.id}" data-amenity ${selectedAmenities.has(a.id) ? 'checked' : ''}><span>${icon(a.icon || 'check2')} ${a.name}</span></label>`;

  setHtml(ctx.outlet, html`${pageHeader({
    title: isEdit ? `Sửa phòng ${room.code}` : 'Thêm phòng',
    breadcrumbs: [{ label: 'Phòng', href: '/admin/rooms' }, { label: isEdit ? room.code : 'Thêm phòng' }],
  })}
  <form id="room-form" class="ad-form has-rail" novalidate>
    <div class="ad-form-main">
      ${formAlert()}
      <section class="sr-panel"><div class="sr-panel-head"><h2>Cơ sở và thông tin phòng</h2></div><div class="sr-panel-body">${renderFields(infoFields, values)}</div></section>
      <section class="sr-panel"><div class="sr-panel-head"><h2>Địa chỉ dùng trên trang khách</h2></div><div class="sr-panel-body" data-location></div></section>
      <section class="sr-panel"><div class="sr-panel-head"><h2>Giá phòng và trạng thái</h2></div><div class="sr-panel-body">
        ${renderFields(priceFields, values)}
        ${occupied ? html`<div class="mt-3">${note(html`Phòng đang có khách <strong>${room.currentTenancy.representative.fullName}</strong>. Muốn trả phòng hoặc đổi khách, thao tác ở trang chi tiết phòng hoặc hợp đồng.`)}</div>` : html`<div class="ad-occupant" data-occupant hidden>
          <div class="ad-occupant-head"><h3>Khách đang thuê phòng này</h3>
            ${session.can('tenants.write') ? html`<button type="button" class="btn btn-outline-secondary btn-sm" data-add-tenant>${icon('person-plus')} Thêm khách mới</button>` : ''}</div>
          ${renderFields(occupantFields, { occupant: {} })}
          <div class="mt-3">${note('Phòng chuyển sang đã thuê ngay khi lưu. Chưa có hợp đồng thì chưa tạo được hóa đơn; bổ sung hợp đồng sau ở trang chi tiết phòng.', { tone: 'warn' })}</div>
        </div>`}
      </div></section>
      <section class="sr-panel"><div class="sr-panel-head"><h2>Giá điện nước và chi phí</h2>
        <div class="sr-panel-actions"><button type="button" class="btn btn-outline-primary btn-sm" data-inherit>${icon('box-arrow-in-down')} Kế thừa giá từ cơ sở</button></div></div>
        <div class="sr-panel-body"><p class="ad-section-hint">Bấm kế thừa để lấy giá của cơ sở rồi sửa nếu phòng này có giá riêng. Để trống là dùng giá cơ sở.</p>
          <div class="row g-3">${rateFields.map((f) => renderField(f, roomRate[f.name.split('.')[1]]))}</div></div></section>
      <section class="sr-panel"><div class="sr-panel-head"><h2>Tiện ích và nội thất</h2><span class="sr-panel-note">Máy giặt, tủ lạnh, máy lạnh…</span></div><div class="sr-panel-body">
        <div class="ad-chips" data-amenities>${catalog.amenities.map(amenityChip)}</div>
        ${session.can('settings.manage') ? html`<div class="ad-inline-add"><label class="visually-hidden" for="rm-amenity">Tên tiện ích mới</label>
          <input type="text" class="form-control form-control-sm" id="rm-amenity" placeholder="Thêm tiện ích khác, ví dụ Máy giặt" maxlength="60" autocomplete="off">
          <button type="button" class="btn btn-outline-secondary btn-sm" data-add-amenity>${icon('plus-lg')} Thêm</button></div>` : ''}
      </div></section>
      <section class="sr-panel"><div class="sr-panel-head"><h2>Ảnh phòng</h2><span class="sr-panel-note">Ảnh đầu tiên là ảnh bìa</span></div><div class="sr-panel-body">
        <div class="ad-gallery-edit" data-existing></div>
        <div data-uploader><input type="file" data-room-images aria-label="Tải ảnh phòng"></div>
      </div></section>
      <section class="sr-panel"><div class="sr-panel-head"><h2>Nội dung trên trang khách</h2></div><div class="sr-panel-body">${renderFields(listingFields, values)}</div></section>
      <div class="ad-savebar">
        <a class="btn btn-outline-secondary" href="${link(back)}">Hủy</a>
        <button type="submit" class="btn btn-primary">${icon('check2')} ${isEdit ? 'Lưu thay đổi' : 'Thêm phòng'}</button>
      </div>
    </div>
    <aside class="ad-form-rail" aria-label="Tóm tắt phòng"><div class="sr-panel" data-summary></div></aside>
  </form>`);

  const form = ctx.outlet.querySelector('form');
  ctx.onCleanup(await enhance(form));
  const input = (name) => form.querySelector(`[data-field="${CSS.escape(name)}"]`);

  // Mỗi dòng giá cho biết đang theo cơ sở hay là giá riêng của phòng.
  const syncRateHelp = () => {
    ROOM_RATE_FIELDS.forEach((r) => {
      const wrap = form.querySelector(`[data-wrap="${CSS.escape(`rate.${r.code}`)}"]`);
      const base = propertyPrices[r.code];
      const value = parseVnd(input(`rate.${r.code}`).value);
      const custom = value != null && value !== base;
      wrap.querySelector('.form-text').textContent = base == null
        ? (value == null ? 'Cơ sở chưa có giá này.' : 'Giá riêng của phòng.')
        : custom ? `Giá riêng. Cơ sở: ${priceText(base, r.unit)}` : `Theo cơ sở: ${priceText(base, r.unit)}`;
    });
  };

  const renderSummary = () => {
    const code = input('code').value.trim().toUpperCase();
    const propertyName = org.properties.find((p) => p.id === input('propertyId').value)?.name;
    const rentValue = parseVnd(input('rent').value);
    const monthly = ['GARBAGE', 'SERVICE', 'INTERNET'].reduce((sum, c) => sum + (parseVnd(input(`rate.${c}`).value) ?? propertyPrices[c] ?? 0), rentValue || 0);
    const count = form.querySelectorAll('[data-amenity]:checked').length;
    setHtml(form.querySelector('[data-summary]'), html`<div class="ad-rail-body">
      ${code ? plate(code, { size: 'lg' }) : html`<span class="ad-rail-empty">Mã phòng</span>`}
      <p class="ad-rail-name">${input('name').value.trim() || 'Tên phòng'}</p>
      <p class="ad-rail-sub">${propertyName}</p>
      <dl>
        <div><dt>Giá phòng</dt><dd class="num">${rentValue ? formatVnd(rentValue) : '—'}</dd></div>
        <div><dt>Tiền cọc đề xuất</dt><dd class="num">${parseVnd(input('requiredDeposit').value) == null ? '—' : formatVnd(parseVnd(input('requiredDeposit').value))}</dd></div>
        <div><dt>Phí cố định mỗi tháng</dt><dd class="num">${formatVnd(monthly - (rentValue || 0))}</dd></div>
        <div class="is-total"><dt>Tổng trước điện nước</dt><dd class="num">${formatVnd(monthly)}</dd></div>
        <div><dt>Điện</dt><dd class="num">${priceText(parseVnd(input('rate.ELECTRICITY').value) ?? propertyPrices.ELECTRICITY, 'đ/kWh')}</dd></div>
        <div><dt>Nước</dt><dd class="num">${priceText(parseVnd(input('rate.WATER').value) ?? propertyPrices.WATER, 'đ/m³')}</dd></div>
        <div><dt>Tiện ích</dt><dd>${count}</dd></div>
      </dl>
    </div>`);
  };

  const loadProperty = async (propertyId) => {
    loadedProperty = null;
    if (!addressEditor) setHtml(form.querySelector('[data-location]'), html`<p class="small">Đang tải địa chỉ cơ sở…</p>`);
    try {
      const property = await propertiesApi.get(propertyId);
      if (input('propertyId').value !== propertyId) return;
      loadedProperty = property;
      propertyPrices = property.prices;
      const inherited = { ...property.address, mapUrl: property.mapUrl, mapEmbedUrl: property.mapEmbedUrl };
      if (addressEditor) addressEditor.setInherited(inherited);
      else {
        addressEditor = await mountAddressEditor(form.querySelector('[data-location]'), { value: room?.addressOverride, inherited, allowInherit: true });
        ctx.onCleanup(() => addressEditor.destroy());
      }
    } catch (error) {
      await errorDialog(error, 'Không tải được bảng giá cơ sở');
    }
    syncRateHelp();
    renderSummary();
  };
  input('propertyId').addEventListener('change', (event) => loadProperty(event.target.value));
  form.addEventListener('input', () => { syncRateHelp(); renderSummary(); });
  form.addEventListener('change', renderSummary);
  await loadProperty(initialProperty);

  const pickedStatus = () => form.querySelector('[data-field="operatingStatus"]:checked')?.value;
  const occupantBlock = form.querySelector('[data-occupant]');
  const syncOccupant = () => { if (occupantBlock) occupantBlock.hidden = pickedStatus() !== 'occupied'; };
  form.addEventListener('change', syncOccupant);
  syncOccupant();
  form.querySelector('[data-add-tenant]')?.addEventListener('click', async () => {
    const created = await tenantFormModal();
    if (!created) return;
    const select = input('occupant.tenantId').tomselect;
    select.addOption({ value: created.id, text: created.fullName, sub: created.code });
    select.setValue(created.id);
  });

  form.querySelector('[data-inherit]').addEventListener('click', () => {
    ROOM_RATE_FIELDS.forEach((r) => {
      const base = propertyPrices[r.code];
      input(`rate.${r.code}`).value = base == null ? '' : formatNumber(base);
    });
    form.dispatchEvent(new Event('input', { bubbles: true }));
    toast('Đã lấy giá từ cơ sở. Có thể sửa lại cho riêng phòng này.', 'info');
  });

  form.querySelector('[data-add-amenity]')?.addEventListener('click', async () => {
    const box = form.querySelector('#rm-amenity');
    const name = box.value.trim();
    if (!name) { box.focus(); return; }
    const existing = catalog.amenities.find((a) => a.name.toLowerCase() === name.toLowerCase());
    let target = existing;
    if (!existing) {
      target = await runAction(() => catalogApi.create('amenities', { code: slugify(name).toUpperCase().slice(0, 40), name, icon: 'check2-circle' }));
      if (!target) return;
      invalidateCatalog();
      catalog.amenities.push(target);
      form.querySelector('[data-amenities]').insertAdjacentHTML('beforeend', amenityChip(target).toString());
    }
    form.querySelector(`[data-amenity][value="${target.id}"]`).checked = true;
    box.value = '';
    renderSummary();
  });

  // Ảnh đã có: đặt ảnh bìa, xóa. Áp dụng ngay vì đây là thao tác trên từng ảnh.
  let images = room?.images || [];
  const renderImages = () => {
    setHtml(form.querySelector('[data-existing]'), html`${images.map((img) => html`<figure class="${img.isCover ? 'is-cover' : ''}">
      <img src="${asset(img.url)}" alt="${img.caption || `Ảnh phòng ${room.code}`}" loading="lazy">
      <figcaption>${img.isCover ? html`<span class="sr-badge tone-door no-dot">Ảnh bìa</span>` : html`<button type="button" class="btn btn-link btn-sm p-0" data-cover="${img.id}">Đặt làm bìa</button>`}
        <button type="button" class="ad-icon-btn is-danger" data-remove-image="${img.id}" aria-label="Xóa ảnh" title="Xóa ảnh">${icon('trash3')}</button></figcaption></figure>`)}`);
  };
  renderImages();
  form.querySelector('[data-existing]').addEventListener('click', async (event) => {
    const cover = event.target.closest('[data-cover]');
    const remove = event.target.closest('[data-remove-image]');
    if (cover) {
      const next = await runAction(() => roomsApi.arrangeImages(id, { coverImageId: cover.dataset.cover }));
      if (next) { images = next; renderImages(); }
    }
    if (remove && await confirmDialog({ title: 'Xóa ảnh này?', confirmText: 'Xóa ảnh', tone: 'danger' })) {
      const next = await runAction(() => roomsApi.removeImage(id, remove.dataset.removeImage));
      if (next) { images = next; renderImages(); }
    }
  });

  const { createUploader } = await import('../../components/uploader.js');
  const uploader = createUploader(form.querySelector('[data-room-images]'), { multiple: true, maxFiles: 8, accept: ['image/jpeg', 'image/png', 'image/webp'], visibility: 'public', purpose: 'room_image' });
  ctx.onCleanup(() => uploader.destroy());

  const binding = bindForm(form, {
    fields,
    validate: (v) => {
      if (!loadedProperty || loadedProperty.id !== v.propertyId) return { propertyId: ['Cần tải thành công thông tin cơ sở trước khi lưu.'] };
      if (occupied || v.operatingStatus !== 'occupied') return null;
      const errors = {};
      if (!v.occupant?.tenantId) errors['occupant.tenantId'] = ['Chọn khách đang thuê phòng này.'];
      if (!v.occupant?.moveInOn) errors['occupant.moveInOn'] = ['Nhập ngày vào ở.'];
      return Object.keys(errors).length ? errors : null;
    },
    onSubmit: async (v) => {
      if (uploader.busy) throw new FormError('Ảnh đang tải lên. Chờ tải xong rồi lưu lại.');
      const rates = ROOM_RATE_FIELDS.map((r) => ({ chargeTypeId: charge(r.code).id, unitPrice: v.rate?.[r.code] ?? (roomRate[r.code] != null ? propertyPrices[r.code] : undefined) }))
        .filter((r) => r.unitPrice != null);
      const renting = !occupied && v.operatingStatus === 'occupied';
      const { rate: _rate, occupant, ...rest } = v;
      const body = { ...rest, roomTypeName: catalog.roomTypes.find((t) => t.id === v.roomTypeId)?.name, rates, amenityIds: [...form.querySelectorAll('[data-amenity]:checked')].map((el) => el.value), imageFileIds: uploader.fileIds, occupant: renting ? occupant : undefined };
      if (addressEditor) body.addressOverride = addressEditor.read();
      if (occupied || room?.calendar?.length) delete body.operatingStatus;
      else if (renting) body.operatingStatus = 'available';
      if (isEdit && body.operatingStatus && body.operatingStatus !== room.operatingStatus) {
        body.statusReason = await reasonDialog({ title: 'Lý do đổi trạng thái phòng', text: 'Thông tin và trạng thái được lưu cùng nhau.', confirmText: 'Lưu thay đổi' });
        if (!body.statusReason) return;
      }
      const saved = isEdit ? await roomsApi.update(id, body) : await roomsApi.create(body);
      binding.reset();
      dataChanged();
      toast(isEdit ? 'Đã lưu thay đổi' : `Đã thêm phòng ${saved.code}`);
      ctx.navigate(`/admin/rooms/${saved.id}`);
    },
  });
  ctx.onCleanup(() => binding.destroy());
}
