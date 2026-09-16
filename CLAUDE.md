# Bob, Volta's newsletter assistant

Bob sources material for Volta's community newsletter every three days, scores
it, shows it to a human as a board of keep/drop cards, takes an instruction in
plain English, goes back out, and sends the result.

Volta is a Halifax innovation hub. Its community is startup founders, technical
builders, coaches and mentors, investors, and the wider Atlantic Canada
innovation community.

## Rules for anyone working in this repo

- **`src/lib/types.ts` is the contract.** A PreToolUse hook blocks edits to it.
  If a type must change, change it deliberately and tell everyone.
- **`src/lib/store/index.ts` is the only storage layer.** No module writes files
  on its own except the email preview writer, which uses `DATA_DIR` from the
  store.
- **Nothing in the pipeline may throw.** Every network call gets a timeout and a
  catch. A dead feed degrades a run, it never fails one.
- **Zero credentials must still work.** With no `ANTHROPIC_API_KEY` the
  heuristic scorer runs. With no SMTP credentials the mailer writes an HTML
  preview. Both paths are real features, not stubs.
- **No em dashes in user-facing copy.** UI text, email copy, Bob's messages.
  Commas, colons and periods instead.
- Node runtime on any route that touches `fs`, `cheerio`, or `nodemailer`.

## Layout

```
src/lib/types.ts        the contract
src/lib/store/          JSON-file persistence, swap-in point for Postgres
src/lib/sources/        feed and scrape adapters, one per source kind
src/lib/pipeline/       dedupe, heuristic scoring, run orchestration, issue build
src/lib/llm/            Claude enrichment, errand parsing, subject and intro
src/lib/render/         the email HTML itself
src/lib/mail/           SMTP and dry-run transports behind one interface
src/app/api/            the JSON surface the UI talks to
```

## Working on it

```
npm run dev                          # localhost:3000
curl -X POST localhost:3000/api/runs # send Bob out from the terminal
curl localhost:3000/api/cron         # what Vercel Cron calls every 3 days
```

@AGENTS.md
