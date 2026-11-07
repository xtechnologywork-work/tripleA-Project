import { NextResponse } from 'next/server';
import { fetchSupabaseState, applyChanges, scopeState, SyncChanges, Identity } from '@/lib/supabase-sync';
import { isServerSupabaseConfigured, verifyAdmin } from '@/lib/supabase-server';
import { verifyEmployeeToken } from '@/lib/employee-session';
import { getLocalDb, getLocalVersion, mergeLocal } from '@/lib/local-db';
import { paymentsEnabled } from '@/lib/payments';

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

export async function GET(req: Request) {
  const fresh = new URL(req.url).searchParams.get('fresh') === '1';

  if (isServerSupabaseConfigured()) {
    try {
      const remote = await readState(fresh);
      if (remote && remote.db) {
        // Each caller only receives what they are allowed to see
        const identity = await identityOf(req);
        return NextResponse.json(
          {
            db: scopeState(remote.db, identity),
            version: remote.version,
            source: 'supabase',
            features: { inspection: remote.inspectionEnabled, payments: paymentsEnabled() },
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
  return NextResponse.json(
    { db: getLocalDb(), version: getLocalVersion(), source: 'local', features: { inspection: true, payments: paymentsEnabled() }, timestamp: Date.now() },
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
