'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { ArrowDownRight, ArrowUpRight, Download } from 'lucide-react';
import {
  PASS_ENDING_DAYS,
  PASS_LOW_WASHES,
  STUCK_AFTER_MIN,
  WASH_TARGET_MIN,
  MARKET_WASH_PRICE_MINOR,
  change,
  computePassWatch,
  computePulse,
  computeSummary,
  dayKey,
  earliestMoment,
  presetRange,
  previousRange,
  summaryToCsv,
  type Bucket,
  type DataSet,
  type PresetId,
  type Range,
  type Summary,
} from '@/domain/analytics';
import type { OrderStatus } from '@/domain/types';

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------
const DAY_MS = 24 * 60 * 60 * 1000;

function qar(minor: number): string {
  const v = minor / 100;
  return `${v.toLocaleString('en-US', { maximumFractionDigits: 2 })} QAR`;
}

function minutes(m: number | null): string {
  if (m === null) return '–';
  if (m < 1) return '<1 min';
  if (m < 60) return `${Math.round(m)} min`;
  const h = Math.floor(m / 60);
  const r = Math.round(m % 60);
  return r ? `${h}h ${r}m` : `${h}h`;
}

const pct = (x: number | null) => (x === null ? '–' : `${Math.round(x * 100)}%`);
const num = (x: number) => x.toLocaleString('en-US');

function ago(now: number, then: number | null): string {
  if (then === null) return '–';
  const m = Math.max(0, Math.floor((now - then) / 60000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

function rangeLabel(r: Range): string {
  const fmt = (t: number) =>
    new Date(t + 3 * 60 * 60 * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const last = r.to - 1;
  return dayKey(r.from) === dayKey(last) ? fmt(r.from) : `${fmt(r.from)} – ${fmt(last)}`;
}

const STATUS_NAMES: Record<OrderStatus, string> = {
  NEW: 'New',
  ASSIGNED: 'Assigned',
  IN_PROGRESS: 'In progress',
  QUALITY_CHECK: 'Quality check',
  COMPLETED: 'Completed',
  RETURNED_TO_PARKING: 'Ready at bay',
  ISSUE_REPORTED: 'Issue reported',
  DELAYED: 'Delayed',
  CANCELLED: 'Cancelled',
};

const DAMAGE_NAMES: Record<string, string> = { SCRATCH: 'Scratch', DENT: 'Dent', CRACK: 'Crack', PAINT: 'Paint', OTHER: 'Other' };
const SEVERITY_NAMES: Record<string, string> = { LOW: 'Low', MEDIUM: 'Medium', HIGH: 'High' };
const CATEGORY_NAMES: Record<string, string> = { DAMAGE: 'Damage', ACCESS: 'Access', QUALITY: 'Quality', COMPLAINT: 'Complaint', OTHER: 'Other' };

const PRESETS: { id: PresetId; label: string }[] = [
  { id: 'today', label: 'Today' },
  { id: 'yesterday', label: 'Yesterday' },
  { id: '7d', label: '7 days' },
  { id: '30d', label: '30 days' },
  { id: 'thisMonth', label: 'This month' },
  { id: 'lastMonth', label: 'Last month' },
  { id: 'all', label: 'All time' },
  { id: 'custom', label: 'Custom' },
];

// ---------------------------------------------------------------------------
// Small pieces
// ---------------------------------------------------------------------------
const card = 'rounded-3xl bg-tile';

function Section({ title, note, children, right }: { title: string; note?: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className={`${card} p-4 md:p-6 space-y-5`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-base font-semibold text-ink tracking-tight">{title}</h3>
          {note && <p className="text-sm text-dim mt-0.5">{note}</p>}
        </div>
        {right}
      </div>
      {children}
    </section>
  );
}

function Empty({ children = 'No data in this period.' }: { children?: React.ReactNode }) {
  return <p className="text-sm text-dim py-6 text-center">{children}</p>;
}

/** Up or down against the previous period. `good` says which direction is the better one. */
function Delta({ current, previous, good = 'up' }: { current: number | null; previous: number | null; good?: 'up' | 'down' | 'none' }) {
  const c = change(current, previous);
  if (c === null) return null;
  const rounded = Math.round(Math.abs(c) * 100);
  if (rounded === 0) return <span className="text-xs text-dim tabular-nums">0%</span>;
  const up = c > 0;
  const better = good === 'none' ? null : good === 'up' ? up : !up;
  const tone = better === null ? 'text-muted' : better ? 'text-emerald-400' : 'text-rose-400';
  const Icon = up ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-0.5 text-xs font-medium tabular-nums ${tone}`} title="Compared with the previous period">
      <Icon className="h-3.5 w-3.5" />
      {rounded}%
    </span>
  );
}

function Spark({ values }: { values: number[] }) {
  if (values.length < 2 || Math.max(...values) === 0) return <div className="h-7" aria-hidden="true" />;
  const max = Math.max(...values);
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * 100},${26 - (v / max) * 24}`).join(' ');
  return (
    <svg viewBox="0 0 100 28" preserveAspectRatio="none" className="h-7 w-full text-link" aria-hidden="true">
      <polyline points={pts} fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function Kpi({
  label,
  value,
  hint,
  delta,
  spark,
}: {
  label: string;
  value: string;
  hint?: string;
  delta?: React.ReactNode;
  spark?: number[];
}) {
  return (
    <div className={`${card} p-4 flex flex-col gap-2 min-w-0`} title={hint}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm text-muted truncate">{label}</span>
        {delta}
      </div>
      <div className="text-[26px] leading-none font-semibold tracking-[-0.02em] text-ink tabular-nums">{value}</div>
      {spark ? <Spark values={spark} /> : <div className="h-7" aria-hidden="true" />}
    </div>
  );
}

/** A list of labelled horizontal bars. */
function BarList({ rows, format = num }: { rows: { label: string; value: number; sub?: string }[]; format?: (n: number) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.label} className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="text-body truncate">{r.label}</span>
            <span className="text-ink font-semibold tabular-nums whitespace-nowrap">
              {format(r.value)}
              {r.sub && <span className="ms-1.5 text-xs font-normal text-dim">{r.sub}</span>}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-fill overflow-hidden">
            <div className="h-full rounded-full bg-[#0071e3]" style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** One bar split into parts, with a legend. */
function Split({ parts }: { parts: { label: string; value: number; color: string }[] }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  if (total === 0) return <Empty />;
  return (
    <div className="space-y-3">
      <div className="flex h-3 rounded-full overflow-hidden bg-fill gap-0.5" role="img" aria-label={parts.map((p) => `${p.label} ${p.value}`).join(', ')}>
        {parts
          .filter((p) => p.value > 0)
          .map((p) => (
            <div key={p.label} className={p.color} style={{ width: `${(p.value / total) * 100}%` }} />
          ))}
      </div>
      <ul className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
        {parts.map((p) => (
          <li key={p.label} className="flex items-center gap-2 text-muted">
            <span className={`h-2 w-2 rounded-full ${p.color}`} />
            {p.label}
            <span className="text-ink font-semibold tabular-nums">{num(p.value)}</span>
            <span className="text-dim tabular-nums">{pct(p.value / total)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Bars over time. Each bar may be stacked. Hover or focus a bar to read it. */
function TimeBars({
  buckets,
  series,
  format,
}: {
  buckets: Bucket[];
  series: { label: string; color: string; get: (b: Bucket) => number }[];
  format: (n: number) => string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const totals = buckets.map((b) => series.reduce((s, x) => s + x.get(b), 0));
  const max = Math.max(1, ...totals);
  const every = Math.max(1, Math.ceil(buckets.length / 8));
  const shown = active !== null ? buckets[active] : null;

  if (Math.max(...totals) === 0) return <Empty />;
  return (
    <div className="space-y-3">
      <div className="min-h-[20px] text-sm text-muted tabular-nums">
        {shown ? (
          <span>
            <span className="text-ink font-semibold">{shown.label}</span>
            {series.map((s) => (
              <span key={s.label} className="ms-3">
                {s.label} <span className="text-ink">{format(s.get(shown))}</span>
              </span>
            ))}
          </span>
        ) : (
          <span className="text-dim">Hover or tap a bar</span>
        )}
      </div>
      <div className="flex items-end gap-[3px] h-44" onMouseLeave={() => setActive(null)}>
        {buckets.map((b, i) => {
          const total = totals[i];
          return (
            <button
              key={b.start}
              type="button"
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onClick={() => setActive(i)}
              aria-label={`${b.label}: ${series.map((s) => `${s.label} ${format(s.get(b))}`).join(', ')}`}
              className={`flex-1 min-w-0 h-full flex flex-col justify-end rounded-md outline-none transition-opacity cursor-pointer ${
                active !== null && active !== i ? 'opacity-50' : ''
              }`}
            >
              <span className="flex flex-col justify-end w-full rounded-md overflow-hidden" style={{ height: `${total > 0 ? Math.max(3, (total / max) * 100) : 0}%` }}>
                {series
                  .slice()
                  .reverse()
                  .map((s) => {
                    const v = s.get(b);
                    return v > 0 ? <span key={s.label} className={`block w-full ${s.color}`} style={{ flexGrow: v, flexBasis: 0 }} /> : null;
                  })}
              </span>
              {total === 0 && <span className="block w-full h-[3px] rounded-full bg-fill" />}
            </button>
          );
        })}
      </div>
      <div className="flex gap-[3px] text-[11px] text-dim">
        {buckets.map((b, i) => (
          <span key={b.start} className="flex-1 min-w-0 text-center whitespace-nowrap overflow-visible">
            {i % every === 0 ? b.label : ''}
          </span>
        ))}
      </div>
      <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted">
        {series.map((s) => (
          <li key={s.label} className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${s.color}`} />
            {s.label}
          </li>
        ))}
      </ul>
    </div>
  );
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function Heatmap({ grid }: { grid: number[][] }) {
  const max = Math.max(0, ...grid.flat());
  if (max === 0) return <Empty />;
  return (
    <div className="overflow-x-auto">
      <div className="min-w-[560px] space-y-1">
        <div className="grid gap-[3px] ps-10" style={{ gridTemplateColumns: 'repeat(24, minmax(0, 1fr))' }}>
          {Array.from({ length: 24 }, (_, h) => (
            <span key={h} className="text-[10px] text-dim text-center">
              {h % 3 === 0 ? h : ''}
            </span>
          ))}
        </div>
        {grid.map((row, d) => (
          <div key={d} className="flex items-center gap-1">
            <span className="w-9 text-xs text-dim shrink-0">{WEEKDAYS[d]}</span>
            <div className="grid gap-[3px] flex-1" style={{ gridTemplateColumns: 'repeat(24, minmax(0, 1fr))' }}>
              {row.map((v, h) => (
                <span
                  key={h}
                  title={`${WEEKDAYS[d]} ${String(h).padStart(2, '0')}:00, ${v} ${v === 1 ? 'order' : 'orders'}`}
                  className="h-6 rounded-[5px] bg-[#0071e3]"
                  style={{ opacity: v === 0 ? 0.08 : 0.2 + (v / max) * 0.8 }}
                />
              ))}
            </div>
          </div>
        ))}
        <p className="text-xs text-dim pt-1">Doha time. The darker the square, the more orders.</p>
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-2xl bg-inset p-4">
      <div className="text-xs text-dim">{label}</div>
      <div className="mt-1 text-[20px] leading-tight font-semibold text-ink tabular-nums">{value}</div>
      {sub && <div className="text-xs text-dim mt-0.5">{sub}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// The page
// ---------------------------------------------------------------------------
const STORAGE_KEY = 'triplea_insights_view';

export function InsightsView({ data, now }: { data: DataSet; now: number | null }) {
  const [preset, setPreset] = useState<PresetId>('7d');
  const [compare, setCompare] = useState(true);
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');

  // Remember the choice on this device
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (saved && PRESETS.some((p) => p.id === saved.preset)) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- the saved choice is only known in the browser
        setPreset(saved.preset);
        setCompare(saved.compare !== false);
        setCustomFrom(saved.customFrom || '');
        setCustomTo(saved.customTo || '');
      }
    } catch {
      // Ignore
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ preset, compare, customFrom, customTo }));
    } catch {
      // Ignore
    }
  }, [preset, compare, customFrom, customTo]);

  const earliest = useMemo(() => earliestMoment(data), [data]);

  const range: Range | null = useMemo(() => {
    if (now === null) return null;
    let custom: Range | undefined;
    if (preset === 'custom' && customFrom && customTo) {
      const from = Date.parse(`${customFrom}T00:00:00+03:00`);
      const to = Date.parse(`${customTo}T00:00:00+03:00`) + DAY_MS;
      if (Number.isFinite(from) && Number.isFinite(to) && to > from) custom = { from, to };
    }
    return presetRange(preset, now, { custom, earliest });
  }, [preset, now, customFrom, customTo, earliest]);

  const summary: Summary | null = useMemo(() => (range ? computeSummary(data, range) : null), [data, range]);
  const prevRange = range ? previousRange(range, preset) : null;
  const prev: Summary | null = useMemo(
    () => (compare && prevRange ? computeSummary(data, prevRange) : null),
    [data, compare, prevRange]
  );
  const pulse = useMemo(() => (now === null ? null : computePulse(data, now)), [data, now]);
  const passes = useMemo(() => (now === null ? null : computePassWatch(data, now)), [data, now]);

  if (!summary || !pulse || !passes || now === null || !range) {
    return (
      <div className="space-y-4" aria-busy="true">
        <div className={`${card} h-16 animate-pulse`} />
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className={`${card} h-28 animate-pulse`} />
          ))}
        </div>
        <div className={`${card} h-72 animate-pulse`} />
      </div>
    );
  }

  const sp = (get: (b: Bucket) => number) => summary.buckets.map(get);
  const stage = Object.fromEntries(summary.ops.stages.map((s) => [s.key, s]));
  const stageMax = Math.max(1, ...summary.ops.stages.map((s) => s.avgMin ?? 0));

  const exportCsv = () => {
    const blob = new Blob([summaryToCsv(summary)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `triplea-insights-${dayKey(range.from)}-to-${dayKey(range.to - 1)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const chip = (active: boolean) =>
    `shrink-0 px-3.5 py-1.5 rounded-full text-sm whitespace-nowrap transition cursor-pointer ${
      active ? 'bg-ink text-canvas font-medium' : 'bg-tile text-body hover:bg-raised'
    }`;

  const peakHour = (() => {
    let best = { count: 0, hour: -1 };
    const byHour = Array.from({ length: 24 }, () => 0);
    for (const row of summary.heatmap) row.forEach((v, h) => (byHour[h] += v));
    byHour.forEach((v, h) => {
      if (v > best.count) best = { count: v, hour: h };
    });
    return best.hour >= 0 ? `${String(best.hour).padStart(2, '0')}:00` : null;
  })();

  return (
    <div className="max-w-[1200px] space-y-4">
      {/* Period */}
      <div className={`${card} p-3 md:p-4 space-y-3`}>
        <div className="flex items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="tablist" aria-label="Period">
          {PRESETS.map((p) => (
            <button key={p.id} role="tab" aria-selected={preset === p.id} onClick={() => setPreset(p.id)} className={chip(preset === p.id)}>
              {p.label}
            </button>
          ))}
        </div>
        {preset === 'custom' && (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <label className="flex items-center gap-2 text-muted">
              From
              <input
                type="date"
                value={customFrom}
                max={customTo || undefined}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="bg-raised rounded-xl px-3 py-2 text-ink outline-none tabular-nums"
              />
            </label>
            <label className="flex items-center gap-2 text-muted">
              To
              <input
                type="date"
                value={customTo}
                min={customFrom || undefined}
                onChange={(e) => setCustomTo(e.target.value)}
                className="bg-raised rounded-xl px-3 py-2 text-ink outline-none tabular-nums"
              />
            </label>
            {!(customFrom && customTo) && <span className="text-dim">Choose both dates. Showing the last 7 days until then.</span>}
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-sm text-muted tabular-nums">
            <span className="text-ink font-medium">{rangeLabel(range)}</span>
            {compare && prevRange && <span className="text-dim"> · compared with {rangeLabel(prevRange)}</span>}
          </div>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-sm text-muted cursor-pointer select-none">
              <input type="checkbox" checked={compare} disabled={!prevRange} onChange={(e) => setCompare(e.target.checked)} className="accent-[#0071e3] h-4 w-4" />
              Compare
            </label>
            <button onClick={exportCsv} className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-fill hover:bg-fill-strong text-sm text-ink transition active:scale-95 cursor-pointer">
              <Download className="h-4 w-4" />
              Export
            </button>
          </div>
        </div>
      </div>

      {/* Right now */}
      <Section title="Right now" note="Live, not tied to the period above.">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <Stat label="In progress" value={num(pulse.inProgress)} sub="assigned, washing or in quality check" />
          <Stat label="Waiting" value={num(pulse.waiting)} sub="new orders not yet assigned" />
          <Stat label="Oldest waiting" value={minutes(pulse.oldestWaitingMin)} />
          <Stat label="Last activity" value={ago(now, pulse.lastActivityAt)} />
        </div>
        {pulse.stuck.length > 0 && (
          <div className="rounded-2xl bg-amber-400/[0.08] p-4 space-y-2">
            <div className="text-sm font-semibold text-amber-300">
              {pulse.stuck.length} {pulse.stuck.length === 1 ? 'order is' : 'orders are'} taking longer than usual
            </div>
            <ul className="space-y-1.5 text-sm">
              {pulse.stuck.slice(0, 5).map((s) => (
                <li key={s.orderId} className="flex items-center justify-between gap-3">
                  <span className="text-body tabular-nums">
                    {s.reference} <span className="text-dim">· {STATUS_NAMES[s.status]}</span>
                  </span>
                  <span className="text-amber-300 tabular-nums whitespace-nowrap">
                    {minutes(s.minutes)} <span className="text-dim">(limit {s.limit})</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Section>

      {/* Key numbers */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <Kpi
          label="Revenue"
          value={qar(summary.revenue.totalMinor)}
          hint="Paid single washes plus passes sold in the period. A wash paid with a pass is not counted again."
          delta={<Delta current={summary.revenue.totalMinor} previous={prev?.revenue.totalMinor ?? null} />}
          spark={sp((b) => b.singleMinor + b.passMinor)}
        />
        <Kpi
          label="Orders"
          value={num(summary.orders.created)}
          hint="Orders placed in the period, including cancelled ones."
          delta={<Delta current={summary.orders.created} previous={prev?.orders.created ?? null} />}
          spark={sp((b) => b.orders)}
        />
        <Kpi
          label="Ready at bay"
          value={num(summary.orders.delivered)}
          hint="Orders placed in the period that are finished."
          delta={<Delta current={summary.orders.delivered} previous={prev?.orders.delivered ?? null} />}
          spark={sp((b) => b.delivered)}
        />
        <Kpi
          label="Customers"
          value={num(summary.customers.active)}
          hint="Different employees who ordered in the period."
          delta={<Delta current={summary.customers.active} previous={prev?.customers.active ?? null} />}
        />
        <Kpi
          label="Order to ready"
          value={minutes(stage.total.avgMin)}
          hint="Average time from the order being placed to the car being ready."
          delta={<Delta current={stage.total.avgMin} previous={prev?.ops.stages.find((s) => s.key === 'total')?.avgMin ?? null} good="down" />}
        />
        <Kpi
          label="Employee savings"
          value={qar(summary.savings.totalMinor)}
          hint={`Against a normal price of ${qar(MARKET_WASH_PRICE_MINOR)} per wash.`}
          delta={<Delta current={summary.savings.totalMinor} previous={prev?.savings.totalMinor ?? null} />}
        />
      </div>

      {/* Revenue */}
      <Section
        title="Revenue"
        note="Single washes are counted when ordered. A pass is counted when it is sold, and the washes paid with it are not counted again."
      >
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2">
            <TimeBars
              buckets={summary.buckets}
              format={qar}
              series={[
                { label: 'Single washes', color: 'bg-[#0071e3]', get: (b) => b.singleMinor },
                { label: 'Passes sold', color: 'bg-[#8e8e93]', get: (b) => b.passMinor },
              ]}
            />
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-1 gap-3 content-start">
            <Stat label="Single washes" value={qar(summary.revenue.singleMinor)} sub={`${num(summary.revenue.singleCount)} ${summary.revenue.singleCount === 1 ? 'order' : 'orders'}`} />
            <Stat label="Passes sold" value={qar(summary.revenue.passMinor)} sub={`${num(summary.revenue.passesSold)} ${summary.revenue.passesSold === 1 ? 'pass' : 'passes'}`} />
            <Stat label="Average single wash" value={summary.revenue.avgSingleMinor === null ? '–' : qar(summary.revenue.avgSingleMinor)} />
            <Stat
              label="Washes prepaid, not used yet"
              value={`${num(passes.prepaidWashes)} washes`}
              sub={`worth ${qar(passes.prepaidMinor)} on active passes`}
            />
          </div>
        </div>
      </Section>

      {/* Orders */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <Section title="Orders" note="Placed and finished, by day." right={<Delta current={summary.orders.created} previous={prev?.orders.created ?? null} />}>
            <TimeBars
              buckets={summary.buckets}
              format={num}
              series={[
                { label: 'Finished', color: 'bg-[#0071e3]', get: (b) => b.delivered },
                { label: 'Not finished', color: 'bg-[#8e8e93]', get: (b) => Math.max(0, b.orders - b.delivered) },
              ]}
            />
          </Section>
        </div>
        <Section title="Order types">
          <Split
            parts={[
              { label: 'Single wash', value: summary.orders.singleWashes, color: 'bg-[#0071e3]' },
              { label: 'Pass wash', value: summary.orders.passWashes, color: 'bg-[#8e8e93]' },
            ]}
          />
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Cancelled" value={num(summary.orders.cancelled)} sub={`${pct(summary.orders.cancelRate)} of orders`} />
            <Stat label="Busiest hour" value={peakHour ?? '–'} sub="Doha time" />
          </div>
        </Section>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Section title="Orders by status" note="Where the orders of this period are now.">
          {summary.statusMix.length === 0 ? (
            <Empty />
          ) : (
            <BarList rows={summary.statusMix.map((s) => ({ label: STATUS_NAMES[s.status], value: s.count }))} />
          )}
        </Section>
        <Section title="Why orders were cancelled">
          {summary.cancellations.length === 0 ? (
            <Empty>No cancellations in this period.</Empty>
          ) : (
            <BarList rows={summary.cancellations.map((c) => ({ label: c.reason, value: c.count }))} />
          )}
        </Section>
      </div>

      {/* When */}
      <Section title="When orders come in" note="Orders placed, by day of the week and hour.">
        <Heatmap grid={summary.heatmap} />
      </Section>

      {/* Operations */}
      <Section title="Speed" note="Average time in each step. Measured only on orders that reached the step.">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-3.5">
            {summary.ops.stages.every((s) => s.count === 0) ? (
              <Empty />
            ) : (
              summary.ops.stages.map((s) => (
                <div key={s.key} className="space-y-1.5">
                  <div className="flex items-baseline justify-between gap-3 text-sm">
                    <span className={s.key === 'total' ? 'text-ink font-medium' : 'text-body'}>{s.label}</span>
                    <span className="tabular-nums whitespace-nowrap text-ink font-semibold">
                      {minutes(s.avgMin)}
                      <span className="ms-2 text-xs font-normal text-dim">
                        median {minutes(s.medianMin)} · {num(s.count)} {s.count === 1 ? 'order' : 'orders'}
                      </span>
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-fill overflow-hidden">
                    <div className={`h-full rounded-full ${s.key === 'total' ? 'bg-ink' : 'bg-[#0071e3]'}`} style={{ width: `${((s.avgMin ?? 0) / stageMax) * 100}%` }} />
                  </div>
                </div>
              ))
            )}
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-1 gap-3 content-start">
            <Stat
              label={`Washes within ${WASH_TARGET_MIN} min`}
              value={pct(summary.ops.washOnTargetRate)}
              sub={summary.ops.washMeasured ? `${num(summary.ops.washMeasured)} washes measured` : 'No washes measured yet'}
            />
            <Stat
              label="Flagged as slow"
              value={num(pulse.stuck.length)}
              sub={`over ${STUCK_AFTER_MIN.NEW} min waiting, or ${STUCK_AFTER_MIN.IN_PROGRESS} min washing`}
            />
          </div>
        </div>
      </Section>

      {/* Customers */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Section title="Customers">
          <Split
            parts={[
              { label: 'New', value: summary.customers.newCustomers, color: 'bg-[#0071e3]' },
              { label: 'Returning', value: summary.customers.returning, color: 'bg-[#8e8e93]' },
            ]}
          />
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Orders per customer" value={summary.customers.avgOrders === null ? '–' : summary.customers.avgOrders.toFixed(1)} />
            <Stat
              label="Bought a pass after a single wash"
              value={pct(summary.customers.passConversion)}
              sub={`${num(summary.customers.passesConverted)} of ${num(summary.revenue.passesSold)} passes sold`}
            />
          </div>
          <div>
            <h4 className="text-sm text-muted mb-3">Most orders</h4>
            {summary.topCustomers.length === 0 ? (
              <Empty />
            ) : (
              <BarList rows={summary.topCustomers.map((c) => ({ label: c.name, value: c.orders }))} />
            )}
          </div>
        </Section>

        <Section title="Passes" note="Passes that need attention. Live, not tied to the period.">
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Active passes" value={num(passes.activePasses)} />
            <Stat
              label="Washes used"
              value={`${num(passes.washesUsed)} of ${num(passes.washesGranted)}`}
              sub={passes.washesGranted ? `${pct(passes.washesUsed / passes.washesGranted)} used` : undefined}
            />
          </div>
          <PassList
            title={`Ending within ${PASS_ENDING_DAYS} days`}
            rows={passes.endingSoon.map((p) => ({
              key: p.subscriptionId,
              name: p.name,
              detail: `${p.left} left · ends ${new Date(p.endsAt + 3 * 60 * 60 * 1000).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}`,
            }))}
          />
          <PassList
            title={`${PASS_LOW_WASHES} washes left or fewer`}
            rows={passes.low.map((p) => ({ key: p.subscriptionId, name: p.name, detail: `${p.left} left` }))}
          />
          <PassList
            title="Ended with washes unused"
            rows={passes.expiredWithWashes.map((p) => ({ key: p.subscriptionId, name: p.name, detail: `${p.left} unused` }))}
          />
        </Section>
      </div>

      {/* Quality */}
      <Section title="Quality" note="Car inspections, damage and quality checks for the orders of this period.">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="space-y-4">
            <h4 className="text-sm text-muted">Inspection before the wash</h4>
            {summary.quality.eligible === 0 ? (
              <Empty>No washes started in this period.</Empty>
            ) : (
              <>
                <Split
                  parts={[
                    { label: 'Inspected', value: summary.quality.inspected, color: 'bg-[#0071e3]' },
                    { label: 'Skipped', value: summary.quality.skipped, color: 'bg-amber-400' },
                    { label: 'Missing', value: summary.quality.missing, color: 'bg-[#8e8e93]' },
                  ]}
                />
                {summary.quality.skipReasons.length > 0 && (
                  <ul className="space-y-1.5 text-sm">
                    {summary.quality.skipReasons.map((r) => (
                      <li key={r.reason} className="flex justify-between gap-3 text-muted">
                        <span className="truncate">{r.reason}</span>
                        <span className="text-ink tabular-nums">{r.count}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </div>
          <div className="space-y-4">
            <h4 className="text-sm text-muted">Damage found before the wash</h4>
            {summary.quality.damagesByType.length === 0 ? (
              <Empty>No damage recorded.</Empty>
            ) : (
              <>
                <BarList rows={summary.quality.damagesByType.map((d) => ({ label: DAMAGE_NAMES[d.type] || d.type, value: d.count }))} />
                <p className="text-sm text-muted">
                  {summary.quality.damagesBySeverity.map((s) => `${SEVERITY_NAMES[s.severity] || s.severity} ${s.count}`).join(' · ')}
                </p>
              </>
            )}
            <Stat label="New damage after the wash" value={num(summary.quality.newDamagesAfter)} />
          </div>
          <div className="space-y-4">
            <h4 className="text-sm text-muted">Checks and problems</h4>
            <div className="grid grid-cols-2 gap-3">
              <Stat
                label="Quality check passed"
                value={pct(summary.quality.qcPassRate)}
                sub={summary.quality.qcChecked ? `${num(summary.quality.qcPassed)} of ${num(summary.quality.qcChecked)}` : 'No checks yet'}
              />
              <Stat label="Open problems" value={num(summary.quality.issuesOpen)} sub={summary.quality.avgResolutionHours === null ? undefined : `fixed in ${minutes(summary.quality.avgResolutionHours * 60)} on average`} />
            </div>
            {summary.quality.issuesByCategory.length > 0 && (
              <BarList rows={summary.quality.issuesByCategory.map((c) => ({ label: CATEGORY_NAMES[c.category] || c.category, value: c.count }))} />
            )}
          </div>
        </div>
      </Section>

      {/* Bays and Ministry */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Section title="Bays" note={`${num(summary.distinctBays)} different bays used in this period.`}>
          {summary.topBays.length === 0 ? (
            <Empty />
          ) : (
            <BarList rows={summary.topBays.map((b) => ({ label: `Bay ${b.bay}`, value: b.orders }))} />
          )}
        </Section>
        <Section
          title="Ministry partnership"
          note={`Savings are counted against a normal price of ${qar(MARKET_WASH_PRICE_MINOR)} per wash.`}
        >
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Saved by employees" value={qar(summary.savings.totalMinor)} />
            <Stat label="Saved per employee" value={summary.savings.perCustomerMinor === null ? '–' : qar(summary.savings.perCustomerMinor)} />
            <Stat label="Employees served" value={num(summary.savings.beneficiaries)} />
            <Stat label="Washes delivered" value={num(summary.savings.washesDelivered)} />
          </div>
        </Section>
      </div>

      <p className="text-xs text-dim px-1 pb-4">
        Days follow Doha time. Every figure is calculated from the orders, passes and inspections saved in the database.
      </p>
    </div>
  );
}

function PassList({ title, rows }: { title: string; rows: { key: string; name: string; detail: string }[] }) {
  return (
    <div>
      <h4 className="text-sm text-muted mb-2">{title}</h4>
      {rows.length === 0 ? (
        <p className="text-sm text-dim">None.</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.slice(0, 6).map((r) => (
            <li key={r.key} className="flex items-center justify-between gap-3 rounded-xl bg-inset px-3.5 py-2.5 text-sm">
              <span className="text-body truncate">{r.name}</span>
              <span className="text-ink tabular-nums whitespace-nowrap">{r.detail}</span>
            </li>
          ))}
          {rows.length > 6 && <li className="text-xs text-dim px-1">and {rows.length - 6} more</li>}
        </ul>
      )}
    </div>
  );
}
