'use client';

import type { Run } from '@/lib/types';
import { Button } from '@/components/Button';
import { Pill } from '@/components/Pill';
import { formatDateTime, formatMs, formatRelativeTime } from '@/lib/ui/format';
import { cn } from '@/components/cn';

const THREE_DAYS_MS = 3 * 24 * 60 * 60 * 1000;

function isStale(run: Run | null): boolean {
  if (!run) return true;
  if (run.status === 'error') return true;
  const finished = run.finishedAt ?? run.startedAt;
  return Date.now() - new Date(finished).getTime() > THREE_DAYS_MS;
}

export function BobMessage({
  run,
  running,
  progressMessage,
  runError,
  onSendOut,
}: {
  run: Run | null;
  running: boolean;
  progressMessage: string | null;
  runError: string | null;
  onSendOut: () => void;
}) {
  const stale = isStale(run);

  return (
    <div className="border-b border-[var(--border)] bg-white px-4 py-5 md:px-6">
      <div className="flex gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-sm font-semibold text-white">
          B
        </span>
        <div className="min-w-0 flex-1 space-y-3">
          {running ? (
            <div className="space-y-1.5">
              <p className="text-sm font-medium text-[var(--foreground)]">
                {progressMessage ?? 'Bob is working.'}
              </p>
              <div className="h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-[var(--surface-hover)]">
                <div className="h-full w-1/3 animate-[bob-progress_1.4s_ease-in-out_infinite] rounded-full bg-[var(--accent)]" />
              </div>
            </div>
          ) : run ? (
            <div className="space-y-2">
              <p className="whitespace-pre-line text-sm leading-relaxed text-[var(--foreground)]">
                {run.message}
              </p>
              <p className="text-xs text-[var(--muted-2)]" title={formatDateTime(run.finishedAt ?? run.startedAt)}>
                {run.status === 'error' ? 'Errored ' : 'Finished '}
                {formatRelativeTime(run.finishedAt ?? run.startedAt)}
              </p>
              {run.sourceStats.length > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {run.sourceStats.map((s) => (
                    <Pill
                      key={s.sourceId}
                      tone={s.ok ? 'ok' : 'error'}
                      title={s.ok ? `${formatMs(s.ms)}` : s.error ?? 'Failed'}
                    >
                      {s.name} {s.ok ? `· ${s.count}` : '· failed'}
                    </Pill>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <p className="text-sm text-[var(--muted)]">
              I have not been out yet. Send me out and I will bring back what Volta&apos;s sources have.
            </p>
          )}

          {runError && (
            <p className="text-sm text-red-600">
              I ran into a problem: {runError}
            </p>
          )}

          {(!run || stale) && !running && (
            <Button variant="primary" onClick={onSendOut} className={cn(!run && 'mt-1')}>
              Send Bob out
            </Button>
          )}
          {run && !stale && !running && (
            <Button variant="secondary" size="sm" onClick={onSendOut}>
              Send Bob out again
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
