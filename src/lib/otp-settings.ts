/**
 * Sign in by SMS code: the on/off switch the team controls from Settings, and a small health record
 * (the last refusal from Twilio, the last code that went out). Server only.
 *
 * Kept as small private files in the app-settings bucket (like the ordering hours), so no SQL and no redeploy:
 * a change reaches every server within seconds. Without Supabase (local demo) they live with the local data.
 * Until the team uses the switch once, OTP_ENABLED in the environment decides.
 */
import { getServerSupabase, isServerSupabaseConfigured } from './supabase-server';
import { getLocalValue, setLocalValue } from './local-db';
import { twilioProblem, type TwilioRefusal, type TwilioProblemKind } from './twilio-verify';

const BUCKET = 'app-settings';
const SWITCH_PATH = 'settings/otp.json';
const HEALTH_PATH = 'settings/otp-health.json';
const CACHE_MS = 5000;

export interface OtpSwitch {
  codesRequired: boolean;
  updatedAt?: string;
  updatedBy?: string;
}

export interface OtpHealthRecord {
  lastRefusal?: { status: number; code?: number; kind: TwilioProblemKind; accountSide: boolean; at: string };
  lastSentAt?: string;
}

const onSupabase = () => isServerSupabaseConfigured() && !!getServerSupabase();
const envDefault = () => process.env.OTP_ENABLED === 'true';

async function readFile<T>(path: string, localKey: string): Promise<{ value: T | null; failed: boolean }> {
  try {
    if (onSupabase()) {
      const { data, error } = await getServerSupabase()!.storage.from(BUCKET).download(path);
      if (data) return { value: JSON.parse(await data.text()) as T, failed: false };
      if (error && /not.?found|does not exist|no such|404/i.test(error.message || '')) return { value: null, failed: false };
      if (error) console.error(`Reading ${path} failed:`, error.message);
      return { value: null, failed: true };
    }
    return { value: (getLocalValue(localKey) as T) ?? null, failed: false };
  } catch (err) {
    console.error(`Reading ${path} failed:`, err);
    return { value: null, failed: true };
  }
}

async function writeFile(path: string, localKey: string, value: unknown): Promise<boolean> {
  try {
    if (onSupabase()) {
      const sb = getServerSupabase()!;
      const made = await sb.storage.createBucket(BUCKET, { public: false });
      if (made.error && !/already exists/i.test(made.error.message)) {
        console.error(`Saving ${path} failed:`, made.error.message);
        return false;
      }
      const { error } = await sb.storage.from(BUCKET).upload(path, Buffer.from(JSON.stringify(value)), {
        contentType: 'application/json',
        upsert: true,
      });
      if (error) {
        console.error(`Saving ${path} failed:`, error.message);
        return false;
      }
      return true;
    }
    setLocalValue(localKey, value);
    return true;
  } catch (err) {
    console.error(`Saving ${path} failed:`, err);
    return false;
  }
}

// ---- the switch ----

let switchCache: { value: OtpSwitch; at: number } | null = null;
let switchInFlight: Promise<OtpSwitch> | null = null;
let switchSaves = 0;

/** The switch. Nothing saved yet: OTP_ENABLED decides. A failed read keeps the last answer (or the environment). */
export function loadOtpSwitch(): Promise<OtpSwitch> {
  if (switchCache && Date.now() - switchCache.at < CACHE_MS) return Promise.resolve(switchCache.value);
  if (!switchInFlight) {
    const savesAtStart = switchSaves;
    switchInFlight = readFile<OtpSwitch>(SWITCH_PATH, 'otpSwitch')
      .then(({ value, failed }) => {
        const v: OtpSwitch =
          value && typeof value.codesRequired === 'boolean'
            ? { codesRequired: value.codesRequired, updatedAt: value.updatedAt, updatedBy: value.updatedBy }
            : failed && switchCache
              ? switchCache.value
              : { codesRequired: envDefault() };
        if (switchSaves === savesAtStart) switchCache = { value: v, at: Date.now() };
        return v;
      })
      .finally(() => (switchInFlight = null));
  }
  return switchInFlight;
}

/** Must an employee type a code from SMS to sign in or sign up? */
export async function codesRequired(): Promise<boolean> {
  return (await loadOtpSwitch()).codesRequired;
}

export async function saveOtpSwitch(codesRequired: boolean, by: string): Promise<OtpSwitch | null> {
  switchSaves += 1;
  switchInFlight = null;
  const value: OtpSwitch = { codesRequired, updatedAt: new Date().toISOString(), updatedBy: by };
  if (!(await writeFile(SWITCH_PATH, 'otpSwitch', value))) return null;
  switchCache = { value, at: Date.now() };
  return value;
}

// ---- health ----

let healthCache: OtpHealthRecord | null = null;
let lastHealthWrite = 0;

export async function loadOtpHealth(): Promise<OtpHealthRecord> {
  const { value } = await readFile<OtpHealthRecord>(HEALTH_PATH, 'otpHealth');
  healthCache = value || healthCache || {};
  return healthCache;
}

/**
 * Notes what Twilio answered. Written at most every 30 seconds (a burst of 30 people refused for the same reason
 * is one write), except that a new kind of problem is always written. Never throws.
 */
export async function recordOtpOutcome(outcome: { sent: true } | { sent: false; twilio: TwilioRefusal }): Promise<void> {
  try {
    const now = Date.now();
    const current = healthCache ?? (await loadOtpHealth());
    const next: OtpHealthRecord = { ...current };
    if (outcome.sent) {
      next.lastSentAt = new Date(now).toISOString();
    } else {
      const p = twilioProblem(outcome.twilio.status, outcome.twilio.code);
      next.lastRefusal = { status: outcome.twilio.status, code: outcome.twilio.code, kind: p.kind, accountSide: p.accountSide, at: new Date(now).toISOString() };
    }
    const newKind = !outcome.sent && current.lastRefusal?.code !== outcome.twilio.code;
    healthCache = next;
    if (!newKind && now - lastHealthWrite < 30_000) return;
    lastHealthWrite = now;
    await writeFile(HEALTH_PATH, 'otpHealth', next);
  } catch (err) {
    console.error('Recording the SMS outcome failed:', err);
  }
}
