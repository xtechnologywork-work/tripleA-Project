import { NextResponse, connection } from 'next/server';
import { currentOrdering } from '@/lib/ordering-settings';

/** Can an employee order right now, and the hours. Nothing secret: the screens show it to everyone. */
export async function GET() {
  // Answered at request time, never built in advance: the answer depends on the clock and on the team's switch
  await connection();
  return NextResponse.json(await currentOrdering(), { headers: { 'Cache-Control': 'no-store' } });
}
