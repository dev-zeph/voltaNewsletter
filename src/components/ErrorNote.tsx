'use client';

import { Button } from '@/components/Button';

/** A small, visible "something failed" note. Never swallow an error silently. */
export function ErrorNote({
  message,
  onRetry,
  unreachable = false,
}: {
  message: string;
  onRetry?: () => void;
  unreachable?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      <span>
        {unreachable ? 'API not reachable. ' : ''}
        {message}
      </span>
      {onRetry && (
        <Button variant="danger" size="sm" onClick={onRetry}>
          Try again
        </Button>
      )}
    </div>
  );
}
