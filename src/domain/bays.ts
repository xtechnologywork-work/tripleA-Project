/**
 * Tower Bays: where the cars are right now. Pure: no screen, no clock of its own.
 *
 * A car is in one of three places:
 *  - waiting at its own bay for the team (new or assigned)
 *  - with the team (being washed or checked): its bay is empty for now
 *  - ready: washed and left at the return bay (floor B3 by default), waiting for its owner
 *
 * Postponed orders are not in the tower at all. Orders waiting for an online payment are not real orders yet,
 * so the caller leaves them out.
 */
import type { Order } from './types';

export interface BayCard {
  order: Order;
  /** The bay number to show: the pick-up bay, or the return bay for a ready car */
  bay: string;
  /** Only for a ready car: the floor where it was left */
  floor?: string;
  /** When it started waiting in this place (ms) */
  since: number;
  /** Another car is on the same bay number */
  conflict: boolean;
}

export interface TowerBoard {
  /** At their own bay, waiting for the team. The longest waiting first. */
  toPickUp: BayCard[];
  /** With the team. The longest first. */
  withTeam: BayCard[];
  /** Washed and left at the return bay, newest first */
  ready: BayCard[];
  /** Postponed by the customer: not in the tower */
  postponed: number;
}

/** A ready car stays on the board for a day: owners collect it the same day. */
export const READY_WINDOW_MS = 24 * 60 * 60 * 1000;

const time = (iso: string | undefined): number => {
  const t = iso ? new Date(iso).getTime() : NaN;
  return Number.isFinite(t) ? t : 0;
};

/** Marks every card whose place is shared with another card of the same list. */
function markConflicts(cards: BayCard[], keyOf: (c: BayCard) => string): BayCard[] {
  const count = new Map<string, number>();
  for (const c of cards) count.set(keyOf(c), (count.get(keyOf(c)) || 0) + 1);
  return cards.map((c) => ({ ...c, conflict: (count.get(keyOf(c)) || 0) > 1 }));
}

export function buildTowerBoard(orders: Order[], reorderedAt: Map<string, number>, now: number): TowerBoard {
  const toPickUp: BayCard[] = [];
  const withTeam: BayCard[] = [];
  const ready: BayCard[] = [];
  let postponed = 0;

  for (const o of orders) {
    switch (o.status) {
      case 'NEW':
      case 'ASSIGNED':
        // A re-ordered order waits from the moment it came back
        toPickUp.push({ order: o, bay: o.bayCodeSnapshot, since: reorderedAt.get(o.id) ?? time(o.createdAt), conflict: false });
        break;
      case 'IN_PROGRESS':
      case 'QUALITY_CHECK':
      case 'COMPLETED':
      case 'ISSUE_REPORTED':
        withTeam.push({ order: o, bay: o.bayCodeSnapshot, since: time(o.updatedAt), conflict: false });
        break;
      case 'RETURNED_TO_PARKING': {
        const r = o.returnConfirmation;
        const since = time(r?.confirmedAt) || time(o.updatedAt);
        if (now - since > READY_WINDOW_MS) break;
        ready.push({ order: o, bay: r?.bayCode || o.bayCodeSnapshot, floor: r?.floor || (r?.bayCode ? 'B3' : undefined), since, conflict: false });
        break;
      }
      case 'DELAYED':
        postponed += 1;
        break;
      default:
        break; // cancelled
    }
  }

  return {
    toPickUp: markConflicts(toPickUp.sort((a, b) => a.since - b.since), (c) => c.bay),
    withTeam: withTeam.sort((a, b) => a.since - b.since),
    ready: markConflicts(ready.sort((a, b) => b.since - a.since), (c) => `${c.floor || ''}|${c.bay}`),
    postponed,
  };
}

/** What is at one bay number right now (a car waiting there, and/or a ready car left there). */
export function findBay(board: TowerBoard, bay: number): { waiting: BayCard[]; ready: BayCard[] } {
  const same = (c: BayCard) => Number(c.bay) === bay;
  return { waiting: board.toPickUp.filter(same), ready: board.ready.filter(same) };
}
