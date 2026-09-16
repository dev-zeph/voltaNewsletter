// ============================================================================
// Bob — Google News RSS adapter. cfg.url holds a raw search QUERY, not a URL;
// this file builds the Google News RSS search URL itself. Verified live:
// https://news.google.com/rss/search?q=...&hl=en-CA&gl=CA&ceid=CA:en returns
// well-formed RSS 2.0 with dozens of items for a broad Nova Scotia query.
// ============================================================================

import Parser from 'rss-parser';
import type { RawItem, SourceConfig } from '@/lib/types';
import { UA, canonicalUrl, cleanText, parseDate } from './fetchUtil';

const MAX_ITEMS = 15;

/**
 * Google News titles arrive as "Headline - Publisher". Split on the last
 * " - " so a headline that itself contains a hyphenated phrase does not get
 * cut in the wrong place.
 */
function splitTitle(raw: string): { title: string; publisher: string | null } {
  const idx = raw.lastIndexOf(' - ');
  if (idx === -1) return { title: raw.trim(), publisher: null };
  const title = raw.slice(0, idx).trim();
  const publisher = raw.slice(idx + 3).trim();
  return { title: title || raw.trim(), publisher: publisher || null };
}

export async function fetchGoogleNews(cfg: SourceConfig): Promise<RawItem[]> {
  const parser = new Parser({
    timeout: 12000,
    headers: { 'User-Agent': UA },
  });

  const searchUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(
    cfg.url,
  )}&hl=en-CA&gl=CA&ceid=CA:en`;

  const feed = await parser.parseURL(searchUrl);
  const items: RawItem[] = [];

  for (const entry of feed.items ?? []) {
    const rawTitle = (entry.title ?? '').trim();
    const link = (entry.link ?? '').trim();
    if (!rawTitle || !link) continue;

    const { title, publisher } = splitTitle(rawTitle);
    const meta: Record<string, string> | undefined = publisher ? { publisher } : undefined;

    items.push({
      title,
      url: canonicalUrl(link),
      publishedAt: parseDate(entry.isoDate ?? entry.pubDate ?? null),
      excerpt: cleanText(entry.contentSnippet ?? entry.content ?? entry.summary ?? ''),
      sourceId: cfg.id,
      sourceName: cfg.name,
      meta,
    });

    if (items.length >= MAX_ITEMS) break;
  }

  return items;
}
