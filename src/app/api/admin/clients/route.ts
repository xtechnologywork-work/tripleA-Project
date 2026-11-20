import { NextResponse } from 'next/server';
import { isServerSupabaseConfigured, verifyAdmin } from '@/lib/supabase-server';
import { cleanManualClient } from '@/domain/clients';
import { qatarMobile } from '@/domain/otp';
import { withTitle } from '@/domain/names';
import { findByPhone } from '@/lib/otp-auth';
import { createEmployee, qidTaken, applyChanges } from '@/lib/supabase-sync';
import { getLocalDb, mergeLocal } from '@/lib/local-db';
import { rateLimit } from '@/lib/rate-limit';
import type { AuditLog, Employee } from '@/domain/types';

const fail = (error: string, status = 400) => NextResponse.json({ error }, { status });

/** Two clicks on "Add" in the same moment must not make two accounts: one add per mobile number at a time. */
const adding = new Set<string>();

/**
 * The team adds a client by hand: someone without a Ministry employee number (marketing, security, ...).
 * Saved with their QID and no employee number. They then sign in with their mobile number, without signing up.
 * Admins only.
 */
export async function POST(req: Request) {
  let by = 'local';
  if (isServerSupabaseConfigured()) {
    const admin = await verifyAdmin(req);
    if (!admin) return fail('Sign in first', 401);
    by = admin.email || admin.id;
  }
  if (!rateLimit(`clients-add:${by}`, 30, 60_000)) return fail('Too many in a row. Wait a moment.', 429);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return fail('Bad request');
  }
  const checked = cleanManualClient(body, qatarMobile);
  if (!checked.ok) return fail(checked.error);
  const c = checked.client;

  if (adding.has(c.phone)) return fail('This client is already being added.', 409);
  adding.add(c.phone);
  try {
    // One mobile number, one account: sign in finds people by it
    const byPhone = await findByPhone(c.phone);
    if (byPhone) return fail(`This mobile number is already registered to ${byPhone.fullName}.`, 409);
    // One QID, one account
    const qidUsed = isServerSupabaseConfigured()
      ? await qidTaken(c.qid)
      : ((getLocalDb()?.employees as Employee[]) || []).some((e) => e.qid === c.qid);
    if (qidUsed) return fail('This QID is already registered to another client.', 409);

    const employee: Employee = {
      id: `emp-moci-${c.phone}`,
      fullName: withTitle(c.fullName),
      email: `client.${c.phone}@triplea.qa`,
      phone: `+974 ${c.phone.slice(0, 4)} ${c.phone.slice(4)}`,
      qid: c.qid,
      company: c.company,
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
    };

    if (isServerSupabaseConfigured()) {
      const saved = await createEmployee(employee);
      if (!saved.ok) {
        console.error('Adding a client failed:', saved.error);
        return saved.taken
          ? fail('This mobile number or QID was just registered by someone else.', 409)
          : fail('Could not save the client. Try again.', 503);
      }
    } else {
      mergeLocal({ employees: [employee] });
    }

    const log: AuditLog = {
      id: `aud-cli-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      actor: { type: 'STAFF', id: by, email: by, role: 'ADMIN' },
      action: 'client.add',
      entityType: 'EMPLOYEE',
      entityId: employee.id,
      details: { name: employee.fullName, phone: employee.phone, qid: employee.qid, company: employee.company },
      createdAt: new Date().toISOString(),
    };
    try {
      if (isServerSupabaseConfigured()) await applyChanges({ auditLogs: [log] }, { admin: true });
      else mergeLocal({ auditLogs: [log] });
    } catch (err) {
      console.error('Writing the client audit entry failed:', err);
    }

    return NextResponse.json({ employee }, { headers: { 'Cache-Control': 'no-store' } });
  } finally {
    adding.delete(c.phone);
  }
}
