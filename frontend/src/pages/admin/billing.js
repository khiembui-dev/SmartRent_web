// Tính tiền phòng: chọn cơ sở và tháng → xem số tháng trước → nhập số tháng này → tạo hóa đơn.
// Hóa đơn tạo ra được phát hành ngay nên xuất hiện ở trang Hóa đơn và trong tài khoản khách đang ở phòng đó.
// Số trên bảng chỉ là tạm tính để xem trước; tổng tiền chính thức do máy chủ chốt khi tạo hóa đơn.
import { invoiceBadges, propertySelect } from '../../components/admin-kit.js';
import { confirmDialog, errorDialog, infoDialog, reasonDialog, runAction, toast } from '../../components/dialogs.js';
import { formModal, openModal } from '../../components/modal.js';
import { emptyState, errorState, icon, link, loadingBlock, note, pageHeader, plate } from '../../components/ui.js';
import { replaceQuery } from '../../router/router.js';
import { metersApi, invoicesApi, periodsApi, settingsApi } from '../../services/api.js';
import { session } from '../../services/session.js';
import { addDays, formatDate, monthLabel, nextMonthStart, todayIso, vnDateTimeToInstant } from '../../utils/date.js';
import { uuid } from '../../utils/ids.js';
import { formatNumber, formatVnd, parseDecimal } from '../../utils/money.js';
import { html, setHtml } from '../../utils/html.js';
import { bindActions, dataChanged, tenantCell } from './common.js';

const KINDS = { electricity: { name: 'điện', unit: 'kWh' }, water: { name: 'nước', unit: 'm³' } };
const TAB_GROUPS = {
  missing_readings: ['missing_readings', 'blocked'],
  ready: ['ready', 'draft'],
  invoiced: ['issued_unpaid', 'issued_partial', 'paid'],
};
const TABS = [['', 'Tất cả'], ['missing_readings', 'Chưa nhập số'], ['ready', 'Đủ số, chưa tạo hóa đơn'], ['invoiced', 'Đã tạo hóa đơn']];

/** Trạng thái một tháng trên dải chọn chu kỳ. */
function monthState(period) {
  if (!period) return { cls: 'is-none', text: 'Chưa mở' };
  const s = period.stats;
  if (!s.tenancyCount) return { cls: 'is-none', text: 'Không có khách' };
  if (s.missingReadings || s.blocked) return { cls: 'is-todo', text: `${s.missingReadings + s.blocked} thiếu số` };
  if (s.readyToDraft || s.drafts) return { cls: 'is-ready', text: `${s.readyToDraft + s.drafts} chờ tạo` };
  return { cls: 'is-done', text: 'Xong' };
}

export default async function BillingPage(ctx) {
  ctx.setTitle('Tính tiền phòng');
  const org = session.organization;
  const today = todayIso();
  const currentMonth = today.slice(0, 7);
  let propertyId = ctx.query.propertyId || session.propertyId || org.properties[0]?.id;
  let month = ctx.query.month || currentMonth;
  let year = Number(month.slice(0, 4));
  let tab = ctx.query.group === 'ready' ? 'ready' : ctx.query.group === 'missing_readings' ? 'missing_readings' : '';
  let q = '';
  let periods = [];
  let sheet = null;
  let schedule = null;
  // Giữ chuỗi đang nhập theo công tơ để đổi tab/tìm kiếm không làm mất số chưa lưu.
  const typed = new Map();
  const rowErrors = new Map();

  const can = { readings: session.can('meters.write'), invoices: session.can('invoices.write') && session.can('invoices.issue') };
  const periodOf = (m) => periods.find((p) => p.monthStart === `${m}-01`);
  const locked = () => sheet?.period.status === 'locked';
  const canEnter = () => can.readings && !locked();

  setHtml(ctx.outlet, html`${pageHeader({
    title: 'Tính tiền phòng',
    subtitle: 'Chọn tháng, nhập số điện nước mới rồi tạo hóa đơn. Hóa đơn gửi vào tài khoản khách ngay sau khi tạo.',
  })}
  <section class="sr-panel ad-cycle">
    <div class="ad-cycle-top">
      ${propertySelect({ id: 'bl-property', value: propertyId, all: false })}
      <div class="ad-field"><span class="form-label">Năm</span>
        <div class="ad-year"><button type="button" class="ad-icon-btn" data-year="-1" aria-label="Năm trước">${icon('chevron-left')}</button><strong class="num" data-year-label>${year}</strong>
          <button type="button" class="ad-icon-btn" data-year="1" aria-label="Năm sau">${icon('chevron-right')}</button></div></div>
      <p class="ad-cycle-note" data-schedule></p>
    </div>
    <div class="ad-months" role="group" aria-label="Chọn chu kỳ tháng" data-months></div>
  </section>
  <div data-sheet>${loadingBlock(10)}</div>`);
  const sheetEl = ctx.outlet.querySelector('[data-sheet]');

  const renderMonths = () => {
    ctx.outlet.querySelector('[data-year-label]').textContent = year;
    setHtml(ctx.outlet.querySelector('[data-months]'), html`${Array.from({ length: 12 }, (_, i) => {
      const m = `${year}-${String(i + 1).padStart(2, '0')}`;
      const state = monthState(periodOf(m));
      const future = m > currentMonth;
      return html`<button type="button" class="ad-month ${future ? 'is-future' : state.cls}" data-month="${m}" aria-pressed="${String(m === month)}" ${future ? 'disabled' : ''}>
        <strong>Tháng ${i + 1}</strong><span>${future ? 'Chưa tới' : state.text}</span></button>`;
    })}`);
    // Màn hình hẹp: đưa tháng đang chọn vào giữa dải tháng.
    const strip = ctx.outlet.querySelector('[data-months]');
    const active = strip.querySelector('[aria-pressed="true"]');
    if (active) strip.scrollLeft = active.offsetLeft - (strip.clientWidth - active.offsetWidth) / 2;
  };

  const groupTotal = (rows) => rows.reduce((sum, r) => sum + (r.estimate?.total || 0), 0);
  const rowsOfTab = (key) => (key ? sheet.rows.filter((r) => TAB_GROUPS[key].includes(r.group)) : sheet.rows);
  const invoiceable = () => sheet.rows.filter((r) => ['ready', 'draft'].includes(r.group) && !r.problems.length);

  const typedValue = (b) => {
    const raw = (typed.get(b.meterId) || '').trim();
    if (!raw) return null;
    const value = parseDecimal(raw);
    return value == null || Number.isNaN(value) ? NaN : value;
  };

  /** Lượng dùng hiển thị: số đã lưu, hoặc số đang gõ trừ số tháng trước. */
  const usageOf = (b) => {
    if (b.current) return b.consumption;
    const value = typedValue(b);
    if (value == null || Number.isNaN(value) || !b.previous) return null;
    return Math.round((value - b.previous.value) * 1000) / 1000;
  };

  /** Tạm tính: tiền phòng + phí cố định + lượng dùng × đơn giá. */
  const estimateOf = (row) => {
    if (row.invoice?.status === 'issued') return { total: row.invoice.totalAmount, complete: true };
    const e = row.estimate;
    if (!e) return { total: null, complete: false };
    let total = e.fixedTotal;
    let complete = true;
    for (const kind of Object.keys(KINDS)) {
      const block = row.readings[kind];
      if (!block) continue;
      const use = usageOf(block);
      if (use == null || use < 0) complete = false;
      else total += Math.round(use * (e.unitPrices[kind] ?? 0));
    }
    return { total, complete };
  };

  const useText = (block, kind) => {
    const use = usageOf(block);
    const typedNow = typedValue(block);
    if (!block.current && Number.isNaN(typedNow)) return html`<span class="text-danger">Số chưa hợp lệ</span>`;
    if (use == null) return '';
    if (use < 0) return html`<span class="text-danger">Nhỏ hơn số tháng trước</span>`;
    const anomaly = block.anomaly || (block.averageConsumption > 0 && (use > block.averageConsumption * 2 || use < block.averageConsumption * 0.3));
    return html`<span class="${anomaly ? 'ad-anomaly' : ''}">Dùng ${formatNumber(use, 3)} ${KINDS[kind].unit}${anomaly ? html`, cao thấp bất thường` : ''}</span>`;
  };

  const meterCell = (row, kind) => {
    const b = row.readings[kind];
    const meta = KINDS[kind];
    if (!b) return html`<span class="text-muted-sr small">Không có công tơ</span>`;
    const previous = b.previous
      ? html`<span class="ad-meter-old"><small>Tháng trước</small><strong class="num" title="Chốt ${formatDate(b.previous.observedAt)}">${formatNumber(b.previous.value, 3)}</strong></span>`
      : html`<span class="ad-meter-old"><small>Tháng trước</small><strong class="text-danger">Chưa có</strong></span>`;
    let current;
    if (b.current) {
      const canFix = canEnter() && !b.current.inUse && b.current.kind === 'periodic';
      current = html`<span class="ad-meter-new is-saved"><small>Tháng này</small><strong class="num">${formatNumber(b.current.value, 3)}</strong>
        ${canFix ? html`<button type="button" class="btn btn-link btn-sm p-0" data-action="correct" data-reading="${b.current.id}" data-value="${b.current.value}" data-label="${meta.name} phòng ${row.room.code}">Sửa</button>` : ''}</span>`;
    } else if (canEnter()) {
      current = html`<span class="ad-meter-new"><label class="visually-hidden" for="m-${b.meterId}">Số ${meta.name} tháng này phòng ${row.room.code}</label>
        <small aria-hidden="true">Tháng này</small>
        <input id="m-${b.meterId}" class="form-control form-control-sm num ${rowErrors.has(b.meterId) ? 'is-invalid' : ''}" inputmode="decimal" autocomplete="off" placeholder="Nhập số" data-meter="${b.meterId}" data-row="${row.tenancy.id}" data-kind="${kind}" value="${typed.get(b.meterId) || ''}"></span>`;
    } else {
      current = html`<span class="ad-meter-new is-saved"><small>Tháng này</small><strong class="text-muted-sr">Chưa nhập</strong></span>`;
    }
    return html`<div class="ad-meter">${previous}${icon('arrow-right', 'ad-meter-arrow')}${current}</div>
      <div class="ad-meter-use" data-use="${b.meterId}">${useText(b, kind)}</div>
      ${rowErrors.has(b.meterId) ? html`<div class="small text-danger">${rowErrors.get(b.meterId)}</div>` : ''}`;
  };

  const totalCell = (row) => {
    if (row.invoice?.status === 'issued') return html`<strong class="num">${formatVnd(row.invoice.totalAmount)}</strong>`;
    const e = estimateOf(row);
    return html`<button type="button" class="ad-total ${e.complete ? '' : 'is-partial'}" data-action="breakdown" data-id="${row.tenancy.id}" aria-label="Xem chi tiết tạm tính phòng ${row.room.code}">
      <strong class="num">${formatVnd(e.total)}</strong><small>${e.complete ? 'Tạm tính' : 'Chưa gồm điện nước'}</small></button>`;
  };

  const actionCell = (row) => {
    if (row.invoice?.status === 'issued') {
      return html`<a class="fw-semibold" href="${link(`/admin/invoices/${row.invoice.id}`)}">${row.invoice.code}</a><div class="mt-1">${invoiceBadges(row.invoice)}</div>`;
    }
    if (row.group === 'blocked') return html`<span class="sr-badge tone-danger">Cần xử lý</span>`;
    if (row.group === 'missing_readings') return html`<span class="sr-badge tone-wash">Chưa nhập số</span>`;
    if (row.problems.length || locked() || !can.invoices) return html`<span class="sr-badge tone-muted">Đủ số</span>`;
    return html`<button type="button" class="btn btn-outline-primary btn-sm" data-action="create-one" data-id="${row.tenancy.id}">Tạo hóa đơn</button>`;
  };

  const rowHtml = (row) => html`<tr data-tenancy="${row.tenancy.id}">
    <td data-label="Phòng"><div class="ad-led-room">${plate(row.room)}<span>${tenantCell(row.tenancy.representative)}${row.endedInPeriod ? html`<small class="d-block text-muted-sr">Đã trả phòng trong tháng</small>` : ''}</span></div></td>
    <td data-label="Điện (kWh)">${meterCell(row, 'electricity')}</td>
    <td data-label="Nước (m³)">${meterCell(row, 'water')}</td>
    <td data-label="Tổng tiền" class="text-end" data-total="${row.tenancy.id}">${totalCell(row)}</td>
    <td data-label="Hóa đơn" class="text-end">${actionCell(row)}</td>
  </tr>${row.problems.filter((p) => !['missing_reading'].includes(p.code)).length ? html`<tr class="ad-led-problem"><td colspan="5">${icon('exclamation-triangle')} ${row.problems.filter((p) => p.code !== 'missing_reading').map((p) => p.message).join(' ')}
    ${row.problems.some((p) => p.code === 'unsigned_contract') && session.can('contracts.sign') ? html`<a href="${link(`/admin/contracts/new?tenancyId=${row.tenancy.id}`)}">Bổ sung hợp đồng</a>` : ''}</td></tr>` : ''}`;

  const renderBar = () => {
    const bar = ctx.outlet.querySelector('[data-bar]');
    if (!bar) return;
    const entered = [...typed.values()].filter((v) => v.trim()).length;
    const count = invoiceable().length;
    bar.querySelector('[data-entered]').textContent = entered ? `${entered} số chưa lưu` : 'Không có số chưa lưu';
    const save = bar.querySelector('[data-action="save"]');
    if (save) save.disabled = !entered;
    const create = bar.querySelector('[data-action="create-all"]');
    if (create) {
      create.disabled = !count && !entered;
      create.textContent = entered ? 'Lưu số và tạo hóa đơn' : `Tạo hóa đơn${count ? ` cho ${count} phòng` : ''}`;
    }
  };

  const renderSheet = () => {
    const period = sheet.period;
    const counts = Object.fromEntries(TABS.map(([key]) => [key, rowsOfTab(key).length]));
    const needle = q.toLowerCase();
    const rows = rowsOfTab(tab).filter((r) => !needle || `${r.room.code} ${r.tenancy.representative.fullName}`.toLowerCase().includes(needle));
    const lastDay = addDays(nextMonthStart(period.monthStart), -1);
    const observedDefault = lastDay < today ? lastDay : today;
    const stats = sheet.stats;
    setHtml(sheetEl, html`<section class="sr-panel ad-ledger-panel">
      <div class="ad-ledger-head">
        <div><h2>${monthLabel(period.monthStart)}</h2><p>${period.property.name}. ${stats.tenancyCount} phòng có khách trong tháng.</p></div>
        <div class="ad-ledger-tools">
          <div class="ad-search">${icon('search')}<input type="search" class="form-control form-control-sm" data-sheet-search value="${q}" placeholder="Tìm phòng hoặc khách" aria-label="Tìm phòng hoặc khách"></div>
          ${session.can(locked() ? 'billing.unlock' : 'billing.lock') ? html`<button type="button" class="btn btn-outline-secondary btn-sm" data-action="${locked() ? 'unlock' : 'lock'}">${icon(locked() ? 'unlock' : 'lock')} ${locked() ? 'Mở khóa tháng' : 'Khóa tháng'}</button>` : ''}
        </div>
      </div>
      ${locked() ? html`<div class="px-3 pb-3">${note('Tháng này đã khóa nên không nhập số hoặc tạo hóa đơn được. Mở khóa cần có lý do.', { tone: 'warn', iconName: 'lock' })}</div>` : ''}
      <div class="ad-tabs" role="group" aria-label="Lọc theo tình trạng">${TABS.map(([key, label]) => html`<button type="button" class="ad-tab ${key === 'missing_readings' && counts[key] ? 'has-attention' : ''}" data-tab="${key}" aria-pressed="${String(tab === key)}">${label}<span class="num">${counts[key]}</span></button>`)}</div>
      ${rows.length ? html`<div class="ad-ledger-wrap"><table class="ad-ledger"><thead><tr><th>Phòng</th><th>Điện (kWh)</th><th>Nước (m³)</th><th class="text-end">Tổng tiền</th><th class="text-end">Hóa đơn</th></tr></thead>
        <tbody>${rows.map(rowHtml)}</tbody></table></div>`
    : emptyState(stats.tenancyCount
      ? { iconName: tab === 'missing_readings' ? 'check2-circle' : 'funnel', title: tab === 'missing_readings' ? 'Đã nhập đủ số điện nước' : 'Không có phòng ở mục này', text: tab === 'missing_readings' ? 'Chuyển sang mục Đủ số để tạo hóa đơn.' : '' }
      : { iconName: 'door-open', title: 'Tháng này không có phòng có khách', text: 'Chỉ phòng có hợp đồng mới cần tính tiền.' })}
    </section>
    ${canEnter() || (can.invoices && !locked()) ? html`<div class="ad-billbar" data-bar>
      <div class="ad-field"><label class="form-label" for="bl-date">Ngày chốt số</label>
        <input type="text" class="form-control form-control-sm" id="bl-date" data-datepicker data-max="${today}" value="${observedDefault}" autocomplete="off"></div>
      <p data-entered></p>
      ${canEnter() ? html`<button type="button" class="btn btn-outline-secondary" data-action="save">${icon('save')} Lưu số đã nhập</button>` : ''}
      ${can.invoices ? html`<button type="button" class="btn btn-primary" data-action="create-all"></button>` : ''}
    </div>` : ''}`);
    renderBar();
    import('../../components/datepicker.js').then(({ initDatepickers }) => {
      if (sheetEl.querySelector('#bl-date')) disposeDates = initDatepickers(sheetEl.querySelector('[data-bar]'));
    });
  };
  let disposeDates = () => {};
  ctx.onCleanup(() => disposeDates());

  const renderNoPeriod = () => {
    const period = periodOf(month);
    if (period) return;
    setHtml(sheetEl, html`<section class="sr-panel">${emptyState({
      iconName: 'calendar-plus', title: `${monthLabel(`${month}-01`)} chưa mở`, text: 'Mở tháng này để xem các phòng cần tính tiền.',
      action: session.can('invoices.write') ? html`<button type="button" class="btn btn-primary btn-sm" data-action="open-period">Mở tháng này</button>` : '',
    })}</section>`);
  };

  const loadSheet = async () => {
    replaceQuery({ propertyId, month: month === currentMonth ? undefined : month, group: tab && tab !== 'invoiced' ? tab : undefined });
    disposeDates();
    const period = periodOf(month);
    if (!period) {
      sheet = null;
      renderNoPeriod();
      return;
    }
    if (sheet) sheetEl.style.opacity = '.55';
    try {
      sheet = await periodsApi.worksheet(period.id);
      renderSheet();
    } catch (error) {
      setHtml(sheetEl, errorState(error));
      sheetEl.querySelector('#sr-retry')?.addEventListener('click', loadSheet);
    }
    sheetEl.style.opacity = '';
  };

  const loadPeriods = async () => {
    periods = (await periodsApi.list({ propertyId, pageSize: 60 })).items;
    renderMonths();
  };

  const openPeriod = async () => {
    const created = await runAction(() => periodsApi.create({ propertyId, monthStart: `${month}-01` }));
    if (!created) return;
    await loadPeriods();
    await loadSheet();
  };

  /** Lưu các số đang nhập. Trả false khi còn dòng lỗi để luồng tạo hóa đơn dừng lại. */
  const saveTyped = async () => {
    rowErrors.clear();
    const allTyped = [...typed.entries()].filter(([, v]) => v.trim());
    if (!allTyped.length) return true;
    const blocks = sheet.rows.flatMap((r) => Object.values(r.readings).filter(Boolean));
    let bad = 0;
    for (const [meterId] of allTyped) {
      const block = blocks.find((b) => b.meterId === meterId);
      const value = typedValue(block);
      if (value == null || Number.isNaN(value)) {
        rowErrors.set(meterId, 'Số chưa hợp lệ. Dùng dấu phẩy cho phần thập phân.');
        bad += 1;
      } else if (block.previous && value < block.previous.value) {
        rowErrors.set(meterId, `Không được nhỏ hơn ${formatNumber(block.previous.value, 3)}.`);
        bad += 1;
      }
    }
    if (bad) {
      renderSheet();
      toast(`${bad} số chưa hợp lệ, xem dòng được đánh dấu`, 'warning');
      return false;
    }
    const day = sheetEl.querySelector('#bl-date')?.value || today;
    const observedAt = day === today ? new Date().toISOString() : vnDateTimeToInstant(day, 18);
    const items = allTyped.map(([meterId]) => ({ meterId, readingValue: typedValue(blocks.find((b) => b.meterId === meterId)), observedAt }));
    const result = await runAction(() => metersApi.recordBatch({ billingPeriodId: sheet.period.id, items }, uuid()));
    if (!result) return false;
    const failed = result.results.filter((r) => r.status === 'failed');
    result.results.filter((r) => r.status === 'succeeded').forEach((r) => typed.delete(r.meterId));
    failed.forEach((f) => rowErrors.set(f.meterId, f.message));
    const saved = result.results.length - failed.length;
    toast(failed.length ? `Đã lưu ${saved} số, ${failed.length} số lỗi` : `Đã lưu ${saved} số`, failed.length ? 'warning' : 'success');
    dataChanged();
    await loadPeriods();
    await loadSheet();
    return !failed.length;
  };

  const createInvoices = async (rows) => {
    const total = groupTotal(rows);
    const ok = await confirmDialog({
      title: rows.length === 1 ? `Tạo hóa đơn phòng ${rows[0].room.code}?` : `Tạo ${rows.length} hóa đơn ${monthLabel(sheet.period.monthStart).toLowerCase()}?`,
      html: html`<p class="mb-1">Tổng tạm tính <strong>${formatVnd(total)}</strong>.</p><p class="mb-0">Hóa đơn gửi vào tài khoản khách ngay. Sau khi tạo, muốn đổi tiền phải dùng điều chỉnh hoặc hủy hóa đơn.</p>`,
      confirmText: 'Tạo hóa đơn',
    });
    if (!ok) return;
    const result = await runAction(() => invoicesApi.createBatch({ periodId: sheet.period.id, action: 'issue', tenancyIds: rows.map((r) => r.tenancy.id) }, uuid()));
    if (!result) return;
    const { succeeded, failed } = result.summary;
    if (failed) {
      await infoDialog({ title: `Đã tạo ${succeeded} hóa đơn, ${failed} phòng lỗi`, icon: 'warning', html: html`<ul class="text-start mb-0">${result.items.filter((i) => i.status === 'failed').map((i) => html`<li>${i.room}: ${i.message}</li>`)}</ul>` });
    } else {
      toast(`Đã tạo ${succeeded} hóa đơn và gửi vào tài khoản khách`);
    }
    dataChanged();
    await loadPeriods();
    await loadSheet();
  };

  // ---------------------------------------------------------------- sự kiện
  const onClick = async (event) => {
    const yearBtn = event.target.closest('[data-year]');
    if (yearBtn) {
      year += Number(yearBtn.dataset.year);
      renderMonths();
      return;
    }
    const monthBtn = event.target.closest('[data-month]');
    if (monthBtn && !monthBtn.disabled) {
      month = monthBtn.dataset.month;
      typed.clear();
      rowErrors.clear();
      renderMonths();
      if (!periodOf(month) && month === currentMonth && session.can('invoices.write')) await openPeriod();
      else await loadSheet();
      return;
    }
    const tabBtn = event.target.closest('[data-tab]');
    if (tabBtn) {
      tab = tabBtn.dataset.tab;
      renderSheet();
    }
  };
  const onInput = (event) => {
    const el = event.target;
    if (el.matches('[data-sheet-search]')) {
      q = el.value;
      const position = el.selectionStart;
      renderSheet();
      const again = sheetEl.querySelector('[data-sheet-search]');
      again.focus();
      again.setSelectionRange(position, position);
      return;
    }
    if (!el.matches('[data-meter]')) return;
    typed.set(el.dataset.meter, el.value);
    rowErrors.delete(el.dataset.meter);
    el.classList.remove('is-invalid');
    const row = sheet.rows.find((r) => r.tenancy.id === el.dataset.row);
    const block = row.readings[el.dataset.kind];
    setHtml(sheetEl.querySelector(`[data-use="${el.dataset.meter}"]`), useText(block, el.dataset.kind));
    setHtml(sheetEl.querySelector(`[data-total="${row.tenancy.id}"]`), totalCell(row));
    renderBar();
  };
  const onKeydown = (event) => {
    if (event.key !== 'Enter' || !event.target.matches('[data-meter]')) return;
    event.preventDefault();
    const inputs = [...sheetEl.querySelectorAll('[data-meter]')];
    inputs[inputs.indexOf(event.target) + 1]?.focus();
  };
  const onChange = async (event) => {
    if (event.target.id !== 'bl-property') return;
    propertyId = event.target.value;
    typed.clear();
    rowErrors.clear();
    sheet = null;
    setHtml(sheetEl, loadingBlock(10));
    await loadPeriods();
    await loadSheet();
  };
  ctx.outlet.addEventListener('click', onClick);
  ctx.outlet.addEventListener('input', onInput);
  ctx.outlet.addEventListener('keydown', onKeydown);
  ctx.outlet.addEventListener('change', onChange);
  ctx.onCleanup(() => {
    ctx.outlet.removeEventListener('click', onClick);
    ctx.outlet.removeEventListener('input', onInput);
    ctx.outlet.removeEventListener('keydown', onKeydown);
    ctx.outlet.removeEventListener('change', onChange);
  });

  ctx.onCleanup(bindActions(ctx.outlet, {
    save: saveTyped,
    'open-period': openPeriod,
    'create-all': async () => {
      if (!(await saveTyped())) return;
      const rows = invoiceable();
      if (!rows.length) {
        toast('Chưa có phòng đủ số để tạo hóa đơn', 'info');
        return;
      }
      await createInvoices(rows);
    },
    'create-one': async (btn) => {
      const row = sheet.rows.find((r) => r.tenancy.id === btn.dataset.id);
      await createInvoices([row]);
    },
    breakdown: (btn) => {
      const row = sheet.rows.find((r) => r.tenancy.id === btn.dataset.id);
      const e = row.estimate;
      const metered = Object.keys(KINDS).map((kind) => {
        const block = row.readings[kind];
        if (!block) return null;
        const use = usageOf(block);
        const price = e.unitPrices[kind];
        return { label: `Tiền ${KINDS[kind].name}`, text: use == null ? 'Chưa có số tháng này' : `${formatNumber(use, 3)} ${KINDS[kind].unit} × ${formatVnd(price)}`, amount: use == null || use < 0 ? null : Math.round(use * (price ?? 0)) };
      }).filter(Boolean);
      const est = estimateOf(row);
      openModal({
        title: `Tạm tính phòng ${row.room.code}`,
        body: html`<ul class="ad-breakdown">
          ${e.lines.filter((l) => !l.metered).map((l) => html`<li><span>${l.description}</span><strong class="num">${formatVnd(l.amount)}</strong></li>`)}
          ${metered.map((m) => html`<li><span>${m.label}<small>${m.text}</small></span><strong class="num">${m.amount == null ? '—' : formatVnd(m.amount)}</strong></li>`)}
          <li class="is-total"><span>Tổng tạm tính</span><strong class="num">${formatVnd(est.total)}</strong></li></ul>
          <p class="small text-muted-sr mb-0 mt-3">Số chính thức do máy chủ chốt khi tạo hóa đơn. Giá lấy theo hợp đồng, sau đó tới giá riêng của phòng và giá cơ sở.</p>`,
      });
    },
    correct: async (btn) => {
      const result = await formModal({
        title: `Sửa số ${btn.dataset.label}`, submitLabel: 'Lưu số mới',
        intro: note('Bản ghi cũ được giữ lại trong lịch sử. Số đã lên hóa đơn thì không sửa ở đây.'),
        fields: [
          { name: 'readingValue', label: 'Số đúng', type: 'decimal', decimals: 3, required: true, min: 0, default: Number(btn.dataset.value) },
          { name: 'reason', label: 'Lý do sửa', type: 'textarea', rows: 2, required: true, minLength: 5 },
        ],
        onSubmit: (v) => metersApi.correct(btn.dataset.reading, v),
      });
      if (result) {
        toast('Đã sửa số');
        dataChanged();
        await loadPeriods();
        await loadSheet();
      }
    },
    lock: async () => {
      const s = sheet.stats;
      const pending = s.missingReadings + s.readyToDraft + s.drafts;
      if (!(await confirmDialog({ title: 'Khóa tháng này?', text: pending ? `Còn ${pending} phòng chưa có hóa đơn. Sau khi khóa sẽ không nhập số hoặc tạo hóa đơn được cho đến khi mở khóa.` : 'Sau khi khóa sẽ không nhập số hoặc tạo hóa đơn được cho đến khi mở khóa.', confirmText: 'Khóa tháng' }))) return;
      if (await runAction(() => periodsApi.lock(sheet.period.id, { acknowledgeIncomplete: true }), { success: 'Đã khóa tháng' })) {
        await loadPeriods();
        await loadSheet();
      }
    },
    unlock: async () => {
      const reason = await reasonDialog({ title: 'Mở khóa tháng', text: 'Mở khóa không cho sửa hóa đơn đã phát hành.', label: 'Lý do mở khóa', confirmText: 'Mở khóa' });
      if (reason && await runAction(() => periodsApi.unlock(sheet.period.id, reason), { success: 'Đã mở khóa tháng' })) {
        await loadPeriods();
        await loadSheet();
      }
    },
  }));

  if (!org.properties.length) {
    setHtml(sheetEl, html`<section class="sr-panel">${emptyState({ iconName: 'buildings', title: 'Chưa có cơ sở', text: 'Thêm cơ sở và phòng trước khi tính tiền.' })}</section>`);
    return;
  }
  try {
    [schedule] = await Promise.all([settingsApi.billingSchedule().catch(() => null), loadPeriods()]);
  } catch (error) {
    await errorDialog(error);
    return;
  }
  if (schedule?.reminderEnabled) {
    setHtml(ctx.outlet.querySelector('[data-schedule]'), html`${icon('bell')} Nhắc nhập số ngày ${schedule.meterReadingDay}, tạo hóa đơn ngày ${schedule.invoiceCreateDay} hằng tháng. <a href="${link('/admin/settings')}">Đổi lịch</a>`);
  }
  if (!periodOf(month) && month === currentMonth && session.can('invoices.write')) await openPeriod();
  else await loadSheet();
}
