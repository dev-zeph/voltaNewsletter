// ============================================================================
// Bob — issue composition. Writes the subject line and opening paragraph,
// and the pure first-person run summary. No em dashes anywhere. Never throws.
// ============================================================================

import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import Anthropic from '@anthropic-ai/sdk';
import type { AudienceTag, Section } from '@/lib/types';
import { SECTION_LABELS } from '@/lib/types';
import { getClient, hasLlm, MODEL } from './client';

const ComposeSchema = z.object({
  subject: z.string(),
  intro: z.string(),
});

function stripEmDash(s: string): string {
  return s.replace(/—/g, ', ').replace(/\s{2,}/g, ' ').trim();
}

function todayLabel(): string {
  return new Date().toLocaleDateString('en-CA', { month: 'long', day: 'numeric' });
}

function deterministicCompose(
  kept: Array<{ title: string; section: Section; why: string }>,
  audience: AudienceTag | 'all',
): { subject: string; intro: string } {
  if (kept.length === 0) {
    return {
      subject: `Volta newsletter, ${todayLabel()}: a quiet week`,
      intro: stripEmDash(
        `I did not find enough this run to fill an issue. Nothing crossed the bar, so there is nothing queued for ${
          audience === 'all' ? 'the full list' : audience
        } today.`,
      ),
    };
  }

  // Picking the shortest title put "Yoga" on the subject line of an issue that
  // led with two funding rounds. Lead with the most newsworthy section instead,
  // and skip titles too short to carry a subject line on their own.
  const subjectRank: Section[] = [
    'funding',
    'volta-update',
    'opportunity',
    'events',
    'jobs',
    'ecosystem',
  ];
  const substantial = kept.filter((k) => k.title.trim().split(/\s+/).length >= 3);
  const candidates = substantial.length > 0 ? substantial : kept;
  const top =
    [...candidates].sort(
      (a, b) => subjectRank.indexOf(a.section) - subjectRank.indexOf(b.section),
    )[0] ?? kept[0];

  let subject = `${top.title}: what's new at Volta, ${todayLabel()}`;
  if (subject.length > 65) {
    subject = `${top.title.slice(0, 45).trim()}, ${todayLabel()}`;
  }
  if (subject.length > 65) {
    subject = subject.slice(0, 62).trim() + '...';
  }

  const counts = new Map<Section, number>();
  for (const item of kept) {
    counts.set(item.section, (counts.get(item.section) ?? 0) + 1);
  }
  const parts: string[] = [];
  for (const [section, count] of counts) {
    const label = SECTION_LABELS[section] ?? section;
    parts.push(`${count} in ${label}`);
  }

  const intro = stripEmDash(
    `Here is what I found worth your time this run: ${pluralize(
      kept.length,
      'item',
    )} across ${pluralize(counts.size, 'section')}, ${parts.join(
      ', ',
    )}. Take a look below and tell me if anything should move or go.`,
  );

  return { subject, intro };
}

export async function composeIntro(
  kept: Array<{ title: string; section: Section; why: string }>,
  audience: AudienceTag | 'all',
): Promise<{ subject: string; intro: string }> {
  if (!hasLlm()) {
    return deterministicCompose(kept, audience);
  }

  const client = getClient();
  if (!client) {
    return deterministicCompose(kept, audience);
  }

  if (kept.length === 0) {
    return deterministicCompose(kept, audience);
  }

  const listing = kept
    .map((item, i) => `${i + 1}. [${item.section}] ${item.title}, ${item.why}`)
    .join('\n');

  const system = `You are Bob, Volta's newsletter researcher. Write the subject line and
opening paragraph for this issue of Volta's newsletter, addressed to
${audience === 'all' ? 'the full mailing list' : `the ${audience} segment`}.

Rules:
- "subject" must be specific and reference the single strongest story in
  the list below. Never write a generic subject like "Volta Weekly Update".
  Keep it under 65 characters.
- "intro" is a 2-3 sentence opening paragraph, warm and plain, written like
  a competent colleague. No exclamation marks. No em dashes, ever, use
  commas or periods. No marketing adjectives.
- Do not simply list every headline. Set the tone for the issue.`;

  try {
    const response = await client.messages.parse({
      model: MODEL,
      max_tokens: 2000,
      system,
      messages: [{ role: 'user', content: `Items in this issue:\n${listing}` }],
      output_config: {
        effort: 'medium',
        format: zodOutputFormat(ComposeSchema),
      },
    });

    const parsed = response.parsed_output;
    if (!parsed) {
      return deterministicCompose(kept, audience);
    }

    return {
      subject: stripEmDash(parsed.subject).slice(0, 65),
      intro: stripEmDash(parsed.intro),
    };
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError || err instanceof Anthropic.APIError) {
      console.warn('[bob] compose failed, falling back to deterministic subject/intro', err.message);
    } else {
      console.warn('[bob] compose failed unexpectedly, falling back to deterministic subject/intro', err);
    }
    return deterministicCompose(kept, audience);
  }
}

function pluralize(n: number, noun: string, pluralNoun?: string): string {
  if (n === 1) return `1 ${noun}`;
  return `${n} ${pluralNoun ?? noun + 's'}`;
}

export function bobRunMessage(stats: {
  raw: number;
  deduped: number;
  surfaced: number;
  sourcesOk: number;
  sourcesTotal: number;
  bySection: Partial<Record<Section, number>>;
}): string {
  const { raw, deduped, surfaced, sourcesOk, sourcesTotal, bySection } = stats;

  const sourceClause =
    sourcesTotal > 0
      ? `from ${sourcesOk} of ${sourcesTotal} source${sourcesTotal === 1 ? '' : 's'}`
      : 'from no sources';

  const pulledClause = `I pulled ${pluralize(raw, 'item')} ${sourceClause}.`;

  const dropped = Math.max(0, raw - deduped);

  if (surfaced === 0) {
    const droppedClause =
      dropped > 0
        ? ` After dropping ${pluralize(dropped, 'repeat or already-seen item', 'repeats and things you have already seen')}, nothing cleared the bar this run.`
        : ' Nothing cleared the bar this run.';
    return stripEmDash(pulledClause + droppedClause);
  }

  const sectionEntries = Object.entries(bySection).filter(
    ([, count]) => typeof count === 'number' && count > 0,
  ) as Array<[Section, number]>;

  // Explicit pairs. Naive "+s" turns "event this week" into "event this weeks"
  // and "role open" into "role opens", which reads as a typo in Bob's voice.
  const sectionLabels: Record<Section, [singular: string, plural: string]> = {
    'volta-update': ['Volta update', 'Volta updates'],
    funding: ['funding round', 'funding rounds'],
    events: ['event this week', 'events this week'],
    jobs: ['open role', 'open roles'],
    ecosystem: ['ecosystem story', 'ecosystem stories'],
    opportunity: ['grant or program deadline', 'grant and program deadlines'],
  };

  // Lead with what Bader cares about most, not with whatever hashed first.
  const sectionRank: Section[] = [
    'funding',
    'events',
    'volta-update',
    'opportunity',
    'jobs',
    'ecosystem',
  ];
  sectionEntries.sort(
    (a, b) => sectionRank.indexOf(a[0]) - sectionRank.indexOf(b[0]),
  );

  const sectionParts = sectionEntries.map(([section, count]) => {
    const [singular, plural] = sectionLabels[section];
    return pluralize(count, singular, plural);
  });

  const be = surfaced === 1 ? 'is' : 'are';
  const worthClause = ` After dropping repeats and things you have already seen, ${surfaced} ${be} worth your eyes${
    sectionParts.length > 0 ? `: ${sectionParts.join(', ')}.` : '.'
  }`;

  return stripEmDash(pulledClause + worthClause);
}
