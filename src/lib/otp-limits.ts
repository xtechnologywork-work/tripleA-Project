/**
 * Limits on messages and checks, kept in the database so they hold on Netlify, where each request can run on a
 * different machine. Falls back to memory when the table does not exist yet (local demo, or before the SQL is run).
 * Server only.
 */
import { getServerSupabase, isServerSupabaseConfigured } from '@/lib/supabase-server';

const TABLE = 'otp_events';
const shared = globalThis as unknown as { __otpMemory?: Map<string, number[]> };
const memory: Map<string, number[]> = (shared.__otpMemory ||= new Map());

function memoryCount(bucket: string, windowMs: number, now: number): number {
  const list = (memory.get(bucket) || []).filter((t) => now - t < windowMs);
  memory.set(bucket, list);
  return list.length;
}

/** How many events this bucket had in the window. */
export async function countEvents(bucket: string, windowMs: number): Promise<number> {
  const now = Date.now();
  const sb = getServerSupabase();
  if (sb && isServerSupabaseConfigured()) {
    const { count, error } = await sb
      .from(TABLE)
      .select('id', { count: 'exact', head: true })
      .eq('bucket', bucket)
      .gte('created_at', new Date(now - windowMs).toISOString());
    if (!error && typeof count === 'number') return count;
  }
  return memoryCount(bucket, windowMs, now);
}

/** Records one event in each bucket. */
export async function recordEvents(buckets: string[]): Promise<void> {
  const now = Date.now();
  const sb = getServerSupabase();
  if (sb && isServerSupabaseConfigured()) {
    const { error } = await sb.from(TABLE).insert(buckets.map((bucket) => ({ bucket })));
    if (!error) {
      // Now and then, forget events older than two days
      if (Math.random() < 0.02) {
        await sb.from(TABLE).delete().lt('created_at', new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString());
      }
      return;
    }
  }
  for (const b of buckets) memory.set(b, [...(memory.get(b) || []), now]);
}

/** True when every bucket is still under its limit. */
export async function underLimits(checks: { bucket: string; max: number; windowMs: number }[]): Promise<boolean> {
  for (const c of checks) {
    if ((await countEvents(c.bucket, c.windowMs)) >= c.max) return false;
  }
  return true;
}
