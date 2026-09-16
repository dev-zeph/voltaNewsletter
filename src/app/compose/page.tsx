'use client';

import { Suspense, useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import type { AudienceTag, Issue, IssueMode, IssueSection, Item, SendLogEntry } from '@/lib/types';
import { AUDIENCE_LABELS, AUDIENCE_TAGS, SECTION_LABELS } from '@/lib/types';
import { useBobState } from '@/components/BobStateContext';
import { patchIssue, previewUrl, sendIssue } from '@/components/api';
import { Button } from '@/components/Button';
import { Pill } from '@/components/Pill';
import { ErrorNote } from '@/components/ErrorNote';
import { EmptyState } from '@/components/EmptyState';
import { Skeleton } from '@/components/Skeleton';
import { cn } from '@/components/cn';
import { formatDateTime, formatNumber, pluralize } from '@/lib/ui/format';

const SAVE_DEBOUNCE_MS = 600;

export default function ComposePage() {
  return (
    <Suspense fallback={<ComposeSkeleton />}>
      <ComposeInner />
    </Suspense>
  );
}

function ComposeSkeleton() {
  return (
    <div className="space-y-4 px-4 py-5 md:px-6">
      <Skeleton className="h-6 w-64" />
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-40 w-full" />
        </div>
        <Skeleton className="h-[60vh] w-full" />
      </div>
    </div>
  );
}

function ComposeInner() {
  const { state, setState, loading, error, reachable, refetch } = useBobState();
  const searchParams = useSearchParams();
  const paramIssueId = searchParams.get('issue');

  const sortedIssues = useMemo(() => {
    const issues = state?.issues ?? [];
    return [...issues].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [state?.issues]);

  const resolvedId = paramIssueId ?? sortedIssues[0]?.id ?? null;
  const issue = resolvedId ? (state?.issues.find((i) => i.id === resolvedId) ?? null) : null;

  if (!loading && !state) {
    return (
      <div className="px-4 py-5 md:px-6">
        <ErrorNote message={error ?? 'Could not load Bob.'} unreachable={!reachable} onRetry={refetch} />
      </div>
    );
  }

  if (loading && !state) {
    return <ComposeSkeleton />;
  }

  if (!issue) {
    return (
      <div className="px-4 py-5 md:px-6">
        <EmptyState
          title="Nothing to compose yet"
          description="There is no newsletter draft to edit. Keep a few cards on Bob's Desk and build the newsletter from there, then come back."
          action={
            <Link href="/">
              <Button variant="primary">Go to Bob's Desk</Button>
            </Link>
          }
        />
      </div>
    );
  }

  return <ComposeEditor key={issue.id} issue={issue} items={state?.items ?? []} recipients={state?.recipients ?? []} transportDetail={state?.transport.detail ?? ''} transportReady={state?.transport.ready ?? false} />;
}

function ComposeEditor({
  issue,
  items,
  recipients,
  transportDetail,
  transportReady,
}: {
  issue: Issue;
  items: Item[];
  recipients: import('@/lib/types').Recipient[];
  transportDetail: string;
  transportReady: boolean;
}) {
  const { state, setState } = useBobState();
  const locked = issue.status === 'sent';

  const itemsById = useMemo(() => new Map(items.map((it) => [it.id, it])), [items]);

  // Bumped on every successful save so the preview iframe key changes and reloads.
  const previewVersionRef = useRef(0);

  // ---- editable text fields, debounce-saved ----
  const [subject, setSubject] = useState(issue.subject);
  const [intro, setIntro] = useState(issue.intro);
  const [signoff, setSignoff] = useState(issue.signoff);
  const [saving, setSaving] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const dirtyRef = useRef(false);
  const savedFadeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setSubject(issue.subject);
    setIntro(issue.intro);
    setSignoff(issue.signoff);
    dirtyRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [issue.id]);

  useEffect(() => {
    if (!dirtyRef.current) return;
    const timer = setTimeout(async () => {
      setSaving(true);
      setFieldError(null);
      try {
        const { issue: updated } = await patchIssue(issue.id, { subject, intro, signoff });
        previewVersionRef.current += 1;
        setState((s) => (s ? { ...s, issues: s.issues.map((i) => (i.id === updated.id ? updated : i)) } : s));
        dirtyRef.current = false;
        setJustSaved(true);
        if (savedFadeTimer.current) clearTimeout(savedFadeTimer.current);
        savedFadeTimer.current = setTimeout(() => setJustSaved(false), 1800);
      } catch (e) {
        setSubject(issue.subject);
        setIntro(issue.intro);
        setSignoff(issue.signoff);
        setFieldError(e instanceof Error ? e.message : 'Could not save those changes.');
      } finally {
        setSaving(false);
      }
    }, SAVE_DEBOUNCE_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subject, intro, signoff]);

  function edit(setter: (v: string) => void) {
    return (v: string) => {
      dirtyRef.current = true;
      setter(v);
    };
  }

  // ---- mode + audience tabs ----
  const [modeError, setModeError] = useState<string | null>(null);
  const [modeSaving, setModeSaving] = useState(false);
  const [audience, setAudience] = useState<AudienceTag | 'all'>('all');

  useEffect(() => {
    if (issue.mode === 'single') setAudience('all');
    else setAudience((prev) => (prev === 'all' ? AUDIENCE_TAGS[0] : prev));
  }, [issue.mode]);

  async function handleModeChange(mode: IssueMode) {
    if (locked || mode === issue.mode) return;
    const previous = issue;
    setModeSaving(true);
    setModeError(null);
    setState((s) => (s ? { ...s, issues: s.issues.map((i) => (i.id === issue.id ? { ...i, mode } : i)) } : s));
    try {
      const { issue: updated } = await patchIssue(issue.id, { mode });
      previewVersionRef.current += 1;
      setState((s) => (s ? { ...s, issues: s.issues.map((i) => (i.id === updated.id ? updated : i)) } : s));
    } catch (e) {
      setState((s) => (s ? { ...s, issues: s.issues.map((i) => (i.id === issue.id ? previous : i)) } : s));
      setModeError(e instanceof Error ? e.message : 'Could not change the newsletter mode.');
    } finally {
      setModeSaving(false);
    }
  }

  const audienceCounts = useMemo(() => {
    const map = new Map<AudienceTag, number>();
    for (const tag of AUDIENCE_TAGS) {
      map.set(tag, recipients.filter((r) => r.active && r.tags.includes(tag)).length);
    }
    return map;
  }, [recipients]);

  // ---- sections ----
  const [sectionsError, setSectionsError] = useState<string | null>(null);

  async function persistSections(next: IssueSection[]) {
    if (locked) return;
    const previous = issue.sections;
    setSectionsError(null);
    setState((s) => (s ? { ...s, issues: s.issues.map((i) => (i.id === issue.id ? { ...i, sections: next } : i)) } : s));
    try {
      const { issue: updated } = await patchIssue(issue.id, { sections: next });
      previewVersionRef.current += 1;
      setState((s) => (s ? { ...s, issues: s.issues.map((i) => (i.id === updated.id ? updated : i)) } : s));
    } catch (e) {
      setState((s) => (s ? { ...s, issues: s.issues.map((i) => (i.id === issue.id ? { ...i, sections: previous } : i)) } : s));
      setSectionsError(e instanceof Error ? e.message : 'Could not save that change to the sections.');
    }
  }

  function moveSection(index: number, dir: -1 | 1) {
    const target = index + dir;
    if (target < 0 || target >= issue.sections.length) return;
    const next = [...issue.sections];
    [next[index], next[target]] = [next[target], next[index]];
    persistSections(next);
  }

  function moveItem(sectionIndex: number, itemIndex: number, dir: -1 | 1) {
    const ids = issue.sections[sectionIndex].itemIds;
    const target = itemIndex + dir;
    if (target < 0 || target >= ids.length) return;
    const next = issue.sections.map((s, i) => (i === sectionIndex ? { ...s, itemIds: [...s.itemIds] } : s));
    const list = next[sectionIndex].itemIds;
    [list[itemIndex], list[target]] = [list[target], list[itemIndex]];
    persistSections(next);
  }

  function removeItemFromSection(sectionIndex: number, itemId: string) {
    const next = issue.sections
      .map((s, i) => (i === sectionIndex ? { ...s, itemIds: s.itemIds.filter((id) => id !== itemId) } : s))
      .filter((s) => s.itemIds.length > 0);
    persistSections(next);
  }

  // ---- preview ----
  // versionRef bumps whenever a save actually lands, so the iframe key below
  // changes and the preview reloads. Derived at save time, not via an effect.
  const previewKey = `${issue.id}:${issue.mode}:${audience}:${previewVersionRef.current}`;
  const src = previewUrl(issue.id, issue.mode === 'segmented' ? audience : 'all');

  // ---- send panel ----
  const [testTo, setTestTo] = useState('');
  const [testSending, setTestSending] = useState(false);
  const [testError, setTestError] = useState<string | null>(null);
  const [testResults, setTestResults] = useState<SendLogEntry[] | null>(null);

  const [confirmingSend, setConfirmingSend] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);

  const activeRecipients = recipients.filter((r) => r.active);
  const totalRecipients = activeRecipients.length;
  const segmentedBreakdown = AUDIENCE_TAGS.map((tag) => ({
    tag,
    count: audienceCounts.get(tag) ?? 0,
  })).filter((row) => row.count > 0);

  async function handleTestSend(e: FormEvent) {
    e.preventDefault();
    if (!testTo.trim()) return;
    setTestSending(true);
    setTestError(null);
    try {
      const { issue: updated, results } = await sendIssue(issue.id, testTo.trim());
      setState((s) => (s ? { ...s, issues: s.issues.map((i) => (i.id === updated.id ? updated : i)) } : s));
      setTestResults(results);
    } catch (e2) {
      setTestError(e2 instanceof Error ? e2.message : 'Could not send the test email.');
    } finally {
      setTestSending(false);
    }
  }

  async function handleRealSend() {
    setSending(true);
    setSendError(null);
    try {
      const { issue: updated, results } = await sendIssue(issue.id);
      setState((s) => (s ? { ...s, issues: s.issues.map((i) => (i.id === updated.id ? updated : i)) } : s));
      setTestResults(results);
      setConfirmingSend(false);
    } catch (e) {
      setSendError(e instanceof Error ? e.message : 'Could not send the newsletter.');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="space-y-5 px-4 py-5 md:px-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <Link href="/" className="text-xs text-[var(--muted)] hover:text-[var(--accent-strong)] hover:underline">
            &larr; Back to Bob&apos;s Desk
          </Link>
          <h1 className="mt-1 text-lg font-semibold text-[var(--foreground)]">Compose the newsletter</h1>
        </div>
        <div className="flex items-center gap-2">
          {locked ? (
            <Pill tone="accent">Sent {formatDateTime(issue.sentAt)}</Pill>
          ) : (
            <span
              className={cn(
                'text-xs text-emerald-700 transition-opacity duration-700',
                justSaved ? 'opacity-100' : 'opacity-0'
              )}
            >
              Saved
            </span>
          )}
        </div>
      </div>

      {locked && (
        <div className="rounded-md border border-[var(--accent-border)] bg-[var(--accent-soft)] px-3 py-2 text-sm text-[var(--accent-strong)]">
          This issue has already gone out and is locked. You can still send another test copy below, but the
          subject, copy and sections can no longer change.
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:items-start">
        {/* Editor column */}
        <div className="space-y-5">
          {/* Mode toggle */}
          <div className="rounded-lg border border-[var(--border)] bg-white p-4">
            <p className="mb-2 text-sm font-medium text-[var(--foreground)]">Who gets what</p>
            <div className="inline-flex rounded-md border border-[var(--border)] p-0.5">
              <button
                type="button"
                onClick={() => handleModeChange('single')}
                disabled={locked || modeSaving}
                className={cn(
                  'rounded px-2.5 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed',
                  issue.mode === 'single' ? 'bg-[var(--accent)] text-white' : 'text-[var(--muted)]'
                )}
              >
                One email for everyone
              </button>
              <button
                type="button"
                onClick={() => handleModeChange('segmented')}
                disabled={locked || modeSaving}
                className={cn(
                  'rounded px-2.5 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed',
                  issue.mode === 'segmented' ? 'bg-[var(--accent)] text-white' : 'text-[var(--muted)]'
                )}
              >
                One email per audience
              </button>
            </div>
            {modeError && <p className="mt-2 text-xs text-red-600">{modeError}</p>}

            {issue.mode === 'segmented' && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {AUDIENCE_TAGS.map((tag) => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setAudience(tag)}
                    className={cn(
                      'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                      audience === tag
                        ? 'border-[var(--accent)] bg-[var(--accent)] text-white'
                        : 'border-[var(--border)] bg-white text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent-strong)]'
                    )}
                  >
                    {AUDIENCE_LABELS[tag]} &middot; {formatNumber(audienceCounts.get(tag) ?? 0)}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Text fields */}
          <div className="space-y-3 rounded-lg border border-[var(--border)] bg-white p-4">
            <div className="space-y-1">
              <label className="text-xs font-medium text-[var(--muted)]">Subject</label>
              <input
                value={subject}
                onChange={(e) => edit(setSubject)(e.target.value)}
                disabled={locked}
                className="w-full rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] disabled:bg-[var(--surface-hover)] disabled:text-[var(--muted)]"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-[var(--muted)]">Intro</label>
              <textarea
                value={intro}
                onChange={(e) => edit(setIntro)(e.target.value)}
                disabled={locked}
                rows={4}
                className="w-full resize-none rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] disabled:bg-[var(--surface-hover)] disabled:text-[var(--muted)]"
              />
            </div>
            <div className="space-y-1">
              <label className="text-xs font-medium text-[var(--muted)]">Signoff</label>
              <textarea
                value={signoff}
                onChange={(e) => edit(setSignoff)(e.target.value)}
                disabled={locked}
                rows={2}
                className="w-full resize-none rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)] disabled:bg-[var(--surface-hover)] disabled:text-[var(--muted)]"
              />
            </div>
            {fieldError && <ErrorNote message={fieldError} onRetry={() => setFieldError(null)} />}
            {saving && <p className="text-xs text-[var(--muted-2)]">Saving.</p>}
          </div>

          {/* Sections */}
          <div className="space-y-3 rounded-lg border border-[var(--border)] bg-white p-4">
            <p className="text-sm font-medium text-[var(--foreground)]">Sections</p>
            {sectionsError && <ErrorNote message={sectionsError} onRetry={() => setSectionsError(null)} />}
            {issue.sections.length === 0 && (
              <p className="text-sm text-[var(--muted)]">
                No sections left. Every item was removed, so this issue has nothing to send yet.
              </p>
            )}
            <div className="space-y-4">
              {issue.sections.map((section, sIndex) => (
                <div key={`${section.section}-${sIndex}`} className="rounded-md border border-[var(--border)]">
                  <div className="flex items-center justify-between gap-2 border-b border-[var(--border)] bg-[var(--surface-hover)] px-3 py-1.5">
                    <span className="text-xs font-semibold text-[var(--foreground)]">
                      {section.title || SECTION_LABELS[section.section]}
                      <span className="ml-1.5 font-normal text-[var(--muted-2)]">
                        ({pluralize(section.itemIds.length, 'item')})
                      </span>
                    </span>
                    <div className="flex items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={locked || sIndex === 0}
                        onClick={() => moveSection(sIndex, -1)}
                        title="Move section up"
                      >
                        &uarr;
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        disabled={locked || sIndex === issue.sections.length - 1}
                        onClick={() => moveSection(sIndex, 1)}
                        title="Move section down"
                      >
                        &darr;
                      </Button>
                    </div>
                  </div>
                  <ul className="divide-y divide-[var(--border)]">
                    {section.itemIds.map((itemId, iIndex) => {
                      const item = itemsById.get(itemId);
                      return (
                        <li key={itemId} className="flex items-center justify-between gap-2 px-3 py-2">
                          <span className="min-w-0 truncate text-sm text-[var(--foreground)]" title={item?.title ?? itemId}>
                            {item ? item.title : 'Item no longer available'}
                          </span>
                          <div className="flex shrink-0 items-center gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={locked || iIndex === 0}
                              onClick={() => moveItem(sIndex, iIndex, -1)}
                              title="Move up"
                            >
                              &uarr;
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={locked || iIndex === section.itemIds.length - 1}
                              onClick={() => moveItem(sIndex, iIndex, 1)}
                              title="Move down"
                            >
                              &darr;
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={locked}
                              onClick={() => removeItemFromSection(sIndex, itemId)}
                              title="Remove from the newsletter"
                            >
                              Remove
                            </Button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          {/* Send panel */}
          <div className="space-y-3 rounded-lg border border-[var(--border)] bg-white p-4">
            <p className="text-sm font-medium text-[var(--foreground)]">Send</p>
            <div
              className={cn(
                'rounded-md border px-3 py-2 text-sm',
                transportReady
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border-amber-200 bg-amber-50 text-amber-800'
              )}
            >
              {transportDetail}
            </div>

            <form onSubmit={handleTestSend} className="flex flex-wrap items-center gap-2">
              <input
                type="email"
                value={testTo}
                onChange={(e) => setTestTo(e.target.value)}
                placeholder="Send a test to&hellip;"
                className="min-w-0 flex-1 rounded-md border border-[var(--border)] bg-white px-3 py-2 text-sm text-[var(--foreground)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
              />
              <Button type="submit" variant="secondary" disabled={testSending || !testTo.trim()}>
                {testSending ? 'Sending test.' : 'Send test'}
              </Button>
            </form>
            {testError && <ErrorNote message={testError} onRetry={() => setTestError(null)} />}

            <div className="border-t border-[var(--border)] pt-3">
              {!confirmingSend ? (
                <Button
                  variant="primary"
                  onClick={() => setConfirmingSend(true)}
                  disabled={locked || issue.sections.length === 0 || totalRecipients === 0}
                  title={
                    locked
                      ? 'This issue has already been sent.'
                      : totalRecipients === 0
                        ? 'No active recipients to send to.'
                        : undefined
                  }
                >
                  Send the newsletter
                </Button>
              ) : (
                <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3">
                  <p className="text-sm font-medium text-amber-900">
                    This will send to {pluralize(totalRecipients, 'recipient')}
                    {issue.mode === 'segmented' ? ', split by audience:' : '.'}
                  </p>
                  {issue.mode === 'segmented' && (
                    <ul className="space-y-0.5 text-sm text-amber-900">
                      {segmentedBreakdown.map((row) => (
                        <li key={row.tag}>
                          {AUDIENCE_LABELS[row.tag]}: {pluralize(row.count, 'recipient')}
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="flex gap-2 pt-1">
                    <Button variant="danger" onClick={handleRealSend} disabled={sending}>
                      {sending ? 'Sending.' : 'Yes, send it now'}
                    </Button>
                    <Button variant="secondary" onClick={() => setConfirmingSend(false)} disabled={sending}>
                      Cancel
                    </Button>
                  </div>
                </div>
              )}
              {sendError && <ErrorNote message={sendError} onRetry={() => setSendError(null)} />}
            </div>

            {testResults && testResults.length > 0 && (
              <div className="space-y-1.5 border-t border-[var(--border)] pt-3">
                <p className="text-xs font-medium text-[var(--muted)]">Latest send results</p>
                {testResults.map((r, i) => (
                  <div key={i} className="flex flex-wrap items-center gap-2 text-xs">
                    <Pill tone={r.ok ? 'ok' : 'error'}>{r.ok ? 'sent' : 'failed'}</Pill>
                    <span className="text-[var(--muted)]">{r.transport}</span>
                    <span className="text-[var(--muted)]">{r.audience}</span>
                    <span className="text-[var(--muted)]">{pluralize(r.recipients.length, 'recipient')}</span>
                    {r.error && <span className="text-red-600">{r.error}</span>}
                    {r.previewPath && (
                      <span className="truncate font-mono text-[10px] text-[var(--muted-2)]" title={r.previewPath}>
                        {r.previewPath}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}

            {issue.sendLog.length > 0 && (
              <details className="border-t border-[var(--border)] pt-2 text-xs text-[var(--muted)]">
                <summary className="cursor-pointer select-none font-medium">
                  Full send history ({issue.sendLog.length})
                </summary>
                <div className="mt-2 space-y-1.5">
                  {issue.sendLog.map((r, i) => (
                    <div key={i} className="flex flex-wrap items-center gap-2">
                      <span>{formatDateTime(r.at)}</span>
                      <Pill tone={r.ok ? 'ok' : 'error'}>{r.ok ? 'sent' : 'failed'}</Pill>
                      <span>{r.transport}</span>
                      <span>{r.audience}</span>
                      <span>{pluralize(r.recipients.length, 'recipient')}</span>
                    </div>
                  ))}
                </div>
              </details>
            )}
          </div>
        </div>

        {/* Preview column */}
        <div className="lg:sticky lg:top-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-sm font-medium text-[var(--foreground)]">Live preview</p>
            <span className="text-xs text-[var(--muted-2)]">
              {issue.mode === 'segmented' ? AUDIENCE_LABELS[audience as AudienceTag] : 'Everyone'}
            </span>
          </div>
          <iframe
            key={previewKey}
            src={src}
            title="Newsletter preview"
            className="h-[75vh] w-full rounded-lg border border-[var(--border)] bg-white"
          />
        </div>
      </div>
    </div>
  );
}
