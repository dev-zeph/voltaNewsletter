'use client';

import { useMemo } from 'react';
import { useBobState } from '@/components/BobStateContext';
import { previewUrl } from '@/components/api';
import { Pill } from '@/components/Pill';
import { ErrorNote } from '@/components/ErrorNote';
import { EmptyState } from '@/components/EmptyState';
import { Skeleton } from '@/components/Skeleton';
import { formatDateTime, formatNumber, pluralize } from '@/lib/ui/format';

export default function ArchivePage() {
  const { state, loading, error, reachable, refetch } = useBobState();

  const sortedIssues = useMemo(() => {
    const issues = state?.issues ?? [];
    return [...issues].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [state?.issues]);

  const sortedRuns = useMemo(() => {
    const runs = state?.runs ?? [];
    return [...runs].sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  }, [state?.runs]);

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
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-24 w-full" />
      </div>
    );
  }

  const hasAnything = sortedIssues.length > 0 || sortedRuns.length > 0;

  return (
    <div className="space-y-8 px-4 py-5 md:px-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-[var(--foreground)]">Archive</h1>
        <p className="text-sm text-[var(--muted)]">Past newsletters Bob has drafted, and past runs out to fetch.</p>
      </div>

      {!hasAnything ? (
        <EmptyState
          title="Nothing in the archive yet"
          description="Once Bob has been out and a newsletter has been built, they will show up here."
        />
      ) : (
        <>
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-[var(--foreground)]">
              Issues <span className="font-normal text-[var(--muted-2)]">({sortedIssues.length})</span>
            </h2>
            {sortedIssues.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">No issues have been built yet.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-[var(--border)] bg-white">
                <table className="w-full min-w-[640px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)] bg-[var(--surface-hover)] label-eyebrow text-left text-[11px] text-[var(--muted)]">
                      <th className="px-3 py-2 font-medium">Created</th>
                      <th className="px-3 py-2 font-medium">Subject</th>
                      <th className="px-3 py-2 font-medium">Mode</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                      <th className="px-3 py-2 font-medium">Recipients</th>
                      <th className="px-3 py-2" />
                    </tr>
                  </thead>
                  <tbody>
                    {sortedIssues.map((issue) => {
                      const totalRecipients = issue.sendLog.reduce((sum, entry) => sum + entry.recipients.length, 0);
                      return (
                        <tr key={issue.id} className="border-b border-[var(--border)] last:border-b-0">
                          <td className="whitespace-nowrap px-3 py-2 text-[var(--muted)]">
                            {formatDateTime(issue.createdAt)}
                          </td>
                          <td className="max-w-xs truncate px-3 py-2 text-[var(--foreground)]" title={issue.subject}>
                            {issue.subject || 'Untitled'}
                          </td>
                          <td className="px-3 py-2">
                            <Pill tone="neutral">{issue.mode === 'single' ? 'One for everyone' : 'Segmented'}</Pill>
                          </td>
                          <td className="px-3 py-2">
                            <Pill tone={issue.status === 'sent' ? 'ok' : 'neutral'}>{issue.status}</Pill>
                          </td>
                          <td className="px-3 py-2 text-[var(--muted)]">
                            {totalRecipients > 0 ? formatNumber(totalRecipients) : 'not sent'}
                          </td>
                          <td className="px-3 py-2 text-right">
                            <a
                              href={previewUrl(issue.id, 'all')}
                              target="_blank"
                              rel="noreferrer"
                              className="text-xs font-medium text-[var(--accent-strong)] hover:underline"
                            >
                              Preview
                            </a>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-[var(--foreground)]">
              Runs <span className="font-normal text-[var(--muted-2)]">({sortedRuns.length})</span>
            </h2>
            {sortedRuns.length === 0 ? (
              <p className="text-sm text-[var(--muted)]">Bob has not been out yet.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-[var(--border)] bg-white">
                <table className="w-full min-w-[640px] border-collapse text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border)] bg-[var(--surface-hover)] label-eyebrow text-left text-[11px] text-[var(--muted)]">
                      <th className="px-3 py-2 font-medium">Started</th>
                      <th className="px-3 py-2 font-medium">Trigger</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                      <th className="px-3 py-2 font-medium">Raw</th>
                      <th className="px-3 py-2 font-medium">Deduped</th>
                      <th className="px-3 py-2 font-medium">Surfaced</th>
                      <th className="px-3 py-2 font-medium">Sources</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedRuns.map((run) => {
                      const okSources = run.sourceStats.filter((s) => s.ok).length;
                      return (
                        <tr key={run.id} className="border-b border-[var(--border)] last:border-b-0">
                          <td className="whitespace-nowrap px-3 py-2 text-[var(--muted)]">
                            {formatDateTime(run.startedAt)}
                          </td>
                          <td className="px-3 py-2">
                            <Pill tone="neutral">{run.trigger}</Pill>
                          </td>
                          <td className="px-3 py-2">
                            <Pill tone={run.status === 'done' ? 'ok' : run.status === 'error' ? 'error' : 'neutral'}>
                              {run.status}
                            </Pill>
                          </td>
                          <td className="px-3 py-2 text-[var(--foreground)]">{formatNumber(run.rawCount)}</td>
                          <td className="px-3 py-2 text-[var(--foreground)]">{formatNumber(run.dedupedCount)}</td>
                          <td className="px-3 py-2 text-[var(--foreground)]">{formatNumber(run.surfacedCount)}</td>
                          <td className="px-3 py-2 text-[var(--muted)]">
                            {pluralize(okSources, 'source')} of {formatNumber(run.sourceStats.length)} succeeded
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
