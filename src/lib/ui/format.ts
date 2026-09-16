// Date and number formatting helpers for Bob's UI. No logic that touches the
// pipeline or store lives here, just presentation.

const RELATIVE_UNITS: Array<{
  limit: number;
  divisor: number;
  unit: Intl.RelativeTimeFormatUnit;
}> = [
  { limit: 60, divisor: 1, unit: 'second' },
  { limit: 3600, divisor: 60, unit: 'minute' },
  { limit: 86400, divisor: 3600, unit: 'hour' },
  { limit: 604800, divisor: 86400, unit: 'day' },
  { limit: 2629800, divisor: 604800, unit: 'week' },
  { limit: 31557600, divisor: 2629800, unit: 'month' },
  { limit: Infinity, divisor: 31557600, unit: 'year' },
];

const relativeFormatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

/**
 * "2 days ago", "in 3 hours", "just now". Returns `fallback` when the value
 * is missing or unparsable, never throws.
 */
export function formatRelativeTime(
  value: string | null | undefined,
  fallback = 'unknown date'
): string {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;

  const diffSeconds = (date.getTime() - Date.now()) / 1000;
  const abs = Math.abs(diffSeconds);

  if (abs < 45) return 'just now';

  for (const { limit, divisor, unit } of RELATIVE_UNITS) {
    if (abs < limit) {
      const amount = Math.round(diffSeconds / divisor);
      return relativeFormatter.format(amount, unit);
    }
  }
  return fallback;
}

/** "Sep 16, 2026, 10:32 AM" */
export function formatDateTime(
  value: string | null | undefined,
  fallback = 'unknown'
): string {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return new Intl.DateTimeFormat('en-CA', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

/** "Sep 16" */
export function formatShortDate(
  value: string | null | undefined,
  fallback = 'unknown date'
): string {
  if (!value) return fallback;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return fallback;
  return new Intl.DateTimeFormat('en-CA', { month: 'short', day: 'numeric' }).format(date);
}

export function formatNumber(value: number): string {
  return new Intl.NumberFormat('en-CA').format(value);
}

/** "14 items" / "1 item" */
export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${formatNumber(count)} ${count === 1 ? singular : plural}`;
}

export function truncate(value: string, max: number): string {
  if (value.length <= max) return value;
  return `${value.slice(0, Math.max(0, max - 1)).trimEnd()}…`;
}

export function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}
