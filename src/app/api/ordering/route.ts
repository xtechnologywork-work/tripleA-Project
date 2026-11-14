import { NextResponse } from 'next/server';
import { currentOrdering } from '@/lib/ordering-settings';

/** Can an employee order right now, and the hours. Nothing secret: the screens show it to everyone. */
export async function GET() {
  return NextResponse.json(await currentOrdering(), { headers: { 'Cache-Control': 'no-store' } });
}
