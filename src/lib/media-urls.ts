/**
 * Photos and videos are private files. The server hands out signed links that stop working after a while,
 * and a fresh link has a different token each time it is made. If a screen swapped to the new link on every
 * refresh, a playing video would restart and photos would flash. This keeps the link a screen already has
 * for as long as it is still good, and only takes the new one when the old one is about to run out.
 *
 * Only types are imported, so this file can be tested on its own.
 */
import type { MockDatabase } from '@/data/mock/seed';

/** A link with less than this much life left is replaced by the new one. */
export const REPLACE_WHEN_LEFT_MS = 15 * 60 * 1000;

interface Link {
  /** The link without its token: the same file always has the same key */
  key: string;
  /** When it stops working (ms), or null when that cannot be read */
  expires: number | null;
}

export function readLink(url: string | undefined | null): Link | null {
  if (!url || !/^https?:\/\//i.test(url)) return null;
  try {
    const u = new URL(url);
    const token = u.searchParams.get('token');
    let expires: number | null = null;
    if (token) {
      const part = token.split('.')[1];
      if (part) {
        const b64 = part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '=');
        const json = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('utf8');
        const exp = Number(JSON.parse(json).exp);
        if (Number.isFinite(exp)) expires = exp * 1000;
      }
    }
    return { key: `${u.origin}${u.pathname}`, expires };
  } catch {
    return null;
  }
}

type Setter = (current: string) => string;

/** Every place in the data that holds a file link. */
function eachLink(db: MockDatabase, visit: (get: string, set: Setter) => void): void {
  for (const p of db.photos || []) {
    visit(p.blobKey, (next) => (p.blobKey = next));
  }
  for (const i of db.inspections || []) {
    for (const m of i.media || []) visit(m.url, (next) => (m.url = next));
    for (const d of i.damages || []) {
      if (d.photoUrl) visit(d.photoUrl, (next) => (d.photoUrl = next));
    }
  }
}

/**
 * Makes `next` reuse the links `previous` already had, when those are still good for a while.
 * Changes `next` in place.
 */
export function keepFreshLinks(next: MockDatabase, previous: MockDatabase | null, now: number = Date.now()): void {
  if (!previous) return;
  const old = new Map<string, string>();
  eachLink(previous, (url) => {
    const link = readLink(url);
    if (link && (link.expires === null || link.expires - now > REPLACE_WHEN_LEFT_MS)) old.set(link.key, url);
  });
  if (old.size === 0) return;
  eachLink(next, (url, set) => {
    const link = readLink(url);
    const kept = link ? old.get(link.key) : undefined;
    if (kept && kept !== url) set(kept);
  });
}
