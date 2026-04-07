# Toki

Toki is a social helping app where users ask for advice, others answer, askers rate answers from 1-10, and top givers appear on a leaderboard.

## Current Stack

- Frontend: Vanilla JS + CSS + HTML
- Dev server / hot reload: Vite
- Shared backend: Supabase (Auth + Postgres)

## Local Development

1. Install dependencies:
   - `npm install`
2. Copy env template:
   - `cp .env.example .env.local`
3. Fill values in `.env.local`:
   - `VITE_SUPABASE_URL`
   - `VITE_SUPABASE_PUBLISHABLE_KEY` (preferred)
   - Optional fallback: `VITE_SUPABASE_ANON_KEY` (legacy projects)
4. Start local dev server (hot reload):
   - `npm run dev`
5. Open the URL shown in terminal (default `http://localhost:5173`).

## Important Security Note

- `.env.local` is ignored by git and should not be committed.
- Use only publishable/anon key in frontend.
- Never put Supabase `service_role` or secret keys in client code.

## Supabase Setup (Do This in Parallel)

1. Create a Supabase project.
2. In Auth settings:
   - For easiest testing, disable email confirmation temporarily.
   - Re-enable email confirmation before production launch.
3. In SQL Editor, run:
   - `supabase/setup.sql`
4. (Optional but recommended) Theme auth emails:
   - Follow `supabase/email-templates/README.md`
   - Paste `supabase/email-templates/confirm-signup.html` into Supabase **Confirm signup** template
5. Confirm tables exist:
   - `profiles`, `questions`, `answers`, `ratings`
6. Confirm RLS is enabled on all four tables and policies were created.

## Build and Preview

- Production build: `npm run build`
- Preview production build: `npm run preview`

## Publish

- Publish static build to GitHub Pages: `npm run publish`
- Recommended before publish: `npm run check && npm run test:e2e`

## Tests

- Run all tests: `npm test`
- Watch mode: `npm run test:watch`
- Run quick validation (unit + build): `npm run check`
- Run Playwright E2E: `npm run test:e2e`
- Run Playwright UI mode: `npm run test:e2e:ui`
- First-time Playwright browser install:
  - `npx playwright install chromium`
- On Linux only, if browser libs are missing:
  - `npx playwright install-deps chromium`

Test coverage in this repo includes:
- data joins (questions + answers + ratings)
- leaderboard ranking rules
- profile activity aggregation
- Supabase env configuration resolution
- full user journey E2E (register, ask, answer, rate, leaderboard) using a mocked Supabase client (no writes to live Supabase)
