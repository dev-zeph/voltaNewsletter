import Anthropic from '@anthropic-ai/sdk';
import { getClient, MODEL } from '@/lib/llm/client';
import { canonicalUrl, cleanText, parseDate } from '@/lib/sources/fetchUtil';
import type { RawItem, SourceConfig } from '@/lib/types';

/**
 * The one source that reasons instead of parsing.
 *
 * Every other adapter can only find what a publisher decided to syndicate.
 * That covers the predictable beats and misses the specific ones: a regional
 * awards list, a program deadline announced only in a newsletter, a company
 * milestone covered once by a weekly nobody has added as a feed. For those the
 * user knows the thing exists but not where it lives, which is exactly the
 * question a search agent is good at and a feed parser cannot answer at all.
 *
 * `cfg.url` holds a plain-English brief rather than a URL.
 *
 * Cost and latency are real here, so this never runs on the scheduled sweep.
 * It runs when someone asks for something specific.
 */

/** Keeps one brief bounded. Each use is a round trip. */
const MAX_SEARCHES = 4;
const MAX_ITEMS = 8;
const REQUEST_TIMEOUT_MS = 75_000;

const SYSTEM = `You are Bob, the research assistant for Volta, an innovation hub in Halifax, Nova Scotia.

Volta's community is startup founders, technical builders, coaches and mentors, investors, and the wider Atlantic Canada innovation community.

You have been given one research brief. Use web search to answer it, then report what you actually found.

Rules:
- Search for real, current, specific items. Prefer Atlantic Canada sources and Atlantic Canada relevance.
- Only report things you actually found a source URL for. Never invent an item, a date, a name, or a URL. An empty result is a correct answer when nothing exists.
- Prefer the original announcement over aggregator coverage of it.
- Ignore anything older than about three months unless the brief explicitly asks for history.

When you are done searching, end your reply with a single fenced json block and nothing after it:

\`\`\`json
{"items":[{"title":"...","url":"https://...","publishedAt":"YYYY-MM-DD or null","summary":"one or two plain sentences, no marketing adjectives"}]}
\`\`\`

Report at most ${MAX_ITEMS} items, best first. If you found nothing, return {"items":[]}.
Do not use em dashes anywhere. Use commas, colons or periods.`;

interface AgentItem {
  title?: unknown;
  url?: unknown;
  publishedAt?: unknown;
  summary?: unknown;
}

export async function fetchAgentSearch(cfg: SourceConfig): Promise<RawItem[]> {
  const client = getClient();
  if (!client) return [];

  const brief = cfg.url?.trim();
  if (!brief) return [];

  try {
    const response = await client.messages.create(
      {
        model: MODEL,
        max_tokens: 8000,
        system: SYSTEM,
        output_config: { effort: 'medium' },
        tools: [
          {
            type: 'web_search_20260318',
            name: 'web_search',
            max_uses: MAX_SEARCHES,
            // Bias results toward the region Volta actually operates in.
            user_location: {
              type: 'approximate',
              country: 'CA',
              region: 'Nova Scotia',
              city: 'Halifax',
              timezone: 'America/Halifax',
            },
          },
        ],
        messages: [{ role: 'user', content: `Research brief: ${brief}` }],
      },
      { timeout: REQUEST_TIMEOUT_MS },
    );

    const fromJson = parseReportedItems(response, cfg);
    if (fromJson.length) return fromJson;

    // Claude searched but did not produce usable JSON. The raw search results
    // are still real findings, so fall back to those rather than losing the
    // whole errand to a formatting slip.
    return harvestSearchResults(response, cfg);
  } catch (err) {
    if (err instanceof Anthropic.APIError) {
      console.warn(`[bob] agent search failed (${err.status}): ${err.message}`);
    } else {
      console.warn('[bob] agent search failed:', err);
    }
    return [];
  }
}

/** Pulls the fenced json block out of Claude's reply. */
function parseReportedItems(
  response: Anthropic.Message,
  cfg: SourceConfig,
): RawItem[] {
  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n');

  const fenced = /```json\s*([\s\S]*?)```/i.exec(text);
  const candidate = fenced ? fenced[1] : sliceOutermostObject(text);
  if (!candidate) return [];

  let parsed: { items?: unknown };
  try {
    parsed = JSON.parse(candidate) as { items?: unknown };
  } catch {
    return [];
  }
  if (!Array.isArray(parsed.items)) return [];

  const out: RawItem[] = [];
  for (const entry of parsed.items as AgentItem[]) {
    const title = typeof entry?.title === 'string' ? entry.title.trim() : '';
    const rawUrl = typeof entry?.url === 'string' ? entry.url.trim() : '';
    if (!title || !/^https?:\/\//i.test(rawUrl)) continue;

    out.push({
      title,
      url: canonicalUrl(rawUrl),
      publishedAt:
        typeof entry?.publishedAt === 'string' ? parseDate(entry.publishedAt) : null,
      excerpt:
        typeof entry?.summary === 'string' ? cleanText(entry.summary, 400) : '',
      sourceId: cfg.id,
      sourceName: cfg.name,
      meta: { researchBrief: cfg.url },
    });
    if (out.length >= MAX_ITEMS) break;
  }
  return out;
}

/** Last resort: the search tool's own result blocks. */
function harvestSearchResults(
  response: Anthropic.Message,
  cfg: SourceConfig,
): RawItem[] {
  const out: RawItem[] = [];

  for (const block of response.content) {
    if (block.type !== 'web_search_tool_result') continue;

    // A failed search returns an error object here, not a list. Indexing it
    // without checking is the documented way to crash on this tool.
    const content = block.content;
    if (!Array.isArray(content)) {
      console.warn(
        `[bob] web search error for "${cfg.name}": ${
          (content as { error_code?: string })?.error_code ?? 'unknown'
        }`,
      );
      continue;
    }

    for (const result of content) {
      if (result.type !== 'web_search_result') continue;
      if (!result.title || !result.url) continue;
      out.push({
        title: result.title,
        url: canonicalUrl(result.url),
        publishedAt: parseDate(result.page_age),
        excerpt: '',
        sourceId: cfg.id,
        sourceName: cfg.name,
        meta: { researchBrief: cfg.url },
      });
      if (out.length >= MAX_ITEMS) return out;
    }
  }

  return out;
}

/** Handles a reply that emitted bare JSON without the fence. */
function sliceOutermostObject(text: string): string | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  return text.slice(start, end + 1);
}
