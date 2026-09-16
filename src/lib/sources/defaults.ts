// ============================================================================
// Bob — default source list. Tier 0 entries are all live-verified (curl'd on
// 2026-09-16, see the per-source notes below). Higher tiers are locked
// (enabled: false) and describe what Bader would need to unlock them; they
// render as the "if Bader gives us X" ladder on the /sources page.
//
// Dropped candidates and why (do not re-add without re-verifying):
//   - digitalnovascotia.com: every path (/, /feed, /news/feed) returns a
//     Vercel bot-protection checkpoint page ("Vercel Security Checkpoint"),
//     429 on the feed paths. No way to fetch it headlessly.
//   - halifaxpartnership.com: /feed, /news/feed both 403.
//   - investnovascotia.ca: no RSS feed found at /feed, /feed/, or via
//     <link rel="alternate"> on the homepage.
//   - techvibes.com, atlanticbusinessmagazine.ca: /feed on both returns
//     200 text/html but it is just the homepage re-served, not a real feed.
//   - smu.ca: no RSS feed found at /feed or /news/feed.
// ============================================================================

import type { SourceConfig } from '@/lib/types';

export const DEFAULT_SOURCES: SourceConfig[] = [
  // ---------------------------------------------------------------------
  // Tier 0 — zero credentials, verified working.
  // ---------------------------------------------------------------------
  {
    id: 'volta-news',
    name: 'Volta News',
    kind: 'html',
    url: 'https://voltaeffect.com/blog',
    enabled: true,
    tier: 0,
    sectionHint: 'volta-update',
    authority: 1.0,
    builtin: true,
    homepage: 'https://voltaeffect.com',
  },
  {
    id: 'volta-events',
    name: 'Volta Events',
    kind: 'html',
    url: 'https://voltaeffect.com/events',
    enabled: true,
    tier: 0,
    sectionHint: 'events',
    authority: 1.0,
    builtin: true,
    homepage: 'https://voltaeffect.com/events',
  },
  {
    // Verified: https://entrevestor.com/rss -> RSS 2.0, 10 items, dated today.
    id: 'entrevestor',
    name: 'Entrevestor',
    kind: 'rss',
    url: 'https://entrevestor.com/rss',
    enabled: true,
    tier: 0,
    sectionHint: 'ecosystem',
    authority: 0.9,
    builtin: true,
    homepage: 'https://entrevestor.com',
  },
  {
    // Verified: https://betakit.com/feed -> RSS 2.0, 150 items on the feed
    // (adapter caps at 25). Canadian tech + funding news.
    id: 'betakit',
    name: 'BetaKit',
    kind: 'rss',
    url: 'https://betakit.com/feed',
    enabled: true,
    tier: 0,
    sectionHint: 'ecosystem',
    authority: 0.8,
    builtin: true,
    homepage: 'https://betakit.com',
  },
  {
    // Verified: https://www.springboardatlantic.ca/feed -> RSS 2.0, 10 items.
    // Atlantic university tech-transfer network: grants, commercialization
    // programs, research-to-market stories.
    id: 'springboard-atlantic',
    name: 'Springboard Atlantic',
    kind: 'rss',
    url: 'https://www.springboardatlantic.ca/feed',
    enabled: true,
    tier: 0,
    sectionHint: 'opportunity',
    authority: 0.4,
    builtin: true,
    homepage: 'https://www.springboardatlantic.ca',
  },
  {
    // Verified: https://www.dal.ca/news.rss.html -> RSS 2.0, 25 items.
    // Broad university news, not startup-specific, so low authority.
    id: 'dal-news',
    name: 'Dalhousie News',
    kind: 'rss',
    url: 'https://www.dal.ca/news.rss.html',
    enabled: true,
    tier: 0,
    sectionHint: 'ecosystem',
    authority: 0.3,
    builtin: true,
    homepage: 'https://www.dal.ca/news.html',
  },
  {
    // Verified: news.google.com/rss/search returns well-formed RSS with
    // dozens of results for this query shape. Scoped tightly to Volta
    // itself so it can double as a backup if the voltaeffect.com scraper
    // ever breaks.
    id: 'gnews-volta',
    name: 'Google News: Volta Halifax',
    kind: 'gnews',
    url: '"Volta" Halifax innovation hub OR coworking',
    enabled: true,
    tier: 0,
    sectionHint: 'volta-update',
    authority: 0.5,
    builtin: true,
    homepage: 'https://news.google.com',
  },
  {
    id: 'gnews-funding',
    name: 'Google News: Nova Scotia Funding',
    kind: 'gnews',
    url: 'Nova Scotia startup funding OR "Atlantic Canada" startup raises',
    enabled: true,
    tier: 0,
    sectionHint: 'funding',
    authority: 0.6,
    builtin: true,
    homepage: 'https://news.google.com',
  },
  {
    id: 'gnews-opportunity',
    name: 'Google News: NS Grants & Programs',
    kind: 'gnews',
    url: 'Nova Scotia startup grant OR "Atlantic Canada" innovation program funding',
    enabled: true,
    tier: 0,
    sectionHint: 'opportunity',
    authority: 0.5,
    builtin: true,
    homepage: 'https://news.google.com',
  },
  {
    id: 'gnews-ecosystem',
    name: 'Google News: Halifax Tech',
    kind: 'gnews',
    url: 'Halifax startup OR "Atlantic Canada" tech ecosystem',
    enabled: true,
    tier: 0,
    sectionHint: 'ecosystem',
    authority: 0.4,
    builtin: true,
    homepage: 'https://news.google.com',
  },

  // ---------------------------------------------------------------------
  // Tier 1 — locked. Volta-owned accounts, needs an internal API token.
  // ---------------------------------------------------------------------
  {
    id: 'linkedin-volta',
    name: 'LinkedIn: Volta company page',
    kind: 'html',
    url: 'https://www.linkedin.com/company/voltaeffect',
    enabled: false,
    tier: 1,
    authority: 0.7,
    builtin: true,
    homepage: 'https://www.linkedin.com/company/voltaeffect',
    requires:
      'LinkedIn Page admin access plus a Community Management API token. Volta owns the page, so this is an internal approval, not a purchase.',
  },
  {
    id: 'instagram-volta',
    name: 'Instagram: @voltaeffect',
    kind: 'html',
    url: 'https://www.instagram.com/voltaeffect',
    enabled: false,
    tier: 1,
    authority: 0.5,
    builtin: true,
    homepage: 'https://www.instagram.com/voltaeffect',
    requires:
      'Instagram Business account linked to a Facebook Page, plus a Graph API token.',
  },

  // ---------------------------------------------------------------------
  // Tier 2 — locked. Needs access Bader would have to grant, not buy.
  // ---------------------------------------------------------------------
  {
    id: 'volta-member-crm',
    name: 'Volta Member CRM / Directory',
    kind: 'html',
    url: 'https://voltaeffect.com/community',
    enabled: false,
    tier: 2,
    authority: 0.8,
    builtin: true,
    homepage: 'https://voltaeffect.com/community',
    requires:
      "Read access to Volta's member list. Unlocks new-member spotlights and 'who is hiring in the network'.",
  },
  {
    id: 'event-platform',
    name: 'Event platform (Eventbrite / Luma)',
    kind: 'html',
    url: 'https://www.eventbrite.ca',
    enabled: false,
    tier: 2,
    authority: 0.7,
    builtin: true,
    homepage: 'https://www.eventbrite.ca',
    requires:
      "Eventbrite or Luma organizer API key. Unlocks last week's demo recaps with attendance.",
  },

  // ---------------------------------------------------------------------
  // Tier 3 — locked. Paid.
  // ---------------------------------------------------------------------
  {
    id: 'crunchbase',
    name: 'Crunchbase',
    kind: 'html',
    url: 'https://www.crunchbase.com',
    enabled: false,
    tier: 3,
    authority: 0.6,
    builtin: true,
    homepage: 'https://www.crunchbase.com',
    requires:
      'A paid Crunchbase Basic API key, roughly USD 49/month. Would confirm round sizes that news coverage leaves vague.',
  },
];
