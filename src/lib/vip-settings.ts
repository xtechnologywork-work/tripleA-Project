/**
 * VIP clients on the server: which employees the team marked as VIP. Server only.
 *
 * On Supabase the list is one small private file in storage (bucket app-settings, file settings/vip.json), so no SQL is needed.
 * Without Supabase (the local demo) it is kept with the other local data.
 */
import { getServerSupabase, isServerSupabaseConfigured } from './supabase-server';
import { getLocalValue, setLocalValue } from './local-db';

// A bucket of its own: the photo bucket only accepts images, so it refuses these small settings files
const BUCKET = 'app-settings';
const PATH = 'settings/vip.json';
const LOCAL_KEY = 'vipEmployees';
/** Read again after this long: a change by the team reaches every screen within seconds */
const CACHE_MS = 5000;
/** The list stays small: a sanity limit, so one wrong request cannot grow the file without end */
const MAX_VIP = 2000;

let cache: { ids: Set<string>; at: number } | null = null;
let inFlight: Promise<Set<string>> | null = null;
/** Counts saves: a read that started before a save must not put its older answer in the cache */
let saves = 0;

const onSupabase = () => isServerSupabaseConfigured() && !!getServerSupabase();

const cleanIds = (raw: unknown): string[] =>
  Array.isArray(raw) ? Array.from(new Set(raw.filter((x): x is string => typeof x === 'string' && /^[\w-]{1,80}$/.test(x)))).slice(0, MAX_VIP) : [];

/** The ids of the VIP employees. A read that fails keeps the last answer (or none). */
export function loadVipIds(): Promise<Set<string>> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_MS) return Promise.resolve(cache.ids);
  // Everybody asking while a read is under way shares that one read
  if (!inFlight) inFlight = readVipIds().finally(() => (inFlight = null));
  return inFlight;
}

async function readVipIds(): Promise<Set<string>> {
  const now = Date.now();
  const savesAtStart = saves;
  let ids = cache?.ids ?? new Set<string>();
  try {
    if (onSupabase()) {
      const { data, error } = await getServerSupabase()!.storage.from(BUCKET).download(PATH);
      if (data) ids = new Set(cleanIds(JSON.parse(await data.text())?.ids));
      else if (error && /not.?found|does not exist|no such|404/i.test(error.message || '')) ids = new Set();
      else if (error) console.error('Reading the VIP list failed:', error.message);
    } else {
      ids = new Set(cleanIds((getLocalValue(LOCAL_KEY) as { ids?: unknown } | undefined)?.ids));
    }
  } catch (err) {
    console.error('Reading the VIP list failed:', err);
  }
  if (saves === savesAtStart) cache = { ids, at: now };
  return ids;
}

/** Marks or unmarks one employee. Returns the new list, or null when it could not be saved. */
export async function setVip(employeeId: string, vip: boolean): Promise<Set<string> | null> {
  if (!/^[\w-]{1,80}$/.test(employeeId)) return null;
  // Read fresh: two changes made close together must not undo each other
  cache = null;
  inFlight = null;
  saves += 1;
  const ids = new Set(await loadVipIds());
  if (vip) ids.add(employeeId);
  else ids.delete(employeeId);
  if (ids.size > MAX_VIP) return null;
  const body = JSON.stringify({ ids: Array.from(ids) });
  try {
    if (onSupabase()) {
      const sb = getServerSupabase()!;
      const made = await sb.storage.createBucket(BUCKET, { public: false });
      if (made.error && !/already exists/i.test(made.error.message)) {
        console.error('Saving the VIP list failed:', made.error.message);
        return null;
      }
      const { error } = await sb.storage.from(BUCKET).upload(PATH, Buffer.from(body), { contentType: 'application/json', upsert: true });
      if (error) {
        console.error('Saving the VIP list failed:', error.message);
        return null;
      }
    } else {
      setLocalValue(LOCAL_KEY, { ids: Array.from(ids) });
    }
    cache = { ids, at: Date.now() };
    return ids;
  } catch (err) {
    console.error('Saving the VIP list failed:', err);
    return null;
  }
}
