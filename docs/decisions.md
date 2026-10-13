# Decisions & notes

- **Embedding helper lives in `api/_lib/embed.ts`, not `api/ai/embed.ts`.** Vercel turns every file under `/api` into a
  route unless the file or folder starts with `_`. A helper without a default export at `api/ai/embed.ts` would be
  deployed as a broken endpoint.
- **Embedding model:** `gemini-embedding-001` with `outputDimensionality: 768`, vectors L2-normalised. Run
  `npm run models` to confirm your key can use it; if not, change `EMBEDDING_MODEL` in `api/_lib/embed.ts`.
- **Verifications RLS:** creators can create and edit their own verification requests, but only with
  `status = 'pending'`. Marking something verified/rejected happens server-side with the service role key.
- **brief_rights** is readable only by the owning brand (as specified). If creators should see rights on a brief,
  add a `to authenticated` select policy like the one on `briefs`.
- **Demo password in the frontend:** `/login` contains the demo accounts' password so the one-click demo buttons work.
  These accounts hold only sample data.
- API routes import siblings with `.js` extensions (`../_lib/gemini.js`) because the project is ESM (`"type": "module"`).
