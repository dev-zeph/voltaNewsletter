'use client';

import type { ButtonHTMLAttributes } from 'react';
import { cn } from '@/components/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

const VARIANT_CLASSES: Record<Variant, string> = {
  primary:
    'bg-[var(--accent)] text-white border-transparent hover:bg-[var(--accent-strong)] disabled:hover:bg-[var(--accent)]',
  secondary:
    'bg-white text-[var(--foreground)] border-[var(--border)] hover:bg-[var(--surface-hover)]',
  ghost:
    'bg-transparent text-[var(--muted)] border-transparent hover:bg-[var(--surface-hover)] hover:text-[var(--foreground)]',
  danger:
    'bg-white text-red-600 border-red-200 hover:bg-red-50',
};

const SIZE_CLASSES: Record<Size, string> = {
  sm: 'text-xs px-2.5 py-1.5 gap-1.5',
  md: 'text-sm px-3.5 py-2 gap-2',
};

export function Button({ variant = 'secondary', size = 'md', className, ...props }: ButtonProps) {
  return (
    <button
      className={cn(
        'inline-flex items-center justify-center rounded-md border font-medium transition-colors',
        'active:translate-y-px',
        'disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent)] focus-visible:ring-offset-1',
        VARIANT_CLASSES[variant],
        SIZE_CLASSES[size],
        className
      )}
      {...props}
    />
  );
}
