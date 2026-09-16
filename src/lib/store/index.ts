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

export function activeBackend(): StoreBackend {
  return supabaseStore.isSupabaseConfigured() ? 'supabase' : 'file';
}

/**
 * Shown in the UI so nobody has to guess whether their data will survive the
 * next deploy. A deployed Bob on the file backend looks like it is working
 * right up until the function recycles, which is the worst way to find out.
 */
export function storeStatus(): {
  backend: StoreBackend;
  durable: boolean;
  detail: string;
} {
  if (activeBackend() === 'supabase') {
    return {
      backend: 'supabase',
      durable: true,
      detail: 'Runs, items and issues persist to Supabase.',
    };
  }
  return {
    backend: 'file',
    durable: false,
    detail:
      'Storing to local JSON files under .data/. Fine on your machine. On a serverless deploy this is lost between requests, so set the Supabase variables before relying on it.',
  };
}

const backend = () =>
  activeBackend() === 'supabase' ? supabaseStore : fileStore;

// --- runs ------------------------------------------------------------------

export function getRuns(): Promise<Run[]> {
  return backend().getRuns();
}

export function getRun(id: string): Promise<Run | null> {
  return backend().getRun(id);
}

export async function getLatestRun(): Promise<Run | null> {
  const runs = await getRuns();
  return runs[0] ?? null;
}

export function saveRun(run: Run): Promise<void> {
  return backend().saveRun(run);
}

// --- items -----------------------------------------------------------------

export function getItems(runId?: string): Promise<Item[]> {
  return backend().getItems(runId);
}

export function getItemsByIds(ids: string[]): Promise<Item[]> {
  return backend().getItemsByIds(ids);
}

export function saveItems(items: Item[]): Promise<void> {
  return backend().saveItems(items);
}

export function updateItem(
  id: string,
  patch: Partial<Item>,
): Promise<Item | null> {
  return backend().updateItem(id, patch);
}

// --- directives ------------------------------------------------------------

export function getDirectives(): Promise<Directive[]> {
  return backend().getDirectives();
}

/** The standing guidance Bob carries into every future run. */
export async function getPersistentDirectives(): Promise<Directive[]> {
  const all = await getDirectives();
  return all.filter((d) => d.persistent);
}

export function saveDirective(d: Directive): Promise<void> {
  return backend().saveDirective(d);
}

export function deleteDirective(id: string): Promise<void> {
  return backend().deleteDirective(id);
}

// --- recipients & sources --------------------------------------------------

export function getRecipients(): Promise<Recipient[]> {
  return backend().getRecipients();
}

export function saveRecipients(list: Recipient[]): Promise<void> {
  return backend().saveRecipients(list);
}

export function getSources(): Promise<SourceConfig[]> {
  return backend().getSources();
}

export function saveSources(list: SourceConfig[]): Promise<void> {
  return backend().saveSources(list);
}

// --- issues ----------------------------------------------------------------

export function getIssues(): Promise<Issue[]> {
  return backend().getIssues();
}

export function getIssue(id: string): Promise<Issue | null> {
  return backend().getIssue(id);
}

export function saveIssue(issue: Issue): Promise<void> {
  return backend().saveIssue(issue);
}

// --- seen urls -------------------------------------------------------------

export function getSeenUrls(): Promise<Set<string>> {
  return backend().getSeenUrls();
}

export function addSeenUrls(urls: string[]): Promise<void> {
  return backend().addSeenUrls(urls);
}

// The email preview writer needs a directory even on the Supabase backend.
export { DATA_DIR } from '@/lib/store/file-store';
