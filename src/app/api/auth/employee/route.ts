import { NextResponse } from 'next/server';
import { findEmployeeByPhone, createEmployee } from '@/lib/supabase-sync';
import { isServerSupabaseConfigured } from '@/lib/supabase-server';
import { signEmployeeToken } from '@/lib/employee-session';
import { rateLimit, clientIp } from '@/lib/rate-limit';
import { getLocalDb, mergeLocal } from '@/lib/local-db';
import type { Employee } from '@/domain/types';

/**
 * Employee sign in and sign up, done on the server.
 * The server checks the phone number, creates the account when needed, and returns a signed
 * session token. Every later request must carry that token, so an employee can only reach
 * their own data.
 *
 * NOTE: a phone number alone is a weak proof of identity. Adding a one-time SMS code before
 * the token is issued is the next step (it needs an SMS provider such as Twilio).
 */
export async function POST(req: Request) {
  const ip = clientIp(req);
  if (!rateLimit(`auth:ip:${ip}`, 20, 60_000)) {
    return NextResponse.json({ error: 'TOO_MANY' }, { status: 429 });
  }

  let body: { action?: string; phone?: string; fullName?: string; employeeNo?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'BAD_REQUEST' }, { status: 400 });
  }

  const digits = String(body.phone || '').replace(/\D/g, '');
  if (digits.length < 8) return NextResponse.json({ error: 'BAD_PHONE' }, { status: 400 });
  const last8 = digits.slice(-8);

  // Guessing numbers one by one is slowed down per number as well
  if (!rateLimit(`auth:phone:${last8}`, 8, 60_000)) {
    return NextResponse.json({ error: 'TOO_MANY' }, { status: 429 });
  }

  const configured = isServerSupabaseConfigured();

  const lookup = async (): Promise<Employee | null> => {
    if (configured) return findEmployeeByPhone(last8);
    const list = ((getLocalDb()?.employees as Employee[]) || []).filter((e) =>
      (e.phone || '').replace(/\D/g, '').endsWith(last8)
    );
    return list[0] || null;
  };

  const existing = await lookup();

  if (body.action === 'login') {
    if (!existing) return NextResponse.json({ error: 'NOT_FOUND' }, { status: 404 });
    if (existing.status === 'SUSPENDED') return NextResponse.json({ error: 'SUSPENDED' }, { status: 403 });
    return NextResponse.json({ employee: existing, token: signEmployeeToken(existing.id) });
  }

  if (body.action === 'signup') {
    const fullName = String(body.fullName || '').trim();
    const employeeNo = String(body.employeeNo || '').trim();
    if (fullName.length < 2 || fullName.length > 80) return NextResponse.json({ error: 'BAD_NAME' }, { status: 400 });
    if (!/^[\w-]{1,20}$/.test(employeeNo)) return NextResponse.json({ error: 'BAD_EMPLOYEE_NO' }, { status: 400 });
    // A number that is already registered can never be taken over by signing up again
    if (existing) return NextResponse.json({ error: 'EXISTS' }, { status: 409 });

    const employee: Employee = {
      id: `emp-moci-${last8}`,
      employeeNo,
      fullName,
      email: `moci.${last8}@moci.gov.qa`,
      phone: `+974 ${last8.slice(0, 4)} ${last8.slice(4)}`,
      company: 'Ministry of Commerce and Industry - State of Qatar',
      status: 'ACTIVE',
      createdAt: new Date().toISOString(),
    };

    if (configured) {
      const saved = await createEmployee(employee);
      if (!saved.ok) {
        console.error('Employee sign up failed:', saved.error);
        return NextResponse.json({ error: 'FAILED' }, { status: 500 });
      }
    } else {
      mergeLocal({ employees: [employee] });
    }
    return NextResponse.json({ employee, token: signEmployeeToken(employee.id), isNew: true });
  }

  return NextResponse.json({ error: 'BAD_REQUEST' }, { status: 400 });
}
