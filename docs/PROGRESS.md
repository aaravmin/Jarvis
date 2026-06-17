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

On top of that, a **multi-agent system** is now built: an intent **router** (`POST /api/agent`) sends
each request to exactly one agent, and a full **Opportunity agent** (programs/jobs/hackathons) mirrors
the people agent with chrono-resolved deadlines. Tabs were renamed to mirror the agents.

**One thing gates *running* the DB-backed features (not the build):** applying migrations `0001→0004`
needs the real Supabase **access token** in the MCP config + a Claude Code window reload (so the
Supabase MCP connects). `ANTHROPIC_API_KEY` + the anon key are already in `.env.local`.

## Task log (most recent first)
- **Multi-agent system + Opportunity agent** — ✅ built (local; gated on migrations to *run*). Two
  parts:
  1. **Intent router** — `POST /api/agent` classifies one request (Haiku, `JARVIS_ROUTER_MODEL`) and
     dispatches to exactly ONE agent: opportunity · contact · email · calendar · meeting · assistant.
     Live agents run (opportunity/contact research, assistant ask); email/calendar return a
     needs-connection hint; meeting asks for a pasted transcript. Failsafe → assistant on any error.
     Files: `src/lib/agents/{types,registry,router,citation-gate}.ts`, `src/app/api/agent/route.ts`.
  2. **Opportunity agent** — mirrors the people agent end-to-end for programs/jobs/hackathons/
     fellowships. Two-phase Claude (web search → forced `report_opportunities`) + the shared citation
     gate; **deadlines obey hard rule #2** (model returns verbatim strings; `chrono-node` resolves them
     in `deadline.ts`). Each result carries deadline, how-to-apply, requirements, location, dates, and
     required skills — every field sourced. Lands in Review (L0). Files: `src/lib/agents/opportunity/*`
     (types/deadline/extract/map/load/run/useOpportunityRun), `src/app/api/opportunities/*`,
     `src/components/{OpportunityCard,OpportunityRunCard,FindOpportunitiesBar}.tsx`, migration
     `0004_opportunities.sql`, wired into `/opportunities` + `/review`.
  - **Tavily** (`src/lib/search/tavily.ts`) wired as an OPTIONAL recall seed (gated on `TAVILY_API_KEY`,
    safe no-op without it; never a provenance source). **Refactor:** extracted `runPeopleSearch` so
    `/api/research` and the router share one path (behavior identical). **Nav** renamed to mirror agents
    (Email/Calendar/Meetings/Contacts/Opportunities). **Verified:** `tsc` + `eslint` clean; live dev
    server compiles all new routes (agent/opportunities → 401 JSON unauthed; pages → 307 `/login`).
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
- `npx tsc --noEmit` — clean. `npx eslint src` — clean.
- Live dev server compiles every new route through Turbopack: `POST /api/agent` and
  `POST /api/opportunities` → 401 JSON unauthed; `/opportunities` + `/review` → 307 `/login`.
  (Full `npm run build` deferred to avoid clobbering the running dev server's `.next` cache.)
- Runtime auth gate: protected routes redirect to `/login`; APIs self-enforce auth with 401 JSON.

## The single next task
**Apply the migrations + verify auth/research/opportunities live.** Needs (from the user): the **real
Supabase personal access token** in the MCP config + a **window reload** so the `supabase` MCP
connects. (`ANTHROPIC_API_KEY` + anon key are already in `.env.local`.) Then: apply `0001→0004` via
the MCP, confirm RLS (insert a row as user A, confirm invisible to user B), and run one cohort search
**and one opportunity search** end-to-end (⌘K or the page bars → results land in Review with working
source chips and chrono-resolved deadlines).

## Known roadblocks / waiting on the user
- **Supabase live (apply migrations `0001→0004`):** real access token in the MCP config + window
  reload. The config is structurally fixed (`~/.claude.json`); only the token is a placeholder. The
  `sbp_…` access token goes in the **MCP config**, NOT `.env.local` (the `.env.local` Supabase key is
  the `eyJ…` anon JWT — a different credential). ← **current blocker** for running everything DB-backed
  (auth sign-in, People, Opportunities, Review, Auto-Populate).
- **`ANTHROPIC_API_KEY` + anon key:** ✅ now set in `.env.local` (per the user). The router also uses
  Claude; without the key, routing falls back to the assistant and research runs error gracefully.
- **Model choice:** research/opportunity engines default to `claude-sonnet-4-6`; set
  `ANTHROPIC_MODEL=claude-opus-4-8` for stronger research. Router defaults to Haiku
  (`JARVIS_ROUTER_MODEL`).
- **Optional `TAVILY_API_KEY`:** unset = Opportunity agent uses Claude `web_search` only (fully
  functional). Set it for a recall boost; it never affects provenance.

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
