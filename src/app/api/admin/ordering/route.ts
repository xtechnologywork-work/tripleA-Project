import { NextResponse } from 'next/server';
import { isServerSupabaseConfigured, verifyAdmin } from '@/lib/supabase-server';
import { currentOrdering, loadOrdering, saveOrdering } from '@/lib/ordering-settings';
import { cleanOrdering } from '@/domain/ordering';
import { applyChanges } from '@/lib/supabase-sync';
import { mergeLocal } from '@/lib/local-db';
import { rateLimit, clientIp } from '@/lib/rate-limit';
import type { AuditLog } from '@/domain/types';

const noStore = { headers: { 'Cache-Control': 'no-store' } };

/** The team changes the switch or the hours. Admins only. */
export async function POST(req: Request) {
  let by = 'local';
  if (isServerSupabaseConfigured()) {
    const admin = await verifyAdmin(req);
    if (!admin) return NextResponse.json({ error: 'Sign in first' }, { status: 401 });
    by = admin.email || admin.id;
  }
  if (!rateLimit(`ordering-admin:${clientIp(req)}`, 30, 60_000)) {
    return NextResponse.json({ error: 'Too many changes. Wait a moment.' }, { status: 429 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }

  const before = await loadOrdering();
  const checked = cleanOrdering(body, before);
  if (!checked.ok) return NextResponse.json({ error: checked.error }, { status: 400 });
  if (!(await saveOrdering(checked.settings))) {
    return NextResponse.json({ error: 'Could not save. Try again.' }, { status: 503 });
  }

  // Who changed it, and when, in the audit log (the change itself is already saved)
  const log: AuditLog = {
    id: `aud-ord-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    actor: { type: 'STAFF', id: by, email: by, role: 'ADMIN' },
    action: 'settings.ordering',
    entityType: 'SETTINGS',
    entityId: 'ordering',
    details: { before, after: checked.settings },
    createdAt: new Date().toISOString(),
  };
  try {
    if (isServerSupabaseConfigured()) await applyChanges({ auditLogs: [log] }, { admin: true });
    else mergeLocal({ auditLogs: [log] });
  } catch (err) {
    console.error('Writing the ordering audit entry failed:', err);
  }

  return NextResponse.json(await currentOrdering(), noStore);
}
