import { NextResponse } from 'next/server';
import { ensureSeeded } from '@/lib/bootstrap';
import { hasLlm } from '@/lib/llm/client';
import { transportStatus } from '@/lib/mail';
import { storeStatus } from '@/lib/store';
import {
  getDirectives,
  getIssues,
  getItems,
  getItemsByIds,
  getLatestRun,
  getRuns,
} from '@/lib/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** One call that hydrates the whole app. Keeps the client simple. */
export async function GET() {
  try {
    const { sources, recipients } = await ensureSeeded();
    const [latestRun, directives, issues, runs, store] = await Promise.all([
      getLatestRun(),
      getDirectives(),
      getIssues(),
      getRuns(),
      storeStatus(),
    ]);
    const runItems = latestRun ? await getItems(latestRun.id) : [];

    // An issue can reference items from whatever run built it, which is not
    // always the latest one. Shipping only the latest run's items left the
    // compose view unable to resolve an older issue's contents, so include
    // everything the recent issues point at as well.
    const issueItemIds = [
      ...new Set(issues.slice(0, 5).flatMap((i) => i.sections.flatMap((s) => s.itemIds))),
    ];
    const issueItems = await getItemsByIds(issueItemIds);

    const byId = new Map(runItems.map((i) => [i.id, i]));
    for (const item of issueItems) if (!byId.has(item.id)) byId.set(item.id, item);
    const items = [...byId.values()];

    return NextResponse.json({
      latestRun,
      runs: runs.slice(0, 20),
      items,
      recipients,
      sources,
      directives,
      issues,
      transport: transportStatus(),
      store,
      llm: hasLlm(),
    });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : String(err) },
      { status: 500 },
    );
  }
}
