import { NextResponse } from 'next/server';
import { isServerSupabaseConfigured, getServerSupabase, verifyAdmin } from '@/lib/supabase-server';
import { setVip } from '@/lib/vip-settings';
import { applyChanges } from '@/lib/supabase-sync';
import { getLocalDb, mergeLocal } from '@/lib/local-db';
import { rateLimit, clientIp } from '@/lib/rate-limit';
import type { AuditLog } from '@/domain/types';

/** The team marks a client as VIP, or removes it. Admins only. */
export async function POST(req: Request) {
  let by = 'local';
  if (isServerSupabaseConfigured()) {
    const admin = await verifyAdmin(req);
    if (!admin) return NextResponse.json({ error: 'Sign in first' }, { status: 401 });
    by = admin.email || admin.id;
  }
  if (!rateLimit(`vip-admin:${clientIp(req)}`, 60, 60_000)) {
    return NextResponse.json({ error: 'Too many changes. Wait a moment.' }, { status: 429 });
  }

  let body: { employeeId?: unknown; vip?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Bad request' }, { status: 400 });
  }
  const employeeId = typeof body.employeeId === 'string' ? body.employeeId : '';
  if (!employeeId || typeof body.vip !== 'boolean') return NextResponse.json({ error: 'Bad request' }, { status: 400 });

  // The client must exist
  let name = '';
  if (isServerSupabaseConfigured() && getServerSupabase()) {
    const { data } = await getServerSupabase()!.from('employees').select('id,full_name').eq('id', employeeId).limit(1);
    if (!data || !data[0]) return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    name = String((data[0] as { full_name?: string }).full_name || '');
  } else {
    const found = ((getLocalDb()?.employees as Array<{ id: string; fullName?: string }>) || []).find((e) => e.id === employeeId);
    if (!found) return NextResponse.json({ error: 'Client not found' }, { status: 404 });
    name = found.fullName || '';
  }

  const ids = await setVip(employeeId, body.vip);
  if (!ids) return NextResponse.json({ error: 'Could not save. Try again.' }, { status: 503 });

  // Who changed it, and when, in the audit log (the change itself is already saved)
  const log: AuditLog = {
    id: `aud-vip-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    actor: { type: 'STAFF', id: by, email: by, role: 'ADMIN' },
    action: body.vip ? 'client.vip.add' : 'client.vip.remove',
    entityType: 'EMPLOYEE',
    entityId: employeeId,
    details: { name },
    createdAt: new Date().toISOString(),
  };
  try {
    if (isServerSupabaseConfigured()) await applyChanges({ auditLogs: [log] }, { admin: true });
    else mergeLocal({ auditLogs: [log] });
  } catch (err) {
    console.error('Writing the VIP audit entry failed:', err);
  }

  return NextResponse.json({ ok: true, employeeId, vip: ids.has(employeeId) }, { headers: { 'Cache-Control': 'no-store' } });
}
