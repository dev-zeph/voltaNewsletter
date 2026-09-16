import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type {
  Directive,
  Issue,
  Item,
  Recipient,
  Run,
  SourceConfig,
} from '@/lib/types';

/**
 * Supabase-backed store. This is the backend a deployed Bob uses, because
 * Vercel's filesystem is ephemeral and the JSON file store silently loses every
 * run between invocations.
 *
 * Each table keeps the record as jsonb plus the columns worth indexing, so the
 * shape stays aligned with src/lib/types.ts without a migration per field.
 * Run `supabase/schema.sql` once before pointing Bob at this.
 */

let client: SupabaseClient | null = null;

/**
 * Bob talks to Supabase only from server code, so the un-prefixed names are
 * preferred: a NEXT_PUBLIC_ variable is inlined into the client bundle whether
 * or not the browser needs it. The NEXT_PUBLIC_ names are still accepted
 * because that is what the Supabase dashboard hands you.
 */
function supabaseUrl(): string | undefined {
  return (
    process.env.SUPABASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  );
}

function supabaseKey(): string | undefined {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim()
  );
}

export function isSupabaseConfigured(): boolean {
  return Boolean(supabaseUrl() && supabaseKey());
}

function db(): SupabaseClient {
  if (client) return client;

  // Prefer the service-role key when it is present: Bob is entirely
  // server-side, so it never needs the browser-safe key, and the service key is
  // what lets you turn RLS on without locking Bob out.
  const url = supabaseUrl();
  const key = supabaseKey();

  if (!url || !key) {
    throw new Error(
      'Supabase store selected but NEXT_PUBLIC_SUPABASE_URL or a key is missing.',
    );
  }

  client = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

/** Rows come back as `{ data }`; unwrap to the record the app expects. */
function unwrap<T>(rows: Array<{ data: unknown }> | null): T[] {
  return (rows ?? []).map((r) => r.data as T);
}

/**
 * Cheap probe: is Supabase not just configured, but actually usable? Being
 * configured proves nothing, the schema still has to have been applied.
 * Memoized, so this costs one request per process.
 */
let reachable: Promise<{ ok: boolean; reason?: string }> | null = null;

export function checkReachable(): Promise<{ ok: boolean; reason?: string }> {
  if (reachable) return reachable;

  reachable = (async () => {
    try {
      const { error: readError } = await db().from('bob_runs').select('id').limit(1);

      if (readError) {
        // PGRST205 is "table not in the schema cache", which in practice means
        // supabase/schema.sql has not been run yet.
        const missingSchema =
          readError.code === 'PGRST205' ||
          /could not find the table/i.test(readError.message);

        return {
          ok: false,
          reason: missingSchema
            ? 'Supabase is configured but the tables do not exist. Run supabase/schema.sql in the Supabase SQL editor.'
            : `Supabase rejected a read: ${readError.message}`,
        };
      }

      // A read proves nothing. Bob's entire job is writing, and with RLS on,
      // SELECT can succeed while every INSERT is refused. Probing with a read
      // alone picked the Supabase backend and then failed on the first save.
      const probe = `bob-healthcheck-${Date.now()}`;
      const { error: writeError } = await db()
        .from('bob_seen_urls')
        .upsert({ url: probe });

      if (writeError) {
        // 42501 is Postgres "insufficient privilege", which here always means
        // RLS is on and the anon key has no policy allowing writes.
        const rls =
          writeError.code === '42501' ||
          /row-level security/i.test(writeError.message);

        return {
          ok: false,
          reason: rls
            ? 'Supabase tables exist but row level security is blocking writes. Either set SUPABASE_SERVICE_ROLE_KEY, which is the secure fix, or run the RLS block at the bottom of supabase/schema.sql to turn RLS off on these tables.'
            : `Supabase refused a write: ${writeError.message}`,
        };
      }

      await db().from('bob_seen_urls').delete().eq('url', probe);
      return { ok: true };
    } catch (err) {
      return {
        ok: false,
        reason: err instanceof Error ? err.message : String(err),
      };
    }
  })();

  return reachable;
}

// --- runs ------------------------------------------------------------------

export async function getRuns(): Promise<Run[]> {
  const { data, error } = await db()
    .from('bob_runs')
    .select('data')
    .order('started_at', { ascending: false })
    .limit(50);
  if (error) throw new Error(`getRuns: ${error.message}`);
  return unwrap<Run>(data);
}

export async function getRun(id: string): Promise<Run | null> {
  const { data, error } = await db()
    .from('bob_runs')
    .select('data')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`getRun: ${error.message}`);
  return (data?.data as Run) ?? null;
}

export async function saveRun(run: Run): Promise<void> {
  const { error } = await db()
    .from('bob_runs')
    .upsert({ id: run.id, started_at: run.startedAt, data: run });
  if (error) throw new Error(`saveRun: ${error.message}`);
}

// --- items -----------------------------------------------------------------

export async function getItems(runId?: string): Promise<Item[]> {
  let query = db().from('bob_items').select('data').order('score', { ascending: false });
  if (runId) query = query.eq('run_id', runId);
  const { data, error } = await query.limit(500);
  if (error) throw new Error(`getItems: ${error.message}`);
  return unwrap<Item>(data);
}

export async function getItemsByIds(ids: string[]): Promise<Item[]> {
  if (!ids.length) return [];
  const { data, error } = await db().from('bob_items').select('data').in('id', ids);
  if (error) throw new Error(`getItemsByIds: ${error.message}`);
  // Preserve the caller's ordering: issue sections depend on it.
  const byId = new Map(unwrap<Item>(data).map((i) => [i.id, i]));
  return ids.map((id) => byId.get(id)).filter((i): i is Item => Boolean(i));
}

export async function saveItems(incoming: Item[]): Promise<void> {
  if (!incoming.length) return;
  const { error } = await db().from('bob_items').upsert(
    incoming.map((item) => ({
      id: item.id,
      run_id: item.runId,
      score: item.score,
      data: item,
    })),
  );
  if (error) throw new Error(`saveItems: ${error.message}`);
}

export async function updateItem(
  id: string,
  patch: Partial<Item>,
): Promise<Item | null> {
  const { data, error } = await db()
    .from('bob_items')
    .select('data')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`updateItem read: ${error.message}`);
  if (!data) return null;

  const current = data.data as Item;
  const next: Item = { ...current, ...patch, id: current.id };

  const { error: writeError } = await db()
    .from('bob_items')
    .update({ score: next.score, data: next })
    .eq('id', id);
  if (writeError) throw new Error(`updateItem write: ${writeError.message}`);

  return next;
}

// --- directives ------------------------------------------------------------

export async function getDirectives(): Promise<Directive[]> {
  const { data, error } = await db()
    .from('bob_directives')
    .select('data')
    .order('created_at', { ascending: true })
    .limit(100);
  if (error) throw new Error(`getDirectives: ${error.message}`);
  return unwrap<Directive>(data);
}

export async function saveDirective(d: Directive): Promise<void> {
  const { error } = await db().from('bob_directives').upsert({
    id: d.id,
    created_at: d.createdAt,
    persistent: d.persistent,
    data: d,
  });
  if (error) throw new Error(`saveDirective: ${error.message}`);
}

export async function deleteDirective(id: string): Promise<void> {
  const { error } = await db().from('bob_directives').delete().eq('id', id);
  if (error) throw new Error(`deleteDirective: ${error.message}`);
}

// --- recipients & sources --------------------------------------------------

/**
 * These two are saved as a whole array by the UI, so a save is "make the table
 * match this list": upsert everything given, then delete whatever is no longer
 * in it. Done in that order so a failure never leaves the table empty.
 */
async function replaceAll<T extends { id: string }>(
  table: string,
  rows: T[],
): Promise<void> {
  if (rows.length) {
    const { error } = await db()
      .from(table)
      .upsert(rows.map((r) => ({ id: r.id, data: r })));
    if (error) throw new Error(`${table} upsert: ${error.message}`);
  }

  const keep = rows.map((r) => r.id);
  const query = db().from(table).delete();
  const { error: delError } = keep.length
    ? await query.not('id', 'in', `(${keep.map((id) => `"${id}"`).join(',')})`)
    : await query.neq('id', '');
  if (delError) throw new Error(`${table} prune: ${delError.message}`);
}

export async function getRecipients(): Promise<Recipient[]> {
  const { data, error } = await db().from('bob_recipients').select('data');
  if (error) throw new Error(`getRecipients: ${error.message}`);
  return unwrap<Recipient>(data);
}

export async function saveRecipients(list: Recipient[]): Promise<void> {
  await replaceAll('bob_recipients', list);
}

export async function getSources(): Promise<SourceConfig[]> {
  const { data, error } = await db().from('bob_sources').select('data');
  if (error) throw new Error(`getSources: ${error.message}`);
  return unwrap<SourceConfig>(data);
}

export async function saveSources(list: SourceConfig[]): Promise<void> {
  await replaceAll('bob_sources', list);
}

// --- issues ----------------------------------------------------------------

export async function getIssues(): Promise<Issue[]> {
  const { data, error } = await db()
    .from('bob_issues')
    .select('data')
    .order('created_at', { ascending: false })
    .limit(100);
  if (error) throw new Error(`getIssues: ${error.message}`);
  return unwrap<Issue>(data);
}

export async function getIssue(id: string): Promise<Issue | null> {
  const { data, error } = await db()
    .from('bob_issues')
    .select('data')
    .eq('id', id)
    .maybeSingle();
  if (error) throw new Error(`getIssue: ${error.message}`);
  return (data?.data as Issue) ?? null;
}

export async function saveIssue(issue: Issue): Promise<void> {
  const { error } = await db()
    .from('bob_issues')
    .upsert({ id: issue.id, created_at: issue.createdAt, data: issue });
  if (error) throw new Error(`saveIssue: ${error.message}`);
}

// --- seen urls -------------------------------------------------------------

export async function getSeenUrls(): Promise<Set<string>> {
  const { data, error } = await db()
    .from('bob_seen_urls')
    .select('url')
    .order('seen_at', { ascending: false })
    .limit(2000);
  if (error) throw new Error(`getSeenUrls: ${error.message}`);
  return new Set((data ?? []).map((r) => r.url as string));
}

export async function addSeenUrls(urls: string[]): Promise<void> {
  if (!urls.length) return;
  const now = new Date().toISOString();
  const { error } = await db()
    .from('bob_seen_urls')
    .upsert(urls.map((url) => ({ url, seen_at: now })));
  if (error) throw new Error(`addSeenUrls: ${error.message}`);
}
