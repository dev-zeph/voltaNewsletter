// ============================================================================
// Bob — shared type contract. Every module builds against this file.
// Nothing here may be changed by a subagent without the orchestrator's say-so.
// ============================================================================

/** Who a piece of content is for. Drives newsletter segmentation. */
export type AudienceTag =
  | 'founders'
  | 'builders'
  | 'coaches'
  | 'investors'
  | 'community';

export const AUDIENCE_TAGS: AudienceTag[] = [
  'founders',
  'builders',
  'coaches',
  'investors',
  'community',
];

export const AUDIENCE_LABELS: Record<AudienceTag, string> = {
  founders: 'Founders',
  builders: 'Builders & Technical',
  coaches: 'Coaches & Mentors',
  investors: 'Investors & Partners',
  community: 'Wider Community',
};

/** Which block of the newsletter an item belongs in. */
export type Section =
  | 'volta-update'
  | 'funding'
  | 'events'
  | 'jobs'
  | 'ecosystem'
  | 'opportunity';

export const SECTIONS: Section[] = [
  'volta-update',
  'funding',
  'events',
  'jobs',
  'ecosystem',
  'opportunity',
];

export const SECTION_LABELS: Record<Section, string> = {
  'volta-update': 'From Volta',
  funding: 'Who Got Funded',
  events: "What's On This Week",
  jobs: 'Who Is Hiring',
  ecosystem: 'Around the Ecosystem',
  opportunity: 'Grants, Programs & Deadlines',
};

export const SECTION_ORDER: Section[] = [
  'volta-update',
  'events',
  'funding',
  'opportunity',
  'jobs',
  'ecosystem',
];

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

export type SourceKind = 'rss' | 'html' | 'gnews';

/**
 * Tier 0 works with zero credentials. Tiers 1+ are the "if Bader gives us X"
 * ladder and render on the /sources page as locked cards.
 */
export type SourceTier = 0 | 1 | 2 | 3;

export interface SourceConfig {
  id: string;
  name: string;
  kind: SourceKind;
  /** RSS feed URL, page URL to scrape, or a Google News search query. */
  url: string;
  enabled: boolean;
  tier: SourceTier;
  /** Human text shown on locked sources: what we need to switch it on. */
  requires?: string;
  /** Default section for items from this source (the scorer may override). */
  sectionHint?: Section;
  /** Weight 0..1. Volta's own site outranks a generic news feed. */
  authority: number;
  /** User-added feeds are deletable; built-ins are not. */
  builtin: boolean;
  homepage?: string;
}

/** What a source adapter returns before any enrichment. */
export interface RawItem {
  title: string;
  url: string;
  publishedAt: string | null;
  excerpt: string;
  sourceId: string;
  sourceName: string;
  /** Anything extra the adapter scraped, e.g. event date, location. */
  meta?: Record<string, string>;
}

export interface SourceResult {
  sourceId: string;
  sourceName: string;
  ok: boolean;
  items: RawItem[];
  ms: number;
  error?: string;
}

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

export type Decision = 'pending' | 'keep' | 'drop';

export interface Item {
  id: string;
  runId: string;

  // raw
  title: string;
  url: string;
  sourceId: string;
  sourceName: string;
  publishedAt: string | null;
  fetchedAt: string;
  excerpt: string;
  meta?: Record<string, string>;

  // enrichment
  section: Section;
  audiences: AudienceTag[];
  /** 0-100. Above SCORE_THRESHOLD it gets surfaced to Bader. */
  score: number;
  /** One line: why a Volta member should care. Shown on the card. */
  why: string;
  /** Newsletter-ready copy, 1-2 sentences. Shown in the email. */
  blurb: string;
  entities: { orgs: string[]; people: string[]; amount?: string };
  /** 'llm' when Claude enriched it, 'heuristic' when the fallback did. */
  enrichedBy: 'llm' | 'heuristic';

  // human decisions
  decision: Decision;
  digDeeper: boolean;
}

export const SCORE_THRESHOLD = 45;

// ---------------------------------------------------------------------------
// Directives — the errand system. This is the product's core loop.
// ---------------------------------------------------------------------------

export interface Directive {
  id: string;
  createdAt: string;
  /** Exactly what the user typed. */
  rawText: string;
  /** Keywords to boost in scoring. */
  boost: string[];
  /** Keywords that push an item's score down hard. */
  suppress: string[];
  /** Extra Google News queries to run this time. */
  extraQueries: string[];
  /** Extra RSS/HTML URLs to pull this time. */
  extraFeeds: string[];
  /** Sections to prioritise. */
  focusSections: Section[];
  /** Free text passed into the LLM scorer as standing guidance. */
  note: string;
  /** Persistent directives apply to every future run. This is how Bob learns. */
  persistent: boolean;
}

// ---------------------------------------------------------------------------
// Runs
// ---------------------------------------------------------------------------

export type RunTrigger = 'cron' | 'manual' | 'errand';
export type RunStatus = 'running' | 'done' | 'error';

export interface Run {
  id: string;
  startedAt: string;
  finishedAt: string | null;
  status: RunStatus;
  trigger: RunTrigger;
  /** The directive that shaped this run, if any. */
  directiveId: string | null;
  sourceStats: Array<{
    sourceId: string;
    name: string;
    ok: boolean;
    count: number;
    ms: number;
    error?: string;
  }>;
  rawCount: number;
  dedupedCount: number;
  surfacedCount: number;
  /** Bob's message to the user, written in first person. */
  message: string;
  itemIds: string[];
  error?: string;
}

// ---------------------------------------------------------------------------
// Recipients & issues
// ---------------------------------------------------------------------------

export interface Recipient {
  id: string;
  email: string;
  name: string;
  tags: AudienceTag[];
  active: boolean;
}

export type IssueMode = 'single' | 'segmented';
export type IssueStatus = 'draft' | 'sent';

export interface IssueSection {
  section: Section;
  title: string;
  itemIds: string[];
}

export interface Issue {
  id: string;
  createdAt: string;
  subject: string;
  /** Editable opening paragraph. */
  intro: string;
  signoff: string;
  mode: IssueMode;
  sections: IssueSection[];
  status: IssueStatus;
  sentAt: string | null;
  sendLog: SendLogEntry[];
}

export interface SendLogEntry {
  at: string;
  transport: 'smtp' | 'dry-run';
  audience: AudienceTag | 'all';
  recipients: string[];
  ok: boolean;
  error?: string;
  /** Path to the rendered .html preview written to disk. */
  previewPath?: string;
}

// ---------------------------------------------------------------------------
// Render payload — what the email template consumes
// ---------------------------------------------------------------------------

export interface RenderedSection {
  title: string;
  items: Item[];
}

export interface NewsletterPayload {
  subject: string;
  intro: string;
  signoff: string;
  audience: AudienceTag | 'all';
  audienceLabel: string;
  sections: RenderedSection[];
  issueDate: string;
}
