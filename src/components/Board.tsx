'use client';

import { useEffect, useMemo } from 'react';
import type { AudienceTag, Item, Section } from '@/lib/types';
import { SECTION_LABELS, SECTION_ORDER } from '@/lib/types';
import { ItemCard } from '@/components/ItemCard';
import { EmptyState } from '@/components/EmptyState';
import { BoardSkeleton } from '@/components/Skeleton';
import { SECTION_CHIP_STYLES } from '@/components/sectionStyles';
import { cn } from '@/components/cn';
import type { DeskFilters } from '@/components/FilterBar';

interface BoardProps {
  items: Item[];
  hasRun: boolean;
  loading: boolean;
  filters: DeskFilters;
  focusedId: string | null;
  busyId: string | null;
  onFocusCard: (id: string) => void;
  onKeep: (id: string) => void;
  onDrop: (id: string) => void;
  onUndo: (id: string) => void;
  onToggleDig: (id: string) => void;
  onSectionChange: (id: string, section: Section) => void;
  onToggleAudience: (id: string, audience: AudienceTag) => void;
}

function isEditableTarget(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

export function Board({
  items,
  hasRun,
  loading,
  filters,
  focusedId,
  busyId,
  onFocusCard,
  onKeep,
  onDrop,
  onUndo,
  onToggleDig,
  onSectionChange,
  onToggleAudience,
}: BoardProps) {
  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (filters.section !== 'all' && item.section !== filters.section) return false;
      if (filters.audience !== 'all' && !item.audiences.includes(filters.audience)) return false;
      if (filters.hideDropped && item.decision === 'drop') return false;
      if (item.score < filters.minScore) return false;
      return true;
    });
  }, [items, filters]);

  const grouped = useMemo(() => {
    const map = new Map<Section, Item[]>();
    for (const section of SECTION_ORDER) map.set(section, []);
    for (const item of filtered) {
      map.get(item.section)?.push(item);
    }
    return map;
  }, [filtered]);

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (isEditableTarget(e.target)) return;
      if (!focusedId) return;
      if (e.key === 'k' || e.key === 'K') {
        e.preventDefault();
        onKeep(focusedId);
      } else if (e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        onDrop(focusedId);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [focusedId, onKeep, onDrop]);

  if (loading) return <BoardSkeleton />;

  if (!hasRun) {
    return (
      <EmptyState
        title="Bob hasn't been out yet"
        description="Send Bob out and he'll bring back a board of items from Volta's sources, scored and sorted, ready for you to keep or drop."
      />
    );
  }

  if (items.length === 0) {
    return (
      <EmptyState
        title="Bob's last run came back empty"
        description="Nothing cleared the bar this time. Try sending Bob back out with an errand, or check the sources page for dead feeds."
      />
    );
  }

  if (filtered.length === 0) {
    return (
      <EmptyState
        title="No items match these filters"
        description="Loosen the section, audience or score filters to see more of what Bob found."
      />
    );
  }

  return (
    <div className="space-y-8">
      {SECTION_ORDER.map((section) => {
        const sectionItems = grouped.get(section) ?? [];
        if (sectionItems.length === 0) return null;
        return (
          <section key={section}>
            <div className="mb-3 flex items-center gap-2">
              <span
                className={cn(
                  'rounded-full border px-2 py-0.5 text-xs font-semibold',
                  SECTION_CHIP_STYLES[section]
                )}
              >
                {SECTION_LABELS[section]}
              </span>
              <span className="text-xs text-[var(--muted-2)]">{sectionItems.length}</span>
            </div>
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {sectionItems.map((item) => (
                <ItemCard
                  key={item.id}
                  item={item}
                  focused={focusedId === item.id}
                  busy={busyId === item.id}
                  onFocusCard={() => onFocusCard(item.id)}
                  onKeep={() => onKeep(item.id)}
                  onDrop={() => onDrop(item.id)}
                  onUndo={() => onUndo(item.id)}
                  onToggleDig={() => onToggleDig(item.id)}
                  onSectionChange={(next) => onSectionChange(item.id, next)}
                  onToggleAudience={(audience) => onToggleAudience(item.id, audience)}
                />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
