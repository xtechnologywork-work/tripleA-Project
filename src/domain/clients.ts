/**
 * Clients added by hand by the team: people who use the service but have no Ministry employee number
 * (the marketing team, security, ...). They are identified by their Qatar ID (QID) instead, and sign in with
 * their mobile number like everyone else. Pure rules (only a type is imported), so they can be tested on their own.
 */
import type { Employee } from './types';

/** A Qatar ID: exactly 11 digits, the first one 2 or 3 (the century of birth). */
export const isQid = (v: unknown): boolean => /^[23]\d{10}$/.test(String(v ?? ''));

/** The teams offered in the form. "Other" lets the team type a name. */
export const CLIENT_TEAMS = ['Marketing', 'Security', 'Other'] as const;
export type ClientTeam = (typeof CLIENT_TEAMS)[number];

/** A client added by the team with a QID and no employee number. */
export const isQidClient = (e: Pick<Employee, 'employeeNo' | 'qid'> | null | undefined): boolean => !!e && !e.employeeNo && !!e.qid;

/** What identifies the person, for the screens: "Employee no: 69..." or "QID: 2..." (empty when neither is known). */
export function clientIdLine(e: Pick<Employee, 'employeeNo' | 'qid'> | null | undefined): { label: 'Employee no' | 'QID'; value: string } | null {
  if (!e) return null;
  if (e.employeeNo) return { label: 'Employee no', value: e.employeeNo };
  if (e.qid) return { label: 'QID', value: e.qid };
  return null;
}

export interface ManualClient {
  fullName: string;
  /** The 8 digits of the Qatar mobile */
  phone: string;
  qid: string;
  /** Saved as the client's company, e.g. "Marketing team" */
  company: string;
}

/**
 * Checks the form. `toMobile` turns what was typed into the 8 Qatar mobile digits (or null), the same rule as sign up.
 * Returns the cleaned client, or the first problem in plain words.
 */
export function cleanManualClient(
  input: { fullName?: unknown; phone?: unknown; qid?: unknown; team?: unknown; otherTeam?: unknown },
  toMobile: (typed: string) => string | null
): { ok: true; client: ManualClient } | { ok: false; error: string } {
  const fullName = String(input.fullName ?? '').trim().replace(/\s+/g, ' ');
  if (fullName.length < 2 || fullName.length > 80) return { ok: false, error: 'The full name must be 2 to 80 characters.' };
  const phone = toMobile(String(input.phone ?? ''));
  if (!phone) return { ok: false, error: 'Enter an 8-digit Qatar mobile number (starting with 3, 5, 6 or 7).' };
  const qid = String(input.qid ?? '').replace(/[\s-]/g, '');
  if (!isQid(qid)) return { ok: false, error: 'The QID must be exactly 11 digits, starting with 2 or 3.' };
  const team = String(input.team ?? '');
  if (!(CLIENT_TEAMS as readonly string[]).includes(team)) return { ok: false, error: 'Choose a team.' };
  let company: string;
  if (team === 'Other') {
    const other = String(input.otherTeam ?? '').trim().replace(/\s+/g, ' ');
    if (other.length < 2 || other.length > 60) return { ok: false, error: 'Write the team or company name (2 to 60 characters).' };
    company = other;
  } else {
    company = `${team} team`;
  }
  return { ok: true, client: { fullName, phone, qid, company } };
}
