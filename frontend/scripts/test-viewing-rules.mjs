import assert from 'node:assert/strict';
import { viewingBounds, viewingTimeError } from '../src/utils/viewing.js';

const now = '2026-11-09T10:00:00+07:00';
for (const value of [null, 'invalid', '2026-11-08T10:00:00+07:00', now, '2026-11-09T20:00:01+07:00', '2026-11-10T20:01:00+07:00']) {
  assert.ok(viewingTimeError(value, now), `must reject ${value}`);
}
for (const value of ['2026-11-09T20:00:00+07:00', '2026-11-09T12:59:00Z', '2026-11-10T10:00:00+07:00']) {
  assert.equal(viewingTimeError(value, now), null);
}
assert.equal(viewingBounds('2026-11-09T19:58:10+07:00').min, '2026-11-09T19:59');
for (const value of ['2026-11-09T20:00:00+07:00', '2026-11-09T23:59:59+07:00']) {
  assert.equal(viewingBounds(value).min, '2026-11-10T00:00');
}
assert.equal(viewingBounds('2026-11-09T09:00:00+07:00').defaultTime, '2026-11-09T10:00');
assert.equal(viewingBounds('2026-11-09T20:00:00+07:00').defaultTime, '2026-11-10T10:00');
assert.equal(viewingTimeError('2026-11-10T19:30:00+07:00', now, '2026-11-10T20:00:00+07:00'), null);
assert.ok(viewingTimeError('2026-11-10T19:30:00+07:00', now, '2026-11-10T21:01:00+07:00'));
assert.ok(viewingTimeError('2026-11-10T19:30:00+07:00', now, '2026-11-11T00:00:00+07:00'));
console.log('Viewing date boundaries, Vietnam timezone, and 20:00 cutoff passed.');

assert.equal(viewingTimeError('2026-11-10T20:00:00+07:00', now, '2026-11-10T21:00:00+07:00'), null);
