'use client';

import type { ReactNode } from 'react';
import { cn } from '@/components/cn';

/** A small clickable/removable chip, used for audience tags and directives. */
export function Chip({
  children,
  active = false,
  onClick,
  onRemove,
  className,
  activeClassName,
  inactiveClassName,
  title,
}: {
  children: ReactNode;
  active?: boolean;
  onClick?: () => void;
  onRemove?: () => void;
  className?: string;
  activeClassName?: string;
  inactiveClassName?: string;
  title?: string;
}) {
  const interactive = Boolean(onClick);
  const Tag = interactive ? 'button' : 'span';

  return (
    <Tag
      type={interactive ? 'button' : undefined}
      onClick={onClick}
      title={title}
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium transition-colors',
        interactive && 'cursor-pointer',
        active
          ? (activeClassName ?? 'bg-[var(--accent)] text-white border-[var(--accent)]')
          : (inactiveClassName ??
              'bg-white text-[var(--muted)] border-[var(--border)] hover:border-[var(--accent)] hover:text-[var(--accent-strong)]'),
        className
      )}
    >
      {children}
      {onRemove && (
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            onRemove();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.stopPropagation();
              e.preventDefault();
              onRemove();
            }
          }}
          className="ml-0.5 rounded-full px-1 leading-none opacity-70 hover:opacity-100"
          aria-label="Remove"
        >
          &times;
        </span>
      )}
    </Tag>
  );
}
