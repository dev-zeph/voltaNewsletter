// ============================================================================
// Bob — storage. Picks a backend once, then delegates.
//
//   Supabase configured  -> Supabase. Required for any deployment, because
//                           serverless filesystems are ephemeral and the file
//                           store silently loses every run between invocations.
//   otherwise            -> JSON files under .data/. Zero setup, works the
//                           moment you clone the repo.
//
// Every module in the app imports from here and nowhere else, so switching
// backends is an environment variable, not a refactor.
// ============================================================================

import type {
  Directive,
  Issue,
  Item,
  Recipient,
  Run,
  SourceConfig,
} from '@/lib/types';
import * as fileStore from '@/lib/store/file-store';
import * as supabaseStore from '@/lib/store/supabase-store';

export type StoreBackend = 'supabase' | 'file';

let degradedReason: string | null = null;
let warned = false;

/**
 * Resolves the backend to actually use. Supabase being *configured* proves
 * nothing: the schema still has to have been applied. If it is configured but
 * unusable, fall back to files and say why, loudly, once.
 *
 * This follows the same rule as the rest of the pipeline: degrade, never fail.
 * Hard-failing here means a missing SQL migration takes the whole app down,
 * which is a miserable way to discover you forgot a setup step.
 */
/**
 * On a serverless host the file store is not a fallback, it is a trap. Each
 * invocation may land on a different container, so a run writes items to one
 * /tmp and the very next click looks them up in another and gets a 404. The app
 * looks like it works and quietly loses everything.
 *
 * So: degrade locally, refuse to pretend in production.
 */
function mustBeDurable(): boolean {
  if (process.env.BOB_REQUIRE_DURABLE_STORE === 'false') return false;
  return Boolean(process.env.VERCEL || process.env.BOB_REQUIRE_DURABLE_STORE);
}

export class StoreUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'StoreUnavailableError';
  }
}

async function resolveBackend(): Promise<typeof fileStore | typeof supabaseStore> {
  if (!supabaseStore.isSupabaseConfigured()) {
    degradedReason = null;
    if (mustBeDurable()) {
      throw new StoreUnavailableError(
        'This deployment has no durable storage. Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY (or SUPABASE_SERVICE_ROLE_KEY) in the Vercel project, then redeploy. Without them Bob would write to a container filesystem that vanishes between requests, which looks like it works and then loses everything.',
      );
    }
    return fileStore;
  }

  const health = await supabaseStore.checkReachable();
  if (health.ok) {
    degradedReason = null;
    return supabaseStore;
  }

  degradedReason = health.reason ?? 'Supabase is unreachable.';

  if (mustBeDurable()) {
    throw new StoreUnavailableError(
      `Supabase is configured but not usable, and this deployment has no safe fallback. ${degradedReason}`,
    );
  }

  if (!warned) {
    warned = true;
    console.warn(
      `[bob] Falling back to the local file store. ${degradedReason}`,
    );
  }
  return fileStore;
}

export async function activeBackend(): Promise<StoreBackend> {
  return (await resolveBackend()) === supabaseStore ? 'supabase' : 'file';
}

/**
 * Shown in the UI so nobody has to guess whether their data will survive the
 * next deploy. A deployed Bob on the file backend looks like it is working
 * right up until the function recycles, which is the worst way to find out.
 */
export async function storeStatus(): Promise<{
  backend: StoreBackend;
  durable: boolean;
  detail: string;
}> {
  let backend: StoreBackend;
  try {
    backend = await activeBackend();
  } catch (err) {
    // The status endpoint is how the UI explains the problem, so it is the one
    // caller that must survive an unusable store.
    return {
      backend: 'file',
      durable: false,
      detail: err instanceof Error ? err.message : String(err),
    };
  }

  if (backend === 'supabase') {
    return {
      backend,
      durable: true,
      detail: 'Runs, items and issues persist to Supabase.',
    };
  }

  if (degradedReason) {
    return {
      backend,
      durable: false,
      detail: `${degradedReason} Bob is using local JSON files in the meantime, so nothing is lost on your machine, but a deploy will not keep anything.`,
    };
  }

  return {
    backend,
    durable: false,
    detail:
      'Storing to local JSON files under .data/. Fine on your machine. On a serverless deploy this is lost between requests, so set the Supabase variables before relying on it.',
  };
}

const backend = resolveBackend;

// --- runs ------------------------------------------------------------------

export async function getRuns(): Promise<Run[]> {
  return (await backend()).getRuns();
}

export async function getRun(id: string): Promise<Run | null> {
  return (await backend()).getRun(id);
}

export async function getLatestRun(): Promise<Run | null> {
  const runs = await getRuns();
  return runs[0] ?? null;
}

export async function saveRun(run: Run): Promise<void> {
  return (await backend()).saveRun(run);
}

// --- items -----------------------------------------------------------------

export async function getItems(runId?: string): Promise<Item[]> {
  return (await backend()).getItems(runId);
}

export async function getItemsByIds(ids: string[]): Promise<Item[]> {
  return (await backend()).getItemsByIds(ids);
}

export async function saveItems(items: Item[]): Promise<void> {
  return (await backend()).saveItems(items);
}

export async function updateItem(
  id: string,
  patch: Partial<Item>,
): Promise<Item | null> {
  return (await backend()).updateItem(id, patch);
}

// --- directives ------------------------------------------------------------

export async function getDirectives(): Promise<Directive[]> {
  return (await backend()).getDirectives();
}

/** The standing guidance Bob carries into every future run. */
export async function getPersistentDirectives(): Promise<Directive[]> {
  const all = await getDirectives();
  return all.filter((d) => d.persistent);
}

export async function saveDirective(d: Directive): Promise<void> {
  return (await backend()).saveDirective(d);
}

export async function deleteDirective(id: string): Promise<void> {
  return (await backend()).deleteDirective(id);
}

// --- recipients & sources --------------------------------------------------

export async function getRecipients(): Promise<Recipient[]> {
  return (await backend()).getRecipients();
}

export async function saveRecipients(list: Recipient[]): Promise<void> {
  return (await backend()).saveRecipients(list);
}

export async function getSources(): Promise<SourceConfig[]> {
  return (await backend()).getSources();
}

export async function saveSources(list: SourceConfig[]): Promise<void> {
  return (await backend()).saveSources(list);
}

// --- issues ----------------------------------------------------------------

export async function getIssues(): Promise<Issue[]> {
  return (await backend()).getIssues();
}

export async function getIssue(id: string): Promise<Issue | null> {
  return (await backend()).getIssue(id);
}

export async function saveIssue(issue: Issue): Promise<void> {
  return (await backend()).saveIssue(issue);
}

// --- seen urls -------------------------------------------------------------

export async function getSeenUrls(): Promise<Set<string>> {
  return (await backend()).getSeenUrls();
}

export async function addSeenUrls(urls: string[]): Promise<void> {
  return (await backend()).addSeenUrls(urls);
}

// The email preview writer needs a directory even on the Supabase backend.
export { DATA_DIR } from '@/lib/store/file-store';
