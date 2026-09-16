// ============================================================================
// Bob — generic RSS/Atom adapter. rss-parser handles both formats under one
// API, so this file does not need to branch on feed type.
// ============================================================================

import Parser from 'rss-parser';
import type { RawItem, SourceConfig } from '@/lib/types';
import { UA, canonicalUrl, cleanText, parseDate } from './fetchUtil';

const MAX_ITEMS = 25;

export async function fetchRss(cfg: SourceConfig): Promise<RawItem[]> {
  const parser = new Parser({
    timeout: 12000,
    headers: { 'User-Agent': UA },
  });

  const feed = await parser.parseURL(cfg.url);
  const items: RawItem[] = [];

  for (const entry of feed.items ?? []) {
    const title = (entry.title ?? '').trim();
    const link = (entry.link ?? '').trim();
    if (!title || !link) continue;

    items.push({
      title,
      url: canonicalUrl(link),
      publishedAt: parseDate(entry.isoDate ?? entry.pubDate ?? null),
      excerpt: cleanText(entry.contentSnippet ?? entry.content ?? entry.summary ?? ''),
      sourceId: cfg.id,
      sourceName: cfg.name,
    });

    if (items.length >= MAX_ITEMS) break;
  }

  return items;
}
