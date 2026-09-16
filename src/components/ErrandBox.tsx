'use client';

import { useState, type KeyboardEvent } from 'react';
import type { Directive } from '@/lib/types';
import { Button } from '@/components/Button';
import { Chip } from '@/components/Chip';

const PLACEHOLDER =
  'more funding news, drop the generic AI stuff, check Volta’s events page again, and find anything on ocean tech';

export function ErrandBox({
  directives,
  running,
  onSubmit,
  onRemoveDirective,
}: {
  directives: Directive[];
  running: boolean;
  onSubmit: (text: string) => void;
  onRemoveDirective: (id: string) => void;
}) {
  const [text, setText] = useState('');

  function submit() {
    const trimmed = text.trim();
    if (!trimmed || running) return;
    onSubmit(trimmed);
    setText('');
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  const persistent = directives.filter((d) => d.persistent);

  return (
    <div className="sticky bottom-0 border-t border-[var(--border)] bg-white/95 px-4 py-3 backdrop-blur md:px-6">
      {persistent.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-[var(--muted-2)]">Bob is carrying forward:</span>
          {persistent.map((d) => (
            <Chip key={d.id} onRemove={() => onRemoveDirective(d.id)} title={d.rawText}>
              {d.rawText.length > 42 ? `${d.rawText.slice(0, 42)}…` : d.rawText}
            </Chip>
          ))}
        </div>
      )}
      <div className="flex items-end gap-2">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={PLACEHOLDER}
          rows={2}
          disabled={running}
          className="min-h-[2.5rem] flex-1 resize-none rounded-md border border-[var(--control-border)] bg-white px-3 py-2 text-sm text-[var(--foreground)] placeholder:text-[var(--muted-2)] focus:outline-none focus:ring-2 focus:ring-[var(--accent)]"
        />
        <Button variant="primary" onClick={submit} disabled={running || !text.trim()}>
          Send Bob back out
        </Button>
      </div>
      <p className="mt-1.5 text-[11px] text-[var(--muted-2)]">
        Press K to keep the focused card, D to drop it, Enter here to send the errand.
      </p>
    </div>
  );
}
