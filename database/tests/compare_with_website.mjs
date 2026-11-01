// Đối chiếu số liệu: engine của website tính một bên, view và hàm của database tính một bên, trên cùng dữ liệu 06_du_lieu_mau.sql.
// Script in ra một file SQL; chạy file đó trên database đã nạp 06 sẽ liệt kê mọi chỗ lệch. Không lệch thì in 0.
// Chạy: node database/tests/compare_with_website.mjs > so_sanh.sql
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
globalThis.localStorage = { getItem: () => null, setItem() {}, removeItem() {} };
const mock = (path) => import(pathToFileURL(resolve(here, '../../frontend/src/mocks', path)).href);
const { buildSeed } = await mock('seed.js');
const engine = await mock('engine.js');
const db = buildSeed();

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
const q = (v) => (v === null || v === undefined ? 'NULL' : typeof v === 'number' || typeof v === 'boolean' ? String(v) : `'${String(v).replace(/'/g, "''")}'`);
const values = (rows) => rows.map((r) => `(${r.map(q).join(', ')})`).join(',\n  ');
const ADJUSTMENT = ['debit_adjustment', 'credit_adjustment'];

const invoices = db.invoices.filter((i) => !ADJUSTMENT.includes(i.kind)).map((i) => {
  const b = engine.invoiceBalance(db, i, today);
  return [i.tenancyId, i.kind, i.serviceFrom, i.status, engine.invoiceTotal(i), b.receivableAmount, b.paidAmount, b.outstandingAmount, b.paymentStatus, b.isOverdue];
});
const deposits = db.tenancies.map((t) => [t.id, engine.depositHeld(db, t.id)]);
const debts = db.tenants.map((t) => {
  const d = engine.tenantDebt(db, t.id, today);
  return [t.id, d.outstandingAmount, d.overdueAmount];
});
const rooms = db.rooms.map((r) => [r.id, engine.roomOccupancy(db, r, today).occupancyStatus]);
const contracts = db.contracts.map((c) => {
  const s = engine.contractStatus(db, c, today);
  return [c.id, s.status, s.endsOn, s.expiring, s.stillOccupiedAfterExpiry];
});
const rates = db.tenancies.filter((t) => t.status === 'active').flatMap((t) => [...engine.effectiveRates(db, t.id, today).values()]
  .map((c) => [t.id, c.rate.chargeTypeId, c.rate.id, c.rate.unitPrice]));

console.log(`SET search_path = smartrent, public;
CREATE TEMP TABLE e_invoices(tenancy uuid, kind text, service_from date, status text, total numeric, receivable numeric, paid numeric, outstanding numeric, payment_status text, overdue boolean);
INSERT INTO e_invoices VALUES\n  ${values(invoices)};
CREATE TEMP TABLE e_deposits(id uuid, held numeric);
INSERT INTO e_deposits VALUES\n  ${values(deposits)};
CREATE TEMP TABLE e_debts(id uuid, outstanding numeric, overdue numeric);
INSERT INTO e_debts VALUES\n  ${values(debts)};
CREATE TEMP TABLE e_rooms(id uuid, status text);
INSERT INTO e_rooms VALUES\n  ${values(rooms)};
CREATE TEMP TABLE e_contracts(id uuid, status text, ends_on date, expiring boolean, still boolean);
INSERT INTO e_contracts VALUES\n  ${values(contracts)};
CREATE TEMP TABLE e_rates(tenancy uuid, charge uuid, rate uuid, price numeric);
INSERT INTO e_rates VALUES\n  ${values(rates)};

SELECT 'so_dong|' || json_build_object('hoa_don', (SELECT count(*) FROM e_invoices),
  'tien_phai_thu', (SELECT sum(receivable) FROM e_invoices WHERE status = 'issued'), 'da_thu', (SELECT sum(paid) FROM e_invoices WHERE status = 'issued'), 'dot_thue', (SELECT count(*) FROM e_deposits),
  'khach', (SELECT count(*) FROM e_debts), 'phong', (SELECT count(*) FROM e_rooms), 'hop_dong', (SELECT count(*) FROM e_contracts), 'gia', (SELECT count(*) FROM e_rates))::text;

-- ID hóa đơn của mock sinh ngẫu nhiên mỗi lần chạy nên đối chiếu theo khóa nghiệp vụ.
CREATE TEMP VIEW db_invoices AS
  SELECT b.*, i.service_from FROM v_invoice_balances b JOIN invoices i ON i.id = b.invoice_id;

SELECT 'hoa_don_lech|' || count(*) FROM e_invoices e
  LEFT JOIN db_invoices b ON b.tenancy_id = e.tenancy AND b.kind = e.kind AND b.service_from = e.service_from
  WHERE b.invoice_id IS NULL OR b.status <> e.status OR b.original_amount <> e.total
     OR (e.status = 'issued' AND (b.receivable_amount <> e.receivable OR b.paid_amount <> e.paid OR b.outstanding_amount <> e.outstanding
                                  OR b.payment_status <> e.payment_status OR b.is_overdue <> e.overdue));
SELECT 'coc_lech|' || count(*) FROM e_deposits e LEFT JOIN v_deposit_balances b ON b.tenancy_id = e.id WHERE b.held_amount IS DISTINCT FROM e.held;
SELECT 'cong_no_lech|' || count(*) FROM e_debts e LEFT JOIN v_tenant_debts b ON b.tenant_id = e.id
  WHERE b.outstanding_amount IS DISTINCT FROM e.outstanding OR b.overdue_amount IS DISTINCT FROM e.overdue;
SELECT 'trang_thai_phong_lech|' || count(*) FROM e_rooms e LEFT JOIN v_room_status s ON s.id = e.id WHERE s.occupancy_status IS DISTINCT FROM e.status;
SELECT 'hop_dong_lech|' || count(*) FROM e_contracts e LEFT JOIN v_contract_status s ON s.contract_id = e.id
  WHERE s.status IS DISTINCT FROM e.status OR s.ends_on IS DISTINCT FROM e.ends_on OR s.expiring IS DISTINCT FROM e.expiring OR s.still_occupied_after_expiry IS DISTINCT FROM e.still;
SELECT 'gia_hieu_luc_lech|' || count(*) FROM e_rates e
  LEFT JOIN LATERAL (SELECT * FROM effective_rates(e.tenancy, vn_today()) r WHERE r.charge_type_id = e.charge) r ON true
  WHERE r.rate_id IS DISTINCT FROM e.rate OR r.unit_price <> e.price;

SELECT 'chi_tiet_hoa_don|' || b.code || ' web ' || e.total || '/' || e.paid || '/' || e.outstanding || ' db ' || b.original_amount || '/' || b.paid_amount || '/' || b.outstanding_amount
  FROM e_invoices e JOIN db_invoices b ON b.tenancy_id = e.tenancy AND b.kind = e.kind AND b.service_from = e.service_from
  WHERE e.status = 'issued' AND (b.original_amount <> e.total OR b.paid_amount <> e.paid OR b.outstanding_amount <> e.outstanding) LIMIT 5;
SELECT 'chi_tiet_hop_dong|' || e.id::text || ' web ' || e.status || ' ' || e.ends_on || ' ' || e.expiring || ' db ' || s.status || ' ' || s.ends_on || ' ' || s.expiring
  FROM e_contracts e JOIN v_contract_status s ON s.contract_id = e.id
  WHERE s.status IS DISTINCT FROM e.status OR s.ends_on IS DISTINCT FROM e.ends_on OR s.expiring IS DISTINCT FROM e.expiring LIMIT 5;
SELECT 'vi_du_dac_ta|' || code || ': tong ' || original_amount || ', da thu ' || paid_amount || ', con ' || outstanding_amount
  FROM v_invoice_balances WHERE code = 'HD-BT2609-001';`);
