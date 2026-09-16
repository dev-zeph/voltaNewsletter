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
async function resolveBackend(): Promise<typeof fileStore | typeof supabaseStore> {
  if (!supabaseStore.isSupabaseConfigured()) {
    degradedReason = null;
    return fileStore;
  }

  const health = await supabaseStore.checkReachable();
  if (health.ok) {
    degradedReason = null;
    return supabaseStore;
  }

  degradedReason = health.reason ?? 'Supabase is unreachable.';
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
  const backend = await activeBackend();

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
