/**
 * Order numbers (CB-261115-0007) are unique. Two phones ordering in the same moment can both pick the next free
 * number; the database accepts the first and refuses the second. These helpers let the server give the second
 * order a new number and try again, so no order is ever lost to a clash. Pure, so they can be tested.
 */

interface DbError {
  code?: string;
  message?: string;
  details?: string;
}

/** Is this the database refusing a duplicate order number (and nothing else)? */
export function isReferenceClash(error: DbError | null | undefined): boolean {
  if (!error) return false;
  if (error.code !== '23505') return false;
  return /reference/i.test(`${error.message || ''} ${error.details || ''}`);
}

/** "CB-261115-0007" moved forward by `by`: "CB-261115-0010". Anything that is not an order number is returned as it is. */
export function bumpReference(reference: string, by: number): string {
  const m = /^(CB-\d{6}-)(\d{4,})$/.exec(reference);
  if (!m) return reference;
  const next = parseInt(m[2], 10) + Math.max(0, Math.floor(by));
  return `${m[1]}${String(next).padStart(Math.max(4, m[2].length), '0')}`;
}

/**
 * How far to jump on each retry. The range of chance grows with every attempt (4, 8, 16, ... up to 512 numbers), so even
 * a hundred orders clashing in the same moment spread out within a few rounds. `index` keeps orders of one batch apart.
 */
export function retryJump(attempt: number, index: number, random: () => number = Math.random): number {
  const range = 4 * 2 ** Math.min(Math.max(attempt, 0), 7);
  return attempt + index + Math.floor(random() * range);
}

type Row = Record<string, unknown>;

/**
 * Saves new orders, and when the database refuses one because another phone just took its number, gives that
 * order a fresh number and saves again. Gives up (and throws) only for any other error, or after `maxAttempts` clashes.
 */
export async function saveOrdersWithRetry(opts: {
  upsert: (rows: Row[]) => Promise<{ error: DbError | null }>;
  freshReference: (createdAt: string) => Promise<string>;
  rows: Row[];
  isNew: (id: string) => boolean;
  /** Called for each order that was given a new number */
  onFixed: (id: string, reference: string) => void;
  maxAttempts?: number;
  random?: () => number;
}): Promise<{ attempts: number }> {
  const max = opts.maxAttempts ?? 12;
  let attempt = 0;
  for (;;) {
    const { error } = await opts.upsert(opts.rows);
    if (!error) return { attempts: attempt };
    if (!isReferenceClash(error) || attempt >= max) throw new Error(`orders: ${error.message}`);
    attempt += 1;
    let index = 0;
    for (const row of opts.rows) {
      if (!opts.isNew(String(row.id))) continue; // only a new order can clash on its number
      const fresh = bumpReference(await opts.freshReference(String(row.created_at)), retryJump(attempt, index++, opts.random));
      row.reference = fresh;
      opts.onFixed(String(row.id), fresh);
    }
  }
}
