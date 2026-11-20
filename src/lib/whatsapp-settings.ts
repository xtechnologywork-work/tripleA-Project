/**
 * The WhatsApp message texts the team edits in Settings. Server only.
 * A small private file in the app-settings bucket (like the ordering hours): no SQL, no redeploy.
 * Without Supabase (local demo) they live with the local data. Until the team saves once, the defaults are used.
 */
import { getServerSupabase, isServerSupabaseConfigured } from './supabase-server';
import { getLocalValue, setLocalValue } from './local-db';
import { DEFAULT_WA_TEMPLATES, readWaTemplates, type WaTemplates } from '@/domain/whatsapp';

const BUCKET = 'app-settings';
const PATH = 'settings/whatsapp.json';
const LOCAL_KEY = 'whatsappTemplates';

const onSupabase = () => isServerSupabaseConfigured() && !!getServerSupabase();

/** The saved texts. Nothing saved yet: the defaults. A failed read also falls back to the defaults (never blocks the team). */
export async function loadWaTemplates(): Promise<{ templates: WaTemplates; saved: boolean }> {
  try {
    if (onSupabase()) {
      const { data, error } = await getServerSupabase()!.storage.from(BUCKET).download(PATH);
      if (data) return { templates: readWaTemplates(JSON.parse(await data.text())), saved: true };
      if (error && !/not.?found|does not exist|no such|404/i.test(error.message || '')) console.error('Reading the WhatsApp messages failed:', error.message);
      return { templates: { ...DEFAULT_WA_TEMPLATES }, saved: false };
    }
    const local = getLocalValue(LOCAL_KEY);
    return { templates: readWaTemplates(local), saved: !!local };
  } catch (err) {
    console.error('Reading the WhatsApp messages failed:', err);
    return { templates: { ...DEFAULT_WA_TEMPLATES }, saved: false };
  }
}

export async function saveWaTemplates(templates: WaTemplates): Promise<boolean> {
  try {
    if (onSupabase()) {
      const sb = getServerSupabase()!;
      const made = await sb.storage.createBucket(BUCKET, { public: false });
      if (made.error && !/already exists/i.test(made.error.message)) {
        console.error('Saving the WhatsApp messages failed:', made.error.message);
        return false;
      }
      const { error } = await sb.storage.from(BUCKET).upload(PATH, Buffer.from(JSON.stringify(templates)), {
        contentType: 'application/json',
        upsert: true,
      });
      if (error) {
        console.error('Saving the WhatsApp messages failed:', error.message);
        return false;
      }
      return true;
    }
    setLocalValue(LOCAL_KEY, templates);
    return true;
  } catch (err) {
    console.error('Saving the WhatsApp messages failed:', err);
    return false;
  }
}
