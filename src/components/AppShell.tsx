'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { BobStateProvider, useBobState } from '@/components/BobStateContext';
import { cn } from '@/components/cn';
import { formatRelativeTime } from '@/lib/ui/format';

const NAV_ITEMS: Array<{ href: string; label: string }> = [
  { href: '/', label: "Bob's Desk" },
  { href: '/compose', label: 'Compose' },
  { href: '/recipients', label: 'Recipients' },
  { href: '/sources', label: 'Sources' },
  { href: '/archive', label: 'Archive' },
];

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <BobStateProvider>
      <Shell>{children}</Shell>
    </BobStateProvider>
  );
}

function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="flex flex-col gap-4 border-b border-[var(--border)] bg-white px-4 py-3 md:w-60 md:shrink-0 md:border-b-0 md:border-r md:px-5 md:py-6">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-md bg-[var(--accent)] text-sm font-semibold text-white">
            B
          </span>
          <div className="leading-tight">
            <p className="text-sm font-semibold text-[var(--foreground)]">Bob</p>
            <p className="label-eyebrow text-[10px] text-[var(--muted-2)]">for Volta</p>
          </div>
        </div>

        <nav className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
          {NAV_ITEMS.map((item) => {
            const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'shrink-0 rounded-md px-2.5 py-1.5 text-sm font-medium transition-colors',
                  active
                    ? 'bg-[var(--accent-soft)] text-[var(--accent-strong)]'
                    : 'text-[var(--muted)] hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]'
                )}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden md:mt-auto md:block">
          <StatusStrip />
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        <main className="min-w-0">{children}</main>
        <div className="border-t border-[var(--border)] bg-white px-4 py-3 md:hidden">
          <StatusStrip />
        </div>
      </div>
    </div>
  );
}

function StatusStrip() {
  const { state, loading, reachable } = useBobState();

  if (loading && !state) {
    return <p className="text-xs text-[var(--muted-2)]">Checking Bob&apos;s status.</p>;
  }

  if (!state) {
    return (
      <p className="text-xs text-red-600">
        {reachable ? 'Bob is not responding.' : 'API not reachable.'}
      </p>
    );
  }

  return (
    <dl className="space-y-1.5 text-xs text-[var(--muted)]">
      <div className="flex items-center justify-between gap-2">
        <dt className="label-eyebrow text-[10px] text-[var(--muted-2)]">Brain</dt>
        <dd
          className={cn(
            'inline-flex items-center gap-1 font-medium',
            state.llm ? 'text-emerald-700' : 'text-[var(--muted)]'
          )}
        >
          <span
            className={cn('h-1.5 w-1.5 rounded-full', state.llm ? 'bg-emerald-500' : 'bg-[var(--muted-2)]')}
          />
          {state.llm ? 'Claude enrichment' : 'Heuristic only'}
        </dd>
      </div>
      <div className="flex items-center justify-between gap-2">
        <dt className="label-eyebrow text-[10px] text-[var(--muted-2)]">Mail</dt>
        <dd
          className={cn(
            'inline-flex items-center gap-1 font-medium',
            state.transport.ready ? 'text-emerald-700' : 'text-amber-700'
          )}
          title={state.transport.detail}
        >
          <span
            className={cn(
              'h-1.5 w-1.5 rounded-full',
              state.transport.ready ? 'bg-emerald-500' : 'bg-amber-500'
            )}
          />
          {state.transport.transport === 'resend'
            ? 'Resend'
            : state.transport.transport === 'smtp'
              ? 'SMTP'
              : 'Dry run'}
        </dd>
      </div>
      {/* Whether anything Bob does actually survives. A deployed Bob on the
          file backend looks fine right up until the function recycles, so this
          row says so out loud rather than letting it be discovered later. */}
      <div className="flex items-center justify-between gap-2">
        <dt className="label-eyebrow text-[10px] text-[var(--muted-2)]">Storage</dt>
        <dd
          className={cn(
            'inline-flex items-center gap-1 font-medium',
            state.store?.durable ? 'text-emerald-700' : 'text-amber-700'
          )}
          title={state.store?.detail}
        >
          <span
            className={cn(
              'h-1.5 w-1.5 rounded-full',
              state.store?.durable ? 'bg-emerald-500' : 'bg-amber-500'
            )}
          />
          {state.store?.backend === 'supabase' ? 'Supabase' : 'Local files'}
        </dd>
      </div>
      <div className="flex items-center justify-between gap-2">
        <dt className="label-eyebrow text-[10px] text-[var(--muted-2)]">Last run</dt>
        <dd className="font-medium text-[var(--foreground)]">
          {state.latestRun ? formatRelativeTime(state.latestRun.finishedAt ?? state.latestRun.startedAt) : 'never'}
        </dd>
      </div>
    </dl>
  );
}
