/**
 * Ordering hours on the server: where they are kept, and the answer to "can an employee order now?".
 * Server only.
 *
 * On Supabase the settings are one small private file in storage (settings/ordering.json), so no SQL is needed.
 * Without Supabase (the local demo) they are kept with the other local data.
 */
import { getServerSupabase, isServerSupabaseConfigured } from './supabase-server';
import { getLocalValue, setLocalValue } from './local-db';
import { DEFAULT_ORDERING, orderingStatus, readOrdering, type OrderingSettings, type OrderingView } from '@/domain/ordering';

const BUCKET = 'order-photos';
const PATH = 'settings/ordering.json';
const LOCAL_KEY = 'orderingSettings';
/** Read again after this long: a change by the team reaches every employee within seconds */
const CACHE_MS = 5000;

let cache: { value: OrderingSettings; at: number } | null = null;

const onSupabase = () => isServerSupabaseConfigured() && !!getServerSupabase();

/** The saved settings. Nothing saved (or damaged): closed for everyone. A read that fails keeps the last answer. */
export async function loadOrdering(): Promise<OrderingSettings> {
  const now = Date.now();
  if (cache && now - cache.at < CACHE_MS) return cache.value;

  let value: OrderingSettings = cache?.value ?? { ...DEFAULT_ORDERING };
  try {
    if (onSupabase()) {
      const { data, error } = await getServerSupabase()!.storage.from(BUCKET).download(PATH);
      if (data) value = readOrdering(JSON.parse(await data.text()));
      // Nothing saved yet: the closed default. Any other error keeps what was known.
      else if (error && /not.?found|does not exist|no such|404/i.test(error.message || '')) value = { ...DEFAULT_ORDERING };
      else if (error) console.error('Reading the ordering hours failed:', error.message);
    } else {
      value = readOrdering(getLocalValue(LOCAL_KEY));
    }
  } catch (err) {
    console.error('Reading the ordering hours failed:', err);
  }
  cache = { value, at: now };
  return value;
}

/** Saves the settings. Returns false when they could not be saved. */
export async function saveOrdering(settings: OrderingSettings): Promise<boolean> {
  try {
    if (onSupabase()) {
      const sb = getServerSupabase()!;
      const made = await sb.storage.createBucket(BUCKET, { public: false });
      if (made.error && !/already exists/i.test(made.error.message)) {
        console.error('Saving the ordering hours failed:', made.error.message);
        return false;
      }
      const { error } = await sb.storage.from(BUCKET).upload(PATH, Buffer.from(JSON.stringify(settings)), {
        contentType: 'application/json',
        upsert: true,
      });
      if (error) {
        console.error('Saving the ordering hours failed:', error.message);
        return false;
      }
    } else {
      setLocalValue(LOCAL_KEY, settings);
    }
    cache = { value: settings, at: Date.now() };
    return true;
  } catch (err) {
    console.error('Saving the ordering hours failed:', err);
    return false;
  }
}

/** Can an employee order right now? With the reason, and the hours for the screen. */
export async function currentOrdering(nowMs: number = Date.now()): Promise<OrderingView> {
  return orderingStatus(await loadOrdering(), nowMs);
}
