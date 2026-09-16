// ============================================================================
// Bob — shared fetch/parse/clean helpers for every source adapter.
// Nothing in this file may throw past its own boundary except fetchText,
// which is documented to throw on a non-2xx response so callers can decide
// how to handle it (fetchSource in index.ts is the place that turns that
// into a SourceResult failure instead of letting it escape).
// ============================================================================

export const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36';

/**
 * Fetch a URL as text with a hard timeout. Throws on network failure,
 * abort, or a non-2xx response. Callers (rss.ts, gnews.ts, volta.ts) run
 * this inside their own try/catch, or rely on fetchSource in index.ts to
 * catch it for them.
 */
export async function fetchText(url: string, timeoutMs = 12000): Promise<string> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: '*/*' },
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`fetchText: ${url} responded ${res.status} ${res.statusText}`);
    }
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

const TRACKING_PARAM_EXACT = new Set(['fbclid', 'gclid', 'ref']);

/**
 * Canonicalize a URL: strip utm_* / fbclid / gclid / ref query params,
 * drop the hash, drop a trailing slash on the path, lowercase the host.
 *
 * Google News "rss/articles/..." links are opaque redirect tokens (there is
 * no real URL embedded to unwrap without an extra network round trip), and
 * this function is synchronous by contract, so the deterministic choice
 * here is: leave them as Google's redirect link, just canonicalized like
 * any other URL. Never throws; an unparseable input is returned trimmed.
 */
export function canonicalUrl(raw: string): string {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return trimmed;
  try {
    const u = new URL(trimmed);
    u.hostname = u.hostname.toLowerCase();
    u.hash = '';

    const toDelete: string[] = [];
    u.searchParams.forEach((_, key) => {
      const lower = key.toLowerCase();
      if (lower.startsWith('utm_') || TRACKING_PARAM_EXACT.has(lower)) {
        toDelete.push(key);
      }
    });
    toDelete.forEach((key) => u.searchParams.delete(key));

    if (u.pathname.length > 1 && u.pathname.endsWith('/')) {
      u.pathname = u.pathname.slice(0, -1);
    }

    return u.toString();
  } catch {
    return trimmed;
  }
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  '#39': "'",
  nbsp: ' ',
  rsquo: '’',
  lsquo: '‘',
  ldquo: '“',
  rdquo: '”',
  mdash: '—',
  ndash: '–',
  hellip: '…',
};

/**
 * Strip HTML tags, decode common entities, collapse whitespace, and
 * truncate on a word boundary. Never throws.
 */
export function cleanText(html: string, maxLen = 400): string {
  if (!html) return '';
  let text: string;
  try {
    text = html
      .replace(/<!--[\s\S]*?-->/g, ' ')
      .replace(/<[^>]*>/g, ' ')
      .replace(/&([a-zA-Z]+|#\d+);/g, (match, code: string) => {
        if (code.startsWith('#')) {
          const num = Number(code.slice(1));
          return Number.isFinite(num) ? String.fromCharCode(num) : match;
        }
        return ENTITIES[code] ?? match;
      })
      .replace(/\s+/g, ' ')
      .trim();
  } catch {
    text = String(html).trim();
  }

  if (text.length <= maxLen) return text;
  const cut = text.slice(0, maxLen);
  const lastSpace = cut.lastIndexOf(' ');
  const body = lastSpace > maxLen * 0.5 ? cut.slice(0, lastSpace) : cut;
  return `${body.trim()}…`;
}

/**
 * Parse any date-ish string into an ISO string, or null. Never throws.
 */
export function parseDate(input?: string | null): string | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;
  try {
    const d = new Date(trimmed);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
  } catch {
    return null;
  }
}
