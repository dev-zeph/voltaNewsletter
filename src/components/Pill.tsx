import type { ReactNode } from 'react';
import { cn } from '@/components/cn';

type Tone = 'ok' | 'error' | 'neutral' | 'accent';

const TONE_CLASSES: Record<Tone, string> = {
  ok: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  error: 'bg-red-50 text-red-700 border-red-200',
  neutral: 'bg-[var(--surface-hover)] text-[var(--muted)] border-[var(--border)]',
  accent: 'bg-[var(--accent-soft)] text-[var(--accent-strong)] border-[var(--accent-border)]',
};

export function Pill({
  tone = 'neutral',
  children,
  title,
  className,
}: {
  tone?: Tone;
  children: ReactNode;
  title?: string;
  className?: string;
}) {
  return (
    <span
      title={title}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium',
        TONE_CLASSES[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
