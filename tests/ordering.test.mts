/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck -- run with: node --experimental-strip-types --test tests/ordering.test.mts
import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_ORDERING, cleanOrdering, readOrdering, orderingStatus, dohaMinutes, dohaClock, clockLabel } from '../src/domain/ordering.ts';

// 2026-11-14 at the given Doha time (Doha is UTC+3)
const at = (hhmm) => {
  const [h, m] = hhmm.split(':').map(Number);
  return Date.UTC(2026, 10, 14, h - 3, m, 0);
};
const ON = { open: true, opensAt: '07:00', closesAt: '15:15' };

test('nothing set means closed for everyone', () => {
  assert.deepEqual(DEFAULT_ORDERING, { open: false, opensAt: '07:00', closesAt: '15:15' });
  assert.equal(orderingStatus(readOrdering(undefined), at('10:00')).accepting, false);
  assert.equal(orderingStatus(readOrdering(null), at('10:00')).reason, 'PAUSED');
});

test('open only inside the hours, up to but not including the closing minute', () => {
  const s = (t) => orderingStatus(ON, at(t));
  assert.equal(s('06:59').reason, 'BEFORE_OPENING');
  assert.equal(s('07:00').accepting, true);
  assert.equal(s('12:30').accepting, true);
  assert.equal(s('15:14').accepting, true);
  assert.equal(s('15:15').reason, 'AFTER_CLOSING');
  assert.equal(s('23:59').accepting, false);
  assert.equal(s('00:00').accepting, false);
});

test('the switch closes everything, even inside the hours', () => {
  const r = orderingStatus({ ...ON, open: false }, at('10:00'));
  assert.equal(r.accepting, false);
  assert.equal(r.reason, 'PAUSED');
});

test('the time is Doha time, not the machine time', () => {
  assert.equal(dohaMinutes(Date.UTC(2026, 10, 14, 4, 0, 0)), 7 * 60); // 04:00 UTC = 07:00 in Doha
  assert.equal(dohaClock(Date.UTC(2026, 10, 14, 21, 30, 0)), '00:30'); // the next day in Doha
  assert.equal(orderingStatus(ON, Date.UTC(2026, 10, 14, 4, 0, 0)).accepting, true);
  assert.equal(orderingStatus(ON, Date.UTC(2026, 10, 14, 3, 59, 0)).accepting, false);
});

test('what the team types is checked', () => {
  assert.equal(cleanOrdering({ open: true, opensAt: '08:30', closesAt: '16:00' }).ok, true);
  assert.equal(cleanOrdering({ opensAt: '8:30' }).ok, false);
  assert.equal(cleanOrdering({ opensAt: '25:00' }).ok, false);
  assert.equal(cleanOrdering({ closesAt: '12:60' }).ok, false);
  assert.equal(cleanOrdering({ open: 'yes' }).ok, false);
  assert.equal(cleanOrdering({ opensAt: '15:15', closesAt: '07:00' }).ok, false);
  assert.equal(cleanOrdering({ opensAt: '09:00', closesAt: '09:00' }).ok, false);
});

test('a change keeps the fields that were not sent', () => {
  const r = cleanOrdering({ open: true }, { open: false, opensAt: '08:00', closesAt: '14:00' });
  assert.deepEqual(r.settings, { open: true, opensAt: '08:00', closesAt: '14:00' });
});

test('damaged stored data falls back to closed', () => {
  assert.deepEqual(readOrdering({ open: true, opensAt: 'soon', closesAt: '15:15' }), DEFAULT_ORDERING);
  assert.deepEqual(readOrdering('x'), DEFAULT_ORDERING);
});

test('hours are written for people to read', () => {
  assert.equal(clockLabel('07:00', 'en'), '7:00 AM');
  assert.equal(clockLabel('15:15', 'en'), '3:15 PM');
  assert.equal(clockLabel('00:05', 'en'), '12:05 AM');
  assert.equal(clockLabel('12:00', 'en'), '12:00 PM');
  assert.equal(clockLabel('15:15', 'ar'), '3:15 م');
  assert.equal(clockLabel('07:00', 'ar'), '7:00 ص');
});
