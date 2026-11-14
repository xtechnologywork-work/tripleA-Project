/**
 * The order of the dispatch queue. Pure.
 *
 *  1. VIP orders that are still active (not done, not cancelled, not postponed): always at the very top
 *  2. everything else, newest placement first
 *  3. postponed orders: at the bottom, out of the team's way
 *
 * When a VIP order is done (ready, or cancelled) it joins the normal order again.
 */
import type { Order } from './types';

const DONE = new Set(['RETURNED_TO_PARKING', 'CANCELLED']);

/** A VIP's order the team still has to deal with. */
export const isActiveVipOrder = (o: Pick<Order, 'status' | 'employeeId'>, vipIds: Set<string>): boolean =>
  vipIds.has(o.employeeId) && !DONE.has(o.status) && o.status !== 'DELAYED';

/** 0 = VIP at the top, 1 = normal, 2 = postponed. */
export function queueRank(o: Pick<Order, 'status' | 'employeeId'>, vipIds: Set<string>): number {
  if (o.status === 'DELAYED') return 2;
  return isActiveVipOrder(o, vipIds) ? 0 : 1;
}

/** Sorts in place and returns the same list. `queuedAt` is when the order took its place (a re-order counts from its return). */
export function sortQueue<T extends Pick<Order, 'status' | 'employeeId'>>(list: T[], vipIds: Set<string>, queuedAt: (o: T) => number): T[] {
  return list.sort((a, b) => queueRank(a, vipIds) - queueRank(b, vipIds) || queuedAt(b) - queuedAt(a));
}
