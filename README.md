# Bob

Bob is Volta's newsletter assistant. He goes out to the public web every three
days, brings back what Volta's community would actually want to read, and hands
it to a human as a board of keep-or-drop cards. You tell him what to go back for
in plain English. When it looks right, he sends it.

Built for the brief "Volta wants to send its community an email a week, and does
not have a team to write it."

## The bet

Bader will reject anything that adds a chore. So the unit of work Bob hands him
is not "write a newsletter." It is "approve or reject twenty cards, then hit
send." Bob does the ninety-five percent that is gathering and drafting. The human
does the five percent that is taste.

Three things Bob can make for free that nobody at Volta has time to make today:

- **Who got funded in Atlantic Canada this week.** Nobody aggregates this.
- **What is on this week.** Volta's own events page, which is already stale in
  everyone's memory by Monday.
- **Who is hiring in the network.** The highest-open-rate section in every
  startup-hub newsletter that exists, and it is pure aggregation.

## Run it

```bash
npm install
cp .env.example .env.local     # optional, see below
npm run dev
```

Open http://localhost:3000 and press **Send Bob out**.

**It works with no credentials at all.** Every external dependency sits behind an
adapter with a real fallback:

| Without a key | What happens |
|---|---|
| No `ANTHROPIC_API_KEY` | The heuristic scorer runs: recency decay, source authority, Atlantic Canada geographic relevance, section value, keyword boosts. Lower quality copy, same working product. |
| No `SMTP_*` | Sending writes a rendered HTML file to `.data/previews/` and logs the recipient split. The artifact is real, the email just does not leave the building. |

Add the keys and the same code paths light up. Nothing is a stub.

## The loop

1. **Cron fires**, or you press the button. Bob hits every enabled source in
   parallel, each with its own timeout. A dead feed degrades the run, it never
   fails one.
2. **Dedupe.** Exact URL, then near-duplicate titles by token-set similarity,
   then everything Bob has ever shown before. The same funding round appears on
   BetaKit, Entrevestor and Google News with three different headlines, and
   Bader must not see it three times.
3. **Enrich.** Section, audience tags, a 0-100 score, a one-line argument for
   why a Volta member should care, and newsletter-ready copy.
4. **The board.** Keep, drop, retarget the audience, move the section, or flag
   **dig deeper**.
5. **The errand box.** Type `more funding, drop the generic AI stuff, find me
   anything on ocean tech`. That becomes a structured directive: boosted
   keywords, suppressed keywords, new Google News queries, section focus. Bob
   goes back out shaped by it. Anything flagged dig deeper becomes its own
   targeted search.
6. **Standing instructions.** A directive that reads like a preference ("stop
   sending me national news") is marked persistent and applies to every future
   run. **This is how Bob gets better without anyone configuring anything.**
7. **Compose.** One email for everyone, or one per audience. Segmented mode
   sends each audience only the items tagged for them and drops sections that
   end up empty for that group.
8. **Send.** Recipients go in BCC, never To.

## The options ladder

The `/sources` page is the ask list, as a working page instead of a slide.
Tier 0 needs nothing and is what runs today. Each tier above it is one
environment variable and a toggle that is already wired.

| Tier | What we need | What it unlocks |
|---|---|---|
| 0 | nothing | Volta's own site, Entrevestor, BetaKit, Digital Nova Scotia, targeted Google News. Scoring, drafting, segmentation, preview send. |
| 1 | `ANTHROPIC_API_KEY` | Claude scores, classifies and writes the copy, and parses the errands. |
| 1 | Gmail app password or a Resend domain | Real sends. |
| 1 | LinkedIn Page admin, Instagram Business token | First-party social pull. Volta owns the page, so this is an internal approval, not a purchase. |
| 2 | Member list export, event platform API key | New-member spotlights, last week's demo recaps, who is hiring in the network. |
| 2 | Mailchimp or HubSpot list + open rates | Real segments, and open rates feeding back into scoring. |
| 3 | Crunchbase API | Confirmed round sizes where news coverage is vague. |

## Storage

`.data/*.json` through a single module, `src/lib/store/index.ts`. Deliberately
boring: no database to provision, works the moment you clone. Every read and
write goes through that file, so swapping in Postgres for a real Vercel
deployment is one file, not a refactor.

## Scheduling

`vercel.json` runs `/api/cron` every three days at 13:00 UTC. Locally, hit it by
hand:

```bash
curl -X POST localhost:3000/api/runs   # send Bob out
curl localhost:3000/api/cron           # exactly what Vercel calls
```

## Layout

```
src/lib/types.ts        the contract every module builds against
src/lib/store/          JSON persistence, the Postgres swap-in point
src/lib/sources/        feed and scrape adapters
src/lib/pipeline/       dedupe, heuristic scoring, run orchestration, issue build
src/lib/llm/            Claude enrichment, errand parsing, subject and intro
src/lib/render/         the email HTML
src/lib/mail/           SMTP and dry-run behind one interface
src/app/api/            the JSON surface
```

See `BUILD_LOG.md` for how this was built and what it cost.
