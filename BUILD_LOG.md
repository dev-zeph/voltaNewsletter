# Build log

What this was, how it was built, and what I actually used.

## The constraint

One session, orchestrated rather than hand-written. A large model held the
architecture and the product decisions; smaller models built against a frozen
contract in parallel; the orchestrator integrated, tested against live data, and
fixed what the tests exposed.

## Claude Code features used

### Planning and decisions
1. **`AskUserQuestion`** for the three genuinely blocking calls: LLM key
   availability, email transport, and priority under time pressure. Everything
   else was decided without asking, because asking costs more than a reversible
   wrong guess.
2. **Ground-truth check before planning.** Node version, which API keys actually
   existed in the environment, whether the target directory existed. The plan
   was written against what was there, not what was assumed.

### Orchestration
3. **Subagent fan-out.** Four parallel agents on one contract: source adapters,
   enrichment and scoring, email render and transport, front end.
4. **A frozen type contract written first.** `src/lib/types.ts` plus
   `CONTRACT.md` went in before any agent launched. Agents filled in bodies
   against exported signatures they could not change.
5. **Explicit file ownership per agent.** Each brief named the exact files that
   agent owned and forbade the rest. Zero merge conflicts across four agents.
6. **Model tiering.** Orchestration and integration on the larger model, build
   work on a smaller one.
7. **Agent recovery.** Two agents died mid-flight on a session rate limit. Their
   completed files were already on disk and verified, so recovery was a scoped
   re-launch for the remainder, not a restart.

### Harness configuration
8. **`CLAUDE.md`** with the project's real invariants: nothing in the pipeline
   throws, zero credentials must still work, no em dashes in copy.
9. **A `PreToolUse` hook** (`.claude/guard-contract.sh`) that hard-blocks edits
   to `src/lib/types.ts`. With four agents importing from one file in parallel,
   a well-meaning "fix" to a shared type breaks three agents in ways that only
   appear at integration. The hook returns a deny decision with a reason.
10. **Project `.claude/settings.json`** with a permission allowlist for the
    commands this build runs constantly, to cut prompt friction.
11. **Skill invocation** (`claude-api`) before writing a single line of
    Anthropic SDK code, because that API surface changed and writing it from
    memory produces code that 400s at runtime.
12. **Local dependency docs over recall.** `node_modules/next/dist/docs/` for
    Next.js 16 specifics, and reading the installed SDK's own `.d.ts` files to
    confirm `messages.parse` and `output_config` before use.

### Verification
13. **Live integration testing, not unit tests.** Bob was run against the real
    internet seven times during the build. Every quality defect listed below was
    found that way.
14. **Browser verification** of the desk page, which caught a copy bug that no
    typecheck would have.
15. **Targeted algorithm tests** written and run against the dedupe scorer, with
    both should-merge and must-not-merge cases, after a subagent flagged the
    threshold as weak.
16. **Subagent reports treated as claims, not facts.** Each agent's self-report
    was checked against live behaviour. Several held up. One did not.
17. **Memory** carried a standing instruction about em dashes from earlier
    projects, which became a contract rule here.

## Defects found by running it, not by reading it

Each of these passed typecheck and looked fine in review.

| Found | Why it mattered |
|---|---|
| First run surfaced **110 cards** | The entire product bet is "approve twenty cards." 110 recreates the chore Bob exists to remove. Added a board cap with per-section ceilings. |
| "8 event this weeks", "2 role opens" | Naive `+ "s"` pluralisation in Bob's own summary line. Replaced with explicit singular/plural pairs. |
| Volta's blog items had **no dates at all** | The listing page carries no date markup, so the recency signal was dead on the single highest-value source. The post pages do expose it, so dates are now hydrated through a small worker pool. |
| With dates in, Volta posts were **up to 951 days old** | Volta's blog mixes current announcements with posts going back two and a half years, and on authority alone they outranked this week's funding rounds. Added a hard staleness gate. |
| Cards read **"Volta update, no direct Atlantic Canada angle"** | The geo check only read the item's text, and Volta's own event listings do not say "Halifax". Local publishers now carry the geographic signal themselves. |
| Then they read **"Volta Volta update"** | The fix introduced a duplicated word. Caught on the next run. |
| Events three weeks out read **"published today"** | Event listings carry the date the thing happens. Future dates now read "happening in 12 days", which is the fact that makes an event worth including. |
| Dedupe missed `$4.2 million` vs `$4.2M` | Money tokenises differently across outlets, so the same round survived as three cards. Amounts are now normalised to one canonical token. |
| Email event tags printed **`2026-09-16T21:00:00.000Z`** | The one tag whose entire job is telling a reader when to show up was printing a raw ISO timestamp. Now reads "Wed, Sep 16, 6:00 p.m.", with midnight treated as "no time published". |
| Fallback subject line was **"Yoga: what's new at Volta"** | The deterministic composer picked the shortest title, and an issue that led with two funding rounds went out titled after a yoga class. Now ranks by section newsworthiness and skips titles too short to carry a subject. |
| Errand fallback produced **"me anything on ocean tech in Nova Scotia Nova Scotia"** | Conversational scaffolding was being kept as a keyword and the region appended to a phrase that already named it. Both are shown back to the user as directive chips. Now strips filler and checks for a region before scoping. |
| Dedupe still missed asymmetric headlines | Jaccard punishes length difference, and real headlines about one story are wildly asymmetric. Blended in a length-aware containment score, guarded against over-merging short generic titles. Verified 6/6 on both should-merge and must-not-merge cases. |

## Session two: deployment, Resend, and the Trojan design pass

18. **Vercel MCP** for the deploy: team and project discovery, project creation
    linked to the GitHub repo, deployment polling, and build logs. Push to
    `main` now deploys automatically.
19. **A subagent for git and deployment** with three hard safety checks before
    anything left the machine: no `.env` tracked, no credential-shaped strings
    anywhere in the tree, `.data/` untracked. It was also explicitly forbidden
    from force-pushing and from touching any `buy_*` tool.
20. **A subagent for the design port**, briefed to source the system from both
    the live trojancli.com and the local `trojan-web` codebase, and to verify
    with screenshots of every page rather than a passing build.
21. **Reading installed type definitions instead of trusting recall** again, for
    the Resend SDK. `emails.send` returns `{ data, error }` and does not throw
    on an API error, which is exactly the kind of thing a memory-written
    integration gets wrong silently.
22. **A real preflight**, `npm run check`, that sends an actual Claude request,
    lists Resend domains, and does a Supabase write round-trip. A key being
    present in a file proves nothing.

### Two more defects found by running it

| Found | Why it mattered |
|---|---|
| **Setting the Supabase variables took the whole app down** | Credentials get pasted before anyone opens the SQL editor, so "configured but no schema" is the common path, not an edge case. Every request died with `Could not find the table public.bob_recipients`. It also broke the project's own stated rule that storage should degrade rather than fail. The store now probes once, falls back to files, and reports a message that names the fix. |
| **`.data/` writes would throw `EROFS` on Vercel** | Only `/tmp` is writable there. The preview writer now targets `/tmp` when `VERCEL` is set, so the dry-run fallback cannot explode inside an error handler. |

### Verified in production

A real run on the deployed app: 10 of 10 sources, 156 raw items, 30 surfaced,
7.2 seconds end to end.

## What is honestly weak

- **The people-vs-org entity split** is a regex with a role-word heuristic. It is
  not named-entity recognition and its recall is poor.
- **The LLM path has not been exercised against the live API.** It is verified
  against the installed SDK's type definitions, and every call site falls back
  to the heuristic per item on failure, but no real request has been made yet.
  This is the first thing to test once the key is in.
- **Volta's own blog is genuinely stale.** Every post on the listing is more than
  a year old. The events page is the live Volta channel. That is a finding about
  Volta's publishing cadence, not a bug in Bob, and it is worth raising.
- **Dalhousie's feed produces false positives in the funding section.** University
  PR uses words like "funding" and "invest" constantly. The LLM scorer should
  fix this; the heuristic does not.
