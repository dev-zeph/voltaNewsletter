/** Tiny classname joiner, no dependency needed for what this app uses. */
export function cn(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}
