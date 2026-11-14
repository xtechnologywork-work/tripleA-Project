/**
 * Ordering hours: when employees may place orders. Pure: no clock of its own, no storage.
 *
 * Orders are accepted only when BOTH are true:
 *  - the switch is on (the team pressed "Open orders"), and
 *  - the time in Doha is inside the daily window (from opensAt, up to but not including closesAt).
 *    A closing time earlier than the opening time means the window runs past midnight (a night shift,
 *    for example 7:00 PM to 12:15 AM).
 *
 * Nothing is set at first: the switch is off, so every employee account is closed until the team opens it.
 */

export interface OrderingSettings {
  /** The switch: orders are open for everyone (while inside the hours) */
  open: boolean;
  /** "HH:MM", 24 hours, Doha time */
  opensAt: string;
  /** "HH:MM", 24 hours, Doha time */
  closesAt: string;
}

/** Default: closed for everyone, with the usual working hours ready. */
export const DEFAULT_ORDERING: OrderingSettings = { open: false, opensAt: '07:00', closesAt: '15:15' };

export type OrderingReason = 'OPEN' | 'PAUSED' | 'BEFORE_OPENING' | 'AFTER_CLOSING';

export interface OrderingView extends OrderingSettings {
  /** Can an employee place an order right now? */
  accepting: boolean;
  reason: OrderingReason;
  /** The time in Doha now, "HH:MM" */
  dohaNow: string;
}

const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;
const DOHA_OFFSET_MS = 3 * 60 * 60 * 1000;

export const minutesOf = (hhmm: string): number => {
  const m = HHMM.exec(hhmm);
  return m ? Number(m[1]) * 60 + Number(m[2]) : NaN;
};

/** Minutes since midnight in Doha (Qatar has no daylight saving: always UTC+3). */
export function dohaMinutes(nowMs: number): number {
  const d = new Date(nowMs + DOHA_OFFSET_MS);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
}

const pad = (n: number) => String(n).padStart(2, '0');
export const dohaClock = (nowMs: number): string => {
  const m = dohaMinutes(nowMs);
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
};

/**
 * Checks what the team typed. Returns the clean settings, or the problem.
 * Missing fields keep their current value; the two times must be different (a closing time earlier than the
 * opening time is fine: the window then runs past midnight).
 */
export function cleanOrdering(
  input: unknown,
  current: OrderingSettings = DEFAULT_ORDERING
): { ok: true; settings: OrderingSettings } | { ok: false; error: string } {
  const i = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const open = i.open === undefined ? current.open : i.open;
  const opensAt = i.opensAt === undefined ? current.opensAt : i.opensAt;
  const closesAt = i.closesAt === undefined ? current.closesAt : i.closesAt;
  if (typeof open !== 'boolean') return { ok: false, error: 'The switch must be on or off' };
  if (typeof opensAt !== 'string' || !HHMM.test(opensAt)) return { ok: false, error: 'The opening time is not valid' };
  if (typeof closesAt !== 'string' || !HHMM.test(closesAt)) return { ok: false, error: 'The closing time is not valid' };
  if (minutesOf(opensAt) === minutesOf(closesAt)) return { ok: false, error: 'The opening and closing times cannot be the same' };
  return { ok: true, settings: { open, opensAt, closesAt } };
}

/** What is stored may be missing or damaged: anything that is not valid falls back to the closed default. */
export function readOrdering(stored: unknown): OrderingSettings {
  const r = cleanOrdering(stored, DEFAULT_ORDERING);
  return r.ok ? r.settings : { ...DEFAULT_ORDERING };
}

/** Is ordering open right now, and if not, why not. */
export function orderingStatus(settings: OrderingSettings, nowMs: number): OrderingView {
  const now = dohaMinutes(nowMs);
  const from = minutesOf(settings.opensAt);
  const to = minutesOf(settings.closesAt);
  // Same day: from <= now < to. Past midnight (closing earlier than opening): open from the opening time to midnight, and from midnight to the closing time.
  const inside = from < to ? now >= from && now < to : now >= from || now < to;
  let reason: OrderingReason;
  if (!settings.open) reason = 'PAUSED';
  else if (inside) reason = 'OPEN';
  // Closed: before the opening time (the same day), or past the closing time
  else if (from < to && now >= to) reason = 'AFTER_CLOSING';
  else reason = 'BEFORE_OPENING';
  return { ...settings, accepting: reason === 'OPEN', reason, dohaNow: dohaClock(nowMs) };
}

/** "07:00" -> "7:00 AM" (or "7:00 ص" in Arabic), for people to read. */
export function clockLabel(hhmm: string, lang: 'en' | 'ar'): string {
  const m = HHMM.exec(hhmm);
  if (!m) return hhmm;
  const h = Number(m[1]);
  const h12 = h % 12 === 0 ? 12 : h % 12;
  const suffix = lang === 'ar' ? (h < 12 ? 'ص' : 'م') : h < 12 ? 'AM' : 'PM';
  return `${h12}:${m[2]} ${suffix}`;
}
