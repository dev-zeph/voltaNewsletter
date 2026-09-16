// ============================================================================
// Bob — errand parsing. Turns plain-English instructions from Bader into a
// structured Directive. Falls back to a keyword parser with zero credentials.
// Never throws.
// ============================================================================

import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import Anthropic from '@anthropic-ai/sdk';
import type { Directive, Section } from '@/lib/types';
import { SECTIONS } from '@/lib/types';
import { getClient, hasLlm, MODEL } from './client';

type DirectiveDraft = Omit<Directive, 'id' | 'createdAt'>;

const DirectiveSchema = z.object({
  boost: z.array(z.string()),
  suppress: z.array(z.string()),
  extraQueries: z.array(z.string()),
  researchBriefs: z.array(z.string()),
  extraFeeds: z.array(z.string()),
  focusSections: z.array(z.enum(SECTIONS as [Section, ...Section[]])),
  note: z.string(),
  persistent: z.boolean(),
});

function buildSystemPrompt(availableSourceNames: string[]): string {
  return `You are Bob, Volta's newsletter researcher, an assistant to a Halifax
innovation hub. Bader is about to give you a plain-English errand: an
instruction about what to look for, ignore, or double-check on this sourcing
run.

Turn the instruction into a structured directive with these fields:

- "boost": short keyword phrases to favour when scoring items this run
  (and in future runs if persistent).
- "suppress": short keyword phrases that should push an item's score down,
  or bury it entirely, e.g. topics Bader said to drop or stop sending.
- "extraQueries": Google News search strings to run THIS time, scoped to
  Atlantic Canada where it makes sense. This is the highest-value field.
  A vague topic like "ocean tech" should become specific, regionally scoped
  queries such as "ocean technology Nova Scotia startup" or "oceantech
  Halifax funding". Write 1-4 queries. Do not write generic unscoped
  queries when a regional angle is implied.
- "researchBriefs": plain-English research questions for a web-search agent.
  Use these for asks that a news search will NOT answer, where the thing is
  specific and probably not syndicated in any feed: an awards list, a cohort
  announcement, a program deadline, a specific organisation's recent activity.
  "Digital Nova Scotia's awards" is exactly this shape: it is a real thing,
  Bader knows it exists, and no RSS feed carries it. Write it as a question an
  assistant could go and answer, e.g. "Who won Digital Nova Scotia's most
  recent awards, and when is the next round". Write 0-2 briefs, and only when
  a keyword query genuinely would not work. These cost real money and time, so
  do not use one where extraQueries would do.
- "extraFeeds": only include a URL here if Bader named an actual website or
  feed URL to check. Available named sources Bob already knows about:
  ${availableSourceNames.join(', ') || 'none'}. If Bader references one of
  these by name without a URL, leave extraFeeds empty since Bob already
  polls it; only add a URL if it is new or was explicitly given.
- "focusSections": which of these sections to prioritise this run:
  ${SECTIONS.join(', ')}.
- "note": a short free-text restatement of the standing guidance, to hand
  to the scoring model as context.
- "persistent": true if this reads like a standing preference that should
  apply to every future run (language like "always", "from now on", "I
  never want", "stop sending me"). False if it is a one-off ask for this
  run only.

No em dashes anywhere in your output. Use commas or periods.`;
}

function fallbackParse(rawText: string): DirectiveDraft {
  const boost: string[] = [];
  const suppress: string[] = [];
  const extraQueries: string[] = [];
  const focusSections: Section[] = [];

  const SECTION_WORD_MAP: Array<[RegExp, Section]> = [
    [/\bfunding\b/i, 'funding'],
    [/\bevent(s)?\b/i, 'events'],
    [/\bjob(s)?\b|\bhiring\b/i, 'jobs'],
    [/\bgrant(s)?\b|\bprogram(s)?\b/i, 'opportunity'],
  ];

  // Split on commas and "and" into individual clauses.
  const clauses = rawText
    .split(/,|\band\b/i)
    .map((c) => c.trim())
    .filter((c) => c.length > 0);

  const BOOST_LEAD = /^(more|find|get|add|include|look for|look into|dig into)\b\s*/i;
  const SUPPRESS_LEAD = /^(less|drop|no|remove|stop|skip|without|cut)\b\s*/i;

  /**
   * Strips the conversational scaffolding a person naturally types. "find me
   * anything on ocean tech" should yield "ocean tech", not "me anything on
   * ocean tech", because this string is shown back to the user as a directive
   * chip and pushed into a search query.
   */
  const FILLER = /^(me|us|any|anything|some|something|all|the|a|an|about|on|of|for|with|regarding|re|stuff|news|info|information|more)\b\s*/i;
  const TRAILING_FILLER = /\s*\b(stuff|things|news|content|items?)\b$/i;

  const tidy = (raw: string): string => {
    let topic = raw.trim();
    // Peel repeated leading filler: "find me any more stuff about X".
    for (let i = 0; i < 6 && FILLER.test(topic); i++) {
      topic = topic.replace(FILLER, '').trim();
    }
    topic = topic.replace(TRAILING_FILLER, '').trim();
    return topic.replace(/[.!?]+$/, '').trim();
  };

  const REGION = /\b(nova scotia|halifax|atlantic canada|new brunswick|newfoundland|pei|moncton|dartmouth)\b/i;

  for (const clause of clauses) {
    if (BOOST_LEAD.test(clause)) {
      const topic = tidy(clause.replace(BOOST_LEAD, ''));
      if (topic) {
        boost.push(topic);
        // Only scope the query to the region when the user has not already
        // named one, otherwise you get "ocean tech Nova Scotia Nova Scotia".
        extraQueries.push(
          REGION.test(topic) ? topic : `${topic} Nova Scotia`,
        );
      }
    } else if (SUPPRESS_LEAD.test(clause)) {
      const topic = tidy(clause.replace(SUPPRESS_LEAD, ''));
      if (topic) suppress.push(topic);
    }

    for (const [re, section] of SECTION_WORD_MAP) {
      if (re.test(clause) && !focusSections.includes(section)) {
        focusSections.push(section);
      }
    }
  }

  const persistent = /\b(always|never|from now on|going forward|stop sending)\b/i.test(rawText);

  return {
    rawText,
    boost,
    suppress,
    extraQueries: extraQueries.slice(0, 4),
    // Without an LLM there is no way to tell a research brief from a keyword,
    // so the fallback never invents one. Keyword queries still run.
    researchBriefs: [],
    extraFeeds: [],
    focusSections,
    note: rawText,
    persistent,
  };
}

export async function parseErrand(
  rawText: string,
  availableSourceNames: string[],
): Promise<DirectiveDraft> {
  if (!rawText || rawText.trim().length === 0) {
    return {
      rawText: rawText ?? '',
      boost: [],
      suppress: [],
      extraQueries: [],
      researchBriefs: [],
      extraFeeds: [],
      focusSections: [],
      note: '',
      persistent: false,
    };
  }

  if (!hasLlm()) {
    return fallbackParse(rawText);
  }

  const client = getClient();
  if (!client) {
    return fallbackParse(rawText);
  }

  try {
    const response = await client.messages.parse({
      model: MODEL,
      max_tokens: 4000,
      system: buildSystemPrompt(availableSourceNames),
      messages: [{ role: 'user', content: rawText }],
      output_config: {
        effort: 'medium',
        format: zodOutputFormat(DirectiveSchema),
      },
    });

    const parsed = response.parsed_output;
    if (!parsed) {
      return fallbackParse(rawText);
    }

    return {
      rawText,
      boost: parsed.boost,
      suppress: parsed.suppress,
      extraQueries: parsed.extraQueries.slice(0, 4),
      researchBriefs: parsed.researchBriefs.slice(0, 2),
      extraFeeds: parsed.extraFeeds,
      focusSections: parsed.focusSections,
      note: parsed.note,
      persistent: parsed.persistent,
    };
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      console.warn('[bob] errand parse rate limited, falling back to keyword parser', err.message);
    } else if (err instanceof Anthropic.APIError) {
      console.warn('[bob] errand parse API error, falling back to keyword parser', err.message);
    } else {
      console.warn('[bob] errand parse failed unexpectedly, falling back to keyword parser', err);
    }
    return fallbackParse(rawText);
  }
}
