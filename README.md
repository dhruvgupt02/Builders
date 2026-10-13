# BRIVIO

**An AI-native marketplace that connects AI creators — AI filmmakers, animators and generative artists — with brands.**

Brands discover creators, browse AI portfolios that show the exact tools, models and workflows behind each piece,
and publish creative briefs with clear format, style and commercial-use rights. Creators build a profile, publish
portfolio pieces with their workflow, and request verification badges.

## Stack

| Layer | Tech |
| --- | --- |
| Frontend | Vite + React + TypeScript + Tailwind CSS v4, React Router |
| Backend | Vercel serverless functions in `/api` (Node, TypeScript) |
| Data | Supabase — Postgres, Auth, Storage, pgvector |
| AI | Gemini via `@google/genai` (chat model from `GEMINI_MODEL`, embeddings: `gemini-embedding-001` @ 768 dims) |
| Hosting | Vercel (free tier) |

## Pages

| Route | Who | What |
| --- | --- | --- |
| `/` | Public | Landing page and featured creators |
| `/creators` | Public | Search: keyword or "describe what you need", filters with live counts, sort, shareable URLs |
| `/creators/:id` | Public | Creator profile: verification summary, stats, chips, filterable portfolio |
| `/portfolio/:id` | Public | Portfolio viewer: media, details, "Made with", workflow timeline, more from the creator |
| `/login` | Public | Log in, create an account, or try a demo account |
| `/onboarding/creator` | Creators | Create or edit the creator profile (with AI bio polish) |
| `/dashboard/creator` | Creators | Profile summary, portfolio management, verification requests |
| `/portfolio/new`, `/portfolio/:id/edit` | Owner | Add or edit a portfolio piece (upload, workflow builder, AI description) |
| `/briefs/new`, `/briefs/:id/edit` | Brands | Brief builder: start from a rough idea (AI) or a five-step form, with autosave, completeness meter and "Check my brief" |
| `/briefs/:id` | Logged in | Brief view: deliverables table, commercial use in one sentence, "Find matching creators"; owner can change status, edit, duplicate |
| `/dashboard/brand` | Brands | My briefs: status, completeness, create, edit, duplicate, delete |
| `/briefs` | Logged in | Open briefs board for creators, filtered by content type and aspect ratio |

## Project layout

```
src/
  pages/          Route components
  components/     Layout, cards, VerificationBadges, ToolChips, Lightbox
  components/ui/  Design-system components (see docs/design/README.md)
  lib/            supabase.ts (browser client), taxonomy.ts (fixed lists), auth, uploads, AI client
api/
  ai/health.ts         GET  /api/ai/health        — checks the Gemini key + model
  ai/polish-bio.ts     POST /api/ai/polish-bio    — improves a creator bio
  ai/describe-item.ts  POST /api/ai/describe-item — writes a portfolio description
  ai/embed-row.ts      POST /api/ai/embed-row     — embeds a profile or piece right after it is saved
  ai/brief-builder.ts  POST /api/ai/brief-builder — rough idea to structured brief (JSON mode, validated)
  ai/brief-check.ts    POST /api/ai/brief-check   — gaps, conflicts and suggestions for a brief
  search/semantic.ts   POST /api/search/semantic  — "describe what you need" search (public, rate limited)
  _lib/                Server-only helpers. Underscore = not deployed as a route.
supabase/
  schema.sql      Tables, indexes, RLS policies, new-user trigger
  storage.sql     Storage buckets + policies
  migrations/     Changes made after the first setup; run in order
scripts/
  seed.ts          Sample data (npm run seed)
  mirror-media.ts  Copy placeholder images into Supabase Storage (npm run mirror-media)
  embed.ts         Fill embeddings (npm run embed)
  list-models.ts   List embedding models your key can use (npm run models)
  test-search.ts   Search accuracy tests against the live database (npm run test:search)
  test-brief-builder.ts  AI brief builder and brief ownership tests (npm run test:briefs)
  seed-briefs.ts   Sample brands and briefs; `npm run seed -- --briefs-only` refreshes just these
  migrate.ts       Apply pending SQL migrations (npm run migrate)
  verify-migrations.ts  Check migration policies and behaviour (npm run migrate:verify)
docs/
```

## Setup

1. **Install**
   ```bash
   npm install
   ```
2. **Environment** — copy `.env.example` to `.env` and fill in:
   | Variable | Where it's used | Where to find it |
   | --- | --- | --- |
   | `VITE_SUPABASE_URL` | browser | Supabase → Project Settings → API → Project URL |
   | `VITE_SUPABASE_ANON_KEY` | browser | Supabase → API → `anon` public key |
   | `SUPABASE_URL` | server/scripts | same as the project URL |
   | `SUPABASE_SERVICE_ROLE_KEY` | server/scripts only | Supabase → API → `service_role` key (**secret**) |
   | `GEMINI_API_KEY` | server/scripts only | Google AI Studio (**secret**) |
   | `GEMINI_MODEL` | server | `gemini-flash-latest` |

   Only `VITE_*` variables reach the browser. Never prefix secrets with `VITE_`.
3. **Database** — in the Supabase SQL editor, run `supabase/schema.sql`, then `supabase/storage.sql`. Then apply the
   migrations:
   ```bash
   npm run migrate
   ```
   This runs every file in `supabase/migrations/` that has not been applied yet (each in its own transaction) and
   records it in a `schema_migrations` table. `npm run migrate -- --status` only lists them, and
   `npm run migrate:verify` checks that the policies exist and behave correctly.

   It needs one extra variable in `.env`, used only by these scripts (do not add it to Vercel):
   `SUPABASE_DB_URL` — Supabase dashboard → **Connect** (top bar) → **Connection string** → **Session pooler** → copy
   the URI and replace `[YOUR-PASSWORD]` with your database password. Use the Session pooler string, not "Direct
   connection", which only works over IPv6. If the password contains `@ : / # ?`, URL-encode those characters.

   Without it, you can paste the files from `supabase/migrations/` into the SQL editor instead, lowest number first.
4. **Sample data**
   ```bash
   npm run seed
   ```
   The seed copies its placeholder images into Supabase Storage as it goes. Use `npm run seed -- --dry-run` to preview
   the generated data without touching the database.
5. **Embeddings**
   ```bash
   npm run models
   npm run embed
   ```
   `models` confirms the embedding model is available to your key; `embed` fills any missing vectors and is safe to
   re-run. Edits made in the app are embedded automatically on save; `embed` catches anything that was missed.
6. **Run locally**
   ```bash
   npm run dev
   ```
   The dev server also serves the `/api` routes (a small dev-only plugin in `vite.config.ts`), so the AI buttons work
   locally without `vercel dev`.

## Sample data

`npm run seed` is idempotent: it deletes previous sample rows (`creators.is_sample = true`, the sample brands, and
the demo users' data) and inserts fresh ones:

- 25 sample AI creators across 10 Indian cities, with 3–5 portfolio items each and 2–4 workflow steps per item
- Verification mix: ~40% fully verified, ~40% partly verified, ~20% unverified
- 5 brands (candles, skincare, café, edtech, clothing) with briefs and rights
- Demo accounts: `demo.brand@brivio.app` and `demo.creator@brivio.app` (password `BrivioDemo123!`), also available via the
  **Try as brand / Try as creator** buttons on `/login`

All creators, clients and brands are fictional. Images are placeholders (originally from picsum.photos and DiceBear)
stored in the project's own `portfolio-media` bucket, so the app does not depend on those sites at runtime.
`npm run mirror-media` re-copies anything that still points outside Storage and reports what is left.

## Search

Search runs in Postgres (`supabase/migrations/004_search.sql`) and works without logging in.

- **Rules.** Filter groups are combined with AND. Inside a group any selected value matches (OR), except tools with
  "Match all tools" on, where the creator must have every selected tool. Budget keeps creators whose starting price
  (`price_min`) is within the budget. Text search needs every word to appear in the creator's name, headline, bio, city,
  specializations, skills, tools, or in their portfolio titles, descriptions and style tags.
- **`creator_search` view** — one row per creator with portfolio and verification aggregates.
- **`search_creators(...)`** — returns `{ total, rows }`; each row has up to three thumbnails and the selected values it matches.
- **`search_facets(filters, options)`** — the number beside each filter option: how many creators you would see with that
  option switched on and everything else unchanged. Clicking an option always gives exactly that many results.
- **`search_closest(filters, lim)`** — for empty results: creators meeting the most filters, with what each one misses.
- **`match_creators(embedding, lim)` / `search_semantic(...)`** — cosine similarity over creator and portfolio embeddings.

```bash
npm run test:search
```
runs 31 checks through the public API and compares every answer with an independent calculation from the base tables
(result sets, counts, match-all, budget, text, sorting, paging, every facet count, closest matches, semantic ranking).

## Briefs

A brief captures content type, style, format and commercial use completely enough for a creator to price it.

- **Model.** `briefs` (basics, creative direction, budget, status `draft`/`open`/`closed`, completeness), `brief_deliverables`
  (one row per format: content type, aspect ratio, duration, quantity) and `brief_rights` (platforms, territory, duration,
  exclusivity, ownership, real people, AI voice, music, disclosure, credit, tool licences). Fixed lists live in
  `src/lib/taxonomy.ts`; the shared rules (validation, completeness, the plain-English rights sentence) in `src/lib/brief.ts`.
- **AI Brief Builder.** `/api/ai/brief-builder` sends the rough idea to Gemini in JSON mode with a strict schema whose
  fixed-list fields are enums of the taxonomy. The answer is then validated again on the server: anything not in the
  taxonomy is dropped and reported, numbers are range-checked, and every required field the idea left open gets a default
  that is listed as an assumption. It also returns up to three clarifying questions with quick answers.
- **Check my brief.** Built-in rules (formats against platforms, budget against deliverables, deadline, rights) always
  run; Gemini adds more observations when it is available.
- **Visibility.** Drafts are private to their brand. Open and closed briefs are readable by logged-in users. Only the
  owning brand can change a brief, its rights or its deliverables.

```bash
npm run test:briefs
```
runs the builder on eight rough ideas (checking taxonomy values, required fields, assumptions and deliverables), checks
the server-side validation and the brief check, and verifies through the public API that a non-owner cannot read a draft
or change someone else's brief.

## AI features

- **Describe what you need** (search) embeds the text and ranks creators by similarity. It is public, limited to about 20
  searches a minute per visitor, and falls back to keyword results with a notice if Gemini is slow, down or not configured.
- Saving a profile or portfolio piece calls `/api/ai/embed-row`, so new content is searchable by description straight away.

- **Polish my bio** (onboarding) and **Describe this piece** (portfolio form) call `/api/ai/*`. Both need a logged-in user.
- The routes never crash the UI: a missing key, a rate limit (429) or an outage comes back as a short message next to the button.
- If `GEMINI_MODEL` is overloaded or does not answer within 8 seconds, the routes fall back to `gemini-flash-lite-latest`
  (override with an optional `GEMINI_FALLBACK_MODEL` variable). `/api/ai/health` reports which model answered.

## Deploy (Vercel)

1. Push to GitHub and import the repo in Vercel (framework preset: Vite).
2. Add all six environment variables in Vercel → Project → Settings → Environment Variables.
3. Deploy. `vercel.json` rewrites every non-`/api` path to `index.html` so React Router routes work on refresh.
4. Check `https://<your-app>.vercel.app/api/ai/health` returns `{ "ok": true, ... }`.
