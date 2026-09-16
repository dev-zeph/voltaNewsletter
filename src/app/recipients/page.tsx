'use client';

import { useMemo, useState } from 'react';
import type { AudienceTag, Recipient } from '@/lib/types';
import { AUDIENCE_LABELS, AUDIENCE_TAGS } from '@/lib/types';
import { useBobState } from '@/components/BobStateContext';
import { saveRecipients } from '@/components/api';
import { Button } from '@/components/Button';
import { ErrorNote } from '@/components/ErrorNote';
import { EmptyState } from '@/components/EmptyState';
import { Skeleton } from '@/components/Skeleton';
import { cn } from '@/components/cn';
import { formatNumber } from '@/lib/ui/format';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function newRecipient(): Recipient {
  return {
    id: crypto.randomUUID(),
    email: '',
    name: '',
    tags: [],
    active: true,
  };
}

export default function RecipientsPage() {
  const { state, setState, loading, error, reachable, refetch } = useBobState();

  const [rows, setRows] = useState<Recipient[]>([]);
  const [initialized, setInitialized] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // One-time snapshot of server data into the editable table. This runs
  // during render (React's documented pattern for adjusting state from a
  // prop/data change) rather than in an effect, so it takes effect on the
  // same render the data arrives instead of one render later.
  if (state && !initialized) {
    setInitialized(true);
    setRows(state.recipients.map((r) => ({ ...r, tags: [...r.tags] })));
  }

  const invalidIds = useMemo(() => {
    const bad = new Set<string>();
    for (const row of rows) {
      if (!EMAIL_RE.test(row.email.trim())) bad.add(row.id);
    }
    return bad;
  }, [rows]);

  const audienceCounts = useMemo(() => {
    const map = new Map<AudienceTag, number>();
    for (const tag of AUDIENCE_TAGS) {
      map.set(tag, rows.filter((r) => r.active && r.tags.includes(tag)).length);
    }
    return map;
  }, [rows]);

  function updateRow(id: string, patch: Partial<Recipient>) {
    setDirty(true);
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }

  function toggleTag(id: string, tag: AudienceTag) {
    setDirty(true);
    setRows((prev) =>
      prev.map((r) =>
        r.id === id
          ? { ...r, tags: r.tags.includes(tag) ? r.tags.filter((t) => t !== tag) : [...r.tags, tag] }
          : r
      )
    );
  }

  function removeRow(id: string) {
    setDirty(true);
    setRows((prev) => prev.filter((r) => r.id !== id));
  }

  function addRow() {
    setDirty(true);
    setRows((prev) => [...prev, newRecipient()]);
  }

  async function handleSave() {
    if (invalidIds.size > 0) return;
    setSaving(true);
    setSaveError(null);
    const previous = state?.recipients ?? [];
    try {
      const cleaned = rows.map((r) => ({ ...r, email: r.email.trim(), name: r.name.trim() }));
      const { recipients } = await saveRecipients(cleaned);
      setState((s) => (s ? { ...s, recipients } : s));
      setRows(recipients.map((r) => ({ ...r, tags: [...r.tags] })));
      setDirty(false);
    } catch (e) {
      setState((s) => (s ? { ...s, recipients: previous } : s));
      setSaveError(e instanceof Error ? e.message : 'Could not save the recipient list.');
    } finally {
      setSaving(false);
    }
  }

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
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-5 px-4 py-5 md:px-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-[var(--foreground)]">Recipients</h1>
          <p className="text-sm text-[var(--muted)]">
            Who the newsletter reaches, and which audience each person belongs to.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {dirty && !saving && <span className="text-xs font-medium text-amber-700">Unsaved changes</span>}
          {!dirty && initialized && !saving && (
            <span className="text-xs text-[var(--muted-2)]">All changes saved</span>
          )}
          <Button variant="primary" onClick={handleSave} disabled={saving || !dirty || invalidIds.size > 0}>
            {saving ? 'Saving.' : 'Save'}
          </Button>
        </div>
      </div>

      {saveError && <ErrorNote message={saveError} onRetry={handleSave} />}
      {invalidIds.size > 0 && (
        <ErrorNote
          message={`Fix ${invalidIds.size} invalid email address${invalidIds.size === 1 ? '' : 'es'} before saving.`}
        />
      )}

      <div className="flex flex-wrap gap-2">
        {AUDIENCE_TAGS.map((tag) => (
          <div
            key={tag}
            className="rounded-md border border-[var(--border)] bg-white px-3 py-2 text-xs text-[var(--muted)]"
          >
            <span className="block font-semibold text-[var(--foreground)]">
              {formatNumber(audienceCounts.get(tag) ?? 0)}
            </span>
            {AUDIENCE_LABELS[tag]}
          </div>
        ))}
      </div>

      {rows.length === 0 ? (
        <EmptyState
          title="No recipients yet"
          description="Add the first person Bob's newsletter should reach."
          action={
            <Button variant="primary" onClick={addRow}>
              Add recipient
            </Button>
          }
        />
      ) : (
        <div className="overflow-x-auto rounded-lg border border-[var(--border)] bg-white">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-[var(--border)] bg-[var(--surface-hover)] label-eyebrow text-left text-[11px] text-[var(--muted)]">
                <th className="px-3 py-2 font-medium">Email</th>
                <th className="px-3 py-2 font-medium">Name</th>
                {AUDIENCE_TAGS.map((tag) => (
                  <th key={tag} className="px-2 py-2 text-center font-medium" title={AUDIENCE_LABELS[tag]}>
                    {AUDIENCE_LABELS[tag].split(' ')[0]}
                  </th>
                ))}
                <th className="px-2 py-2 text-center font-medium">Active</th>
                <th className="px-2 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const invalid = invalidIds.has(row.id);
                return (
                  <tr key={row.id} className="border-b border-[var(--border)] last:border-b-0">
                    <td className="px-3 py-1.5">
                      <input
                        value={row.email}
                        onChange={(e) => updateRow(row.id, { email: e.target.value })}
                        placeholder="name@example.com"
                        className={cn(
                          'w-full rounded-md border bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]',
                          invalid ? 'border-red-300' : 'border-[var(--border)]'
                        )}
                      />
                      {invalid && <p className="mt-0.5 text-[11px] text-red-600">Not a valid email address.</p>}
                    </td>
                    <td className="px-3 py-1.5">
                      <input
                        value={row.name}
                        onChange={(e) => updateRow(row.id, { name: e.target.value })}
                        placeholder="Name"
                        className="w-full rounded-md border border-[var(--border)] bg-white px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
                      />
                    </td>
                    {AUDIENCE_TAGS.map((tag) => (
                      <td key={tag} className="px-2 py-1.5 text-center">
                        <input
                          type="checkbox"
                          checked={row.tags.includes(tag)}
                          onChange={() => toggleTag(row.id, tag)}
                          className="h-3.5 w-3.5 accent-[var(--accent)]"
                        />
                      </td>
                    ))}
                    <td className="px-2 py-1.5 text-center">
                      <input
                        type="checkbox"
                        checked={row.active}
                        onChange={(e) => updateRow(row.id, { active: e.target.checked })}
                        className="h-3.5 w-3.5 accent-[var(--accent)]"
                      />
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <Button variant="ghost" size="sm" onClick={() => removeRow(row.id)}>
                        Remove
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="border-t border-[var(--border)] px-3 py-2">
            <Button variant="secondary" size="sm" onClick={addRow}>
              Add recipient
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
