import assert from 'node:assert/strict';
import { formatMoneyEdit, parseVnd } from '../src/utils/money.js';
import { contractTenantErrors } from '../src/utils/contract-tenant.js';

// Type continuously across two separators: formatting must never move the next digit.
let value = '';
let caret = 0;
for (const digit of '44400000') {
  const raw = value.slice(0, caret) + digit + value.slice(caret);
  ({ text: value, caret } = formatMoneyEdit(raw, caret + 1));
  assert.equal(caret, value.length);
}
assert.equal(value, '44.400.000');
assert.equal(parseVnd(value), 44400000);
assert.deepEqual(formatMoneyEdit('1.0200.000', 5), { text: '10.200.000', caret: 5 });
assert.deepEqual(formatMoneyEdit('004000', 6), { text: '4.000', caret: 5 });
assert.deepEqual(formatMoneyEdit('', 0), { text: '', caret: 0 });
assert.equal(formatMoneyEdit('9007199254740993').text, '9.007.199.254.740.993');
assert.equal(parseVnd(formatMoneyEdit('9007199254740993').text), null);
const tenant = { phone: '0901234567', dateOfBirth: '2008-11-10' };
assert.deepEqual(contractTenantErrors(tenant, '2026-11-10'), {});
assert.ok(contractTenantErrors({ ...tenant, dateOfBirth: '2008-11-11' }, '2026-11-10').dateOfBirth);
assert.ok(contractTenantErrors({ ...tenant, dateOfBirth: null }, '2026-11-10').dateOfBirth);
assert.ok(contractTenantErrors({ ...tenant, phone: '' }, '2026-11-10').phone);
assert.ok(contractTenantErrors({ ...tenant, phone: '12345' }, '2026-11-10').phone);
assert.deepEqual(contractTenantErrors({ ...tenant, dateOfBirth: '2008-02-29' }, '2026-02-28'), {});
console.log('Money typing/caret and contract tenant age/phone checks passed.');
