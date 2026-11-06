import crypto from 'crypto';

/**
 * Employee session tokens (server only).
 * A token is "employeeId.expiry.signature". Only the server can make one, so a client
 * cannot pretend to be another employee. Set SESSION_SECRET in .env.local to a long random
 * string; without it the Supabase secret key is used as the signing secret.
 */
const secret =
  process.env.SESSION_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || 'local-demo-only-secret';

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64url');
const unb64 = (s: string) => Buffer.from(s, 'base64url').toString('utf8');
const sign = (payload: string) => crypto.createHmac('sha256', secret).update(payload).digest('base64url');

export function signEmployeeToken(employeeId: string, ttlDays = 30): string {
  const expires = Date.now() + ttlDays * 24 * 60 * 60 * 1000;
  const payload = `${b64(employeeId)}.${expires}`;
  return `${payload}.${sign(payload)}`;
}

/** Returns the employee id when the token is genuine and not expired, otherwise null. */
export function verifyEmployeeToken(token: string | null | undefined): string | null {
  if (!token) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [idPart, expiresPart, signature] = parts;
  const expected = sign(`${idPart}.${expiresPart}`);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const expires = Number(expiresPart);
  if (!Number.isFinite(expires) || expires < Date.now()) return null;
  try {
    return unb64(idPart) || null;
  } catch {
    return null;
  }
}
