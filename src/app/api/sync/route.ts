import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { fetchSupabaseState, applyChanges, SyncChanges } from '@/lib/supabase-sync';
import { isServerSupabaseConfigured, verifyAdmin } from '@/lib/supabase-server';

// Local cache used when Supabase is not configured, and as a fallback when it is unreachable
const DB_FILE = path.join(process.cwd(), '.server_db_sync.json');

let inMemoryDb: Record<string, unknown> | null = null;
let lastVersion = 1;

function getDb() {
  if (inMemoryDb) return inMemoryDb;
  try {
    if (fs.existsSync(DB_FILE)) {
      inMemoryDb = JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'));
      return inMemoryDb;
    }
  } catch (err) {
    console.error('Error reading sync db file:', err);
  }
  return null;
}

function persistLocal(db: Record<string, unknown>) {
  inMemoryDb = db;
  lastVersion += 1;
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing sync db file:', err);
  }
}

/** Merge changed rows into the local cache by id. Never replaces the whole database. */
function mergeLocal(changes: SyncChanges) {
  const db = getDb() || {};
  for (const [key, rows] of Object.entries(changes)) {
    if (!Array.isArray(rows)) continue;
    const list = (Array.isArray(db[key]) ? (db[key] as Array<{ id: string }>) : []).slice();
    for (const row of rows as Array<{ id: string }>) {
      const i = list.findIndex((r) => r.id === row.id);
      if (i >= 0) list[i] = row;
      else list.unshift(row);
    }
    db[key] = list;
  }
  persistLocal(db);
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
        inMemoryDb = remote.db as unknown as Record<string, unknown>;
        lastVersion = remote.version;
        return NextResponse.json({
          db: inMemoryDb,
          version: lastVersion,
          source: 'supabase',
          timestamp: Date.now(),
        });
      }
    } catch {
      // Graceful fallback to the local cache
    }
  }

  return NextResponse.json({
    db: getDb(),
    version: lastVersion,
    source: isServerSupabaseConfigured() ? 'local_fallback' : 'local',
    timestamp: Date.now(),
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // The old "send the whole database" format is refused: it could erase other people's work
    if (!body || !body.changes || typeof body.changes !== 'object') {
      return NextResponse.json({ success: false, error: 'Send { changes } with the rows that changed' }, { status: 400 });
    }
    const changes = body.changes as SyncChanges;

    if (!isServerSupabaseConfigured()) {
      mergeLocal(changes);
      return NextResponse.json({ success: true, version: lastVersion, syncedToSupabase: false, rejected: [] });
    }

    const admin = await verifyAdmin(req);
    const result = await applyChanges(changes, !!admin);
    stateCache = null; // the next read must see this change

    if (!result.ok) {
      return NextResponse.json({ success: false, error: result.error }, { status: 502 });
    }

    return NextResponse.json({
      success: true,
      version: lastVersion,
      syncedToSupabase: true,
      admin: !!admin,
      rejected: result.rejected,
      referenceFixes: result.referenceFixes,
      photoUrls: result.photoUrls,
    });
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}
