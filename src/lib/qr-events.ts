/**
 * The QR code that employees scan to open the customer page. Every scan, and every sign up or sign in that
 * started from a scan, is saved so the dashboard can show how the code is doing. Server only.
 *
 * The events are saved in the audit log table (no new table to create) with action qr.scan, qr.signup or qr.login.
 */
import { getServerSupabase, isServerSupabaseConfigured } from '@/lib/supabase-server';
import { deviceOf, isBot, summarize, type QrDevice, type QrKind, type QrRow, type QrStats } from '@/domain/qr-stats';

export type { QrKind, QrDevice, QrStats } from '@/domain/qr-stats';

const ACTION: Record<QrKind, string> = { scan: 'qr.scan', signup: 'qr.signup', login: 'qr.login' };
// Used when no database is connected (local demo)
// Kept on globalThis so every route sees the same list, also after a reload in development
const shared = globalThis as unknown as { __qrMemory?: QrRow[] };
const memory: QrRow[] = (shared.__qrMemory ||= []);

export async function recordQrEvent(kind: QrKind, device: QrDevice): Promise<void> {
  const at = Date.now();
  const sb = getServerSupabase();
  if (!sb || !isServerSupabaseConfigured()) {
    memory.push({ kind, device, at });
    if (memory.length > 5000) memory.shift();
    return;
  }
  try {
    await sb.from('audit_logs').insert({
      id: `qr-${at.toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      actor: { type: 'SYSTEM', id: 'qr' },
      action: ACTION[kind],
      entity_type: 'QR',
      entity_id: 'employee-portal',
      details: { device },
      created_at: new Date(at).toISOString(),
    });
  } catch {
    // A problem saving a count must never stop someone from reaching the page
  }
}

export async function getQrStats(): Promise<QrStats> {
  const now = Date.now();
  const sb = getServerSupabase();
  if (!sb || !isServerSupabaseConfigured()) return summarize(memory, now);

  const { data } = await sb
    .from('audit_logs')
    .select('action,details,created_at')
    .in('action', Object.values(ACTION))
    .order('created_at', { ascending: false })
    .limit(20000);

  const kindOf = (action: string): QrKind | null =>
    action === ACTION.scan ? 'scan' : action === ACTION.signup ? 'signup' : action === ACTION.login ? 'login' : null;
  const rows: QrRow[] = [];
  for (const r of (data || []) as { action: string; details: { device?: string } | null; created_at: string }[]) {
    const kind = kindOf(r.action);
    const at = new Date(r.created_at).getTime();
    if (!kind || !Number.isFinite(at)) continue;
    const d = r.details?.device;
    rows.push({ kind, at, device: d === 'mobile' || d === 'desktop' ? d : 'other' });
  }
  return summarize(rows, now);
}

export { deviceOf, isBot };
