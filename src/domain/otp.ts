/**
 * Sign in and sign up with a one-time code sent by SMS (Twilio Verify).
 * Rules that do not depend on the network, so they can be tested on their own. No imports.
 */

/** Qatar mobile numbers: 8 digits starting with 3, 5, 6 or 7. Returns the 8 digits, or null. */
export function qatarMobile(input: string): string | null {
  let digits = String(input || '').replace(/\D/g, '');
  if (digits.startsWith('00974')) digits = digits.slice(5);
  else if (digits.startsWith('974') && digits.length === 11) digits = digits.slice(3);
  return /^[3567]\d{7}$/.test(digits) ? digits : null;
}

/** The number in the international form Twilio needs. */
export const toE164 = (last8: string) => `+974${last8}`;

/** A code is 6 digits. */
export const isCode = (code: string) => /^\d{6}$/.test(String(code || ''));

/** How many messages and checks are allowed. Kept low: every message costs money. */
export const LIMITS = {
  sendPerPhone: { max: 3, windowMs: 10 * 60 * 1000 },
  sendPerDevice: { max: 10, windowMs: 60 * 60 * 1000 },
  sendPerDay: { max: 500, windowMs: 24 * 60 * 60 * 1000 },
  checkPerPhone: { max: 10, windowMs: 10 * 60 * 1000 },
} as const;

/** Seconds before "Send again" opens. */
export const RESEND_SECONDS = 60;

/**
 * Who may sign up: only Ministry employees, and their employee numbers follow a fixed pattern.
 * Checked on the server only, so the rule is not visible in the app. The screen is only told "not allowed".
 *  1. exactly 8 digits
 *  2. starts with 69 or 46
 */
export const isMinistryEmployeeNo = (v: unknown): boolean => /^(69|46)\d{6}$/.test(String(v ?? ''));

/** What the screen is told. Never the raw Twilio message. */
export type OtpError =
  | 'NOT_ALLOWED'
  | 'BAD_PHONE'
  | 'NOT_FOUND'
  | 'EXISTS'
  | 'SUSPENDED'
  | 'BAD_NAME'
  | 'BAD_EMPLOYEE_NO'
  | 'TOO_MANY'
  | 'WRONG_CODE'
  | 'EXPIRED'
  | 'BLOCKED'
  | 'NOT_READY'
  | 'FAILED';
