'use client';

import type { AudienceTag, Item, Section } from '@/lib/types';
import { AUDIENCE_LABELS, AUDIENCE_TAGS, SECTIONS, SECTION_LABELS } from '@/lib/types';
import { AUDIENCE_CHIP_ACTIVE_STYLES, AUDIENCE_CHIP_STYLES } from '@/components/sectionStyles';
import { Chip } from '@/components/Chip';
import { Button } from '@/components/Button';
import { cn } from '@/components/cn';
import { formatRelativeTime } from '@/lib/ui/format';

interface ItemCardProps {
  item: Item;
  focused: boolean;
  busy: boolean;
  onFocusCard: () => void;
  onKeep: () => void;
  onDrop: () => void;
  onUndo: () => void;
  onToggleDig: () => void;
  onSectionChange: (section: Section) => void;
  onToggleAudience: (audience: AudienceTag) => void;
}

export function ItemCard({
  item,
  focused,
  busy,
  onFocusCard,
  onKeep,
  onDrop,
  onUndo,
  onToggleDig,
  onSectionChange,
  onToggleAudience,
}: ItemCardProps) {
  if (item.decision === 'drop') {
    return (
      <div
        tabIndex={0}
        onFocus={onFocusCard}
        className={cn(
          'flex items-center justify-between gap-3 rounded-md border border-[var(--border)] bg-[var(--surface-hover)] px-3 py-2 text-sm text-[var(--muted-2)]',
          focused && 'ring-2 ring-[var(--accent)]'
        )}
      >
        <span className="truncate line-through decoration-[var(--muted-2)]">{item.title}</span>
        <Button variant="ghost" size="sm" onClick={onUndo} disabled={busy}>
          Undo
        </Button>
      </div>
    );
  }

  const kept = item.decision === 'keep';

  return (
    <div
      tabIndex={0}
      onFocus={onFocusCard}
      className={cn(
        'flex flex-col gap-2.5 rounded-lg border bg-white p-4 transition-colors',
        focused && 'ring-2 ring-[var(--accent)]',
        kept ? 'border-[var(--accent)]' : 'border-[var(--border)]'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <a
          href={item.url}
          target="_blank"
          rel="noreferrer"
          className="text-[15px] font-medium leading-snug text-[var(--foreground)] hover:text-[var(--accent-strong)] hover:underline"
        >
          {item.title}
        </a>
        {item.entities.amount && (
          <span className="shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-semibold text-emerald-700">
            {item.entities.amount}
          </span>
        )}
      </div>

      <p className="text-sm font-medium text-[var(--accent-strong)]">{item.why}</p>
      <p className="text-sm text-[var(--muted)]">{item.blurb}</p>

      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
        {AUDIENCE_TAGS.map((tag) => {
          const active = item.audiences.includes(tag);
          return (
            <Chip
              key={tag}
              active={active}
              onClick={() => onToggleAudience(tag)}
              activeClassName={AUDIENCE_CHIP_ACTIVE_STYLES[tag]}
              inactiveClassName={cn('border', AUDIENCE_CHIP_STYLES[tag], 'opacity-70 hover:opacity-100')}
              title={`Toggle ${AUDIENCE_LABELS[tag]}`}
            >
              {AUDIENCE_LABELS[tag]}
            </Chip>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] pt-2.5 text-xs text-[var(--muted-2)]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium text-[var(--muted)]">{item.sourceName}</span>
          <span>{formatRelativeTime(item.publishedAt)}</span>
          <ScoreMeter score={item.score} />
          {item.enrichedBy === 'heuristic' && (
            <span
              title="Bob's heuristic scorer handled this one, not Claude."
              className="label-eyebrow rounded border border-[var(--border)] px-1.5 py-0.5 text-[10px] text-[var(--muted-2)]"
            >
              heuristic
            </span>
          )}
        </div>
        <select
          value={item.section}
          onChange={(e) => onSectionChange(e.target.value as Section)}
          className="rounded border border-[var(--control-border)] bg-white px-1.5 py-1 text-xs text-[var(--muted)]"
        >
          {SECTIONS.map((section) => (
            <option key={section} value={section}>
              {SECTION_LABELS[section]}
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <Button
          variant={kept ? 'primary' : 'secondary'}
          size="sm"
          onClick={onKeep}
          disabled={busy}
          className="flex-1"
        >
          Keep
        </Button>
        <Button variant="secondary" size="sm" onClick={onDrop} disabled={busy} className="flex-1">
          Drop
        </Button>
        <Button
          variant={item.digDeeper ? 'primary' : 'ghost'}
          size="sm"
          onClick={onToggleDig}
          disabled={busy}
          title="Ask Bob to dig deeper on this next run"
        >
          Dig deeper
        </Button>
      </div>
    </div>
  );
}

function ScoreMeter({ score }: { score: number }) {
  const pct = Math.max(0, Math.min(100, score));
  const tone = pct >= 70 ? 'bg-emerald-500' : pct >= 45 ? 'bg-[var(--accent)]' : 'bg-[var(--muted-2)]';
  return (
    <span className="inline-flex items-center gap-1" title={`Score ${pct}/100`}>
      <span className="h-1.5 w-10 overflow-hidden rounded-full bg-[var(--surface-hover)]">
        <span className={cn('block h-full rounded-full', tone)} style={{ width: `${pct}%` }} />
      </span>
      <span>{pct}</span>
    </span>
  );
}
