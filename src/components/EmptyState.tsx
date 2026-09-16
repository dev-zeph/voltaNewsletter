import type { ReactNode } from 'react';

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-[var(--border)] bg-white px-6 py-14 text-center">
      <p className="text-sm font-medium text-[var(--foreground)]">{title}</p>
      <p className="max-w-sm text-sm text-[var(--muted)]">{description}</p>
      {action}
    </div>
  );
}
