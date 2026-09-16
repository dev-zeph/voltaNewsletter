import { randomUUID } from 'node:crypto';
import { ensureSeeded } from '@/lib/bootstrap';
import { bobRunMessage } from '@/lib/llm/compose';
import { enrichItems } from '@/lib/llm/enrich';
import { parseErrand } from '@/lib/llm/errand';
import { dedupe } from '@/lib/pipeline/dedupe';
import type { EnrichContext } from '@/lib/pipeline/heuristic';
import { fetchAllSources } from '@/lib/sources';
import {
  addSeenUrls,
  getItems,
  getLatestRun,
  getPersistentDirectives,
  getSeenUrls,
  saveDirective,
  saveItems,
  saveRun,
} from '@/lib/store';
import type {
  AudienceTag,
  Directive,
  Item,
  RawItem,
  Run,
  RunTrigger,
  Section,
  SourceConfig,
} from '@/lib/types';
import { SECTIONS } from '@/lib/types';

/** Below this an item is not even worth storing. */
const KEEP_FLOOR = 35;

/**
 * Hard ceiling on one board. The product bet is "approve twenty cards, then
 * hit send". A first run pulls well over a hundred items, and handing Bader all
 * of them recreates exactly the chore Bob exists to remove.
 */
const MAX_BOARD = 30;

/**
 * Anything older than this is not news. Volta's own blog listing mixes current
 * announcements with posts going back two and a half years, and without a hard
 * gate those evergreen posts score well enough on authority and geography to
 * take slots from this week's actual funding rounds.
 *
 * Future dates are never stale: an event three weeks out is the whole point of
 * the "what's on this week" section.
 */
const MAX_AGE_DAYS = 90;

/** Per-section ceiling, so one chatty feed cannot swallow the whole board. */
const MAX_PER_SECTION: Record<Section, number> = {
  'volta-update': 6,
  funding: 8,
  events: 6,
  opportunity: 4,
  jobs: 4,
  ecosystem: 5,
};

export interface RunOptions {
  trigger: RunTrigger;
  /** Plain-English instruction from the user. Turns this into a directive. */
  errandText?: string;
}

export interface RunOutcome {
  run: Run;
  items: Item[];
  directive: Directive | null;
}

/**
 * One full Bob cycle: collect, dedupe, enrich, rank, persist.
 *
 * Never throws. A run that fails still produces a Run record with status
 * 'error' and a message the user can read, because a blank screen on demo day
 * is worse than a bad result.
 */
export async function runBob(opts: RunOptions): Promise<RunOutcome> {
  const runId = randomUUID();
  const startedAt = new Date().toISOString();

  const run: Run = {
    id: runId,
    startedAt,
    finishedAt: null,
    status: 'running',
    trigger: opts.trigger,
    directiveId: null,
    sourceStats: [],
    rawCount: 0,
    dedupedCount: 0,
    surfacedCount: 0,
    message: 'Bob is out gathering.',
    itemIds: [],
  };

  try {
    const { sources } = await ensureSeeded();

    // 1. Work out what this run is being asked to do.
    const directive = await resolveDirective(opts.errandText, sources);
    if (directive) {
      await saveDirective(directive);
      run.directiveId = directive.id;
    }
    const standing = await getPersistentDirectives();
    const guidance = mergeGuidance([
      ...standing,
      ...(directive ? [directive] : []),
    ]);

    // "Dig deeper" on a card is a real instruction, not a bookmark. Anything
    // flagged on the last board becomes a targeted follow-up search this time.
    const followUps = await digDeeperQueries();
    if (followUps.length) {
      guidance.extraQueries = unique([
        ...guidance.extraQueries,
        ...followUps,
      ]).slice(0, 10);
    }

    // 2. Build the source list: everything enabled, plus anything the errand
    //    asked for this time only.
    const enabled = sources.filter((s) => s.enabled);
    const ephemeral = ephemeralSources(guidance);
    const toFetch = [...enabled, ...ephemeral];

    // 3. Collect.
    const results = await fetchAllSources(toFetch);
    run.sourceStats = results.map((r) => ({
      sourceId: r.sourceId,
      name: r.sourceName,
      ok: r.ok,
      count: r.items.length,
      ms: r.ms,
      error: r.error,
    }));

    const raw: RawItem[] = results.flatMap((r) => r.items);
    run.rawCount = raw.length;

    // 4. Dedupe against this batch and against everything Bob has ever shown.
    const authority = Object.fromEntries(
      toFetch.map((s) => [s.id, s.authority]),
    );
    const seen = await getSeenUrls();
    const { kept } = dedupe(raw, seen, authority);
    run.dedupedCount = kept.length;

    // 5. Enrich. Falls back to the heuristic scorer per item if the LLM is
    //    unavailable or a chunk fails.
    const sourceById = new Map(toFetch.map((s) => [s.id, s]));
    const ctxFor = (item: RawItem): EnrichContext => {
      const cfg = sourceById.get(item.sourceId);
      return {
        authority: cfg?.authority ?? 0.5,
        boost: guidance.boost,
        suppress: guidance.suppress,
        focusSections: guidance.focusSections,
        note: guidance.note,
        sectionHint: cfg?.sectionHint,
      };
    };
    const enriched = await enrichItems(kept, ctxFor);

    const fetchedAt = new Date().toISOString();
    const scored: Item[] = kept
      .map((rawItem, i) => {
        const e = enriched[i];
        const cfg = sourceById.get(rawItem.sourceId);
        return {
          id: randomUUID(),
          runId,
          title: rawItem.title,
          url: rawItem.url,
          sourceId: rawItem.sourceId,
          sourceName: rawItem.sourceName || cfg?.name || rawItem.sourceId,
          publishedAt: rawItem.publishedAt,
          fetchedAt,
          excerpt: rawItem.excerpt,
          meta: rawItem.meta,
          section: normaliseSection(e?.section, cfg?.sectionHint),
          audiences: e?.audiences?.length
            ? e.audiences
            : (['community'] as AudienceTag[]),
          score: clamp(e?.score ?? 0),
          why: e?.why ?? '',
          blurb: e?.blurb || rawItem.excerpt || rawItem.title,
          entities: e?.entities ?? { orgs: [], people: [] },
          enrichedBy: e?.enrichedBy ?? 'heuristic',
          decision: 'pending' as const,
          digDeeper: false,
        };
      })
      .filter((item) => item.score >= KEEP_FLOOR)
      .filter((item) => !isStale(item.publishedAt))
      .sort((a, b) => b.score - a.score);

    const items = capBoard(scored);

    run.surfacedCount = items.length;
    run.itemIds = items.map((i) => i.id);

    const bySection: Partial<Record<Section, number>> = {};
    for (const item of items) {
      bySection[item.section] = (bySection[item.section] ?? 0) + 1;
    }

    run.message = bobRunMessage({
      raw: run.rawCount,
      deduped: run.dedupedCount,
      surfaced: run.surfacedCount,
      sourcesOk: results.filter((r) => r.ok).length,
      sourcesTotal: results.length,
      bySection,
    });
    run.status = 'done';
    run.finishedAt = new Date().toISOString();

    await saveItems(items);
    await addSeenUrls(items.map((i) => i.url));
    await saveRun(run);

    return { run, items, directive };
  } catch (err) {
    run.status = 'error';
    run.finishedAt = new Date().toISOString();
    run.error = err instanceof Error ? err.message : String(err);
    run.message = `I could not finish that run. ${run.error}`;
    await saveRun(run).catch(() => undefined);
    return { run, items: [], directive: null };
  }
}

// ---------------------------------------------------------------------------

/**
 * Turns every card flagged "dig deeper" on the most recent board into a search
 * query. An org name is the best handle we have, so prefer those and fall back
 * to the headline's distinctive words.
 */
async function digDeeperQueries(): Promise<string[]> {
  const latest = await getLatestRun();
  if (!latest) return [];
  const items = await getItems(latest.id);
  const flagged = items.filter((i) => i.digDeeper).slice(0, 4);

  return unique(
    flagged.map((item) => {
      const org = item.entities.orgs.find((o) => o.length > 2);
      if (org) return `${org} Nova Scotia`;
      const words = item.title
        .replace(/[^\w\s]/g, ' ')
        .split(/\s+/)
        .filter((w) => w.length > 3)
        .slice(0, 5)
        .join(' ');
      return words || item.title.slice(0, 60);
    }),
  ).filter(Boolean);
}

async function resolveDirective(
  errandText: string | undefined,
  sources: SourceConfig[],
): Promise<Directive | null> {
  const text = errandText?.trim();
  if (!text) return null;
  const parsed = await parseErrand(
    text,
    sources.map((s) => s.name),
  );
  return {
    ...parsed,
    id: randomUUID(),
    createdAt: new Date().toISOString(),
    rawText: text,
  };
}

interface Guidance {
  boost: string[];
  suppress: string[];
  focusSections: Section[];
  note: string;
  extraQueries: string[];
  extraFeeds: string[];
}

function mergeGuidance(directives: Directive[]): Guidance {
  const g: Guidance = {
    boost: [],
    suppress: [],
    focusSections: [],
    note: '',
    extraQueries: [],
    extraFeeds: [],
  };
  const notes: string[] = [];
  for (const d of directives) {
    g.boost.push(...d.boost);
    g.suppress.push(...d.suppress);
    g.focusSections.push(...d.focusSections);
    g.extraQueries.push(...d.extraQueries);
    g.extraFeeds.push(...d.extraFeeds);
    if (d.note) notes.push(d.note);
  }
  g.boost = unique(g.boost);
  g.suppress = unique(g.suppress);
  g.focusSections = unique(g.focusSections);
  g.extraQueries = unique(g.extraQueries).slice(0, 6);
  g.extraFeeds = unique(g.extraFeeds).slice(0, 4);
  g.note = notes.join(' ');
  return g;
}

/**
 * Sources that exist only for this run, created from an errand. This is what
 * makes "go find me anything on ocean tech" actually hit the network.
 */
function ephemeralSources(g: Guidance): SourceConfig[] {
  const queries: SourceConfig[] = g.extraQueries.map((q, i) => ({
    id: `errand-q-${i}-${slug(q)}`,
    name: `Errand: ${q}`,
    kind: 'gnews',
    url: q,
    enabled: true,
    tier: 0,
    authority: 0.55,
    builtin: false,
  }));
  const feeds: SourceConfig[] = g.extraFeeds.map((u, i) => ({
    id: `errand-f-${i}-${slug(u)}`,
    name: `Errand feed: ${hostOf(u)}`,
    kind: 'rss',
    url: u,
    enabled: true,
    tier: 0,
    authority: 0.6,
    builtin: false,
  }));
  return [...queries, ...feeds];
}

/**
 * An item with no date at all is kept: a missing date is an unknown, not
 * evidence of age, and dropping those would silently lose feeds that omit
 * timestamps.
 */
function isStale(publishedAt: string | null): boolean {
  if (!publishedAt) return false;
  const ts = Date.parse(publishedAt);
  if (!Number.isFinite(ts)) return false;
  const ageDays = (Date.now() - ts) / 86_400_000;
  return ageDays > MAX_AGE_DAYS;
}

/**
 * Trims a score-sorted list to something a human will actually work through.
 * Takes the best of each section first so every section survives, then fills
 * the remaining slots with the highest scores left over.
 */
function capBoard(sorted: Item[]): Item[] {
  const perSection: Partial<Record<Section, number>> = {};
  const picked: Item[] = [];
  const overflow: Item[] = [];

  for (const item of sorted) {
    const used = perSection[item.section] ?? 0;
    if (used < MAX_PER_SECTION[item.section] && picked.length < MAX_BOARD) {
      perSection[item.section] = used + 1;
      picked.push(item);
    } else {
      overflow.push(item);
    }
  }

  for (const item of overflow) {
    if (picked.length >= MAX_BOARD) break;
    picked.push(item);
  }

  return picked.sort((a, b) => b.score - a.score);
}

function normaliseSection(
  section: Section | undefined,
  hint: Section | undefined,
): Section {
  if (section && SECTIONS.includes(section)) return section;
  if (hint && SECTIONS.includes(hint)) return hint;
  return 'ecosystem';
}

function clamp(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(100, Math.round(n)));
}

function unique<T>(list: T[]): T[] {
  return [...new Set(list)];
}

function slug(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 32);
}

function hostOf(u: string): string {
  try {
    return new URL(u).hostname.replace(/^www\./, '');
  } catch {
    return u.slice(0, 40);
  }
}
