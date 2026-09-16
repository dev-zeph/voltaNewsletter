import { NextResponse } from 'next/server';
import { runBob } from '@/lib/pipeline/run';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// An errand can now trigger live web research, which is by far the slowest
// thing Bob does: roughly 60 to 70 seconds per brief on top of the normal
// collection sweep. 120s was not enough headroom for two briefs.
export const maxDuration = 300;

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
