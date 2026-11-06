import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { fetchSupabaseState, saveSupabaseState } from '@/lib/supabase-sync';
import { isSupabaseConfigured } from '@/lib/supabase';
import { MockDatabase } from '@/data/mock/seed';

// Path to persist state across server restarts
const DB_FILE = path.join(process.cwd(), '.server_db_sync.json');

// In-memory cache
let inMemoryDb: Record<string, unknown> | null = null;
let lastVersion = 1;

function getDb() {
  if (inMemoryDb) return inMemoryDb;
  try {
    if (fs.existsSync(DB_FILE)) {
      const data = fs.readFileSync(DB_FILE, 'utf-8');
      inMemoryDb = JSON.parse(data);
      return inMemoryDb;
    }
  } catch (err) {
    console.error('Error reading sync db file:', err);
  }
  return null;
}

function saveDb(db: Record<string, unknown>) {
  inMemoryDb = db;
  lastVersion += 1;
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf-8');
  } catch (err) {
    console.error('Error writing sync db file:', err);
  }
}

export async function GET() {
  if (isSupabaseConfigured()) {
    try {
      const remote = await fetchSupabaseState();
      if (remote && remote.db) {
        inMemoryDb = remote.db as unknown as Record<string, unknown>;
        lastVersion = remote.version;
        // Keep local cache file updated
        try {
          fs.writeFileSync(DB_FILE, JSON.stringify(remote.db, null, 2), 'utf-8');
        } catch {
          // Ignore
        }
        return NextResponse.json({
          db: inMemoryDb,
          version: lastVersion,
          source: 'supabase',
          timestamp: Date.now(),
        });
      }
    } catch {
      // Graceful fallback to local cache
    }
  }

  const db = getDb();
  return NextResponse.json({
    db,
    version: lastVersion,
    source: isSupabaseConfigured() ? 'local_fallback' : 'local',
    timestamp: Date.now(),
  });
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (body && body.db) {
      saveDb(body.db);

      // Async live sync to Supabase
      if (isSupabaseConfigured()) {
        saveSupabaseState(body.db as MockDatabase, lastVersion).catch(() => {});
      }

      return NextResponse.json({
        success: true,
        version: lastVersion,
        syncedToSupabase: isSupabaseConfigured(),
      });
    }
    return NextResponse.json({ success: false, error: 'No db provided' }, { status: 400 });
  } catch (err: unknown) {
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : String(err) },
      { status: 500 }
    );
  }
}

