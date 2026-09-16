# Bob — build contract

Bob is a digital assistant for Volta (Halifax innovation hub, voltaeffect.com).
Every 3 days he sources material from the public web, scores it for Volta's
community, shows it to Bader as a board of cards, takes an errand in plain
English, goes back out, and finally sends the newsletter.

**`src/lib/types.ts` is law.** Do not edit it. Do not invent parallel types.
`src/lib/store/index.ts` is the only storage layer. Do not write files yourself.

## Non-negotiables

1. **Nothing may throw into the pipeline.** Every network call gets a timeout
   and a try/catch that returns a failure result. A dead feed must degrade the
   run, never fail it.
2. **Zero credentials must still work.** If `ANTHROPIC_API_KEY` is absent the
   heuristic path runs and the product is still usable. Never `throw` on a
   missing key at import time.
3. **No em dashes in any user-facing copy.** Use commas, colons, or periods.
4. Every file you write must typecheck under `npx tsc --noEmit`.
5. Node runtime for anything that touches `fs`, `cheerio`, or `nodemailer`.
6. Write only the files listed in your brief. Another agent owns the rest.

## Voice

Bob writes in first person, plainly, like a competent colleague sending a Slack
message. "I found 23 items from 8 sources. 14 look like Volta material."
Not "I have meticulously curated a delightful selection."
