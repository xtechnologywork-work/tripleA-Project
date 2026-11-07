/**
 * Counting for the employee QR code. No imports, so it can be tested on its own.
 * Days are Doha days (UTC+3), the same as the Insights page.
 */
export type QrKind = 'scan' | 'signup' | 'login';
export type QrDevice = 'mobile' | 'desktop' | 'other';

const OFFSET = 3 * 60 * 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;

const dayStart = (ms: number) => Math.floor((ms + OFFSET) / DAY) * DAY - OFFSET;
const dayKey = (ms: number) => new Date(ms + OFFSET).toISOString().slice(0, 10);

export function deviceOf(userAgent: string): QrDevice {
  if (/Mobi|Android|iPhone|iPad|iPod/i.test(userAgent)) return 'mobile';
  if (/Windows|Macintosh|Linux|X11|CrOS/i.test(userAgent)) return 'desktop';
  return 'other';
}

/** Link previews and crawlers open the link too. They are not people. */
export function isBot(userAgent: string): boolean {
  return !userAgent || /bot|crawl|spider|preview|facebookexternalhit|whatsapp|telegram|slack|curl|wget|headless|monitor|uptime/i.test(userAgent);
}

export interface QrRow {
  kind: QrKind;
  device: QrDevice;
  at: number;
}

export interface QrStats {
  total: number;
  last24h: number;
  last7d: number;
  last30d: number;
  signups: number;
  logins: number;
  lastScanAt: number | null;
  devices: Record<QrDevice, number>;
  /** The last 30 Doha days, oldest first */
  byDay: { day: string; scans: number }[];
}

export function summarize(rows: QrRow[], now: number): QrStats {
  const scans = rows.filter((r) => r.kind === 'scan');
  const today = dayStart(now);
  const days: { day: string; start: number; scans: number }[] = [];
  for (let i = 29; i >= 0; i -= 1) {
    const start = today - i * DAY;
    days.push({ day: dayKey(start), start, scans: 0 });
  }
  const devices: Record<QrDevice, number> = { mobile: 0, desktop: 0, other: 0 };
  let last: number | null = null;
  for (const s of scans) {
    devices[s.device] += 1;
    if (last === null || s.at > last) last = s.at;
    const bucket = days.find((d) => s.at >= d.start && s.at < d.start + DAY);
    if (bucket) bucket.scans += 1;
  }
  const within = (ms: number) => scans.filter((s) => now - s.at <= ms && s.at <= now).length;
  return {
    total: scans.length,
    last24h: within(DAY),
    last7d: within(7 * DAY),
    last30d: within(30 * DAY),
    signups: rows.filter((r) => r.kind === 'signup').length,
    logins: rows.filter((r) => r.kind === 'login').length,
    lastScanAt: last,
    devices,
    byDay: days.map((d) => ({ day: d.day, scans: d.scans })),
  };
}
