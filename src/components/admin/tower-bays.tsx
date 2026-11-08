'use client';

import React, { useMemo, useState } from 'react';
import { Search, X, TriangleAlert } from 'lucide-react';
import { TOTAL_BAYS } from '@/data/mock/seed';
import { buildTowerBoard, findBay, type BayCard } from '@/domain/bays';
import type { Employee, Order, OrderStatus } from '@/domain/types';
import { plateLabel } from '@/lib/utils';

const card = 'rounded-3xl bg-tile';

const STATUS_WORDS: Partial<Record<OrderStatus, string>> = {
  NEW: 'Waiting for the team',
  ASSIGNED: 'Team assigned',
  IN_PROGRESS: 'Being washed',
  QUALITY_CHECK: 'Final check',
  COMPLETED: 'Washed, going back',
  ISSUE_REPORTED: 'Needs attention',
};

function waited(now: number | null, since: number): string {
  if (now === null || !since) return '';
  const m = Math.max(0, Math.floor((now - since) / 60000));
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h}h ${m % 60}m` : `${Math.floor(h / 24)}d`;
}

/** The plate when the customer typed one, otherwise the car, otherwise a plain phrase. */
function vehicleLine(o: Order): string {
  const v = o.vehicleSnapshot;
  if (v.plateNumber && v.plateNumber !== 'Photo Verified') return v.plateNumber;
  const car = [v.make && v.make !== 'Vehicle' ? v.make : '', v.model, v.color].filter(Boolean).join(' ');
  return car || plateLabel(v.plateNumber, 'en');
}

function Place({ c, now, tone, name, onOpen }: { c: BayCard; now: number | null; tone: 'amber' | 'blue' | 'violet'; name: string; onOpen: () => void }) {
  const toneCls = tone === 'amber' ? 'bg-amber-400/10' : tone === 'blue' ? 'bg-[#2997ff]/12' : 'bg-fill';
  const dot = tone === 'amber' ? 'bg-amber-400' : tone === 'blue' ? 'bg-[#2997ff]' : 'bg-violet-400';
  const since = waited(now, c.since);
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`text-start rounded-3xl p-4 md:p-5 space-y-4 transition hover:brightness-125 active:scale-[0.99] cursor-pointer ${toneCls}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          {c.floor && <div className="text-xs text-dim tabular-nums">Floor {c.floor}</div>}
          <div className="text-[28px] leading-none font-semibold tracking-tight text-ink tabular-nums">{c.bay}</div>
        </div>
        <span className={`mt-1.5 w-2 h-2 rounded-full flex-shrink-0 ${dot}`} />
      </div>
      <div className="min-w-0 space-y-0.5">
        <div className="text-[14px] font-semibold text-ink truncate">{name}</div>
        <div className="text-sm text-muted truncate tabular-nums">{vehicleLine(c.order)}</div>
      </div>
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-body truncate">
          {c.order.status === 'RETURNED_TO_PARKING' ? 'Ready for the owner' : STATUS_WORDS[c.order.status] || c.order.status}
        </span>
        {since && <span className="text-dim tabular-nums whitespace-nowrap">{since}</span>}
      </div>
      {c.conflict && (
        <div className="flex items-center gap-1.5 text-xs text-amber-300">
          <TriangleAlert className="h-3.5 w-3.5 flex-shrink-0" />
          <span>Another car is on this bay number</span>
        </div>
      )}
    </button>
  );
}

function Section({ title, hint, count, children, empty }: { title: string; hint: string; count: number; children: React.ReactNode; empty: string }) {
  return (
    <section className="space-y-3">
      <div className="flex items-baseline gap-3 flex-wrap">
        <h3 className="text-base font-semibold text-ink tracking-tight">{title}</h3>
        <span className="text-sm text-dim tabular-nums">{count}</span>
        <span className="text-sm text-dim">{hint}</span>
      </div>
      {count === 0 ? (
        <div className={`${card} p-6 text-center text-sm text-dim`}>{empty}</div>
      ) : (
        <div className="grid grid-cols-1 min-[480px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-3">{children}</div>
      )}
    </section>
  );
}

/**
 * Tower Bays: where every car is right now, in three plain places. Tap a car to open its order.
 */
export function TowerBays({
  orders,
  employees,
  reorderedAt,
  now,
  onOpen,
}: {
  orders: Order[];
  employees: Employee[];
  reorderedAt: Map<string, number>;
  now: number | null;
  onOpen: (orderId: string) => void;
}) {
  const [query, setQuery] = useState('');
  const board = useMemo(() => buildTowerBoard(orders, reorderedAt, now ?? 0), [orders, reorderedAt, now]);
  // The clock starts a moment after the page opens: wait for it, so old ready cars never flash on screen
  if (now === null) return <div className="h-40" aria-hidden />;
  const nameOf = (o: Order) => employees.find((e) => e.id === o.employeeId)?.fullName || 'Ministry staff';

  const q = query.trim().toLowerCase();
  const isBayNumber = /^\d{1,4}$/.test(q);
  const bayNumber = isBayNumber ? Number(q) : NaN;
  const bayValid = isBayNumber && bayNumber >= 1 && bayNumber <= TOTAL_BAYS;

  // A number looks up one bay; text looks for a customer, a plate or an order
  const matches = (c: BayCard) =>
    !q ||
    (isBayNumber
      ? Number(c.bay) === bayNumber
      : nameOf(c.order).toLowerCase().includes(q) ||
        vehicleLine(c.order).toLowerCase().includes(q) ||
        c.order.reference.toLowerCase().includes(q));

  const toPickUp = board.toPickUp.filter(matches);
  const withTeam = isBayNumber ? [] : board.withTeam.filter(matches);
  const ready = board.ready.filter(matches);
  const found = bayValid ? findBay(board, bayNumber) : null;
  const total = board.toPickUp.length + board.withTeam.length + board.ready.length;

  return (
    <div className="max-w-[1200px] space-y-6">
      {/* Where the cars are, in numbers */}
      <div className="grid grid-cols-3 gap-2 md:gap-3">
        {[
          { label: 'Waiting at their bay', value: board.toPickUp.length, dot: 'bg-amber-400' },
          { label: 'With the team', value: board.withTeam.length, dot: 'bg-violet-400' },
          { label: 'Ready for the owner', value: board.ready.length, dot: 'bg-[#2997ff]' },
        ].map((s) => (
          <div key={s.label} className={`${card} p-3 md:p-5`}>
            <div className="flex items-start gap-1.5 md:gap-2 text-xs md:text-sm text-body leading-snug">
              <span className={`mt-1 w-2 h-2 rounded-full flex-shrink-0 ${s.dot}`} />
              <span>{s.label}</span>
            </div>
            <div className="mt-1 text-[26px] md:text-[32px] leading-tight font-semibold tracking-tight text-ink tabular-nums">{s.value}</div>
          </div>
        ))}
      </div>

      {/* One search: a bay number, a customer, a plate or an order */}
      <div className="flex items-center gap-2 max-w-[420px] bg-tile rounded-full px-4 py-2.5">
        <Search className="h-4 w-4 text-dim flex-shrink-0" />
        <input
          type="text"
          placeholder={`Bay number (1 to ${TOTAL_BAYS}), name, plate or order`}
          value={query}
          onChange={(e) => setQuery(e.target.value.slice(0, 40))}
          className="w-full bg-transparent text-sm text-ink placeholder-dim outline-none"
        />
        {query && (
          <button onClick={() => setQuery('')} className="text-dim hover:text-ink" aria-label="Clear search">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* A bay number gets a clear answer */}
      {isBayNumber && (
        <div className={`${card} p-4 md:p-5 text-sm`}>
          {!bayValid ? (
            <span className="text-body">Bay numbers go from 1 to {TOTAL_BAYS.toLocaleString()}.</span>
          ) : found && (found.waiting.length > 0 || found.ready.length > 0) ? (
            <span className="text-body">
              Bay <strong className="text-ink tabular-nums">{bayNumber}</strong>:{' '}
              {found.waiting.length > 0 && 'a car is waiting for the team here'}
              {found.waiting.length > 0 && found.ready.length > 0 && ', and '}
              {found.ready.length > 0 && 'a washed car was left here'}.
            </span>
          ) : (
            <span className="text-body">
              Bay <strong className="text-ink tabular-nums">{bayNumber}</strong> is free.
            </span>
          )}
        </div>
      )}

      {total === 0 && !q ? (
        <div className={`${card} p-10 text-center text-sm text-dim`}>No cars in the tower right now.</div>
      ) : (
        <>
          <Section
            title="Waiting at their bay"
            hint="Go and pick these up, longest waiting first"
            count={toPickUp.length}
            empty={q ? 'Nothing here for this search.' : 'No car is waiting for the team.'}
          >
            {toPickUp.map((c) => (
              <Place key={c.order.id} c={c} now={now} tone="amber" name={nameOf(c.order)} onOpen={() => onOpen(c.order.id)} />
            ))}
          </Section>

          {!isBayNumber && (
            <Section title="With the team" hint="Their bay is empty for now" count={withTeam.length} empty={q ? 'Nothing here for this search.' : 'No car is being washed.'}>
              {withTeam.map((c) => (
                <Place key={c.order.id} c={c} now={now} tone="violet" name={nameOf(c.order)} onOpen={() => onOpen(c.order.id)} />
              ))}
            </Section>
          )}

          <Section
            title="Ready for the owner"
            hint="Washed and left at the return bay, today's cars"
            count={ready.length}
            empty={q ? 'Nothing here for this search.' : 'No washed car is waiting for its owner.'}
          >
            {ready.map((c) => (
              <Place key={c.order.id} c={c} now={now} tone="blue" name={nameOf(c.order)} onOpen={() => onOpen(c.order.id)} />
            ))}
          </Section>
        </>
      )}

      {board.postponed > 0 && !q && (
        <p className="text-sm text-dim">
          {board.postponed} postponed {board.postponed === 1 ? 'order is' : 'orders are'} not in the tower. They come back when the customer re-orders.
        </p>
      )}
    </div>
  );
}
