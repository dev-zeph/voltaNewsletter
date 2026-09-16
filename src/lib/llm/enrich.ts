// ============================================================================
// Bob — LLM enrichment. Batches items to Claude for scoring/tagging, with a
// per-item heuristic fallback so this function can never throw and always
// returns exactly items.length results, in order.
// ============================================================================

import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import Anthropic from '@anthropic-ai/sdk';
import type { AudienceTag, RawItem, Section } from '@/lib/types';
import { AUDIENCE_TAGS, SECTIONS } from '@/lib/types';
import { getClient, hasLlm, MODEL } from './client';
import { heuristicEnrich, type EnrichContext, type EnrichedFields } from '@/lib/pipeline/heuristic';

const BATCH_SIZE = 12;

const ResultItemSchema = z.object({
  index: z.number(),
  section: z.enum(SECTIONS as [Section, ...Section[]]),
  audiences: z.array(z.enum(AUDIENCE_TAGS as [AudienceTag, ...AudienceTag[]])),
  score: z.number(),
  why: z.string(),
  blurb: z.string(),
  orgs: z.array(z.string()),
  people: z.array(z.string()),
  amount: z.string().nullable(),
});

const BatchSchema = z.object({
  items: z.array(ResultItemSchema),
});

type BatchResultItem = z.infer<typeof ResultItemSchema>;

interface IndexedRaw {
  globalIndex: number;
  item: RawItem;
  ctx: EnrichContext;
}

function buildSystemPrompt(): string {
  return `You are Bob, Volta's newsletter researcher. Volta is a Halifax innovation
hub. Its community is startup founders, technical builders, coaches and
mentors, investors, and the wider Atlantic Canada innovation community.

Score every item 0-100 for how much this specific community should care,
using this rubric:
- 90-100: Volta's own news, or a milestone from a Volta member company.
- 75-89: an Atlantic Canada funding round, a major local company milestone,
  or a high-value deadline (grant, accelerator, application window).
- 55-74: a relevant regional event or program.
- 30-54: tangentially relevant Canadian tech news, not Atlantic-specific.
- 0-29: not relevant to this community. Filler, or pure national/global
  noise with no Atlantic Canada angle.

For each item write:
- "why": ONE sentence aimed directly at a Volta member, explaining why this
  matters to them. Not a summary of the article. Be concrete.
- "blurb": newsletter-ready copy, 1-2 sentences, plain and specific. No
  marketing adjectives ("exciting", "game-changing", "cutting-edge"). No em
  dashes, ever. Use commas or periods instead.

Also extract "orgs" (organization names mentioned), "people" (person names
mentioned), and "amount" (a dollar figure if one is central to the story,
else null).

The operator has given you standing guidance for this run. Honour it:
- Boost (favour these topics/keywords): {{BOOST}}
- Suppress (bury these topics/keywords, score them low): {{SUPPRESS}}
- Note from the operator: {{NOTE}}

Return one result per input item, matched by its "index". Never invent
items and never skip an index that was given to you.`;
}

function buildUserContent(batch: IndexedRaw[]): string {
  const lines = batch.map(({ item }, i) => {
    const excerpt = (item.excerpt || '').slice(0, 400);
    return JSON.stringify({
      index: i,
      title: item.title,
      source: item.sourceName,
      date: item.publishedAt,
      excerpt,
      url: item.url,
    });
  });
  return `Score and tag these ${batch.length} items. Each line is one JSON item:\n\n${lines.join('\n')}`;
}

function collectContextText(batch: IndexedRaw[]): { boost: string; suppress: string; note: string } {
  const boostSet = new Set<string>();
  const suppressSet = new Set<string>();
  const notes = new Set<string>();
  for (const { ctx } of batch) {
    ctx.boost.forEach((b) => boostSet.add(b));
    ctx.suppress.forEach((s) => suppressSet.add(s));
    if (ctx.note && ctx.note.trim().length > 0) notes.add(ctx.note.trim());
  }
  return {
    boost: boostSet.size > 0 ? Array.from(boostSet).join(', ') : 'none',
    suppress: suppressSet.size > 0 ? Array.from(suppressSet).join(', ') : 'none',
    note: notes.size > 0 ? Array.from(notes).join(' | ') : 'none',
  };
}

async function enrichBatch(
  batch: IndexedRaw[],
): Promise<Array<EnrichedFields & { enrichedBy: 'llm' | 'heuristic' }>> {
  const client = getClient();
  if (!client) {
    return batch.map(({ item, ctx }) => ({ ...heuristicEnrich(item, ctx), enrichedBy: 'heuristic' as const }));
  }

  const { boost, suppress, note } = collectContextText(batch);
  const system = buildSystemPrompt()
    .replace('{{BOOST}}', boost)
    .replace('{{SUPPRESS}}', suppress)
    .replace('{{NOTE}}', note);

  try {
    const response = await client.messages.parse({
      model: MODEL,
      max_tokens: 16000,
      system,
      messages: [{ role: 'user', content: buildUserContent(batch) }],
      output_config: {
        effort: 'low',
        format: zodOutputFormat(BatchSchema),
      },
    });

    const parsed = response.parsed_output;
    if (!parsed) {
      return batch.map(({ item, ctx }) => ({ ...heuristicEnrich(item, ctx), enrichedBy: 'heuristic' as const }));
    }

    const byIndex = new Map<number, BatchResultItem>();
    for (const r of parsed.items) {
      byIndex.set(r.index, r);
    }

    return batch.map(({ item, ctx }, i) => {
      const r = byIndex.get(i);
      if (!r) {
        return { ...heuristicEnrich(item, ctx), enrichedBy: 'heuristic' as const };
      }
      return {
        section: r.section,
        audiences: r.audiences,
        score: Math.max(0, Math.min(100, Math.round(r.score))),
        why: r.why,
        blurb: r.blurb,
        entities: {
          orgs: r.orgs,
          people: r.people,
          ...(r.amount ? { amount: r.amount } : {}),
        },
        enrichedBy: 'llm' as const,
      };
    });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      console.warn('[bob] enrich batch rate limited, falling back to heuristic scoring', err.message);
    } else if (err instanceof Anthropic.APIError) {
      console.warn('[bob] enrich batch API error, falling back to heuristic scoring', err.message);
    } else {
      console.warn('[bob] enrich batch failed unexpectedly, falling back to heuristic scoring', err);
    }
    return batch.map(({ item, ctx }) => ({ ...heuristicEnrich(item, ctx), enrichedBy: 'heuristic' as const }));
  }
}

export async function enrichItems(
  items: RawItem[],
  ctxFor: (item: RawItem) => EnrichContext,
): Promise<Array<EnrichedFields & { enrichedBy: 'llm' | 'heuristic' }>> {
  if (items.length === 0) return [];

  if (!hasLlm()) {
    return items.map((item) => ({ ...heuristicEnrich(item, ctxFor(item)), enrichedBy: 'heuristic' as const }));
  }

  const indexed: IndexedRaw[] = items.map((item, globalIndex) => ({
    globalIndex,
    item,
    ctx: ctxFor(item),
  }));

  const batches: IndexedRaw[][] = [];
  for (let i = 0; i < indexed.length; i += BATCH_SIZE) {
    batches.push(indexed.slice(i, i + BATCH_SIZE));
  }

  const settled = await Promise.allSettled(batches.map((b) => enrichBatch(b)));

  const results: Array<EnrichedFields & { enrichedBy: 'llm' | 'heuristic' }> = new Array(items.length);

  settled.forEach((outcome, batchIdx) => {
    const batch = batches[batchIdx];
    if (outcome.status === 'fulfilled') {
      outcome.value.forEach((res, i) => {
        results[batch[i].globalIndex] = res;
      });
    } else {
      // Whole batch rejected (shouldn't normally happen, enrichBatch catches
      // internally, but Promise.allSettled is the last line of defense).
      batch.forEach(({ globalIndex, item, ctx }) => {
        results[globalIndex] = { ...heuristicEnrich(item, ctx), enrichedBy: 'heuristic' as const };
      });
    }
  });

  // Final safety net: guarantee every slot is filled.
  for (let i = 0; i < items.length; i++) {
    if (!results[i]) {
      results[i] = { ...heuristicEnrich(items[i], ctxFor(items[i])), enrichedBy: 'heuristic' as const };
    }
  }

  return results;
}
