# How BRIVIO matches creators to a brief

Every creator gets a score from 0 to 100 for a brief. The score is the sum of six parts. It is computed in the
database by `match_creators_for_brief(brief_id, lim)` (`supabase/migrations/006_matching.sql`), so the page, the
profile panel and the tests all see the same numbers. `npm run test:matching` checks each part against this page.

| Part | Points | How it is calculated |
| --- | --- | --- |
| **Tools** | 25 | 25 × (required tools the creator uses ÷ required tools). Full marks if the brief requires none. Then −10 for each *excluded* tool that appears in more than half of the creator's portfolio pieces. Never below 0. |
| **Format** | 20 | 20 × (deliverables covered ÷ deliverables). A deliverable is covered when the creator has a portfolio piece with the same content type **and** the same aspect ratio. A Video 4:5 piece does not cover a Video 9:16 deliverable. |
| **Style** | 25 | Cosine similarity between the brief's embedding and the creator's closest portfolio piece, scaled so 0.72 gives 0 and 0.88 gives 25. |
| **Budget** | 15 | Full marks if the creator's price range overlaps the brief's budget. Starting above the budget: 15 × (1 − how far over, as a fraction of the maximum), so 25% over gives 11.25 and twice the budget gives 0. Topping out below the budget's minimum loses points half as fast. |
| **Commercial** | 10 | Full marks if the creator has licensed or client-delivered work, or if the brief is for organic social only. Otherwise 0. |
| **Verification** | 5 | Verified tool 2, verified workflow 1.5, verified past work 1.5. |

The total is rounded to a whole number. Ties are broken by style similarity, then name.

## Choices worth knowing

- **Half marks when the brief cannot say.** If the brief has no embedding yet, no budget, or no deliverables, or the
  creator lists no price, that part scores half instead of zero. An unfinished brief should not sink everyone equally
  to the bottom, and a missing price is not evidence of being over budget.
- **Why 0.72 to 0.88 for style.** A brief and a portfolio description are both short documents about creative work, so
  their similarity sits in a narrow band (0.77 to 0.85 across the sample data). A 0 to 1 scale would give everyone
  nearly the same style points. The band was set from the sample data and should be re-checked as real data arrives.
- **"Relies on" an excluded tool** means more than half of their pieces use it. Listing a tool, or using it once,
  does not cost anything: the brief only rules out work made with it.
- **Tools and budget are strict, style is soft.** 40 of the 100 points (tools, budget) come from hard facts the brand
  stated, 20 from formats, and 25 from the fuzzy style comparison, so a stylistically close creator cannot outrank one
  who meets the stated requirements unless they also meet most of them.
- **The best-matching piece** returned with each creator is the portfolio piece closest to the brief's embedding. Without
  a brief embedding it is the newest piece in one of the brief's formats.

## "Why this match"

`POST /api/ai/match-reasons` writes one sentence per creator for the top 10 in a single Gemini call, from the
breakdown and the facts behind it. Sentences are stored in `match_cache` (keyed by brief and creator). A trigger
deletes a brief's cached sentences whenever its title, goal, style, tools, budget, formats or usage platforms change.
If Gemini is unavailable, `reasonFromBreakdown` in `src/lib/matching.ts` builds the sentence from the numbers, for
example: "Uses Runway, has work in all 3 formats you need and fits your budget; does not list Kling."

## Where it shows

- `/briefs/:id/matches` (brief owner): ranked cards with the score, five bars, the closest piece, the reason, and
  filters for minimum score, verified only and within budget. If nobody scores above 40 it suggests what to relax.
- `/creators/:id?brief=<id>`: a "Fit for your brief" panel with the same score and breakdown.
