# PROGRESS — living project state

> This is the single source of truth for "where are we." Update it at the end of every task.
> Read this file (plus `/CLAUDE.md` and `/docs/SESSION_HANDOFF.md`) at the start of every session.

## Current phase
**Phase 0 — Foundations** (complete in code) → entering Phase 1, with an early **Auto-Populate**
cohort-research feature already built (cross-cutting, by user request).

## Status summary
Phase 0 is code-complete: app shell, provenance `<Card>`, **auth (P0-T3)**, and the **core +
People + research schema migrations (P0-T4 and forward)** are all written and compile/build clean.
On top of that, the **Auto-Populate cohort research agent** is built end-to-end (the "find me Brown
alumni at a YC biotech startup" feature). A design workflow shaped it and a 4-dimension adversarial
review found **12 real defects — all fixed and re-verified**.

**Two things gate *running* it (not the build):** applying the migrations needs the real Supabase
access token + a Claude Code window reload (so the Supabase MCP connects); the research agent needs
`ANTHROPIC_API_KEY` in `.env.local`.

## Task log (most recent first)
- **Auto-Populate (cohort research agent)** — ✅ built + reviewed + fixed (local). Natural-language
  cohort → Claude w/ web search → verified people land in Review (L0). Engine validates every
  quote/URL against **real `web_search` citations** before persist (the model is untrusted). Files:
  `src/lib/research/*` (extract/map/load/types/targets/useResearchRun), `src/app/api/research/*`,
  `src/components/{PersonCard,ResearchRunCard,AskJarvisDialog,FindPeopleBar}.tsx`, wired into
  `/people`, `/review`, the Topbar ⌘K, and `/dev`. Adversarial review (12 findings) all fixed:
  open-redirect, contact_goals/connections dual-parent RLS, citation-backing direction, dedup race,
  phase-2 stop_reason guard, signout CSRF, etc. **Verified:** `tsc` clean, `npm run build` green.
- **P0-T3 — Supabase Auth** — ✅ code-complete (live apply pending token). `@supabase/ssr` browser +
  server clients, `src/middleware.ts` session refresh + route gate, server-side re-check in the
  `(app)` layout, email/password login/signup + email-confirm + signout, sidebar user/sign-out.
  **Verified at runtime:** `/today` → 307 `/login?redirectTo=…`; `/login` 200; unauth `POST
  /api/research` → 401 JSON. (Real sign-in needs live Supabase creds.)
- **P0-T4 + Phase-6 + research schema** — ✅ migration files written (live apply pending token).
  `supabase/migrations/0001_core.sql` (sources+items+RLS), `0002_people.sql` (full People schema +
  child-table RLS, `items.contact_id`), `0003_research.sql` (research_runs, contacts provenance/
  review columns, `contacts_provenance_chk`, partial unique index, `review_feed` view). RLS on every
  table; child tables scope via parent; `contact_goals`/`connections` verify both parents.
- **P0-T5 / P0-T2 / P0-T1** — ✅ done in prior sessions (see git log).

## Verified working
- `npx tsc --noEmit` — clean.
- `npm run build` — all 14 routes + middleware compile; pages prerender.
- Runtime auth gate (`npm run dev`): protected routes redirect to `/login`; login renders; API self-
  enforces auth with 401 JSON.

## The single next task
**Apply the migrations + verify auth/research live.** Needs (from the user): (1) the **real Supabase
personal access token** in the MCP config + a **window reload** so the `supabase` MCP connects, and
(2) **`ANTHROPIC_API_KEY`** + the anon key in `.env.local`. Then: apply `0001→0003` via the MCP,
confirm RLS (insert a row as user A, confirm invisible to user B), and run one cohort search end-to-end.

## Known roadblocks / waiting on the user
- **Supabase live (apply migrations):** real access token in the MCP config + window reload. The
  config is structurally fixed (`~/.claude.json`); only the token is a placeholder. ← current blocker.
- **`ANTHROPIC_API_KEY`:** research agent reads it server-side. Without it, research runs error
  (handled: the run is marked `error`, surfaced in the UI).
- **Model choice:** engine defaults to `claude-sonnet-4-6` (cheaper); switch to `claude-opus-4-8`
  for stronger research if desired (set `ANTHROPIC_MODEL`).
- **Anon key:** `.env.local` has the project URL; the anon (publishable) key is still a placeholder.

## Stack as built
Next.js 15.5.19 · React 19.1 · Tailwind v4 · TypeScript · lucide-react · Turbopack ·
`@supabase/ssr` + `@supabase/supabase-js` · `@anthropic-ai/sdk` (web_search) · `chrono-node`
(installed for the date resolver, used from Phase 2). App at repo root; docs in `/docs`;
SQL in `/supabase/migrations`.

## Notes
- The model's self-reported URLs/quotes are **never trusted** — see `src/lib/research/extract.ts`
  (`backs()` + the citation allowlist). This is hard rule #3 made verifiable.
- L0 is enforced beyond the status column: every live contact read filters `review_status='accepted'`.
- Architecture decisions live in `/docs/DECISIONS.md`; schema + changelog in `/docs/DATA_MODEL.md`.
