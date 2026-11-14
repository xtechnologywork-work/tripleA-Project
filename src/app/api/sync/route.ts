import { NextResponse } from 'next/server';
import { fetchSupabaseState, applyChanges, scopeState, SyncChanges, Identity } from '@/lib/supabase-sync';
import { isServerSupabaseConfigured, verifyAdmin } from '@/lib/supabase-server';
import { verifyEmployeeToken } from '@/lib/employee-session';
import { getLocalDb, getLocalVersion, mergeLocal } from '@/lib/local-db';
import { paymentsEnabled } from '@/lib/payments';
import { withTitle } from '@/domain/names';
import { currentOrdering } from '@/lib/ordering-settings';
import { loadVipIds } from '@/lib/vip-settings';

const MAX_BODY_BYTES = 8 * 1024 * 1024; // a compressed photo plus the rows around it

/** Who is calling: a signed-in admin, a signed-in employee, or nobody. */
async function identityOf(req: Request): Promise<Identity> {
  const admin = await verifyAdmin(req);
  if (admin) return { admin: true };
  const employeeId = verifyEmployeeToken(req.headers.get('x-employee-token'));
  return { admin: false, employeeId: employeeId || undefined };
}

// Every open screen polls. They share one read per second instead of each querying 13 tables.
const CACHE_MS = 1000;
let stateCache: { at: number; promise: ReturnType<typeof fetchSupabaseState> } | null = null;

function readState(fresh: boolean) {
  if (!fresh && stateCache && Date.now() - stateCache.at < CACHE_MS) return stateCache.promise;
  const promise = fetchSupabaseState();
  stateCache = { at: Date.now(), promise };
  return promise;
}

// An employee's screen reads only that employee's rows. A short answer per person is shared between their open screens.
const scopedCache = new Map<string, { at: number; promise: ReturnType<typeof fetchSupabaseState> }>();

function readScoped(employeeId: string | undefined, fresh: boolean) {
  const key = employeeId || '-';
  const hit = scopedCache.get(key);
  if (!fresh && hit && Date.now() - hit.at < CACHE_MS) return hit.promise;
  const promise = fetchSupabaseState({ employeeId });
  scopedCache.set(key, { at: Date.now(), promise });
  if (scopedCache.size > 500) {
    for (const [k, v] of scopedCache) if (Date.now() - v.at > 10_000) scopedCache.delete(k);
  }
  return promise;
}

export async function GET(req: Request) {
  const fresh = new URL(req.url).searchParams.get('fresh') === '1';

  if (isServerSupabaseConfigured()) {
    try {
      // Who is asking decides what is read: the dashboard reads everything, an employee only their own rows
      const identity = await identityOf(req);
      const remote = identity.admin ? await readState(fresh) : await readScoped(identity.employeeId, fresh);
      if (remote && remote.db) {
        // Each caller only receives what they are allowed to see (checked again here, whatever was read)
        return NextResponse.json(
          {
            db: scopeState(remote.db, identity),
            version: remote.version,
            source: 'supabase',
            features: { inspection: remote.inspectionEnabled, payments: paymentsEnabled() },
            ordering: await currentOrdering(),
            role: identity.admin ? 'admin' : identity.employeeId ? 'employee' : 'public',
            timestamp: Date.now(),
          },
          { headers: { 'Cache-Control': 'no-store' } }
        );
      }
    } catch {
      // fall through to the error below
    }
    // Never fall back to an old local copy here: it would hand out everyone's data without any check
    return NextResponse.json({ db: null, error: 'Database is not reachable' }, { status: 503 });
  }

  // Local demo mode (no Supabase configured): no accounts exist, so everything is returned
  // Names show the same here as with Supabase: a member of the Al Thani family has Sheikh in front
  const local = getLocalDb();
  const vipIds = await loadVipIds();
  const shown = local && Array.isArray(local.employees) ? { ...local, employees: local.employees.map((e) => ({ ...e, fullName: withTitle(e.fullName), vip: vipIds.has(e.id) })) } : local;
  return NextResponse.json(
    { db: shown, version: getLocalVersion(), source: 'local', features: { inspection: true, payments: paymentsEnabled() }, ordering: await currentOrdering(), timestamp: Date.now() },
    { headers: { 'Cache-Control': 'no-store' } }
  );
}

export async function POST(req: Request) {
  try {
    const length = Number(req.headers.get('content-length') || 0);
    if (length > MAX_BODY_BYTES) {
      return NextResponse.json({ success: false, error: 'Request is too large' }, { status: 413 });
    }

    const body = await req.json();

    // The old "send the whole database" format is refused: it could erase other people's work
    if (!body || !body.changes || typeof body.changes !== 'object') {
      return NextResponse.json({ success: false, error: 'Send { changes } with the rows that changed' }, { status: 400 });
    }
    const changes = body.changes as SyncChanges;

    if (!isServerSupabaseConfigured()) {
      mergeLocal(changes as Record<string, unknown>);
      return NextResponse.json({ success: true, version: getLocalVersion(), syncedToSupabase: false, rejected: [] });
    }

    const identity = await identityOf(req);
    if (!identity.admin && !identity.employeeId) {
      return NextResponse.json({ success: false, error: 'Sign in first' }, { status: 401 });
    }

    const result = await applyChanges(changes, identity);
    stateCache = null; // the next read must see this change

    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: 502 });
    }

    return NextResponse.json({
      success: true,
      syncedToSupabase: true,
      admin: identity.admin,
      rejected: result.rejected,
      referenceFixes: result.referenceFixes,
      photoUrls: result.photoUrls,
    });
  } catch (err: unknown) {
    console.error('sync POST failed:', err);
    // The details stay in the server log; the caller gets a short message
    return NextResponse.json({ success: false, error: 'Could not save' }, { status: 500 });
  }
}
