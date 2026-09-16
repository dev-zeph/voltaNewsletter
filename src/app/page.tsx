'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { AudienceTag, IssueMode, Item, Section } from '@/lib/types';
import { useBobState } from '@/components/BobStateContext';
import { buildIssue, patchItem, sendErrand, startRun, type ItemPatch } from '@/components/api';
import { BobMessage } from '@/components/BobMessage';
import { FilterBar, type DeskFilters } from '@/components/FilterBar';
import { Board } from '@/components/Board';
import { ErrandBox } from '@/components/ErrandBox';
import { ErrorNote } from '@/components/ErrorNote';
import { Button } from '@/components/Button';
import { cn } from '@/components/cn';

const PROGRESS_MESSAGES = [
  'Bob is checking Volta’s own channels.',
  'Bob is scanning for funding news.',
  'Bob is reading through event listings.',
  'Bob is weighing what he found.',
  'Bob is writing up his notes.',
];

const DEFAULT_FILTERS: DeskFilters = {
  section: 'all',
  audience: 'all',
  hideDropped: false,
  minScore: 0,
};

export default function DeskPage() {
  const { state, setState, loading, error, reachable, refetch } = useBobState();
  const router = useRouter();

  const [filters, setFilters] = useState<DeskFilters>(DEFAULT_FILTERS);
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [itemError, setItemError] = useState<string | null>(null);

  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState<string | null>(null);
  const [progressMessage, setProgressMessage] = useState<string | null>(null);

  const [issueMode, setIssueMode] = useState<IssueMode>('single');
  const [building, setBuilding] = useState(false);
  const [buildError, setBuildError] = useState<string | null>(null);

  useEffect(() => {
    if (!running) {
      setProgressMessage(null);
      return;
    }
    let i = 0;
    setProgressMessage(PROGRESS_MESSAGES[0]);
    const interval = setInterval(() => {
      i = (i + 1) % PROGRESS_MESSAGES.length;
      setProgressMessage(PROGRESS_MESSAGES[i]);
    }, 3500);
    return () => clearInterval(interval);
  }, [running]);

  const handleSendOut = useCallback(async () => {
    setRunning(true);
    setRunError(null);
    try {
      const { run, items } = await startRun();
      setState((s) => (s ? { ...s, latestRun: run, items } : s));
    } catch (e) {
      setRunError(e instanceof Error ? e.message : 'Bob ran into a problem out there.');
    } finally {
      setRunning(false);
    }
  }, [setState]);

  const handleErrand = useCallback(
    async (text: string) => {
      setRunning(true);
      setRunError(null);
      try {
        const { run, items, directive } = await sendErrand(text);
        setState((s) => {
          if (!s) return s;
          const directives = s.directives.some((d) => d.id === directive.id)
            ? s.directives
            : [...s.directives, directive];
          return { ...s, latestRun: run, items, directives };
        });
      } catch (e) {
        setRunError(e instanceof Error ? e.message : 'Bob ran into a problem out there.');
      } finally {
        setRunning(false);
      }
    },
    [setState]
  );

  const handleRemoveDirective = useCallback(
    (id: string) => {
      // No delete endpoint exists yet for directives, so this only clears it from
      // view for this session. It will come back on the next full state load.
      setState((s) => (s ? { ...s, directives: s.directives.filter((d) => d.id !== id) } : s));
    },
    [setState]
  );

  const applyItemPatch = useCallback(
    async (id: string, patch: ItemPatch, optimisticItem: Item) => {
      const previousItem = state?.items.find((it) => it.id === id) ?? null;
      setBusyId(id);
      setItemError(null);
      setState((s) => (s ? { ...s, items: s.items.map((it) => (it.id === id ? optimisticItem : it)) } : s));
      try {
        const { item } = await patchItem(id, patch);
        setState((s) => (s ? { ...s, items: s.items.map((it) => (it.id === id ? item : it)) } : s));
      } catch (e) {
        if (previousItem) {
          const restored = previousItem;
          setState((s) => (s ? { ...s, items: s.items.map((it) => (it.id === id ? restored : it)) } : s));
        }
        setItemError(e instanceof Error ? e.message : 'Could not save that change.');
      } finally {
        setBusyId(null);
      }
    },
    [state, setState]
  );

  function findItem(id: string): Item | undefined {
    return state?.items.find((it) => it.id === id);
  }

  const handleKeep = (id: string) => {
    const item = findItem(id);
    if (item) applyItemPatch(id, { decision: 'keep' }, { ...item, decision: 'keep' });
  };
  const handleDrop = (id: string) => {
    const item = findItem(id);
    if (item) applyItemPatch(id, { decision: 'drop' }, { ...item, decision: 'drop' });
  };
  const handleUndo = (id: string) => {
    const item = findItem(id);
    if (item) applyItemPatch(id, { decision: 'pending' }, { ...item, decision: 'pending' });
  };
  const handleToggleDig = (id: string) => {
    const item = findItem(id);
    if (item) applyItemPatch(id, { digDeeper: !item.digDeeper }, { ...item, digDeeper: !item.digDeeper });
  };
  const handleSectionChange = (id: string, section: Section) => {
    const item = findItem(id);
    if (item) applyItemPatch(id, { section }, { ...item, section });
  };
  const handleToggleAudience = (id: string, audience: AudienceTag) => {
    const item = findItem(id);
    if (!item) return;
    const audiences = item.audiences.includes(audience)
      ? item.audiences.filter((a) => a !== audience)
      : [...item.audiences, audience];
    applyItemPatch(id, { audiences }, { ...item, audiences });
  };

  async function handleBuildIssue() {
    if (!state?.latestRun) return;
    setBuilding(true);
    setBuildError(null);
    try {
      const { issue, items } = await buildIssue(state.latestRun.id, issueMode);
      setState((s) => (s ? { ...s, issues: [issue, ...s.issues], items } : s));
      router.push(`/compose?issue=${issue.id}`);
    } catch (e) {
      setBuildError(e instanceof Error ? e.message : 'Could not build the newsletter.');
    } finally {
      setBuilding(false);
    }
  }

  const items = state?.items ?? [];
  const keptCount = items.filter((i) => i.decision === 'keep').length;
  const dropCount = items.filter((i) => i.decision === 'drop').length;
  const pendingCount = items.filter((i) => i.decision === 'pending').length;

  return (
    <div className="flex min-h-screen flex-col">
      <BobMessage
        run={state?.latestRun ?? null}
        running={running}
        progressMessage={progressMessage}
        runError={runError}
        onSendOut={handleSendOut}
      />

      {!loading && !state && (
        <div className="px-4 py-3 md:px-6">
          <ErrorNote
            message={error ?? 'Could not load Bob.'}
            unreachable={!reachable}
            onRetry={refetch}
          />
        </div>
      )}

      <FilterBar
        filters={filters}
        onChange={setFilters}
        counts={{ keep: keptCount, drop: dropCount, pending: pendingCount }}
      />

      <div className="flex-1 px-4 py-5 md:px-6">
        {itemError && (
          <div className="mb-4">
            <ErrorNote message={itemError} onRetry={() => setItemError(null)} />
          </div>
        )}
        <Board
          items={items}
          hasRun={Boolean(state?.latestRun)}
          loading={(loading && !state) || running}
          filters={filters}
          focusedId={focusedId}
          busyId={busyId}
          onFocusCard={setFocusedId}
          onKeep={handleKeep}
          onDrop={handleDrop}
          onUndo={handleUndo}
          onToggleDig={handleToggleDig}
          onSectionChange={handleSectionChange}
          onToggleAudience={handleToggleAudience}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] bg-white px-4 py-3 md:px-6">
        <div className="flex items-center gap-2 text-sm">
          <span className="text-[var(--muted)]">Newsletter mode:</span>
          <div className="inline-flex rounded-md border border-[var(--border)] p-0.5">
            <button
              type="button"
              onClick={() => setIssueMode('single')}
              className={cn(
                'rounded px-2 py-1 text-xs font-medium transition-colors',
                issueMode === 'single' ? 'bg-[var(--accent)] text-white' : 'text-[var(--muted)]'
              )}
            >
              One for everyone
            </button>
            <button
              type="button"
              onClick={() => setIssueMode('segmented')}
              className={cn(
                'rounded px-2 py-1 text-xs font-medium transition-colors',
                issueMode === 'segmented' ? 'bg-[var(--accent)] text-white' : 'text-[var(--muted)]'
              )}
            >
              One per audience
            </button>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {buildError && <span className="text-xs text-red-600">{buildError}</span>}
          <Button
            variant="primary"
            onClick={handleBuildIssue}
            disabled={keptCount === 0 || building || !state?.latestRun}
            title={keptCount === 0 ? 'Keep at least one item before building the newsletter' : undefined}
          >
            {building ? 'Building.' : 'Build the newsletter'}
          </Button>
        </div>
      </div>

      <ErrandBox
        directives={state?.directives ?? []}
        running={running}
        onSubmit={handleErrand}
        onRemoveDirective={handleRemoveDirective}
      />
    </div>
  );
}
