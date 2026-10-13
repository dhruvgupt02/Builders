# BRIVIO

**An AI-native marketplace that connects AI creators — AI filmmakers, animators and generative artists — with brands.**

Brands discover creators, browse AI portfolios that show the exact tools, models and workflows behind each piece,
and publish creative briefs with clear format, style and commercial-use rights.

## Stack

| Layer | Tech |
| --- | --- |
| Frontend | Vite + React + TypeScript + Tailwind CSS v4, React Router |
| Backend | Vercel serverless functions in `/api` (Node, TypeScript) |
| Data | Supabase — Postgres, Auth, Storage, pgvector |
| AI | Gemini via `@google/genai` (chat model from `GEMINI_MODEL`, embeddings: `gemini-embedding-001` @ 768 dims) |
| Hosting | Vercel (free tier) |

## Project layout

```
src/
  pages/        Route components (Home, Creators, CreatorProfile, PortfolioViewer, Brief*, Login, onboarding)
  components/   Layout, cards, shared UI
  lib/          supabase.ts (browser client), taxonomy.ts (fixed lists), types, formatting
api/
  ai/health.ts  GET /api/ai/health — checks the Gemini key + model
  _lib/         Server-only helpers (Gemini client, retry, embeddings). Underscore = not deployed as a route.
supabase/
  schema.sql    Tables, indexes, RLS policies, new-user trigger
  storage.sql   Storage buckets + policies
scripts/
  seed.ts       Sample data (npm run seed)
  embed.ts      Fill embeddings (npm run embed)
  list-models.ts  List embedding models your key can use (npm run models)
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
3. **Database** — in the Supabase SQL editor, run `supabase/schema.sql`, then `supabase/storage.sql`.
4. **Sample data**
   ```bash
   npm run seed
   ```
   Use `npm run seed -- --dry-run` to preview the generated data without touching the database.
5. **Embeddings**
   ```bash
   npm run models
   npm run embed
   ```
   `models` confirms the embedding model is available to your key; `embed` fills any missing vectors (safe to re-run).
6. **Run locally**
   ```bash
   npm run dev
   ```
   The `/api` routes run on Vercel. To test them locally use `npx vercel dev` instead of `npm run dev`.

## Sample data

`npm run seed` is idempotent: it deletes previous sample rows (`creators.is_sample = true`, the sample brands, and
the demo users' data) and inserts fresh ones:

- 25 sample AI creators across 10 Indian cities, with 3–5 portfolio items each and 2–4 workflow steps per item
- Verification mix: ~40% fully verified, ~40% partly verified, ~20% unverified
- 5 brands (candles, skincare, café, edtech, clothing) with briefs and rights
- Demo accounts: `demo.brand@brivio.app` and `demo.creator@brivio.app` (password `BrivioDemo123!`), also available via the
  **Try as brand / Try as creator** buttons on `/login`

All creators, clients and brands are fictional. Portfolio media uses placeholder images from picsum.photos and
avatars from DiceBear.

## Deploy (Vercel)

1. Push to GitHub and import the repo in Vercel (framework preset: Vite).
2. Add all six environment variables in Vercel → Project → Settings → Environment Variables.
3. Deploy. `vercel.json` rewrites every non-`/api` path to `index.html` so React Router routes work on refresh.
4. Check `https://<your-app>.vercel.app/api/ai/health` returns `{ "ok": true, ... }`.
