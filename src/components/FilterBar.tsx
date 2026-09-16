'use client';

import type { AudienceTag, Section } from '@/lib/types';
import { AUDIENCE_LABELS, AUDIENCE_TAGS, SECTIONS, SECTION_LABELS } from '@/lib/types';
import { formatNumber } from '@/lib/ui/format';

export interface DeskFilters {
  section: Section | 'all';
  audience: AudienceTag | 'all';
  hideDropped: boolean;
  minScore: number;
}

export function FilterBar({
  filters,
  onChange,
  counts,
}: {
  filters: DeskFilters;
  onChange: (next: DeskFilters) => void;
  counts: { keep: number; drop: number; pending: number };
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-[var(--border)] bg-white px-4 py-3 md:flex-row md:items-center md:justify-between md:px-6">
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={filters.section}
          onChange={(e) => onChange({ ...filters, section: e.target.value as Section | 'all' })}
          className="rounded-md border border-[var(--border)] bg-white px-2 py-1.5 text-sm text-[var(--foreground)]"
        >
          <option value="all">All sections</option>
          {SECTIONS.map((s) => (
            <option key={s} value={s}>
              {SECTION_LABELS[s]}
            </option>
          ))}
        </select>

        <select
          value={filters.audience}
          onChange={(e) => onChange({ ...filters, audience: e.target.value as AudienceTag | 'all' })}
          className="rounded-md border border-[var(--border)] bg-white px-2 py-1.5 text-sm text-[var(--foreground)]"
        >
          <option value="all">All audiences</option>
          {AUDIENCE_TAGS.map((a) => (
            <option key={a} value={a}>
              {AUDIENCE_LABELS[a]}
            </option>
          ))}
        </select>

        <label className="flex items-center gap-1.5 text-sm text-[var(--muted)]">
          <input
            type="checkbox"
            checked={filters.hideDropped}
            onChange={(e) => onChange({ ...filters, hideDropped: e.target.checked })}
            className="h-3.5 w-3.5 accent-[var(--accent)]"
          />
          Hide dropped
        </label>

        <label className="flex items-center gap-2 text-sm text-[var(--muted)]">
          Score
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            value={filters.minScore}
            onChange={(e) => onChange({ ...filters, minScore: Number(e.target.value) })}
            className="accent-[var(--accent)]"
          />
          <span className="w-7 tabular-nums text-[var(--foreground)]">{filters.minScore}</span>
        </label>
      </div>

      <div className="flex items-center gap-3 text-xs text-[var(--muted)]">
        <span className="font-medium text-[var(--accent-strong)]">{formatNumber(counts.keep)} kept</span>
        <span>{formatNumber(counts.drop)} dropped</span>
        <span>{formatNumber(counts.pending)} pending</span>
      </div>
    </div>
  );
}
