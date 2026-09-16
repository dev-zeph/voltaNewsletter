// ============================================================================
// Bob — the zero-credential brain. Runs whenever ANTHROPIC_API_KEY is absent,
// and as the per-item fallback when an LLM batch call fails. This is the
// demo's safety net, so it has to be genuinely good, not a stub.
// ============================================================================

import type { AudienceTag, RawItem, Section } from '@/lib/types';
import { SECTIONS } from '@/lib/types';

export interface EnrichedFields {
  section: Section;
  audiences: AudienceTag[];
  score: number; // 0-100
  why: string;
  blurb: string;
  entities: { orgs: string[]; people: string[]; amount?: string };
}

export interface EnrichContext {
  authority: number; // 0-1, from the item's SourceConfig
  boost: string[]; // directive keywords to favour
  suppress: string[]; // directive keywords to bury
  focusSections: Section[];
  note: string; // free-text standing guidance (not scored, informational)
  sectionHint?: Section;
}

// ---------------------------------------------------------------------------
// Keyword families
// ---------------------------------------------------------------------------

const FUNDING_WORDS = [
  'raises', 'raised', 'round', 'seed', 'series', 'investment', 'funding',
  'backs', 'million', '$',
];

const EVENT_WORDS = [
  'event', 'workshop', 'demo day', 'panel', 'meetup', 'register', 'rsvp',
  'join us', 'hosted',
];

const JOB_WORDS = [
  'hiring', 'job', 'career', "we're looking for", 'join our team', 'role',
];

const OPPORTUNITY_WORDS = [
  'grant', 'program', 'apply', 'deadline', 'applications open', 'cohort',
  'accelerator', 'scholarship', 'call for',
];

const GEO_TERMS = [
  'halifax', 'nova scotia', 'atlantic canada', 'dartmouth', 'moncton',
  'fredericton', "st. john's", 'new brunswick', 'pei', 'newfoundland',
  'volta', 'dalhousie', "saint mary's",
];

const BUILDER_WORDS = ['technical', 'engineering', 'api', 'developer'];
const COACH_WORDS = ['mentor', 'coach', 'advisor'];
const INVESTOR_WORDS = ['lp', 'vc', 'investor', 'fund'];

const ORG_SUFFIXES = [
  'inc', 'ltd', 'corp', 'llc', 'co', 'labs', 'technologies', 'tech',
  'systems', 'capital', 'ventures', 'group', 'solutions', 'health',
  'robotics', 'software', 'biosciences', 'industries', 'partners',
  'foundation', 'university', 'college', 'institute', 'holdings',
];

const ROLE_WORDS = [
  'ceo', 'cto', 'coo', 'founder', 'co-founder', 'cofounder', 'president',
  'professor', 'dr', 'dr.', 'minister', 'director', 'chair', 'chief',
];

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

/** No em dashes anywhere in generated copy. */
function stripEmDash(s: string): string {
  return s.replace(/—/g, ', ').replace(/\s{2,}/g, ' ').trim();
}

function countHits(haystack: string, words: string[]): number {
  let count = 0;
  for (const w of words) {
    if (!w) continue;
    if (haystack.includes(w.toLowerCase())) count++;
  }
  return count;
}

function matchedTerms(haystack: string, words: string[]): string[] {
  const out: string[] = [];
  for (const w of words) {
    if (w && haystack.includes(w.toLowerCase())) out.push(w);
  }
  return out;
}

function properCase(term: string): string {
  return term
    .split(' ')
    .map((w) => (w.length > 0 ? w[0].toUpperCase() + w.slice(1) : w))
    .join(' ');
}

/**
 * Publishers whose entire beat is this region. The value is the geographic
 * term to credit when the item's own text does not name a place.
 */
const LOCAL_PUBLISHERS: Array<[match: string, term: string]> = [
  ['voltaeffect', 'volta'],
  ['volta', 'volta'],
  ['dalhousie', 'dalhousie'],
  ['springboard', 'atlantic canada'],
  ['entrevestor', 'atlantic canada'],
];

function implicitGeoTerm(item: RawItem): string | null {
  const hay = `${item.sourceName} ${item.sourceId} ${item.url}`.toLowerCase();
  for (const [match, term] of LOCAL_PUBLISHERS) {
    if (hay.includes(match)) return term;
  }
  return null;
}

function isVoltaSource(item: RawItem): boolean {
  const hay = `${item.sourceName} ${item.url}`.toLowerCase();
  return hay.includes('voltaeffect.com') || hay.includes('volta');
}

// ---------------------------------------------------------------------------
// Section detection
// ---------------------------------------------------------------------------

const SECTION_LABEL: Record<Section, string> = {
  'volta-update': 'Volta update',
  funding: 'funding round',
  events: 'local event',
  jobs: 'hiring post',
  ecosystem: 'ecosystem story',
  opportunity: 'program opportunity',
};

function detectSection(item: RawItem, ctx: EnrichContext): Section {
  const title = item.title.toLowerCase();
  const excerpt = (item.excerpt || '').toLowerCase();
  // Title matches count double: the headline is the strongest signal.
  const hay = `${title} ${title} ${excerpt}`;

  const scores: Partial<Record<Section, number>> = {
    funding: countHits(hay, FUNDING_WORDS),
    events: countHits(hay, EVENT_WORDS),
    jobs: countHits(hay, JOB_WORDS),
    opportunity: countHits(hay, OPPORTUNITY_WORDS),
  };

  const families: Section[] = ['funding', 'events', 'jobs', 'opportunity'];
  let best: Section | null = null;
  let bestScore = 0;
  for (const f of families) {
    const s = scores[f] ?? 0;
    if (s > bestScore) {
      bestScore = s;
      best = f;
    }
  }
  // Collect ties at the top score for the hint tie-break.
  const tied = bestScore > 0 ? families.filter((f) => (scores[f] ?? 0) === bestScore) : [];
  if (tied.length > 1 && ctx.sectionHint && tied.includes(ctx.sectionHint)) {
    return ctx.sectionHint;
  }

  const fromVolta = isVoltaSource(item);

  if (bestScore > 0) {
    // A keyword family won. Volta's own funding/event news still gets
    // classified as that section, unless the operator explicitly wants it
    // filed under volta-update.
    if (fromVolta && ctx.sectionHint === 'volta-update') return 'volta-update';
    return best as Section;
  }

  if (fromVolta) return 'volta-update';

  if (ctx.sectionHint) return ctx.sectionHint;

  return 'ecosystem';
}

// ---------------------------------------------------------------------------
// Score
// ---------------------------------------------------------------------------

function scoreRecency(publishedAt: string | null): number {
  if (!publishedAt) return 10; // mild penalty for unknown date
  const t = Date.parse(publishedAt);
  if (Number.isNaN(t)) return 10;
  const daysOld = Math.max(0, (Date.now() - t) / (1000 * 60 * 60 * 24));
  let base = 25 * Math.exp(-daysOld / 6);
  if (daysOld > 21) base *= 0.3; // falls off hard past three weeks
  return base;
}

function scoreSection(section: Section): number {
  const table: Record<Section, number> = {
    funding: 15,
    'volta-update': 15,
    events: 13,
    opportunity: 12,
    jobs: 8,
    ecosystem: 4,
  };
  return table[section];
}

function scoreGeo(geoHits: number): number {
  if (geoHits === 0) return -15; // much less useful with no Atlantic angle
  return Math.min(30, 15 + (geoHits - 1) * 5);
}

// ---------------------------------------------------------------------------
// Audiences
// ---------------------------------------------------------------------------

function baseAudiences(section: Section): AudienceTag[] {
  switch (section) {
    case 'funding':
      return ['founders', 'investors'];
    case 'events':
      return ['founders', 'builders', 'coaches', 'investors', 'community'];
    case 'jobs':
      return ['builders', 'community'];
    case 'opportunity':
      return ['founders', 'builders'];
    case 'volta-update':
      return ['community', 'founders'];
    case 'ecosystem':
    default:
      return ['founders', 'community'];
  }
}

function refineAudiences(hay: string, audiences: AudienceTag[]): AudienceTag[] {
  const set = new Set(audiences);
  if (countHits(hay, BUILDER_WORDS) > 0) set.add('builders');
  if (countHits(hay, COACH_WORDS) > 0) set.add('coaches');
  if (countHits(hay, INVESTOR_WORDS) > 0) set.add('investors');
  return Array.from(set);
}

// ---------------------------------------------------------------------------
// Entities
// ---------------------------------------------------------------------------

const AMOUNT_RE =
  /\b(?:CAD\s*)?\$\s?\d[\d,]*(?:\.\d+)?\s*(?:million|billion|thousand|M|B|K)?\b|\bCAD\s+\d[\d,]*(?:\.\d+)?\s*(?:million|billion|thousand|M|B|K)?\b/i;

const CAP_SPAN_RE = /\b[A-Z][a-zA-Z0-9&.'-]*(?:\s+[A-Z][a-zA-Z0-9&.'-]*)+\b/g;

function extractEntities(item: RawItem): { orgs: string[]; people: string[]; amount?: string } {
  const title = item.title;
  const excerptLower = (item.excerpt || '').toLowerCase();

  const spans = Array.from(new Set(title.match(CAP_SPAN_RE) ?? []));

  const orgs: string[] = [];
  const people: string[] = [];

  for (const span of spans) {
    const lower = span.toLowerCase();
    const lastWord = lower.split(' ').pop() ?? '';
    const isOrgBySuffix = ORG_SUFFIXES.some((suf) => lastWord === suf || lastWord.startsWith(suf));

    // Look for a role word immediately preceding this span in the title or
    // excerpt, e.g. "CEO Jane Smith" or "founder John Doe".
    const idx = excerptLower.indexOf(lower);
    let precededByRole = false;
    if (idx > 0) {
      const before = excerptLower.slice(Math.max(0, idx - 20), idx);
      precededByRole = ROLE_WORDS.some((r) => before.includes(r));
    }
    const titleIdx = title.toLowerCase().indexOf(lower);
    if (!precededByRole && titleIdx > 0) {
      const before = title.toLowerCase().slice(Math.max(0, titleIdx - 20), titleIdx);
      precededByRole = ROLE_WORDS.some((r) => before.includes(r));
    }

    if (precededByRole && !isOrgBySuffix) {
      people.push(span);
    } else {
      orgs.push(span);
    }
  }

  const amountMatch = `${title} ${item.excerpt || ''}`.match(AMOUNT_RE);

  return {
    orgs,
    people,
    ...(amountMatch ? { amount: amountMatch[0].trim() } : {}),
  };
}

// ---------------------------------------------------------------------------
// why / blurb
// ---------------------------------------------------------------------------

function recencyLabel(publishedAt: string | null): string {
  if (!publishedAt) return 'publish date unknown';
  const t = Date.parse(publishedAt);
  if (Number.isNaN(t)) return 'publish date unknown';
  const daysOld = (Date.now() - t) / (1000 * 60 * 60 * 24);

  // Event listings carry the date the thing happens, which is usually in the
  // future. "Published today" for a talk three weeks out is just wrong, and it
  // buries the one fact that makes an event worth including.
  if (daysOld < -0.5) {
    const ahead = Math.abs(daysOld);
    if (ahead < 1.5) return 'happening tomorrow';
    if (ahead <= 14) return `happening in ${Math.round(ahead)} days`;
    if (ahead <= 60) return `happening in ${Math.round(ahead / 7)} weeks`;
    return `happening in ${Math.round(ahead / 30)} months`;
  }

  if (daysOld < 1) return 'published today';
  if (daysOld < 2) return 'published yesterday';
  if (daysOld <= 21) return `published ${Math.round(daysOld)} days ago`;
  return `published over ${Math.round(daysOld / 7)} weeks ago`;
}

function buildWhy(
  item: RawItem,
  section: Section,
  geoTerms: string[],
  boostHits: string[],
): string {
  const recency = recencyLabel(item.publishedAt);
  const sectionLabel = SECTION_LABEL[section];
  let sentence: string;
  if (geoTerms.length > 0) {
    const geoPrefix = properCase(geoTerms[0]);
    // "Volta Volta update" reads like a bug, because it is one. If the section
    // label already carries the place, do not say it twice.
    sentence = sectionLabel.toLowerCase().includes(geoTerms[0].toLowerCase())
      ? `${sectionLabel[0].toUpperCase()}${sectionLabel.slice(1)}, ${recency}.`
      : `${geoPrefix} ${sectionLabel}, ${recency}.`;
  } else {
    const capSection = sectionLabel[0].toUpperCase() + sectionLabel.slice(1);
    sentence = `${capSection}, ${recency}, no direct Atlantic Canada angle.`;
  }
  if (boostHits.length > 0) {
    sentence += ` Matches your interest in ${boostHits[0]}.`;
  }
  return stripEmDash(sentence);
}

function firstSentences(text: string, maxChars: number): string {
  if (!text) return '';
  const sentences = text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [text];
  let out = '';
  for (const s of sentences) {
    const candidate = (out + s).trim();
    if (candidate.length > maxChars) break;
    out = out + s;
    if (out.trim().length > 0 && sentences.indexOf(s) >= 1) break; // cap at ~2 sentences
  }
  out = out.trim();
  if (!out) {
    out = text.slice(0, maxChars);
  }
  if (out.length > maxChars) {
    const cut = out.slice(0, maxChars);
    const lastSpace = cut.lastIndexOf(' ');
    out = (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trim() + '...';
  }
  return out;
}

function buildBlurb(item: RawItem): string {
  const source = item.excerpt && item.excerpt.trim().length > 0 ? item.excerpt : item.title;
  return stripEmDash(firstSentences(source.trim(), 220));
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function heuristicEnrich(item: RawItem, ctx: EnrichContext): EnrichedFields {
  const title = item.title.toLowerCase();
  const excerpt = (item.excerpt || '').toLowerCase();
  const hay = `${title} ${excerpt}`;

  const section = detectSection(item, ctx);

  // A source that only ever publishes about this region carries the geographic
  // signal itself. Volta's own event listings rarely say "Halifax" in the body,
  // and without this they were scored as having no Atlantic Canada angle and
  // described that way on the card, which reads as nonsense next to a Volta
  // logo.
  const geoHits = (() => {
    const fromText = matchedTerms(hay, GEO_TERMS);
    if (fromText.length > 0) return fromText;
    const implicit = implicitGeoTerm(item);
    return implicit ? [implicit] : [];
  })();
  const boostHits = matchedTerms(hay, ctx.boost.map((b) => b.toLowerCase()));
  const suppressHits = matchedTerms(hay, ctx.suppress.map((s) => s.toLowerCase()));

  const recencyScore = scoreRecency(item.publishedAt);
  const authorityScore = clamp(ctx.authority, 0, 1) * 15;
  const geoScore = scoreGeo(geoHits.length);
  const sectionScore = scoreSection(section);
  const boostScore = boostHits.length * 8;
  const suppressScore = suppressHits.length * -25;
  const focusScore = ctx.focusSections.includes(section) ? 12 : 0;

  const total =
    recencyScore + authorityScore + geoScore + sectionScore + boostScore + suppressScore + focusScore;
  const score = clamp(Math.round(total), 0, 100);

  const audiences = refineAudiences(hay, baseAudiences(section));

  const why = buildWhy(item, section, geoHits, boostHits);
  const blurb = buildBlurb(item);
  const entities = extractEntities(item);

  // Belt-and-suspenders: detectSection only ever returns a valid Section,
  // but the pipeline contract says nothing may throw, so fall back instead
  // of trusting that invariant.
  const safeSection: Section = SECTIONS.includes(section) ? section : 'ecosystem';

  return { section: safeSection, audiences, score, why, blurb, entities };
}
