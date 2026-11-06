import fs from 'fs';
import path from 'path';

// Local cache file: the whole database when Supabase is not configured, a fallback otherwise.
const DB_FILE = path.join(process.cwd(), '.server_db_sync.json');

let inMemoryDb: Record<string, unknown> | null = null;
let lastVersion = 1;

export function getLocalDb(): Record<string, unknown> | null {
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

export function getLocalVersion(): number {
  return lastVersion;
}

export function setLocalSnapshot(db: Record<string, unknown>, version: number): void {
  inMemoryDb = db;
  lastVersion = version;
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

/** Merge changed rows into the local file by id. Never replaces the whole database. */
export function mergeLocal(changes: Record<string, unknown>): void {
  const db = getLocalDb() || {};
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
