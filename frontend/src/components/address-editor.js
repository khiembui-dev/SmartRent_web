import { FormError, renderFields } from './form.js';
import { initTomSelects } from './select.js';
import { publicApi } from '../services/api.js';
import { html, setHtml } from '../utils/html.js';
import { mapLinks, mapUrlError } from '../utils/maps.js';

let catalogPromise;
const catalog = () => (catalogPromise ||= publicApi.addressUnits().catch((error) => { catalogPromise = null; throw error; }));
const fullAddress = (a) => [a?.line, a?.locality, a?.province, 'Việt Nam'].filter(Boolean).join(', ');

/** Editor địa chỉ dùng chung. read() chỉ trả dữ liệu khi form mẹ lưu; đổi dropdown không ghi SQL ngay. */
export async function mountAddressEditor(host, { value = null, inherited = null, allowInherit = false } = {}) {
  let units;
  try { units = (await catalog()).provinces; }
  catch {
    setHtml(host, html`<div class="alert alert-warning">Không tải được danh mục địa chỉ. Hãy tải lại trang trước khi sửa địa chỉ.</div>`);
    // Không làm mất địa chỉ cũ khi API tạm lỗi; form vẫn sửa được giá hoặc thông tin khác.
    return { read: () => value, setInherited: () => {}, destroy: () => {} };
  }
  let useInherited = allowInherit && !value;
  let changed = false;
  let timer;
  const original = value;
  const initial = value || inherited || {};
  // Chỉ tách phần số nhà; không suy đoán phường mới từ tên quận/phường cũ.
  const parts = initial.line?.match(/^(\S+)\s+(.+)$/);
  const fields = [
    { name: 'addressProvince', label: 'Tỉnh / thành phố', type: 'tomselect', options: units.map((p) => ({ value: p.code, label: p.name })), placeholderOption: 'Chọn tỉnh / thành phố', col: 'col-md-6' },
    { name: 'addressWard', label: 'Phường / xã / đặc khu', type: 'tomselect', options: [], placeholderOption: 'Chọn tỉnh / thành phố trước', col: 'col-md-6' },
    { name: 'addressHouse', label: 'Số nhà / ngõ', placeholder: 'Ví dụ: 12/5', maxLength: 100, col: 'col-md-4' },
    { name: 'addressStreet', label: 'Tên đường / thôn / ấp', placeholder: 'Ví dụ: Nguyễn Gia Trí', maxLength: 200, col: 'col-md-8' },
    { name: 'addressPin', label: 'Ghim Google Maps chính xác (tùy chọn)', type: 'url', maxLength: 4096, help: 'Mặc định link được tạo từ địa chỉ. Nếu Google nhận sai vị trí, dán link Chia sẻ từ ghim đúng.' },
  ];
  setHtml(host, html`<div class="sr-address-editor">
    ${allowInherit ? html`<label class="form-check mb-3"><input class="form-check-input" type="checkbox" data-inherit-address ${useInherited ? 'checked' : ''}><span class="form-check-label">Dùng địa chỉ của cơ sở</span></label>` : ''}
    <p class="small text-muted-sr">Chọn địa chỉ hành chính mới: tỉnh/thành phố → phường/xã. Không cần nhập quận/huyện.</p>
    ${initial.line && !initial.wardCode ? html`<p class="small" data-legacy-address>Địa chỉ hiện có: ${fullAddress(initial)}. Khi sửa, chọn lại tỉnh và phường mới.</p>` : ''}
    <fieldset data-address-fields ${useInherited ? 'hidden disabled' : ''}>${renderFields(fields, {
      addressProvince: initial.provinceCode, addressHouse: initial.houseNumber || parts?.[1] || '', addressStreet: initial.street || parts?.[2] || initial.line || '', addressPin: initial.mapUrl,
    })}</fieldset>
    <div class="text-danger small my-2" role="alert" data-address-error></div>
    <div class="sr-address-preview" data-address-preview></div>
  </div>`);
  const input = (name) => host.querySelector(`[data-field="${name}"]`);
  const disposeSelects = initTomSelects(host);
  const provinceSelect = input('addressProvince').tomselect;
  const wardSelect = input('addressWard').tomselect;
  const setWards = (provinceCode, selected) => {
    wardSelect.clear(true); wardSelect.clearOptions();
    wardSelect.addOptions((units.find((p) => p.code === provinceCode)?.wards || []).map((w) => ({ value: w.code, text: w.name })));
    if (provinceCode) wardSelect.enable(); else wardSelect.disable();
    if (selected) wardSelect.setValue(selected, true);
    wardSelect.settings.placeholder = provinceCode ? 'Chọn phường / xã' : 'Chọn tỉnh / thành phố trước';
    wardSelect.inputState();
  };
  setWards(initial.provinceCode, initial.wardCode);
  const draft = () => {
    const province = units.find((p) => p.code === input('addressProvince').value);
    const ward = province?.wards.find((w) => w.code === input('addressWard').value);
    const houseNumber = input('addressHouse').value.trim(), street = input('addressStreet').value.trim();
    return { houseNumber, street, provinceCode: province?.code, wardCode: ward?.code,
      province: province?.name, locality: ward?.name, line: [houseNumber, street].filter(Boolean).join(' '),
      mapUrl: input('addressPin').value.trim() || null, mapEmbedUrl: !changed ? original?.mapEmbedUrl || null : null };
  };
  const preview = () => {
    const address = useInherited ? inherited : !changed && original ? original : draft();
    const text = fullAddress(address);
    const maps = mapLinks(address || {}, text);
    const valid = address?.line && address?.province;
    setHtml(host.querySelector('[data-address-preview]'), html`<div><strong>Địa chỉ hiển thị cho khách</strong><p class="mb-2">${valid ? text : 'Nhập số nhà, tên đường và chọn tỉnh/phường để tạo liên kết.'}</p>
      ${valid ? html`<a class="btn btn-outline-primary btn-sm" href="${maps.url}" target="_blank" rel="noopener noreferrer">Mở Google Maps ↗</a>
        ${maps.embed ? html`<button class="btn btn-link btn-sm" type="button" data-preview-map>Xem trước bản đồ</button>` : ''}` : ''}
      ${useInherited ? html`<p class="small text-muted-sr mt-2 mb-0">Địa chỉ cập nhật theo cơ sở. Bỏ chọn để nhập địa chỉ riêng cho phòng này.</p>` : html`<p class="small text-muted-sr mt-2 mb-0">Kiểm tra ghim trước khi lưu. Google có thể chưa cập nhật tên đường hoặc phường mới.</p>`}</div>
      <div data-map-frame></div>`);
    host.querySelector('[data-preview-map]')?.addEventListener('click', () => {
      setHtml(host.querySelector('[data-map-frame]'), html`<iframe title="Xem trước vị trí Google Maps" src="${maps.embed}" loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>`);
    });
  };
  const onChange = (e) => {
    host.querySelector('[data-address-error]').textContent = '';
    if (e.target.matches('[data-inherit-address]')) {
      useInherited = e.target.checked;
      const fs = host.querySelector('fieldset'); fs.hidden = useInherited; fs.disabled = useInherited;
      if (!useInherited) { provinceSelect.enable(); if (input('addressProvince').value) wardSelect.enable(); }
    } else if (e.target.matches('[data-field]')) {
      changed = true;
      if (e.target === input('addressProvince')) setWards(e.target.value);
      // Không dùng lại ghim của địa chỉ cũ khi số nhà/đường/phường đã đổi.
      if (e.target !== input('addressPin')) input('addressPin').value = '';
    } else return;
    clearTimeout(timer); timer = setTimeout(preview, 150);
  };
  host.addEventListener('change', onChange);
  const onInput = (e) => {
    if (!['addressHouse', 'addressStreet', 'addressPin'].includes(e.target.dataset.field)) return;
    onChange(e);
  };
  host.addEventListener('input', onInput);
  preview();
  return {
    read() {
      if (useInherited) return null;
      if (!changed && original?.line) return original;
      const a = draft();
      const error = !a.provinceCode || !a.wardCode ? 'Chọn tỉnh/thành phố và phường/xã.' : !a.houseNumber || !a.street ? 'Nhập số nhà và tên đường/thôn/ấp.' : mapUrlError(a.mapUrl);
      if (error) { host.querySelector('[data-address-error]').textContent = error; host.scrollIntoView({ block: 'center' }); throw new FormError(error); }
      return a;
    },
    setInherited(next) {
      inherited = next;
      if (useInherited) {
        // Đổi cơ sở rồi bỏ kế thừa phải bắt đầu từ địa chỉ cơ sở mới.
        const split = next?.line?.match(/^(\S+)\s+(.+)$/);
        provinceSelect.setValue(next?.provinceCode || '', true);
        setWards(next?.provinceCode, next?.wardCode);
        input('addressHouse').value = next?.houseNumber || split?.[1] || '';
        input('addressStreet').value = next?.street || split?.[2] || next?.line || '';
        input('addressPin').value = next?.mapUrl || '';
        changed = true;
      }
      preview();
    },
    destroy() { clearTimeout(timer); disposeSelects(); host.removeEventListener('change', onChange); host.removeEventListener('input', onInput); },
  };
}
