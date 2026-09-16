'use client';

import { useState, type FormEvent } from 'react';
import type { SourceConfig, SourceKind } from '@/lib/types';
import { useBobState } from '@/components/BobStateContext';
import { saveSources } from '@/components/api';
import { Button } from '@/components/Button';
import { Pill } from '@/components/Pill';
import { ErrorNote } from '@/components/ErrorNote';
import { EmptyState } from '@/components/EmptyState';
import { Skeleton } from '@/components/Skeleton';
import { formatMs, formatNumber } from '@/lib/ui/format';

const KIND_LABELS: Record<SourceKind, string> = {
  rss: 'RSS feed',
  html: 'Web page (scraped)',
  gnews: 'Google News search',
};

export default function SourcesPage() {
  const { state, setState, loading, error, reachable, refetch } = useBobState();

  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [form, setForm] = useState<{ name: string; kind: SourceKind; url: string }>({
    name: '',
    kind: 'rss',
    url: '',
  });
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  if (!loading && !state) {
    return (
      <div className="px-4 py-5 md:px-6">
        <ErrorNote message={error ?? 'Could not load Bob.'} unreachable={!reachable} onRetry={refetch} />
      </div>
    );
  }

  if (loading && !state) {
    return (
      <div className="space-y-3 px-4 py-5 md:px-6">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  const sources = state?.sources ?? [];
  const connected = sources.filter((s) => s.tier === 0);
  const adminLocked = sources.filter((s) => s.tier === 1 || s.tier === 2);
  const paidLocked = sources.filter((s) => s.tier === 3);
  const statsFor = (id: string) => state?.latestRun?.sourceStats.find((s) => s.sourceId === id);

  async function persist(next: SourceConfig[], rollback: SourceConfig[]): Promise<boolean> {
    setState((s) => (s ? { ...s, sources: next } : s));
    try {
      const { sources: saved } = await saveSources(next);
      setState((s) => (s ? { ...s, sources: saved } : s));
      return true;
    } catch (e) {
      setState((s) => (s ? { ...s, sources: rollback } : s));
      setActionError(e instanceof Error ? e.message : 'Could not save the sources list.');
      return false;
    }
  }

  async function handleToggle(id: string) {
    if (!state) return;
    const previous = state.sources;
    const next = state.sources.map((s) => (s.id === id ? { ...s, enabled: !s.enabled } : s));
    setBusyId(id);
    setActionError(null);
    await persist(next, previous);
    setBusyId(null);
  }

  async function handleAddSource(e: FormEvent) {
    e.preventDefault();
    if (!state) return;
    const name = form.name.trim();
    const url = form.url.trim();
    if (!name || !url) {
      setAddError('Give the source a name and a URL or search query.');
      return;
    }
    const source: SourceConfig = {
      id: crypto.randomUUID(),
      name,
      kind: form.kind,
      url,
      enabled: true,
      tier: 0,
      authority: 0.5,
      builtin: false,
    };
    const previous = state.sources;
    const next = [...state.sources, source];
    setAdding(true);
    setAddError(null);
    const ok = await persist(next, previous);
    setAdding(false);
    if (ok) {
      setForm({ name: '', kind: 'rss', url: '' });
    } else {
      setAddError('Could not add that source.');
    }
  }

  return (
    <div className="space-y-8 px-4 py-5 md:px-6">
      <div>
        <h1 className="text-lg font-semibold text-[var(--foreground)]">Sources</h1>
        <p className="text-sm text-[var(--muted)]">
          Where Bob looks, and what it would take to unlock the sources that are not on yet.
        </p>
      </div>

      {actionError && <ErrorNote message={actionError} onRetry={() => setActionError(null)} />}

      {/* Connected sources */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-[var(--foreground)]">
          Connected <span className="font-normal text-[var(--muted-2)]">({connected.length})</span>
        </h2>
        {connected.length === 0 ? (
          <EmptyState title="No connected sources" description="Add one below to get Bob started." />
        ) : (
          <div className="space-y-2">
            {connected.map((source) => {
              const stat = statsFor(source.id);
              return (
                <div
                  key={source.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--border)] bg-white p-3"
                >
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-[var(--foreground)]">{source.name}</span>
                      <Pill tone="neutral">{KIND_LABELS[source.kind]}</Pill>
                      <span className="text-xs text-[var(--muted-2)]">authority {source.authority.toFixed(2)}</span>
                    </div>
                    <p className="truncate text-xs text-[var(--muted)]" title={source.url}>
                      {source.url}
                    </p>
                    {stat ? (
                      <p className="text-xs">
                        {stat.ok ? (
                          <span className="text-emerald-700">
                            Last run: {formatNumber(stat.count)} items in {formatMs(stat.ms)}
                          </span>
                        ) : (
                          <span className="text-red-600">Last run failed: {stat.error ?? 'unknown error'}</span>
                        )}
                      </p>
                    ) : (
                      <p className="text-xs text-[var(--muted-2)]">No run yet.</p>
                    )}
                  </div>
                  <label className="flex shrink-0 items-center gap-2 text-xs text-[var(--muted)]">
                    {source.enabled ? 'On' : 'Off'}
                    <input
                      type="checkbox"
                      checked={source.enabled}
                      disabled={busyId === source.id}
                      onChange={() => handleToggle(source.id)}
                      className="h-4 w-7 accent-[var(--accent)]"
                    />
                  </label>
                </div>
              );
            })}
          </div>
        )}

        <form
          onSubmit={handleAddSource}
          className="flex flex-wrap items-end gap-2 rounded-lg border border-dashed border-[var(--border)] bg-white p-3"
        >
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-[var(--muted)]">Name</label>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="Source name"
              className="w-44 rounded-md border border-[var(--border)] bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium text-[var(--muted)]">Kind</label>
            <select
              value={form.kind}
              onChange={(e) => setForm((f) => ({ ...f, kind: e.target.value as SourceKind }))}
              className="rounded-md border border-[var(--border)] bg-white px-2 py-1.5 text-sm"
            >
              <option value="rss">RSS feed</option>
              <option value="html">Web page</option>
              <option value="gnews">Google News query</option>
            </select>
          </div>
          <div className="flex flex-1 flex-col gap-1">
            <label className="text-xs font-medium text-[var(--muted)]">
              {form.kind === 'gnews' ? 'Google News search query' : 'URL'}
            </label>
            <input
              value={form.url}
              onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
              placeholder={form.kind === 'gnews' ? 'e.g. Halifax startup funding' : 'https://'}
              className="min-w-[200px] flex-1 rounded-md border border-[var(--border)] bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
            />
          </div>
          <Button type="submit" variant="primary" disabled={adding}>
            {adding ? 'Adding.' : 'Add a source'}
          </Button>
        </form>
        {addError && <ErrorNote message={addError} onRetry={() => setAddError(null)} />}
      </section>

      {/* Available with access */}
      {(adminLocked.length > 0 || paidLocked.length > 0) && (
        <section className="space-y-6">
          <h2 className="text-sm font-semibold text-[var(--foreground)]">Available with access</h2>

          {adminLocked.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted-2)]">
                Needs a Volta admin to approve
              </p>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {adminLocked.map((source) => (
                  <LockedSourceCard key={source.id} source={source} />
                ))}
              </div>
            </div>
          )}

          {paidLocked.length > 0 && (
            <div className="space-y-2">
              <p className="text-xs font-medium uppercase tracking-wide text-[var(--muted-2)]">
                Needs a paid API key
              </p>
              <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {paidLocked.map((source) => (
                  <LockedSourceCard key={source.id} source={source} />
                ))}
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}

function LockedSourceCard({ source }: { source: SourceConfig }) {
  return (
    <div className="space-y-2 rounded-lg border border-[var(--border)] bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium text-[var(--foreground)]">{source.name}</span>
        {/* No kind pill here. These are not connected, so "Web page (scraped)"
            describes a placeholder rather than how the source would actually be
            read, and it reads as a mistake next to LinkedIn or Crunchbase. */}
        <Pill tone="accent">Tier {source.tier}</Pill>
      </div>
      {source.requires && (
        <p className="rounded-md border border-[var(--border)] bg-[var(--surface-hover)] px-2.5 py-2 text-sm text-[var(--muted)]">
          {source.requires}
        </p>
      )}
      {source.homepage && (
        <a
          href={source.homepage}
          target="_blank"
          rel="noreferrer"
          className="inline-block text-xs text-[var(--accent-strong)] hover:underline"
        >
          {source.homepage}
        </a>
      )}
    </div>
  );
}
