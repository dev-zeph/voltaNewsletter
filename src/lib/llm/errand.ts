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

  const BOOST_LEAD = /^(more|find|get|add|include|look for)\b\s*/i;
  const SUPPRESS_LEAD = /^(less|drop|no|remove|stop|skip|without)\b\s*/i;

  for (const clause of clauses) {
    if (BOOST_LEAD.test(clause)) {
      const topic = clause.replace(BOOST_LEAD, '').trim();
      if (topic) {
        boost.push(topic);
        extraQueries.push(`${topic} Nova Scotia`);
      }
    } else if (SUPPRESS_LEAD.test(clause)) {
      const topic = clause.replace(SUPPRESS_LEAD, '').trim();
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
