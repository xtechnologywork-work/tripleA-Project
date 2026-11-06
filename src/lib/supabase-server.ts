import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Server-side Supabase access (API routes only).
 *
 * With SUPABASE_SERVICE_ROLE_KEY set, the server reads and writes every table itself
 * and the public key can be locked out of the tables (migration_v2_lockdown.sql).
 * Without it, the server falls back to the public key so nothing breaks before you
 * add the service key.
 */
const url = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export const hasServiceKey = (): boolean => serviceKey.length > 20;

export const isServerSupabaseConfigured = (): boolean =>
  url.startsWith('https://') && (hasServiceKey() || anonKey.length > 20);

let serverClient: SupabaseClient | null = null;

export function getServerSupabase(): SupabaseClient | null {
  if (!isServerSupabaseConfigured()) return null;
  if (!serverClient) {
    serverClient = createClient(url, hasServiceKey() ? serviceKey : anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return serverClient;
}

export interface AdminIdentity {
  id: string;
  email: string;
}

const adminEmails = (process.env.ADMIN_EMAILS || '')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

/**
 * Reads the admin's access token from the request and checks it with Supabase Auth.
 * A user counts as an admin when app_metadata.role is "admin", or when their email is
 * listed in ADMIN_EMAILS. Returns null for everyone else.
 */
export async function verifyAdmin(req: Request): Promise<AdminIdentity | null> {
  const header = req.headers.get('authorization') || '';
  const token = header.toLowerCase().startsWith('bearer ') ? header.slice(7).trim() : '';
  if (!token || !isServerSupabaseConfigured()) return null;

  try {
    const verifier = createClient(url, anonKey || serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await verifier.auth.getUser(token);
    if (error || !data.user) return null;

    const email = (data.user.email || '').toLowerCase();
    const role = (data.user.app_metadata as Record<string, unknown> | undefined)?.role;
    if (role === 'admin' || (email && adminEmails.includes(email))) {
      return { id: data.user.id, email };
    }
    return null;
  } catch {
    return null;
  }
}
