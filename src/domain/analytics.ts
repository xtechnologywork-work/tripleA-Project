/**
 * Insights: every number on the Insights page is calculated here, from the real orders, events,
 * passes, credits, inspections and issues. Nothing is invented.
 *
 * All days are Qatar days (UTC+3, no daylight saving), so a wash at 01:00 Doha time counts on the
 * Doha date and not on the date of the browser or the server.
 *
 * This file only imports types, so it can be tested on its own.
 */
import type {
  CreditLedgerEntry,
  Employee,
  EmployeeSubscription,
  Inspection,
  Issue,
  Order,
  OrderEvent,
  OrderStatus,
} from './types';

// ---------------------------------------------------------------------------
// Settings that are business decisions, not data
// ---------------------------------------------------------------------------
export const QATAR_OFFSET_MS = 3 * 60 * 60 * 1000;
/** What one wash would cost without the Ministry agreement (used for the savings figure). */
export const MARKET_WASH_PRICE_MINOR = 3000;
/** A wash that takes longer than this (start to ready) is late. */
export const WASH_TARGET_MIN = 60;
/** An order that stays in a stage longer than this many minutes is flagged as stuck. */
export const STUCK_AFTER_MIN: Partial<Record<OrderStatus, number>> = {
  NEW: 30,
  ASSIGNED: 30,
  IN_PROGRESS: 90,
  QUALITY_CHECK: 30,
};
/** A pass is "ending soon" when it ends within this many days. */
export const PASS_ENDING_DAYS = 14;
/** A pass is "low" at this many washes left or fewer. */
export const PASS_LOW_WASHES = 2;

const MIN = 60_000;
const DAY = 24 * 60 * MIN;

// ---------------------------------------------------------------------------
// Dates (Qatar time)
// ---------------------------------------------------------------------------
/** The start (00:00 Doha time) of the Doha day that contains this moment. */
export function qatarDayStart(ms: number): number {
  return Math.floor((ms + QATAR_OFFSET_MS) / DAY) * DAY - QATAR_OFFSET_MS;
}

/** "2026-11-06": the Doha date of this moment. */
export function dayKey(ms: number): string {
  return new Date(ms + QATAR_OFFSET_MS).toISOString().slice(0, 10);
}

/** 0 to 23, Doha time. */
export function qatarHour(ms: number): number {
  return new Date(ms + QATAR_OFFSET_MS).getUTCHours();
}

/** 0 = Sunday ... 6 = Saturday, Doha time. */
export function qatarWeekday(ms: number): number {
  return new Date(ms + QATAR_OFFSET_MS).getUTCDay();
}

function qatarMonthStart(ms: number, monthShift = 0): number {
  const d = new Date(ms + QATAR_OFFSET_MS);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + monthShift, 1) - QATAR_OFFSET_MS;
}

/** A period of time: from is included, to is not. */
export interface Range {
  from: number;
  to: number;
}

export type PresetId = 'today' | 'yesterday' | '7d' | '30d' | 'thisMonth' | 'lastMonth' | 'all' | 'custom';

export function presetRange(id: PresetId, now: number, opts: { custom?: Range; earliest?: number } = {}): Range {
  const today = qatarDayStart(now);
  switch (id) {
    case 'today':
      return { from: today, to: today + DAY };
    case 'yesterday':
      return { from: today - DAY, to: today };
    case '7d':
      return { from: today - 6 * DAY, to: today + DAY };
    case '30d':
      return { from: today - 29 * DAY, to: today + DAY };
    case 'thisMonth':
      return { from: qatarMonthStart(now), to: qatarMonthStart(now, 1) };
    case 'lastMonth':
      return { from: qatarMonthStart(now, -1), to: qatarMonthStart(now) };
    case 'custom':
      if (opts.custom && opts.custom.to > opts.custom.from) return opts.custom;
      return { from: today - 6 * DAY, to: today + DAY };
    case 'all':
    default: {
      const from = opts.earliest !== undefined ? qatarDayStart(opts.earliest) : today - 29 * DAY;
      return { from: Math.min(from, today), to: today + DAY };
    }
  }
}

/** The period of the same length that ends where this one starts. "All time" has none. */
export function previousRange(range: Range, id: PresetId): Range | null {
  if (id === 'all') return null;
  const length = range.to - range.from;
  return { from: range.from - length, to: range.from };
}

const inRange = (t: number, r: Range) => t >= r.from && t < r.to;
const ms = (iso: string | undefined | null): number => {
  if (!iso) return NaN;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) ? t : NaN;
};

// ---------------------------------------------------------------------------
// Input and output
// ---------------------------------------------------------------------------
export interface DataSet {
  orders: Order[];
  events: OrderEvent[];
  subscriptions: EmployeeSubscription[];
  credits: CreditLedgerEntry[];
  employees: Employee[];
  inspections: Inspection[];
  issues: Issue[];
}

export interface Bucket {
  start: number;
  end: number;
  label: string;
  singleMinor: number;
  passMinor: number;
  orders: number;
  delivered: number;
  passesSold: number;
}

export interface StageTime {
  key: 'assign' | 'start' | 'wash' | 'ready' | 'total';
  label: string;
  avgMin: number | null;
  medianMin: number | null;
  count: number;
}

export interface Summary {
  range: Range;
  revenue: {
    singleMinor: number;
    passMinor: number;
    totalMinor: number;
    singleCount: number;
    passesSold: number;
    avgSingleMinor: number | null;
  };
  orders: {
    created: number;
    delivered: number;
    cancelled: number;
    cancelRate: number | null;
    singleWashes: number;
    passWashes: number;
  };
  customers: {
    active: number;
    newCustomers: number;
    returning: number;
    avgOrders: number | null;
    passConversion: number | null;
    passesConverted: number;
  };
  savings: {
    totalMinor: number;
    perCustomerMinor: number | null;
    beneficiaries: number;
    washesDelivered: number;
  };
  ops: {
    stages: StageTime[];
    washOnTargetRate: number | null;
    washMeasured: number;
  };
  quality: {
    eligible: number;
    inspected: number;
    skipped: number;
    missing: number;
    coverageRate: number | null;
    skipReasons: { reason: string; count: number }[];
    damagesByType: { type: string; count: number }[];
    damagesBySeverity: { severity: string; count: number }[];
    ordersWithDamage: number;
    newDamagesAfter: number;
    qcChecked: number;
    qcPassed: number;
    qcPassRate: number | null;
    issuesByCategory: { category: string; count: number }[];
    issuesOpen: number;
    avgResolutionHours: number | null;
  };
  cancellations: { reason: string; count: number }[];
  statusMix: { status: OrderStatus; count: number }[];
  buckets: Bucket[];
  /** [weekday 0-6][hour 0-23] = orders created */
  heatmap: number[][];
  topCustomers: { employeeId: string; name: string; orders: number }[];
  topBays: { bay: string; orders: number }[];
  distinctBays: number;
}

export interface Pulse {
  inProgress: number;
  waiting: number;
  oldestWaitingMin: number | null;
  stuck: { orderId: string; reference: string; status: OrderStatus; minutes: number; limit: number }[];
  lastActivityAt: number | null;
}

export interface PassWatch {
  endingSoon: { subscriptionId: string; employeeId: string; name: string; endsAt: number; left: number }[];
  low: { subscriptionId: string; employeeId: string; name: string; left: number }[];
  expiredWithWashes: { subscriptionId: string; employeeId: string; name: string; left: number }[];
  activePasses: number;
  washesGranted: number;
  washesUsed: number;
  prepaidWashes: number;
  prepaidMinor: number;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------
export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

export function average(values: number[]): number | null {
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

const rate = (part: number, whole: number): number | null => (whole > 0 ? part / whole : null);

function countBy<T>(items: T[], key: (t: T) => string): { key: string; count: number }[] {
  const map = new Map<string, number>();
  for (const item of items) {
    const k = key(item);
    map.set(k, (map.get(k) || 0) + 1);
  }
  return Array.from(map, ([k, count]) => ({ key: k, count })).sort((a, b) => b.count - a.count || a.key.localeCompare(b.key));
}

/** Change from the previous period, as a fraction (0.12 = up 12%). Null when there is nothing to compare. */
export function change(current: number | null, previous: number | null): number | null {
  if (current === null || previous === null || previous === 0) return null;
  return (current - previous) / previous;
}

function bucketSizeDays(range: Range): number {
  const days = Math.round((range.to - range.from) / DAY);
  if (days <= 62) return 1;
  if (days <= 400) return 7;
  return 30;
}

function bucketLabel(start: number, size: number, count: number, first: boolean): string {
  const d = new Date(start + QATAR_OFFSET_MS);
  const day = d.getUTCDate();
  const month = d.toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' });
  if (size === 1 && count <= 14) {
    const wd = d.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' });
    return `${wd} ${day}`;
  }
  // Long periods: just the day number, with the month on the first bar and on the 1st
  if (size === 1) return first || day === 1 ? `${day} ${month}` : String(day);
  return `${day} ${month}`;
}

// ---------------------------------------------------------------------------
// Event index: when did each order first reach each stage
// ---------------------------------------------------------------------------
type StageTimes = Partial<Record<OrderStatus, number>>;

export function stageTimesByOrder(orders: Order[], events: OrderEvent[]): Map<string, StageTimes> {
  const map = new Map<string, StageTimes>();
  for (const o of orders) {
    const created = ms(o.createdAt);
    map.set(o.id, Number.isFinite(created) ? { NEW: created } : {});
  }
  for (const e of events) {
    if (!e.to) continue;
    const times = map.get(e.orderId);
    if (!times) continue;
    const t = ms(e.createdAt);
    if (!Number.isFinite(t)) continue;
    const current = times[e.to];
    if (current === undefined || t < current) times[e.to] = t;
  }
  return map;
}

const minutesBetween = (from: number | undefined, to: number | undefined): number | null => {
  if (from === undefined || to === undefined) return null;
  const m = (to - from) / MIN;
  return m >= 0 ? m : null;
};

/** An order made when the customer opened the online payment page, and not paid (yet). It is not money and not a wash. */
export const awaitingOnlinePayment = (o: Order): boolean => o.paymentStatus === 'UNPAID' && String(o.idempotencyKey || '').startsWith('pay:');

/** When each order was last re-ordered by its customer (after postponing it). Orders never re-ordered are not in the map. */
export function reorderTimes(events: OrderEvent[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const e of events) {
    if (e.type !== 'REORDERED') continue;
    const t = ms(e.createdAt);
    if (!Number.isFinite(t)) continue;
    const prev = out.get(e.orderId);
    if (prev === undefined || t > prev) out.set(e.orderId, t);
  }
  return out;
}

/** What the order cost the employee, per wash. A pass wash costs the pass price divided by its washes. */
export function effectiveWashMinor(order: Order, subscriptions: EmployeeSubscription[]): number {
  if (order.paymentMode !== 'CREDIT') return order.priceSnapshot?.amountMinor || 0;
  const orderTime = ms(order.createdAt);
  const mine = subscriptions
    .filter((s) => s.employeeId === order.employeeId)
    .sort((a, b) => ms(b.activatedAt) - ms(a.activatedAt));
  // The pass the employee had when ordering (a pass cancelled later still priced the washes made with it), or the newest one
  const sub = mine.find((s) => Number.isFinite(ms(s.activatedAt)) && ms(s.activatedAt) <= orderTime + MIN) || mine[0];
  const pkg = sub?.packageSnapshot;
  const washes = pkg ? pkg.paidWashes + pkg.bonusWashes : 0;
  if (!pkg || washes <= 0) return MARKET_WASH_PRICE_MINOR;
  return Math.round(pkg.price.amountMinor / washes);
}

// ---------------------------------------------------------------------------
// The summary for one period
// ---------------------------------------------------------------------------
export function computeSummary(data: DataSet, range: Range): Summary {
  const { orders, events, subscriptions, employees, inspections, issues } = data;
  const nameOf = new Map(employees.map((e) => [e.id, e.fullName]));

  // Orders waiting for an online payment that never came are not orders yet
  const inPeriod = orders.filter((o) => inRange(ms(o.createdAt), range) && !awaitingOnlinePayment(o));
  const live = inPeriod.filter((o) => o.status !== 'CANCELLED' && !awaitingOnlinePayment(o));
  const cancelled = inPeriod.filter((o) => o.status === 'CANCELLED');
  const delivered = inPeriod.filter((o) => o.status === 'RETURNED_TO_PARKING');
  const singles = live.filter((o) => o.paymentMode === 'ONE_TIME');
  const passWashes = live.filter((o) => o.paymentMode === 'CREDIT');

  // ---- money ----
  const soldPasses = subscriptions.filter((s) => s.status !== 'CANCELLED' && inRange(ms(s.activatedAt), range));
  const singleMinor = singles.reduce((sum, o) => sum + (o.priceSnapshot?.amountMinor || 0), 0);
  const passMinor = soldPasses.reduce((sum, s) => sum + (s.packageSnapshot?.price?.amountMinor || 0), 0);

  // ---- buckets for the charts ----
  const size = bucketSizeDays(range);
  const buckets: Bucket[] = [];
  const bucketCount = Math.ceil((range.to - range.from) / (size * DAY));
  for (let start = range.from; start < range.to; start += size * DAY) {
    const end = Math.min(start + size * DAY, range.to);
    buckets.push({ start, end, label: bucketLabel(start, size, bucketCount, start === range.from), singleMinor: 0, passMinor: 0, orders: 0, delivered: 0, passesSold: 0 });
  }
  const bucketOf = (t: number) => buckets.find((b) => t >= b.start && t < b.end);
  for (const o of singles) {
    const b = bucketOf(ms(o.createdAt));
    if (b) b.singleMinor += o.priceSnapshot?.amountMinor || 0;
  }
  for (const o of live) {
    const b = bucketOf(ms(o.createdAt));
    if (b) b.orders += 1;
  }
  for (const o of delivered) {
    const b = bucketOf(ms(o.createdAt));
    if (b) b.delivered += 1;
  }
  for (const s of soldPasses) {
    const b = bucketOf(ms(s.activatedAt));
    if (b) {
      b.passMinor += s.packageSnapshot?.price?.amountMinor || 0;
      b.passesSold += 1;
    }
  }

  // ---- customers ----
  const firstOrderAt = new Map<string, number>();
  for (const o of orders) {
    if (o.status === 'CANCELLED' || awaitingOnlinePayment(o)) continue;
    const t = ms(o.createdAt);
    if (!Number.isFinite(t)) continue;
    const prev = firstOrderAt.get(o.employeeId);
    if (prev === undefined || t < prev) firstOrderAt.set(o.employeeId, t);
  }
  const activeIds = new Set(live.map((o) => o.employeeId));
  let newCustomers = 0;
  for (const id of activeIds) {
    const first = firstOrderAt.get(id);
    if (first !== undefined && inRange(first, range)) newCustomers += 1;
  }
  let converted = 0;
  for (const s of soldPasses) {
    const boughtAt = ms(s.activatedAt);
    const hadSingleBefore = orders.some(
      (o) => o.employeeId === s.employeeId && o.paymentMode === 'ONE_TIME' && o.status !== 'CANCELLED' && !awaitingOnlinePayment(o) && ms(o.createdAt) < boughtAt
    );
    if (hadSingleBefore) converted += 1;
  }

  // ---- savings ----
  const savingsMinor = live.reduce((sum, o) => sum + Math.max(0, MARKET_WASH_PRICE_MINOR - effectiveWashMinor(o, subscriptions)), 0);

  // ---- time in each stage ----
  const times = stageTimesByOrder(inPeriod, events);
  const series: Record<StageTime['key'], number[]> = { assign: [], start: [], wash: [], ready: [], total: [] };
  for (const o of live) {
    const t = times.get(o.id) || {};
    const afterWash = t.QUALITY_CHECK ?? t.COMPLETED ?? t.RETURNED_TO_PARKING;
    const push = (key: StageTime['key'], v: number | null) => {
      if (v !== null) series[key].push(v);
    };
    push('assign', minutesBetween(t.NEW, t.ASSIGNED));
    push('start', minutesBetween(t.ASSIGNED, t.IN_PROGRESS));
    push('wash', minutesBetween(t.IN_PROGRESS, afterWash));
    push('ready', minutesBetween(afterWash, t.RETURNED_TO_PARKING));
    if (o.status === 'RETURNED_TO_PARKING') push('total', minutesBetween(t.NEW, t.RETURNED_TO_PARKING));
  }
  const stageLabels: Record<StageTime['key'], string> = {
    assign: 'Received to assigned',
    start: 'Assigned to wash started',
    wash: 'Washing',
    ready: 'Wash done to ready at bay',
    total: 'Order to ready, total',
  };
  const stages: StageTime[] = (Object.keys(series) as StageTime['key'][]).map((key) => ({
    key,
    label: stageLabels[key],
    avgMin: average(series[key]),
    medianMin: median(series[key]),
    count: series[key].length,
  }));
  const washOnTarget = series.wash.filter((m) => m <= WASH_TARGET_MIN).length;

  // ---- quality ----
  const reached = new Set<OrderStatus>(['IN_PROGRESS', 'QUALITY_CHECK', 'COMPLETED', 'RETURNED_TO_PARKING']);
  const eligibleOrders = live.filter((o) => reached.has(o.status) || (times.get(o.id) || {}).IN_PROGRESS !== undefined);
  const before = new Map<string, Inspection>();
  for (const i of inspections) if (i.phase === 'BEFORE') before.set(i.orderId, i);
  let inspected = 0;
  let skipped = 0;
  const skipReasons: string[] = [];
  for (const o of eligibleOrders) {
    const i = before.get(o.id);
    if (i?.status === 'SUBMITTED') inspected += 1;
    else if (i?.status === 'SKIPPED') {
      skipped += 1;
      skipReasons.push((i.bypassReason || 'No reason').trim() || 'No reason');
    }
  }
  const periodIds = new Set(live.map((o) => o.id));
  const sentBefore = inspections.filter((i) => i.phase === 'BEFORE' && i.status === 'SUBMITTED' && periodIds.has(i.orderId));
  const damages = sentBefore.flatMap((i) => i.damages);
  const sentAfter = inspections.filter((i) => i.phase === 'AFTER' && i.status === 'SUBMITTED' && periodIds.has(i.orderId));
  const qc = live.filter((o) => o.qualityCheck);
  const periodIssues = issues.filter((i) => inRange(ms(i.createdAt), range));
  const resolved = periodIssues.filter((i) => i.status === 'RESOLVED' && Number.isFinite(ms(i.resolvedAt)));

  // ---- order mix ----
  const statusOrder: OrderStatus[] = ['NEW', 'ASSIGNED', 'IN_PROGRESS', 'QUALITY_CHECK', 'COMPLETED', 'RETURNED_TO_PARKING', 'ISSUE_REPORTED', 'DELAYED', 'CANCELLED'];
  const statusMix = statusOrder
    .map((status) => ({ status, count: inPeriod.filter((o) => o.status === status).length }))
    .filter((x) => x.count > 0);

  // ---- when orders come in ----
  const heatmap = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
  for (const o of live) {
    const t = ms(o.createdAt);
    heatmap[qatarWeekday(t)][qatarHour(t)] += 1;
  }

  // ---- people and places ----
  const perCustomer = countBy(live, (o) => o.employeeId);
  const perBay = countBy(live, (o) => o.bayCodeSnapshot);

  return {
    range,
    revenue: {
      singleMinor,
      passMinor,
      totalMinor: singleMinor + passMinor,
      singleCount: singles.length,
      passesSold: soldPasses.length,
      avgSingleMinor: singles.length ? singleMinor / singles.length : null,
    },
    orders: {
      created: inPeriod.length,
      delivered: delivered.length,
      cancelled: cancelled.length,
      cancelRate: rate(cancelled.length, inPeriod.length),
      singleWashes: singles.length,
      passWashes: passWashes.length,
    },
    customers: {
      active: activeIds.size,
      newCustomers,
      returning: activeIds.size - newCustomers,
      avgOrders: activeIds.size ? live.length / activeIds.size : null,
      passConversion: rate(converted, soldPasses.length),
      passesConverted: converted,
    },
    savings: {
      totalMinor: savingsMinor,
      perCustomerMinor: activeIds.size ? savingsMinor / activeIds.size : null,
      beneficiaries: activeIds.size,
      washesDelivered: live.length,
    },
    ops: {
      stages,
      washOnTargetRate: rate(washOnTarget, series.wash.length),
      washMeasured: series.wash.length,
    },
    quality: {
      eligible: eligibleOrders.length,
      inspected,
      skipped,
      missing: eligibleOrders.length - inspected - skipped,
      coverageRate: rate(inspected + skipped, eligibleOrders.length),
      skipReasons: countBy(skipReasons, (r) => r).slice(0, 5).map((x) => ({ reason: x.key, count: x.count })),
      damagesByType: countBy(damages, (d) => d.type).map((x) => ({ type: x.key, count: x.count })),
      damagesBySeverity: countBy(damages, (d) => d.severity).map((x) => ({ severity: x.key, count: x.count })),
      ordersWithDamage: sentBefore.filter((i) => !i.noDamage && i.damages.length > 0).length,
      newDamagesAfter: sentAfter.reduce((sum, i) => sum + i.damages.filter((d) => d.isNew).length, 0),
      qcChecked: qc.length,
      qcPassed: qc.filter((o) => o.qualityCheck?.passed).length,
      qcPassRate: rate(qc.filter((o) => o.qualityCheck?.passed).length, qc.length),
      issuesByCategory: countBy(periodIssues, (i) => i.category).map((x) => ({ category: x.key, count: x.count })),
      issuesOpen: periodIssues.filter((i) => i.status === 'OPEN').length,
      avgResolutionHours: average(resolved.map((i) => (ms(i.resolvedAt) - ms(i.createdAt)) / (60 * MIN)).filter((h) => h >= 0)),
    },
    cancellations: countBy(cancelled, (o) => (o.cancellation?.reason || 'No reason given').trim() || 'No reason given')
      .slice(0, 5)
      .map((x) => ({ reason: x.key, count: x.count })),
    statusMix,
    buckets,
    heatmap,
    topCustomers: perCustomer.slice(0, 5).map((x) => ({ employeeId: x.key, name: nameOf.get(x.key) || 'Ministry staff', orders: x.count })),
    topBays: perBay.slice(0, 8).map((x) => ({ bay: x.key, orders: x.count })),
    distinctBays: perBay.length,
  };
}

// ---------------------------------------------------------------------------
// Right now (not tied to the chosen period)
// ---------------------------------------------------------------------------
export function computePulse(data: DataSet, now: number): Pulse {
  const { orders, events } = data;
  const active = orders.filter((o) => o.status !== 'RETURNED_TO_PARKING' && o.status !== 'CANCELLED' && !awaitingOnlinePayment(o));
  const times = stageTimesByOrder(active, events);

  // When the order entered the stage it is in now (the latest time it moved there)
  const enteredAt = (o: Order): number => {
    let latest = NaN;
    for (const e of events) {
      if (e.orderId !== o.id || e.to !== o.status) continue;
      const t = ms(e.createdAt);
      if (Number.isFinite(t) && (!Number.isFinite(latest) || t > latest)) latest = t;
    }
    if (Number.isFinite(latest)) return latest;
    return (times.get(o.id) || {})[o.status] ?? ms(o.updatedAt);
  };

  const waiting = active.filter((o) => o.status === 'NEW');
  // A re-ordered order waits from the moment it came back, not from the first time it was placed
  const back = reorderTimes(events);
  const waits = waiting.map((o) => (now - (back.get(o.id) ?? ms(o.createdAt))) / MIN).filter((m) => Number.isFinite(m) && m >= 0);

  const stuck: Pulse['stuck'] = [];
  for (const o of active) {
    const limit = STUCK_AFTER_MIN[o.status];
    if (limit === undefined) continue;
    const since = enteredAt(o);
    const minutes = Math.floor((now - since) / MIN);
    if (Number.isFinite(minutes) && minutes > limit) stuck.push({ orderId: o.id, reference: o.reference, status: o.status, minutes, limit });
  }
  stuck.sort((a, b) => b.minutes - a.minutes);

  let last: number | null = null;
  for (const e of events) {
    const t = ms(e.createdAt);
    if (Number.isFinite(t) && (last === null || t > last)) last = t;
  }
  for (const o of orders) {
    for (const t of [ms(o.updatedAt), ms(o.createdAt)]) {
      if (Number.isFinite(t) && (last === null || t > last)) last = t;
    }
  }

  return {
    inProgress: active.filter((o) => ['ASSIGNED', 'IN_PROGRESS', 'QUALITY_CHECK'].includes(o.status)).length,
    waiting: waiting.length,
    oldestWaitingMin: waits.length ? Math.floor(Math.max(...waits)) : null,
    stuck,
    lastActivityAt: last,
  };
}

// ---------------------------------------------------------------------------
// Passes to watch (not tied to the chosen period)
// ---------------------------------------------------------------------------
export function computePassWatch(data: DataSet, now: number): PassWatch {
  const { subscriptions, credits, employees } = data;
  const nameOf = new Map(employees.map((e) => [e.id, e.fullName]));
  const balance = new Map<string, number>();
  for (const c of credits) balance.set(c.employeeId, (balance.get(c.employeeId) || 0) + c.delta);

  const result: PassWatch = {
    endingSoon: [],
    low: [],
    expiredWithWashes: [],
    activePasses: 0,
    washesGranted: 0,
    washesUsed: 0,
    prepaidWashes: 0,
    prepaidMinor: 0,
  };

  for (const s of subscriptions) {
    const left = balance.get(s.employeeId) || 0;
    const name = nameOf.get(s.employeeId) || 'Ministry staff';
    const endsAt = ms(s.expiresAt);
    const ended = s.status === 'EXPIRED' || (Number.isFinite(endsAt) && endsAt <= now);

    if (s.status === 'ACTIVE' && !ended) {
      result.activePasses += 1;
      const granted = credits
        .filter((c) => c.subscriptionId === s.id && (c.type === 'GRANT' || c.type === 'BONUS'))
        .reduce((sum, c) => sum + c.delta, 0);
      const total = Math.max(granted, left);
      result.washesGranted += total;
      result.washesUsed += Math.max(0, total - left);
      const washes = (s.packageSnapshot?.paidWashes || 0) + (s.packageSnapshot?.bonusWashes || 0);
      const perWash = washes > 0 ? (s.packageSnapshot?.price?.amountMinor || 0) / washes : 0;
      result.prepaidWashes += Math.max(0, left);
      result.prepaidMinor += Math.max(0, left) * perWash;
      if (Number.isFinite(endsAt) && endsAt - now <= PASS_ENDING_DAYS * DAY) {
        result.endingSoon.push({ subscriptionId: s.id, employeeId: s.employeeId, name, endsAt, left });
      }
      if (left <= PASS_LOW_WASHES) result.low.push({ subscriptionId: s.id, employeeId: s.employeeId, name, left });
    } else if (s.status !== 'CANCELLED' && ended && left > 0) {
      result.expiredWithWashes.push({ subscriptionId: s.id, employeeId: s.employeeId, name, left });
    }
  }
  result.endingSoon.sort((a, b) => a.endsAt - b.endsAt);
  result.low.sort((a, b) => a.left - b.left);
  result.prepaidMinor = Math.round(result.prepaidMinor);
  return result;
}

/** The earliest moment in the data (to start "all time" from). */
export function earliestMoment(data: DataSet): number | undefined {
  let min: number | undefined;
  for (const o of data.orders) {
    const t = ms(o.createdAt);
    if (Number.isFinite(t) && (min === undefined || t < min)) min = t;
  }
  for (const s of data.subscriptions) {
    const t = ms(s.activatedAt);
    if (Number.isFinite(t) && (min === undefined || t < min)) min = t;
  }
  return min;
}

// ---------------------------------------------------------------------------
// Export
// ---------------------------------------------------------------------------
const csvCell = (v: string | number): string => {
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function summaryToCsv(summary: Summary): string {
  const q = (minor: number) => (minor / 100).toFixed(2);
  const lines: (string | number)[][] = [
    ['Period', `${dayKey(summary.range.from)} to ${dayKey(summary.range.to - 1)}`],
    [],
    ['Metric', 'Value'],
    ['Revenue, single washes (QAR)', q(summary.revenue.singleMinor)],
    ['Revenue, passes sold (QAR)', q(summary.revenue.passMinor)],
    ['Revenue, total (QAR)', q(summary.revenue.totalMinor)],
    ['Orders created', summary.orders.created],
    ['Orders delivered', summary.orders.delivered],
    ['Orders cancelled', summary.orders.cancelled],
    ['Single washes', summary.orders.singleWashes],
    ['Pass washes', summary.orders.passWashes],
    ['Active customers', summary.customers.active],
    ['New customers', summary.customers.newCustomers],
    ['Passes sold', summary.revenue.passesSold],
    ['Savings for employees (QAR)', q(summary.savings.totalMinor)],
    [],
    ['Date', 'Single washes (QAR)', 'Passes sold (QAR)', 'Orders', 'Delivered', 'Passes sold'],
    ...summary.buckets.map((b) => [dayKey(b.start), q(b.singleMinor), q(b.passMinor), b.orders, b.delivered, b.passesSold]),
  ];
  return lines.map((row) => row.map(csvCell).join(',')).join('\n');
}
