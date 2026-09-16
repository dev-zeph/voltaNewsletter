import { NextResponse } from 'next/server';
import { buildIssue } from '@/lib/pipeline/issue';
import { getIssues, saveIssue } from '@/lib/store';
import type { IssueMode } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function GET() {
  return NextResponse.json({ issues: await getIssues() });
}

/** Assemble a draft from everything Bader kept on the board. */
export async function POST(req: Request) {
  let runId = '';
  let mode: IssueMode = 'single';
  try {
    const body = (await req.json()) as { runId?: unknown; mode?: unknown };
    runId = typeof body.runId === 'string' ? body.runId : '';
    mode = body.mode === 'segmented' ? 'segmented' : 'single';
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  if (!runId) {
    return NextResponse.json({ error: 'runId is required.' }, { status: 400 });
  }

  const built = await buildIssue(runId, mode);
  if (!built) {
    return NextResponse.json({ error: 'Run not found.' }, { status: 404 });
  }
  if (!built.issue.sections.length) {
    return NextResponse.json(
      { error: 'Nothing is marked keep yet. Tick a few cards first.' },
      { status: 400 },
    );
  }

  await saveIssue(built.issue);
  return NextResponse.json({ issue: built.issue, items: built.items });
}
