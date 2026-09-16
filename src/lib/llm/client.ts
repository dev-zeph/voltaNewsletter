// ============================================================================
// Bob — Anthropic client. Zero-credential safe: must never throw at import
// time or when no ANTHROPIC_API_KEY is present.
// ============================================================================

import Anthropic from '@anthropic-ai/sdk';

/** Exact model id. Never append a date suffix. */
export const MODEL = 'claude-opus-5';

let memoized: Anthropic | null | undefined;

/** True iff ANTHROPIC_API_KEY is set to a non-empty string. */
export function hasLlm(): boolean {
  const key = process.env.ANTHROPIC_API_KEY;
  return typeof key === 'string' && key.trim().length > 0;
}

/** Memoized client. Returns null when no key is present. Never throws. */
export function getClient(): Anthropic | null {
  if (memoized !== undefined) return memoized;
  if (!hasLlm()) {
    memoized = null;
    return memoized;
  }
  try {
    memoized = new Anthropic();
  } catch {
    memoized = null;
  }
  return memoized;
}
