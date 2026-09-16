import { NextResponse } from 'next/server';
import { runBob } from '@/lib/pipeline/run';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * "Go back out and get me more on ocean tech, drop the generic AI stuff."
 * The instruction is parsed into a Directive, which shapes both what Bob
 * fetches and how he scores it.
 */
export async function POST(req: Request) {
  let text = '';
  try {
    const body = (await req.json()) as { text?: unknown };
    text = typeof body.text === 'string' ? body.text.trim() : '';
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  if (!text) {
    return NextResponse.json(
      { error: 'Tell Bob what to go and look for.' },
      { status: 400 },
    );
  }

  const { run, items, directive } = await runBob({
    trigger: 'errand',
    errandText: text,
  });
  return NextResponse.json({ run, items, directive });
}
