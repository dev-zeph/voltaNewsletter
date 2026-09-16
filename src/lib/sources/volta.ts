// ============================================================================
// Bob — voltaeffect.com scraper. This is the single most important source:
// Volta's own news and events are the content nobody at Volta has time to
// repackage, so if this file goes dark Bob is missing the point.
//
// Verified live on 2026-09-16:
//   - https://voltaeffect.com/blog serves a Next.js-rendered listing. There
//     is no RSS feed (voltaeffect.com/feed -> 404), so this is a real
//     cheerio scrape. Cards are `<article class="group flex h-full flex-col">`
//     (31 on the page), each containing an `h2/h3 > a[href="/news/..."]`
//     title link, a first `<p>` with a plain-English date
//     ("September 23, 2025") and a second `<p>` with the excerpt.
//   - https://voltaeffect.com/events has no usable dated cards in the DOM
//     (the visible "Recurring gatherings" cards are evergreen program blurbs
//     with no link or date at all) but the page embeds a schema.org
//     `ItemList` of `Event` nodes in a `<script type="application/ld+json">`
//     tag ("Upcoming Volta events", 6 items when checked), each with name,
//     description, startDate, an Eventbrite/organizer url, and a street
//     address. That JSON-LD block is the real, structured source of truth
//     for events and is what this file parses first. A best-effort card
//     scrape (same candidate-selector approach as the news page) is kept as
//     a fallback in case Volta ever removes the JSON-LD, but it will
//     currently find nothing usable and that is fine: this file must never
//     fail the pipeline, only return fewer items.
//
// If voltaeffect.com is unreachable or a future redesign defeats both the
// JSON-LD parse and the card-selector fallback, both functions below catch
// everything internally and resolve to `[]` rather than throw.
// ============================================================================

import * as cheerio from 'cheerio';
import type { AnyNode } from 'domhandler';
import type { RawItem, SourceConfig } from '@/lib/types';
import { canonicalUrl, cleanText, fetchText, parseDate } from './fetchUtil';

const ORIGIN = 'https://voltaeffect.com';
const MAX_ITEMS = 25;

// Candidate selectors, tried in order, for a "listing of cards" page.
// The first selector that yields >= 2 plausible (title + href) results wins.
const CANDIDATE_SELECTORS = [
  'article',
  '[class*="post"]',
  '[class*="card"]',
  '[class*="event"]',
  'h2 a',
  'h3 a',
];

interface ScrapedCard {
  title: string;
  url: string;
  dateText: string | null;
  excerpt: string;
}

function resolveUrl(href: string, origin: string): string | null {
  try {
    return canonicalUrl(new URL(href, origin).toString());
  } catch {
    return null;
  }
}

/**
 * Resilient card scraper shared by the news and events fallback paths.
 * Tries each candidate selector until one yields >= 2 elements that
 * actually resolve to a title + absolute href, then extracts a "first
 * paragraph = date, second paragraph = excerpt" shape (true for the Volta
 * blog listing; harmless if there simply are no matching paragraphs).
 */
function scrapeCards($: cheerio.CheerioAPI, origin: string): ScrapedCard[] {
  for (const selector of CANDIDATE_SELECTORS) {
    const found = $(selector);
    if (found.length < 2) continue;

    const seen = new Set<string>();
    const cards: ScrapedCard[] = [];

    found.each((_, el: AnyNode) => {
      const node = $(el);
      const linkEl = node.is('a') ? node : node.find('h2 a, h3 a, a[href]').first();
      if (!linkEl.length) return;

      const href = linkEl.attr('href');
      const title = cleanText(linkEl.text(), 200);
      if (!href || !title || title.length < 4) return;

      const url = resolveUrl(href, origin);
      if (!url || seen.has(url)) return;
      seen.add(url);

      const paragraphs = node.is('a') ? node.parent().find('p') : node.find('p');
      const dateText = paragraphs.eq(0).text().trim() || null;
      const excerptRaw = paragraphs.length > 1 ? paragraphs.eq(1).text() : paragraphs.eq(0).text();

      cards.push({
        title,
        url,
        dateText,
        excerpt: cleanText(excerptRaw ?? '', 400),
      });
    });

    if (cards.length >= 2) return cards;
  }

  return [];
}

/**
 * Volta's blog listing carries no dates in its markup, so without a second
 * pass every Volta item arrives dateless and the recency signal is dead. That
 * is not cosmetic: the listing mixes current announcements with posts going
 * back years, and a dateless two-year-old post scores the same as this
 * morning's. The individual post pages do expose the date, so we hydrate.
 */
const DATE_HYDRATION_LIMIT = MAX_ITEMS;
const DATE_HYDRATION_CONCURRENCY = 8;

async function fetchPublishedAt(url: string): Promise<string | null> {
  try {
    const html = await fetchText(url, 8000);
    const match =
      /<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)["']/i.exec(
        html,
      ) ??
      /"datePublished"\s*:\s*"([^"]+)"/.exec(html) ??
      /<time[^>]+dateTime=["']([^"']+)["']/i.exec(html);
    return match ? parseDate(match[1]) : null;
  } catch {
    return null;
  }
}

/** Small worker pool. Volta should not get 14 simultaneous requests from us. */
async function hydrateDates(items: RawItem[]): Promise<void> {
  const targets = items
    .slice(0, DATE_HYDRATION_LIMIT)
    .filter((item) => !item.publishedAt);
  if (!targets.length) return;

  let cursor = 0;
  const worker = async () => {
    while (cursor < targets.length) {
      const item = targets[cursor++];
      item.publishedAt = await fetchPublishedAt(item.url);
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(DATE_HYDRATION_CONCURRENCY, targets.length) }, worker),
  );
}

export async function fetchVoltaNews(cfg: SourceConfig): Promise<RawItem[]> {
  try {
    const html = await fetchText(`${ORIGIN}/blog`, 12000);
    const $ = cheerio.load(html);
    const cards = scrapeCards($, ORIGIN);

    const items: RawItem[] = cards.slice(0, MAX_ITEMS).map((card) => ({
      title: card.title,
      url: card.url,
      publishedAt: parseDate(card.dateText),
      excerpt: card.excerpt,
      sourceId: cfg.id,
      sourceName: cfg.name,
    }));

    await hydrateDates(items);
    return items;
  } catch {
    // Volta's markup or availability defeated the scraper. Degrade, do not fail.
    return [];
  }
}

interface JsonLdEvent {
  '@type'?: string;
  name?: string;
  description?: string;
  startDate?: string;
  url?: string;
  location?: {
    name?: string;
    address?: {
      streetAddress?: string;
      addressLocality?: string;
      addressRegion?: string;
    };
  };
}

interface ExtractedEvent {
  title: string;
  url: string;
  startDate: string | null;
  excerpt: string;
  meta: Record<string, string>;
}

function extractEventsFromJsonLd($: cheerio.CheerioAPI): ExtractedEvent[] {
  const results: ExtractedEvent[] = [];

  $('script[type="application/ld+json"]').each((_, el) => {
    if (results.length > 0) return;
    const raw = $(el).contents().text();
    if (!raw || !raw.includes('"ItemList"') || !raw.includes('"Event"')) return;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return;
    }

    const blocks = Array.isArray(parsed) ? parsed : [parsed];
    const itemList = blocks.find(
      (b): b is { itemListElement: Array<{ item?: JsonLdEvent }> } =>
        !!b && typeof b === 'object' && (b as { '@type'?: string })['@type'] === 'ItemList' && Array.isArray((b as { itemListElement?: unknown }).itemListElement),
    );
    if (!itemList) return;

    for (const entry of itemList.itemListElement) {
      const ev = entry?.item;
      if (!ev || ev['@type'] !== 'Event') continue;

      const title = cleanText(String(ev.name ?? ''), 200);
      const url = ev.url ? canonicalUrl(String(ev.url)) : '';
      if (!title || !url) continue;

      const meta: Record<string, string> = {};
      if (ev.startDate) meta.eventDate = ev.startDate;
      const addr = ev.location?.address;
      if (addr) {
        const parts = [addr.streetAddress, addr.addressLocality, addr.addressRegion].filter(Boolean);
        if (parts.length) meta.location = parts.join(', ');
      } else if (ev.location?.name) {
        meta.location = ev.location.name;
      }

      results.push({
        title,
        url,
        startDate: ev.startDate ?? null,
        excerpt: cleanText(String(ev.description ?? ''), 400),
        meta,
      });
    }
  });

  return results;
}

export async function fetchVoltaEvents(cfg: SourceConfig): Promise<RawItem[]> {
  try {
    const html = await fetchText(`${ORIGIN}/events`, 12000);
    const $ = cheerio.load(html);

    const jsonLdEvents = extractEventsFromJsonLd($);

    if (jsonLdEvents.length >= 1) {
      return jsonLdEvents.slice(0, MAX_ITEMS).map((ev) => ({
        title: ev.title,
        url: ev.url,
        publishedAt: parseDate(ev.startDate),
        excerpt: ev.excerpt,
        sourceId: cfg.id,
        sourceName: cfg.name,
        meta: Object.keys(ev.meta).length ? ev.meta : undefined,
      }));
    }

    // Fallback: JSON-LD gone, try a plain card scrape. Real Volta event
    // cards observed at verification time had no href or date at all, so
    // this will likely yield nothing usable, which is fine, not fatal.
    const cards = scrapeCards($, ORIGIN);
    return cards.slice(0, MAX_ITEMS).map((card) => ({
      title: card.title,
      url: card.url,
      publishedAt: parseDate(card.dateText),
      excerpt: card.excerpt,
      sourceId: cfg.id,
      sourceName: cfg.name,
    }));
  } catch {
    // Volta's markup or availability defeated the scraper. Degrade, do not fail.
    return [];
  }
}
