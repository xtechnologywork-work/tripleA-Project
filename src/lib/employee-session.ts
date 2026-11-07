import crypto from 'crypto';

/**
 * Employee session tokens (server only).
 * A token is "employeeId.expiry.signature". Only the server can make one, so a client
 * cannot pretend to be another employee. Set SESSION_SECRET in .env.local to a long random
 * string; without it the Supabase secret key is used as the signing secret.
 */
// The fixed demo secret is only for local demo mode (no Supabase). With Supabase and no real secret, no token can be made.
const secret =
  process.env.SESSION_SECRET ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  (process.env.NEXT_PUBLIC_SUPABASE_URL ? '' : 'local-demo-only-secret');

const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64url');
const unb64 = (s: string) => Buffer.from(s, 'base64url').toString('utf8');
const sign = (payload: string) => crypto.createHmac('sha256', secret).update(payload).digest('base64url');

export function signEmployeeToken(employeeId: string, ttlDays = 30): string {
  if (!secret) throw new Error('SESSION_SECRET is not set');
  const expires = Date.now() + ttlDays * 24 * 60 * 60 * 1000;
  const payload = `${b64(employeeId)}.${expires}`;
  return `${payload}.${sign(payload)}`;
}

/** Returns the employee id when the token is genuine and not expired, otherwise null. */
export function verifyEmployeeToken(token: string | null | undefined): string | null {
  if (!token || !secret) return null;
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

/**
 * A short-lived signed note that carries the sign-up details from "send the code" to "check the code",
 * so they cannot be changed in between. Valid for 15 minutes.
 */
export interface PendingSignup {
  phone: string;
  fullName: string;
  employeeNo: string;
}

export function signPendingSignup(data: PendingSignup, ttlMs = 15 * 60 * 1000): string {
  if (!secret) throw new Error('SESSION_SECRET is not set');
  const payload = `${b64(JSON.stringify({ ...data, kind: 'signup' }))}.${Date.now() + ttlMs}`;
  return `${payload}.${sign(payload)}`;
}

export function verifyPendingSignup(token: string | null | undefined): PendingSignup | null {
  if (!token || !secret) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [dataPart, expiresPart, signature] = parts;
  const expected = sign(`${dataPart}.${expiresPart}`);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  const expires = Number(expiresPart);
  if (!Number.isFinite(expires) || expires < Date.now()) return null;
  try {
    const data = JSON.parse(unb64(dataPart));
    if (data.kind !== 'signup' || typeof data.phone !== 'string' || typeof data.fullName !== 'string' || typeof data.employeeNo !== 'string') return null;
    return { phone: data.phone, fullName: data.fullName, employeeNo: data.employeeNo };
  } catch {
    return null;
  }
}
