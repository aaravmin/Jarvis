# PROGRESS — living project state

> This is the single source of truth for "where are we." Update it at the end of every task.
> Read this file (plus `/CLAUDE.md` and `/docs/SESSION_HANDOFF.md`) at the start of every session.

## Current phase
**Phase 0 — Foundations**

## Status summary
Foundations mostly done. The app scaffolds, runs, and the provenance primitive works. Remaining
Phase 0 work (P0-T3 Supabase Auth, P0-T4 schema) is **blocked on the user providing Supabase
credentials**. The optional Vercel deploy for P0-T2 is also pending the user.

## Task log (most recent first)
- **P0-T5 — Provenance `<Card>` primitive** — ✅ done (local). Built `<Card>` (refuses to render
  without a valid `source.quote`; throws a clear dev error, renders null in prod), `<SourceChip>`
  (opens a modal with the exact quote, in-context highlight, confidence, and a "View original"
  link to `permalink`), shared `CardSource` type, and a `/dev` component-lab page with real cards
  plus a button that demonstrates the guardrail firing. Verified: production build prerenders all
  routes; `/dev` serves the cards. _Interactive click (open modal / trigger guardrail) is best
  confirmed in-browser via `npm run dev`._
- **P0-T2 — Next.js + Tailwind app shell** — ✅ done (local); ⏳ Vercel deploy pending user.
  Scaffolded Next.js 15.5 (App Router, Turbopack) + React 19 + Tailwind v4 (`src/` dir, `@/*` →
  `src/*`). Dark "command center" theme. Persistent sidebar + mobile tab strip + sticky top bar.
  Routes: `/today /tasks /calendar /goals /people /jobs /review` (route group `(app)`), `/` →
  `/today`, plus `/dev`. Verified: `npm run dev` → `/today` 200 with all 7 nav labels.
- **P0-T1 — Repo + docs scaffold** — ✅ done. `/CLAUDE.md` + `/docs/{ROADMAP,PRD,DATA_MODEL,
  DECISIONS,PROGRESS,SESSION_HANDOFF}.md` created and filled. Git initialized; per-task commits.

## Verified working
- `npm run build` — all 13 routes compile, types valid, all prerendered.
- `npm run dev` — boots (~0.8s), serves `/today` (200, all nav), `/` → 307 `/today`, `/dev` (200).

## The single next task
**P0-T3 — Supabase project + Auth** (BLOCKED — needs the user to create a Supabase project and
share the URL + anon key + (for migrations) the DB connection string / service role).
- Acceptance: you can sign up/in; RLS enabled; `.env.local` documented in `/docs`.
- Then **P0-T4 — Core schema migration**: create `sources` + `items` (Section 3.4) with RLS.

## Known roadblocks / waiting on the user
- **Supabase (P0-T3, P0-T4):** need a Supabase project + credentials. ← current blocker.
- **Vercel (P0-T2 deploy step):** need a Vercel account/login to deploy. App runs locally regardless.
- **Anthropic API key (Phase 2+):** needed for the extraction engine.
- **Google Cloud OAuth (Phase 2+):** needed for Gmail/Calendar (read-only first).

## Stack as built
Next.js 15.5.19 · React 19.1 · Tailwind v4 (`@tailwindcss/postcss`) · TypeScript · lucide-react ·
Turbopack (dev + build). App lives at repo root; docs in `/docs`.

## Notes
- Architecture decisions live in `/docs/DECISIONS.md`. The big one: **Supabase is the system of
  record; Notion is only an optional one-way mirror.**
- There is a stray `~/package-lock.json` in the user's home dir; `turbopack.root` in
  `next.config.ts` pins the workspace root so it doesn't confuse the build.
