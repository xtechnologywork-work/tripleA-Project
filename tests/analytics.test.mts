/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck -- run with: node --experimental-strip-types --test tests/analytics.test.mts
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  qatarDayStart,
  dayKey,
  presetRange,
  previousRange,
  computeSummary,
  computePulse,
  computePassWatch,
  summaryToCsv,
  change,
  median,
  effectiveWashMinor,
  earliestMoment,
} from '../src/domain/analytics.ts';

// ---- fixtures ----
const T = (iso) => new Date(iso).getTime();
const PKG = { id: 'pkg', name: 'Pass', paidWashes: 6, bonusWashes: 2, price: { amountMinor: 14000, currency: 'QAR' }, validityDays: 60, eligibleServiceIds: [], active: true };

let n = 0;
const order = (over) => ({
  id: `o${++n}`,
  reference: `CB-${n}`,
  employeeId: 'e1',
  bayId: 'b',
  bayCodeSnapshot: '12',
  zoneCodeSnapshot: 'P',
  vehicleSnapshot: {},
  serviceId: 's',
  serviceSnapshot: {},
  paymentMode: 'ONE_TIME',
  priceSnapshot: { amountMinor: 2000, currency: 'QAR' },
  creditsUsed: 0,
  paymentStatus: 'UNPAID',
  status: 'NEW',
  idempotencyKey: 'k',
  version: 1,
  createdAt: '2026-11-06T08:00:00Z',
  updatedAt: '2026-11-06T08:00:00Z',
  ...over,
});
const ev = (orderId, to, iso) => ({ id: `ev${++n}`, orderId, to, type: 'STATUS_CHANGED', actor: { type: 'STAFF', id: 'x' }, createdAt: iso });
const sub = (over) => ({ id: `s${++n}`, employeeId: 'e1', packageId: 'pkg', packageSnapshot: PKG, status: 'ACTIVE', activatedAt: '2026-11-06T09:00:00Z', expiresAt: '2027-01-05T09:00:00Z', ...over });
const empty = () => ({ orders: [], events: [], subscriptions: [], credits: [], employees: [{ id: 'e1', fullName: 'Bader' }, { id: 'e2', fullName: 'Sara' }], inspections: [], issues: [] });

const NOW = T('2026-11-06T12:00:00Z'); // 15:00 in Doha
const TODAY = presetRange('today', NOW);

// ---- dates ----
test('a Doha day starts at 21:00 UTC the evening before', () => {
  assert.equal(dayKey(T('2026-11-05T21:00:00Z')), '2026-11-06');
  assert.equal(dayKey(T('2026-11-05T20:59:59Z')), '2026-11-05');
  assert.equal(qatarDayStart(T('2026-11-06T12:00:00Z')), T('2026-11-05T21:00:00Z'));
});

test('presets: today, 7 days, months, and the previous period', () => {
  assert.equal(TODAY.to - TODAY.from, 86400000);
  const week = presetRange('7d', NOW);
  assert.equal(week.to - week.from, 7 * 86400000);
  assert.equal(week.to, TODAY.to);
  const month = presetRange('thisMonth', NOW);
  assert.equal(dayKey(month.from), '2026-11-01');
  assert.equal(dayKey(month.to), '2026-12-01');
  const last = presetRange('lastMonth', NOW);
  assert.equal(dayKey(last.from), '2026-10-01');
  assert.equal(last.to, month.from);
  const prev = previousRange(week, '7d');
  assert.equal(prev.to, week.from);
  assert.equal(prev.to - prev.from, week.to - week.from);
  assert.equal(previousRange(week, 'all'), null);
});

test('month presets work across a year change', () => {
  const jan = presetRange('thisMonth', T('2027-01-10T10:00:00Z'));
  assert.equal(dayKey(jan.from), '2027-01-01');
  const dec = presetRange('lastMonth', T('2027-01-10T10:00:00Z'));
  assert.equal(dayKey(dec.from), '2026-12-01');
});

// ---- empty data never breaks ----
test('empty data gives zeros and nulls, not errors', () => {
  const s = computeSummary(empty(), TODAY);
  assert.equal(s.revenue.totalMinor, 0);
  assert.equal(s.orders.cancelRate, null);
  assert.equal(s.customers.avgOrders, null);
  assert.equal(s.ops.washOnTargetRate, null);
  assert.equal(s.quality.coverageRate, null);
  assert.equal(s.buckets.length, 1);
  const p = computePulse(empty(), NOW);
  assert.equal(p.oldestWaitingMin, null);
  assert.equal(p.lastActivityAt, null);
  assert.equal(earliestMoment(empty()), undefined);
});

// ---- money ----
test('revenue counts paid washes and passes sold, never cancelled or pass washes', () => {
  const d = empty();
  d.orders = [
    order({}), // 20
    order({ priceSnapshot: { amountMinor: 5000, currency: 'QAR' } }), // 50
    order({ status: 'CANCELLED' }), // not revenue
    order({ paymentMode: 'CREDIT', creditsUsed: 1, priceSnapshot: { amountMinor: 14000, currency: 'QAR' } }), // paid by the pass
  ];
  d.subscriptions = [sub({}), sub({ status: 'CANCELLED', employeeId: 'e2' })];
  const s = computeSummary(d, TODAY);
  assert.equal(s.revenue.singleMinor, 7000);
  assert.equal(s.revenue.passMinor, 14000);
  assert.equal(s.revenue.totalMinor, 21000);
  assert.equal(s.revenue.singleCount, 2);
  assert.equal(s.revenue.avgSingleMinor, 3500);
  assert.equal(s.revenue.passesSold, 1);
  assert.equal(s.orders.created, 4);
  assert.equal(s.orders.cancelled, 1);
  assert.equal(s.orders.cancelRate, 0.25);
});

test('the chart buckets add up to the totals', () => {
  const d = empty();
  d.orders = [
    order({ createdAt: '2026-11-04T10:00:00Z' }),
    order({ createdAt: '2026-11-05T20:59:00Z' }), // 23:59 Doha, still the 5th
    order({ createdAt: '2026-11-05T21:01:00Z' }), // 00:01 Doha, the 6th
  ];
  d.subscriptions = [sub({ activatedAt: '2026-11-06T09:00:00Z' })];
  const s = computeSummary(d, presetRange('7d', NOW));
  assert.equal(s.buckets.length, 7);
  assert.equal(s.buckets.reduce((a, b) => a + b.singleMinor, 0), s.revenue.singleMinor);
  assert.equal(s.buckets.reduce((a, b) => a + b.passMinor, 0), s.revenue.passMinor);
  assert.equal(s.buckets.reduce((a, b) => a + b.orders, 0), 3);
  const byDay = Object.fromEntries(s.buckets.map((b) => [dayKey(b.start), b.orders]));
  assert.equal(byDay['2026-11-05'], 1);
  assert.equal(byDay['2026-11-06'], 1);
  assert.equal(byDay['2026-11-04'], 1);
});

test('a period outside the data has no orders', () => {
  const d = empty();
  d.orders = [order({ createdAt: '2026-10-01T10:00:00Z' })];
  const s = computeSummary(d, TODAY);
  assert.equal(s.orders.created, 0);
});

test('long periods are grouped by week', () => {
  const d = empty();
  const range = presetRange('all', NOW, { earliest: T('2026-01-01T00:00:00Z') });
  const s = computeSummary(d, range);
  assert.ok(s.buckets.length < 60 && s.buckets.length > 20);
});

// ---- savings ----
test('savings: a paid wash saves 10, a pass wash saves 12.50', () => {
  const d = empty();
  d.subscriptions = [sub({ activatedAt: '2026-11-01T09:00:00Z' })];
  const single = order({});
  const passWash = order({ paymentMode: 'CREDIT', creditsUsed: 1, priceSnapshot: { amountMinor: 2000, currency: 'QAR' } });
  assert.equal(effectiveWashMinor(single, d.subscriptions), 2000);
  assert.equal(effectiveWashMinor(passWash, d.subscriptions), 1750);
  d.orders = [single, passWash];
  const s = computeSummary(d, TODAY);
  assert.equal(s.savings.totalMinor, 1000 + 1250);
  assert.equal(s.savings.beneficiaries, 1);
  assert.equal(s.savings.perCustomerMinor, 2250);
});

test('a wash made with a pass that was cancelled later still counts its savings', () => {
  const subs = [sub({ status: 'CANCELLED', activatedAt: '2026-10-11T09:00:00Z' })];
  const o = order({ paymentMode: 'CREDIT', creditsUsed: 1, createdAt: '2026-10-28T07:05:00Z' });
  assert.equal(effectiveWashMinor(o, subs), 1750);
});

// ---- customers ----
test('new and returning customers', () => {
  const d = empty();
  d.orders = [
    order({ employeeId: 'e1', createdAt: '2026-10-20T10:00:00Z' }), // before the period
    order({ employeeId: 'e1' }),
    order({ employeeId: 'e2' }),
    order({ employeeId: 'e2' }),
  ];
  const s = computeSummary(d, TODAY);
  assert.equal(s.customers.active, 2);
  assert.equal(s.customers.newCustomers, 1);
  assert.equal(s.customers.returning, 1);
  assert.equal(s.customers.avgOrders, 1.5);
  assert.equal(s.topCustomers[0].name, 'Sara');
  assert.equal(s.topCustomers[0].orders, 2);
});

test('pass conversion counts customers who paid for a single wash first', () => {
  const d = empty();
  d.orders = [order({ employeeId: 'e1', createdAt: '2026-11-01T08:00:00Z' })];
  d.subscriptions = [sub({ employeeId: 'e1' }), sub({ employeeId: 'e2' })];
  const s = computeSummary(d, TODAY);
  assert.equal(s.revenue.passesSold, 2);
  assert.equal(s.customers.passesConverted, 1);
  assert.equal(s.customers.passConversion, 0.5);
});

// ---- time per stage ----
test('stage times, the median and the wash target', () => {
  const d = empty();
  const a = order({ status: 'RETURNED_TO_PARKING', createdAt: '2026-11-06T08:00:00Z' });
  const b = order({ status: 'RETURNED_TO_PARKING', createdAt: '2026-11-06T08:00:00Z' });
  d.orders = [a, b];
  d.events = [
    ev(a.id, 'ASSIGNED', '2026-11-06T08:10:00Z'),
    ev(a.id, 'IN_PROGRESS', '2026-11-06T08:15:00Z'),
    ev(a.id, 'RETURNED_TO_PARKING', '2026-11-06T08:55:00Z'), // wash 40 min
    ev(b.id, 'ASSIGNED', '2026-11-06T08:20:00Z'),
    ev(b.id, 'IN_PROGRESS', '2026-11-06T08:30:00Z'),
    ev(b.id, 'RETURNED_TO_PARKING', '2026-11-06T09:40:00Z'), // wash 70 min, late
  ];
  const s = computeSummary(d, TODAY);
  const stage = Object.fromEntries(s.ops.stages.map((x) => [x.key, x]));
  assert.equal(stage.assign.avgMin, 15);
  assert.equal(stage.start.avgMin, 7.5);
  assert.equal(stage.wash.avgMin, 55);
  assert.equal(stage.wash.medianMin, 55);
  assert.equal(stage.total.avgMin, (55 + 100) / 2);
  assert.equal(s.ops.washMeasured, 2);
  assert.equal(s.ops.washOnTargetRate, 0.5);
});

test('an order that never started has no wash time', () => {
  const d = empty();
  d.orders = [order({})];
  const s = computeSummary(d, TODAY);
  assert.equal(s.ops.stages.find((x) => x.key === 'wash').count, 0);
  assert.equal(s.ops.washOnTargetRate, null);
});

test('median of an even and an odd list', () => {
  assert.equal(median([3, 1, 2]), 2);
  assert.equal(median([4, 1, 2, 3]), 2.5);
  assert.equal(median([]), null);
});

// ---- quality ----
test('inspection coverage, skips and damages', () => {
  const d = empty();
  const a = order({ status: 'IN_PROGRESS' });
  const b = order({ status: 'RETURNED_TO_PARKING' });
  const c = order({ status: 'RETURNED_TO_PARKING' });
  const waiting = order({ status: 'NEW' });
  d.orders = [a, b, c, waiting];
  d.inspections = [
    { id: 'i1', orderId: a.id, phase: 'BEFORE', status: 'SUBMITTED', noDamage: false, media: [], damages: [{ id: 'd1', type: 'SCRATCH', severity: 'LOW' }, { id: 'd2', type: 'DENT', severity: 'HIGH' }] },
    { id: 'i2', orderId: b.id, phase: 'BEFORE', status: 'SKIPPED', bypassReason: 'Customer in a hurry', noDamage: false, media: [], damages: [] },
    { id: 'i3', orderId: a.id, phase: 'AFTER', status: 'SUBMITTED', noDamage: false, media: [], damages: [{ id: 'd3', type: 'SCRATCH', severity: 'LOW', isNew: true }] },
  ];
  const s = computeSummary(d, TODAY);
  assert.equal(s.quality.eligible, 3);
  assert.equal(s.quality.inspected, 1);
  assert.equal(s.quality.skipped, 1);
  assert.equal(s.quality.missing, 1);
  assert.equal(s.quality.coverageRate, 2 / 3);
  assert.deepEqual(s.quality.skipReasons, [{ reason: 'Customer in a hurry', count: 1 }]);
  assert.equal(s.quality.ordersWithDamage, 1);
  assert.equal(s.quality.newDamagesAfter, 1);
  assert.deepEqual(s.quality.damagesByType.map((x) => x.type).sort(), ['DENT', 'SCRATCH']);
});

test('quality check pass rate and issues', () => {
  const d = empty();
  d.orders = [
    order({ qualityCheck: { passed: true, checkedBy: 'x', checkedAt: '2026-11-06T09:00:00Z', checklist: {} } }),
    order({ qualityCheck: { passed: false, checkedBy: 'x', checkedAt: '2026-11-06T09:00:00Z', checklist: {} } }),
  ];
  d.issues = [
    { id: 'x1', category: 'DAMAGE', severity: 'LOW', description: '', status: 'RESOLVED', createdBy: 'a', createdAt: '2026-11-06T08:00:00Z', resolvedAt: '2026-11-06T10:00:00Z' },
    { id: 'x2', category: 'DAMAGE', severity: 'LOW', description: '', status: 'OPEN', createdBy: 'a', createdAt: '2026-11-06T08:00:00Z' },
  ];
  const s = computeSummary(d, TODAY);
  assert.equal(s.quality.qcPassRate, 0.5);
  assert.equal(s.quality.issuesOpen, 1);
  assert.equal(s.quality.avgResolutionHours, 2);
  assert.deepEqual(s.quality.issuesByCategory, [{ category: 'DAMAGE', count: 2 }]);
});

test('cancellation reasons and bays', () => {
  const d = empty();
  d.orders = [
    order({ status: 'CANCELLED', cancellation: { reason: 'Changed my mind', by: 'e1', at: '', creditRefunded: false } }),
    order({ status: 'CANCELLED', cancellation: { reason: 'Changed my mind', by: 'e1', at: '', creditRefunded: false } }),
    order({ status: 'CANCELLED' }),
    order({ bayCodeSnapshot: '34' }),
    order({ bayCodeSnapshot: '34' }),
    order({ bayCodeSnapshot: '12' }),
  ];
  const s = computeSummary(d, TODAY);
  assert.deepEqual(s.cancellations[0], { reason: 'Changed my mind', count: 2 });
  assert.equal(s.cancellations[1].reason, 'No reason given');
  assert.deepEqual(s.topBays[0], { bay: '34', orders: 2 });
  assert.equal(s.distinctBays, 2);
});

test('the heat map uses Doha time', () => {
  const d = empty();
  d.orders = [order({ createdAt: '2026-11-06T21:30:00Z' })]; // Saturday 00:30 Doha is not today; check the cell
  const s = computeSummary(d, presetRange('7d', T('2026-11-07T12:00:00Z')));
  const day = new Date(T('2026-11-06T21:30:00Z') + 3 * 3600000).getUTCDay();
  assert.equal(s.heatmap[day][0], 1);
});

// ---- right now ----
test('pulse: waiting, oldest wait and stuck orders', () => {
  const d = empty();
  const fresh = order({ status: 'NEW', createdAt: '2026-11-06T11:50:00Z' });
  const old = order({ status: 'NEW', createdAt: '2026-11-06T10:00:00Z' });
  const slowWash = order({ status: 'IN_PROGRESS', createdAt: '2026-11-06T08:00:00Z' });
  d.orders = [fresh, old, slowWash];
  d.events = [ev(slowWash.id, 'IN_PROGRESS', '2026-11-06T09:00:00Z')];
  const p = computePulse(d, NOW);
  assert.equal(p.waiting, 2);
  assert.equal(p.inProgress, 1);
  assert.equal(p.oldestWaitingMin, 120);
  const ids = p.stuck.map((x) => x.orderId);
  assert.ok(ids.includes(old.id));
  assert.ok(ids.includes(slowWash.id));
  assert.ok(!ids.includes(fresh.id));
  assert.equal(p.stuck[0].minutes >= p.stuck[1].minutes, true);
  assert.equal(p.lastActivityAt, T('2026-11-06T11:50:00Z'));
});

test('finished orders are never stuck', () => {
  const d = empty();
  d.orders = [order({ status: 'RETURNED_TO_PARKING', createdAt: '2026-11-01T08:00:00Z' }), order({ status: 'CANCELLED', createdAt: '2026-11-01T08:00:00Z' })];
  const p = computePulse(d, NOW);
  assert.equal(p.stuck.length, 0);
  assert.equal(p.waiting, 0);
});

// ---- passes ----
test('passes to watch', () => {
  const d = empty();
  d.subscriptions = [
    sub({ id: 'ending', employeeId: 'e1', expiresAt: '2026-11-12T09:00:00Z' }),
    sub({ id: 'expired', employeeId: 'e2', status: 'ACTIVE', expiresAt: '2026-11-01T09:00:00Z' }),
  ];
  d.credits = [
    { id: 'c1', employeeId: 'e1', subscriptionId: 'ending', type: 'GRANT', delta: 8, actorId: 'a', createdAt: '2026-11-01T00:00:00Z' },
    { id: 'c2', employeeId: 'e1', type: 'DEBIT', delta: -7, actorId: 'a', createdAt: '2026-11-02T00:00:00Z' },
    { id: 'c3', employeeId: 'e2', subscriptionId: 'expired', type: 'GRANT', delta: 8, actorId: 'a', createdAt: '2026-10-01T00:00:00Z' },
    { id: 'c4', employeeId: 'e2', type: 'DEBIT', delta: -3, actorId: 'a', createdAt: '2026-10-02T00:00:00Z' },
  ];
  const w = computePassWatch(d, NOW);
  assert.equal(w.activePasses, 1);
  assert.deepEqual(w.endingSoon.map((x) => x.subscriptionId), ['ending']);
  assert.deepEqual(w.low.map((x) => x.subscriptionId), ['ending']);
  assert.deepEqual(w.expiredWithWashes.map((x) => [x.subscriptionId, x.left]), [['expired', 5]]);
  assert.equal(w.washesGranted, 8);
  assert.equal(w.washesUsed, 7);
  assert.equal(w.prepaidWashes, 1);
  assert.equal(w.prepaidMinor, 1750);
});

// ---- helpers ----
test('change from the previous period', () => {
  assert.equal(change(120, 100), 0.2);
  assert.equal(change(80, 100), -0.2);
  assert.equal(change(5, 0), null);
  assert.equal(change(null, 10), null);
});

test('csv escapes commas and quotes and covers every day', () => {
  const d = empty();
  d.orders = [order({})];
  const s = computeSummary(d, presetRange('7d', NOW));
  const csv = summaryToCsv(s);
  const lines = csv.split('\n');
  assert.ok(lines[0].startsWith('Period,'));
  assert.equal(lines.filter((l) => /^\d{4}-\d{2}-\d{2},/.test(l)).length, 7);
  assert.ok(csv.includes('Revenue, total (QAR),20.00') || csv.includes('"Revenue, total (QAR)",20.00'));
});
