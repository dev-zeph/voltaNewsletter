// ============================================================================
// Bob — dedupe. Pure function, no I/O, never throws.
//
// Drops:
//   1. items whose canonical URL is already in `seen` (shown in a past run)
//   2. exact canonical-URL duplicates within this batch
//   3. near-duplicate titles within this batch (same story, different outlet)
// ============================================================================

import type { RawItem } from '@/lib/types';

const STOPWORDS = new Set([
  'the', 'a', 'an', 'in', 'on', 'of', 'to', 'for', 'and', 'at', 'is',
]);

/**
 * Local canonicalization helper. Deliberately not imported from sources/*
 * (that module is owned by another agent and may not exist yet).
 * Lowercases, strips protocol/www, drops trailing slash, drops query string
 * and fragment, which is enough to catch the common tracking-param dupes.
 */
function canonicalUrl(url: string): string {
  if (!url) return '';
  try {
    const u = new URL(url);
    let host = u.hostname.toLowerCase();
    if (host.startsWith('www.')) host = host.slice(4);
    const path = u.pathname.replace(/\/+$/, '');
    return `${host}${path}`.toLowerCase();
  } catch {
    // Not a parseable URL (shouldn't normally happen). Fall back to a
    // best-effort string normalization rather than throwing.
    return url
      .trim()
      .toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/[?#].*$/, '')
      .replace(/\/+$/, '');
  }
}

/**
 * Collapses money to a single canonical token so the same round matches across
 * outlets. BetaKit writes "$4.2 million", Entrevestor writes "$4.2M", and
 * Google News writes "CAD 4.2M". Left as raw text those tokenize into three
 * different token sets and the Jaccard score never clears the threshold, so
 * Bader sees the same round three times.
 */
function normalizeAmounts(text: string): string {
  return text
    .replace(
      /(?:cad|usd|c\$|us\$|\$)\s*([\d,]+(?:\.\d+)?)\s*(m|mm|million|b|bn|billion|k|thousand)?/gi,
      (_full, num: string, unit?: string) => {
        const value = Number(num.replace(/,/g, ''));
        if (!Number.isFinite(value)) return ' ';
        const u = (unit ?? '').toLowerCase();
        let millions = value;
        if (u.startsWith('b')) millions = value * 1000;
        else if (u === 'k' || u === 'thousand') millions = value / 1000;
        else if (!u) millions = value >= 1000 ? value / 1_000_000 : value;
        // One token per amount, rounded so 4.2 and 4.20 agree.
        return ` amt${Math.round(millions * 10) / 10} `;
      },
    )
    .replace(/\bseries\s+([a-h])\b/gi, (_f, l: string) => ` series${l.toLowerCase()} `);
}

/** Normalized token set for a title: lowercase, strip punctuation, drop stopwords. */
function titleTokens(title: string): Set<string> {
  const words = normalizeAmounts(title)
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 0 && !STOPWORDS.has(w));
  return new Set(words);
}

/**
 * Title similarity, blending Jaccard with containment.
 *
 * Plain Jaccard punishes length asymmetry, and real headlines about the same
 * story are wildly asymmetric: "Halifax startup Meander Robotics raises $4.2
 * million Series A led by BDC Capital" against "Meander Robotics raises $4.2M
 * in Series A round" scores 0.43 and slips through as a duplicate. Containment
 * asks the more useful question, whether the shorter headline is essentially a
 * subset of the longer one.
 *
 * Containment alone over-merges short generic titles, so it only applies once
 * the smaller set carries enough tokens to be distinctive, and it is discounted
 * so it stays slightly harder to trip than a true Jaccard match.
 */
function titleSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1;
  if (a.size === 0 || b.size === 0) return 0;

  let intersection = 0;
  for (const tok of a) {
    if (b.has(tok)) intersection++;
  }

  const union = a.size + b.size - intersection;
  const jaccard = union === 0 ? 0 : intersection / union;

  const smaller = Math.min(a.size, b.size);
  if (smaller < MIN_TOKENS_FOR_CONTAINMENT) return jaccard;

  const containment = intersection / smaller;
  return Math.max(jaccard, containment * CONTAINMENT_DISCOUNT);
}

/** Below this many tokens a title is too generic to trust containment on. */
const MIN_TOKENS_FOR_CONTAINMENT = 4;
const CONTAINMENT_DISCOUNT = 0.9;

const TITLE_SIMILARITY_THRESHOLD = 0.6;

export function dedupe(
  items: RawItem[],
  seen: Set<string>,
  authorityBySourceId?: Record<string, number>,
): { kept: RawItem[]; droppedDuplicate: number; droppedSeen: number } {
  const authorityFor = (sourceId: string): number => {
    const table = authorityBySourceId ?? {};
    const val = table[sourceId];
    return typeof val === 'number' ? val : 0.5;
  };

  let droppedSeen = 0;
  let droppedDuplicate = 0;

  // Pass 1: drop items already shown in a previous run.
  const notSeen: RawItem[] = [];
  for (const item of items) {
    const canon = canonicalUrl(item.url);
    if (canon && seen.has(canon)) {
      droppedSeen++;
      continue;
    }
    notSeen.push(item);
  }

  // Pass 2: drop exact canonical-URL duplicates within this batch, keeping
  // the copy from the highest-authority source.
  const byUrl = new Map<string, RawItem>();
  const urlOrder: string[] = [];
  for (const item of notSeen) {
    const canon = canonicalUrl(item.url);
    const key = canon || `__no-url__:${item.title}`;
    const existing = byUrl.get(key);
    if (!existing) {
      byUrl.set(key, item);
      urlOrder.push(key);
    } else {
      droppedDuplicate++;
      if (authorityFor(item.sourceId) > authorityFor(existing.sourceId)) {
        byUrl.set(key, item);
      }
    }
  }
  const urlDeduped = urlOrder.map((k) => byUrl.get(k)!);

  // Pass 3: drop near-duplicate titles (same story, different outlet/URL),
  // keeping the copy from the highest-authority source.
  const survivors: RawItem[] = [];
  const survivorTokens: Set<string>[] = [];

  for (const item of urlDeduped) {
    const tokens = titleTokens(item.title);
    let matchIdx = -1;
    for (let i = 0; i < survivors.length; i++) {
      if (titleSimilarity(tokens, survivorTokens[i]) >= TITLE_SIMILARITY_THRESHOLD) {
        matchIdx = i;
        break;
      }
    }
    if (matchIdx === -1) {
      survivors.push(item);
      survivorTokens.push(tokens);
    } else {
      droppedDuplicate++;
      const existing = survivors[matchIdx];
      if (authorityFor(item.sourceId) > authorityFor(existing.sourceId)) {
        survivors[matchIdx] = item;
        survivorTokens[matchIdx] = tokens;
      }
    }
  }

  return { kept: survivors, droppedDuplicate, droppedSeen };
}
