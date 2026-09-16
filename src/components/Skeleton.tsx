import { cn } from '@/components/cn';

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-[var(--surface-hover)]', className)} />;
}

export function BoardSkeleton() {
  return (
    <div className="space-y-8">
      {[0, 1, 2].map((group) => (
        <div key={group} className="space-y-3">
          <Skeleton className="h-4 w-40" />
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {[0, 1, 2].map((card) => (
              <div key={card} className="space-y-3 rounded-lg border border-[var(--border)] bg-white p-4">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-5/6" />
                <div className="flex gap-2 pt-1">
                  <Skeleton className="h-5 w-16 rounded-full" />
                  <Skeleton className="h-5 w-16 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
