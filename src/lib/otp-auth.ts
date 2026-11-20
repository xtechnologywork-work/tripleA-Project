/**
 * Shared pieces of the sign in and sign up routes. Server only.
 */
import type { Employee } from '@/domain/types';
import { withTitle } from '@/domain/names';
import { findEmployeeByPhone, createEmployee, employeeNoTaken } from '@/lib/supabase-sync';
import { isServerSupabaseConfigured } from '@/lib/supabase-server';
import { getLocalDb, mergeLocal } from '@/lib/local-db';

/** Is the code by SMS required? Set by the team in Settings (until then, OTP_ENABLED decides). */
export { codesRequired as otpEnabled } from '@/lib/otp-settings';

/**
 * For testing on a computer without sending messages: OTP_DEV_CODE is accepted as the code.
 * Never used on the live site (NODE_ENV is "production" there).
 */
export const devCode = (): string | null =>
  process.env.NODE_ENV !== 'production' && /^\d{6}$/.test(process.env.OTP_DEV_CODE || '') ? (process.env.OTP_DEV_CODE as string) : null;

export async function findByPhone(last8: string): Promise<Employee | null> {
  if (isServerSupabaseConfigured()) return findEmployeeByPhone(last8);
  const list = ((getLocalDb()?.employees as Employee[]) || []).filter((e) => (e.phone || '').replace(/\D/g, '').endsWith(last8));
  return list[0] || null;
}

/** One employee number, one account. */
export async function employeeNoUsed(employeeNo: string): Promise<boolean> {
  if (isServerSupabaseConfigured()) return employeeNoTaken(employeeNo);
  return ((getLocalDb()?.employees as Employee[]) || []).some((e) => e.employeeNo === employeeNo);
}

export async function createAccount(last8: string, fullName: string, employeeNo: string): Promise<Employee | null> {
  const employee: Employee = {
    id: `emp-moci-${last8}`,
    employeeNo,
    fullName: withTitle(fullName),
    email: `moci.${last8}@moci.gov.qa`,
    phone: `+974 ${last8.slice(0, 4)} ${last8.slice(4)}`,
    company: 'Ministry of Commerce and Industry - State of Qatar',
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
  };
  if (isServerSupabaseConfigured()) {
    const saved = await createEmployee(employee);
    if (!saved.ok) {
      console.error('Employee sign up failed:', saved.error);
      return null;
    }
  } else {
    mergeLocal({ employees: [employee] });
  }
  return employee;
}

export const cleanName = (v: unknown) => String(v || '').trim().replace(/\s+/g, ' ');
export const validName = (v: string) => v.length >= 2 && v.length <= 80;
export const cleanEmployeeNo = (v: unknown) => String(v || '').trim();
export const validEmployeeNo = (v: string) => /^[\w-]{1,20}$/.test(v);
