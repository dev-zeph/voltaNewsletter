import { NextResponse } from 'next/server';
import { runBob } from '@/lib/pipeline/run';
import { getRuns } from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
/** Collection across ~10 sources plus LLM enrichment. Give it room. */
export const maxDuration = 120;

export async function GET() {
  return NextResponse.json({ runs: await getRuns() });
}

/** Send Bob out with no instruction. */
export async function POST() {
  const { run, items } = await runBob({ trigger: 'manual' });
  return NextResponse.json({ run, items });
}
