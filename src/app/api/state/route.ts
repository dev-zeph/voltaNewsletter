import { NextResponse } from 'next/server';
import { ensureSeeded } from '@/lib/bootstrap';
import { hasLlm } from '@/lib/llm/client';
import { transportStatus } from '@/lib/mail';
import {
  getDirectives,
  getIssues,
  getItems,
  getLatestRun,
  getRuns,
} from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** One call that hydrates the whole app. Keeps the client simple. */
export async function GET() {
  try {
    const { sources, recipients } = await ensureSeeded();
    const [latestRun, directives, issues, runs] = await Promise.all([
      getLatestRun(),
      getDirectives(),
      getIssues(),
      getRuns(),
    ]);
    const items = latestRun ? await getItems(latestRun.id) : [];

    return NextResponse.json({
      latestRun,
      runs: runs.slice(0, 20),
      items,
      recipients,
      sources,
      directives,
      issues,
      transport: transportStatus(),
      llm: hasLlm(),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
