import fs from 'node:fs/promises';
import path from 'node:path';
import type {
  Directive,
  Issue,
  Item,
  Recipient,
  Run,
  SourceConfig,
} from '@/lib/types';

/**
 * File-backed store. One JSON file per collection under .data/.
 *
 * This is the zero-setup backend: no database to provision, works on localhost
 * the moment you clone the repo. It is also the reason a Vercel deployment
 * needs the Supabase backend instead, because serverless filesystems are
 * ephemeral and everything written here disappears between invocations.
 *
 * Selected by `src/lib/store/index.ts` when Supabase is not configured.
 */

/**
 * On Vercel the project directory is read-only and only /tmp is writable, so a
 * write to .data/ throws EROFS rather than failing quietly. /tmp does not
 * survive between invocations either, which is exactly why a deployment should
 * be on the Supabase backend. This just keeps the email preview writer from
 * exploding when it is used as a fallback.
 */
const DATA_DIR = process.env.BOB_DATA_DIR
  ? path.resolve(process.env.BOB_DATA_DIR)
  : process.env.VERCEL
    ? path.join('/tmp', 'bob-data')
    : path.join(process.cwd(), '.data');

type Collection =
  | 'runs'
  | 'items'
  | 'directives'
  | 'recipients'
  | 'sources'
  | 'issues'
  | 'seen';

const locks = new Map<Collection, Promise<unknown>>();

async function ensureDir() {
  await fs.mkdir(DATA_DIR, { recursive: true });
}

function fileFor(c: Collection) {
  return path.join(DATA_DIR, `${c}.json`);
}

async function readCollection<T>(c: Collection, fallback: T): Promise<T> {
  try {
    const raw = await fs.readFile(fileFor(c), 'utf8');
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeCollection<T>(c: Collection, value: T): Promise<void> {
  await ensureDir();
  const tmp = `${fileFor(c)}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2), 'utf8');
  await fs.rename(tmp, fileFor(c));
}

/**
 * Serialises read-modify-write on a collection. Several sources finish at once
 * during a run, and without this the last writer silently wins.
 */
async function mutate<T>(
  c: Collection,
  fallback: T,
  fn: (current: T) => T | Promise<T>,
): Promise<T> {
  const prev = locks.get(c) ?? Promise.resolve();
  const next = prev.then(async () => {
    const current = await readCollection<T>(c, fallback);
    const updated = await fn(current);
    await writeCollection(c, updated);
    return updated;
  });
  locks.set(
    c,
    next.catch(() => undefined),
  );
  return next;
}

// --- runs ------------------------------------------------------------------

export async function getRuns(): Promise<Run[]> {
  const runs = await readCollection<Run[]>('runs', []);
  return runs.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}

export async function getRun(id: string): Promise<Run | null> {
  const runs = await readCollection<Run[]>('runs', []);
  return runs.find((r) => r.id === id) ?? null;
}

export async function getLatestRun(): Promise<Run | null> {
  const runs = await getRuns();
  return runs[0] ?? null;
}

export async function saveRun(run: Run): Promise<void> {
  await mutate<Run[]>('runs', [], (runs) => {
    const i = runs.findIndex((r) => r.id === run.id);
    if (i >= 0) runs[i] = run;
    else runs.unshift(run);
    return runs.slice(0, 50);
  });
}

// --- items -----------------------------------------------------------------

export async function getItems(runId?: string): Promise<Item[]> {
  const items = await readCollection<Item[]>('items', []);
  const scoped = runId ? items.filter((i) => i.runId === runId) : items;
  return scoped.sort((a, b) => b.score - a.score);
}

export async function getItemsByIds(ids: string[]): Promise<Item[]> {
  const items = await readCollection<Item[]>('items', []);
  const byId = new Map(items.map((i) => [i.id, i]));
  return ids.map((id) => byId.get(id)).filter((i): i is Item => Boolean(i));
}

export async function saveItems(incoming: Item[]): Promise<void> {
  if (!incoming.length) return;
  await mutate<Item[]>('items', [], (items) => {
    const byId = new Map(items.map((i) => [i.id, i]));
    for (const item of incoming) byId.set(item.id, item);
    // Keep the store from growing without bound across many runs.
    return [...byId.values()].slice(-800);
  });
}

export async function updateItem(
  id: string,
  patch: Partial<Item>,
): Promise<Item | null> {
  let result: Item | null = null;
  await mutate<Item[]>('items', [], (items) => {
    const i = items.findIndex((x) => x.id === id);
    if (i >= 0) {
      items[i] = { ...items[i], ...patch, id: items[i].id };
      result = items[i];
    }
    return items;
  });
  return result;
}

// --- directives ------------------------------------------------------------

export async function getDirectives(): Promise<Directive[]> {
  return readCollection<Directive[]>('directives', []);
}

/** The standing guidance Bob carries into every future run. */
export async function getPersistentDirectives(): Promise<Directive[]> {
  const all = await getDirectives();
  return all.filter((d) => d.persistent);
}

export async function saveDirective(d: Directive): Promise<void> {
  await mutate<Directive[]>('directives', [], (list) => {
    const i = list.findIndex((x) => x.id === d.id);
    if (i >= 0) list[i] = d;
    else list.push(d);
    return list.slice(-100);
  });
}

export async function deleteDirective(id: string): Promise<void> {
  await mutate<Directive[]>('directives', [], (list) =>
    list.filter((d) => d.id !== id),
  );
}

// --- recipients ------------------------------------------------------------

export async function getRecipients(): Promise<Recipient[]> {
  return readCollection<Recipient[]>('recipients', []);
}

export async function saveRecipients(list: Recipient[]): Promise<void> {
  await writeCollection('recipients', list);
}

// --- sources ---------------------------------------------------------------

export async function getSources(): Promise<SourceConfig[]> {
  return readCollection<SourceConfig[]>('sources', []);
}

export async function saveSources(list: SourceConfig[]): Promise<void> {
  await writeCollection('sources', list);
}

// --- issues ----------------------------------------------------------------

export async function getIssues(): Promise<Issue[]> {
  const issues = await readCollection<Issue[]>('issues', []);
  return issues.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function getIssue(id: string): Promise<Issue | null> {
  const issues = await readCollection<Issue[]>('issues', []);
  return issues.find((i) => i.id === id) ?? null;
}

export async function saveIssue(issue: Issue): Promise<void> {
  await mutate<Issue[]>('issues', [], (list) => {
    const i = list.findIndex((x) => x.id === issue.id);
    if (i >= 0) list[i] = issue;
    else list.unshift(issue);
    return list.slice(0, 100);
  });
}

// --- seen urls (cross-run dedupe) ------------------------------------------

/**
 * Canonical URLs Bob has already shown. Without this, every run re-surfaces the
 * same Entrevestor story and Bader stops trusting the board.
 */
export async function getSeenUrls(): Promise<Set<string>> {
  const seen = await readCollection<string[]>('seen', []);
  return new Set(seen);
}

export async function addSeenUrls(urls: string[]): Promise<void> {
  if (!urls.length) return;
  await mutate<string[]>('seen', [], (list) => {
    const set = new Set(list);
    for (const u of urls) set.add(u);
    return [...set].slice(-2000);
  });
}

export { DATA_DIR };
