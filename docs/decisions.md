# Decisions & notes

## Phase 1

- **Embedding helper lives in `api/_lib/embed.ts`, not `api/ai/embed.ts`.** Vercel turns every file under `/api` into a
  route unless the file or folder starts with `_`. A helper without a default export at `api/ai/embed.ts` would be
  deployed as a broken endpoint.
- **Embedding model:** `gemini-embedding-001` with `outputDimensionality: 768`, vectors L2-normalised. Run
  `npm run models` to confirm your key can use it; if not, change `EMBEDDING_MODEL` in `api/_lib/embed.ts`.
- **Verifications RLS:** creators can create and edit their own verification requests, but only with
  `status = 'pending'`. Marking something verified/rejected happens server-side with the service role key.
- **Demo password in the frontend:** `/login` contains the demo accounts' password so the one-click demo buttons work.
  These accounts hold only sample data.
- API routes import siblings with `.js` extensions (`../_lib/gemini.js`) because the project is ESM (`"type": "module"`).

## Phase 2

- **Migrations.** `002_brief_rights_read.sql` lets any logged-in user read brief rights (they can already read briefs).
  `003_creator_delete.sql` lets creators delete their own portfolio items, workflow steps and *pending* verification
  requests; `schema.sql` only granted insert/update. Until 003 is run, the dashboard's Delete, the form's "remove step"
  and "Withdraw" report that deletion is not switched on, instead of failing silently.
- **Media lives in Supabase Storage.** Sample images were copied from picsum/dicebear into `portfolio-media/seed/` under a
  hash of their source URL, so re-seeding never uploads the same image twice. User uploads go to `<bucket>/<user id>/…`,
  the only place the Storage policies let a user write.
- **Uploads.** Media is limited to 20 MB, evidence to 10 MB. Image thumbnails (and avatars, step images) are resized in the
  browser before upload. For videos the form grabs a poster frame and reads duration and resolution from the file; a
  separate thumbnail can be uploaded instead.
- **AI routes** (`/api/ai/polish-bio`, `/api/ai/describe-item`) require a logged-in user so strangers cannot spend the
  Gemini quota. They time each attempt out at 8s and fall back to `gemini-flash-lite-latest`, because the configured
  `gemini-flash-latest` was observed hanging with no response while overloaded. `GEMINI_MODEL` stays the first choice.
- **Sign-up.** `/login` has a "Create account" tab (name, role, email, password) so new creators can reach onboarding.
  If email confirmation is on in Supabase, the user is told to confirm and then log in.
- **Embeddings after edits.** Saving a profile or portfolio piece clears its embedding. Since Phase 3 the app re-embeds it straight away through `/api/ai/embed-row`; `npm run embed` remains the catch-all.
- **Local API.** `vite.config.ts` has a dev-only plugin that serves `/api/*` from the Vite dev server. It is not part
  of the production build; Vercel runs the same files with its own runtime.
- **Badge tooltips.** Rich tooltips are used on profile, viewer, dashboard and creator cards. Portfolio cards inside the
  masonry grid use the browser's native tooltip, because a floating panel there gets split across columns.

## Phase 3 (search)

- **All search logic is in SQL** (`004_search.sql`), so results, counts, facets and "closest matches" come from one set of
  rules. The page never filters in the browser. `npm run test:search` checks the SQL against an independent TypeScript
  calculation.
- **Facet count meaning.** The number beside an option is the result count you would get by switching that option on,
  with everything else unchanged. Inside a group that already has a selection (where values are OR-ed) this can be higher
  than the current total; it is never a count of "creators who have this value". The pay-off is that clicking an option
  always produces exactly the number shown. Options whose count is 0 are disabled, not hidden.
- **Sorting.** Best match = most selected values matched, then text relevance (name 5, taxonomy 4, headline 3, city 3,
  bio 2, portfolio text 1 per word), then verification count. Price low-high uses `price_min`; high-low uses `price_max`.
- **The view leaves out `embedding`** (large, and useless to the browser) but otherwise carries every creator column.
- **Semantic search honours the filters.** `match_creators(query_embedding, lim)` is exactly as specified;
  `search_semantic` joins it with the same filter rules and builds the cards. Similarity is the better of the creator's
  own embedding and their best portfolio piece, shown as a percentage.
- **Semantic fallback.** `/api/search/semantic` answers `200 { fallback: true, notice }` instead of an error when it cannot
  embed (no key, timeout after 8s, rate limit). The page then runs the keyword search; if the sentence matches no one
  word-for-word it shows everyone who fits the filters, and says so.
- **Rate limit** is in memory per server instance (20 requests a minute per IP): a brake, not a guarantee.
- **Thumbnails on result cards** prefer pieces in the selected aspect ratio or content type, so the card shows why it matched.
- **"Did you mean"** compares query words with taxonomy terms and cities by edit distance in the browser, then asks the
  database how many creators each suggestion would find and only offers the ones that find someone.
- **`npm run migrate -- --redo <file>`** re-runs one migration; 004 is written to be re-runnable (it only replaces a view,
  a type and functions).
