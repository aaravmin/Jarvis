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

**Migrations `0001→0005` are now APPLIED to the live project** (via the Supabase MCP). RLS is on for
all 12 tables, both provenance CHECKs exist, `review_feed` is `security_invoker`, and the security
advisor is clean (revoked a stray public `EXECUTE` on the pre-existing `rls_auto_enable` helper).
People / Opportunities / Review / Auto-Populate are live. The **Google connector** (read-only OAuth +
Drive/Sheets) is built; it activates once the user connects Google on the Connections tab.

## Task log (most recent first)
- **Jarvis write-actions + manual contacts fix + user templates** — ✅ shipped to `main`, build green.
  Three commits this session:
  1. **Write-actions** (`62e119e`): the orb can now `create_calendar_event`, `draft_email`, and
     `save_drive_template`, wired into `ask()`'s Gemini tool loop via `src/lib/assistant/actions.ts`
     (`buildAskActions`). Calendar times resolve in code with chrono (hard rule #2) — the model passes
     the user's verbatim phrase in `when`. Timed-vs-all-day is decided by clock intent
     (`isCertain('hour') || meridiem !== null`, so "tonight"/"this morning" → timed, "June 20" →
     all-day). All-day range ends get a +1 day (Google's all-day end is exclusive; chrono's is
     inclusive), and the confirmation date is formatted from the resolved YYYY-MM-DD (no UTC
     round-trip → no off-by-one in negative-offset zones). Email is **DRAFT only** (gmail.compose;
     no send path — autonomy L0). Save-template reads a named/linked Doc (drive.readonly) → Supabase.
     Each action returns a receipt (`AskActionRef` w/ `detail`) surfaced under "Done by Jarvis";
     missing scope → "Reconnect Google…". `/api/agent` now propagates citations/files/actions.
  2. **Manual contacts fix** (`71616c6`): `loadAcceptedPeople` was filtering out every contact with
     no `source_quote` — i.e. every manually-added one. Removed the filter; `PersonCard` renders
     manual contacts (no provenance) via a non-`<Card>` tile with an "Added by you" badge, keeping
     the `<Card>` source-chip invariant (rule 4) intact for researched people. (Write path was
     already correct — contact row + email/linkedin channels.)
  3. **User templates** (`8e6286a`): "New template" form on the Templates page (type or upload a
     .txt/.md) → `POST /api/templates/create` → `saveUserTemplate` (source "user", verbatim, no
     scrub). New read-only `list_templates` assistant tool hands Jarvis each saved template's full
     name/subject/body so it can MEANINGFULLY adapt one (fill placeholders, change tone/content)
     and then `draft_email` the edited result — prompt instructs it not to echo verbatim.
  - **tsc + full `npm run build` clean** after each commit. Adversarial review (workflow `wj8vppg39`,
    13 agents, 3 lenses, each finding skeptic-verified) found **6 real defects — all fixed** in
    `f5b6e6f`, then re-verified empirically against the project's chrono:
    1. **HIGH** — bare relative phrases ("next week", "next month", "in 2 weeks") became fabricated
       1-hour timed events (chrono attaches a default meridiem to them; the old `meridiem !== null`
       check misread that). Fixed: a meridiem only implies a time when a day-segment word is present
       (`SEGMENT_WORDS` regex); otherwise the phrase stays all-day.
    2. **MED** — start-timed range w/ a date-only end ("tomorrow 9am to next Friday") collapsed to a
       1-hour event; now spans to the end day at the start's time-of-day.
    3. **MED** — multi-day confirmations showed only the first day; new `describeResolved()` renders
       the full range ("Jun 20 – Jun 22") for all-day and timed spans.
    4. **MED** — `NewTemplateForm.submit()` had no `catch`; offline/non-JSON now surfaces a message.
    5. **LOW** — a space-free doc name matched `extractFileId`'s bare-id regex; `saveTemplate` now
       falls back to a name search when a guessed (non-URL) id fails to read.
    6. **LOW** — file was read before the size cap; added a pre-read size + empty-file guard.
- **Gemini switch + Tavily web search + ElevenLabs voice + bare-orb home** — ✅ shipped (local), build green.
  Four user requests in one push:
  1. **Runtime LLM → Gemini** (commit `cc0b3d5`): all model calls go through `src/lib/llm/gemini.ts`
     (direct REST, no SDK) — `geminiStructured`/`geminiToolLoop`/`geminiText`, default `gemini-2.5-flash`,
     `thinkingBudget:0`, retry-on-overload. Migrated 9 logical sites (goals/router/today-plan/draft-email/
     ingest/compose structured; ask/opportunity/research agentic). Anthropic SDK now unused. Verified live.
  2. **Tavily is now the web search** (same commit): `webSearch()` feeds the agent loops; the citation gate
     is preserved against Tavily page text (quote must be a real substring; URL must be in the allowlist).
  3. **ElevenLabs voice** (commit `9d47bdb`): `src/lib/voice/elevenlabs.ts` + `POST /api/voice` speak each
     answer; `JarvisConsole` plays it with a speaker toggle (localStorage-persisted). Server-only key.
     Degrades silently with no key. **⚠ Needs `ELEVENLABS_API_KEY` to actually speak — see SESSION_HANDOFF.**
  4. **Bare-orb home + hamburger-only nav** (commits `365d56b`/`ddcf133`/`5ce870e`): home is just the
     particle sphere + military clock on pure black; nav is a slide-in drawer behind a hamburger; the
     "Ask about your email" explainer and the duplicate top-right "Ask Jarvis" are gone on the home.
- **Daily Plan (Today) + Jarvis Q&A over connected data** — ✅ shipped (local). Two features:
  1. **Daily Plan** (`/today`): `src/lib/agents/today/plan.ts` loads today's calendar events + open/overdue/
     undated tasks + recent emails, then a forced Claude `build_day_plan` tool returns **only**
     order/part-of-day/priority/action/why — **never a clock time** (hard rule #2). Code attaches the real
     calendar times (`sources.occurred_at` → `formatWhen`) and computes a deterministic sortKey (fixed
     events at their epoch; flexible items at startOfDay + bucketHour[morning9/afternoon13/evening18/
     anytime12] + order). Ephemeral — nothing persisted (L0). Every block carries a non-empty `CardSource`
     so `<Card>` renders. `GET /api/today/plan` + `DayPlanView` client component.
  2. **Q&A over connected data**: `src/lib/assistant/data-tools.ts` gives the assistant read-only,
     RLS-scoped access to Gmail/Calendar/meetings/tasks/contacts/opportunities via a prompt **digest**
     (`buildDataDigest`) + a `search_my_data` tool (`searchMyData`). Threaded through `ask(message, ctx)`
     and both `/api/ask` + `/api/agent`. Dates only formatted, never computed. Router/registry guidance +
     JarvisConsole examples updated to advertise data Q&A.
  - Adversarial review (workflow w77ny0yiv, 9 agents): 4 confirmed findings. **Fixed:** voice-input
    duplication (cumulative `e.results` re-appended → rebuild each event); `searchMyData` silently dropped
    null-date tasks/opps under a time window (now `nullableWindowOr` keeps undated/rolling in today/upcoming).
    **Deferred/acknowledged:** `/api/agent` router is not reached by any UI (orb posts to `/api/ask`
    directly) — to be wired when the action-agents arc lands; model prose could restate a real event time
    (low, compliant — the structured timeLabel path is code-derived). **tsc + eslint clean.**
- **Goals anchors UI + manual entry + Gmail/Calendar ingestion + drafting + orb/nav polish** — ✅ shipped
  (migrations `0006→0009` live). Highlights: Goals page/detail + global goal filter (`?goal=`) + per-tab
  filtering + add-to-goal on cards + AI goals-from-context + intersections (combined-ask) + goal
  connections. Manual entry for contacts/opportunities/tasks + a user `profiles` row (age/level/looking-for)
  that makes opportunity auto-population goal+profile-aware. **Gmail ingestion** (`lib/google/ingest.ts`):
  Claude triages inbox relative to goals/profile, keeps only important mail, groups by sender/org, adds
  important senders/opportunity threads to Contacts (L0); **Calendar** kept as-is; both stored as `sources`
  (deduped by external_id). Email drafting to a contact → "Open in Gmail" compose (no send scope). Orb
  rebuilt as a layered morphing blob (moves more when talking); persistent left sidebar nav; all page
  explainer text stripped; logo → home. tsc + eslint clean; routes gate. Adversarial review run wwaqknovi.
- **Goals as ANCHORS (backend+API)** — Migrations `0006_goals_anchors`
  (polymorphic `goal_links` entity↔goal + `goal_connections` + `goal_intersections`) and
  `0007_goals_provenance` (goals get `created_by`/`review_status`/`source_*`/`confidence` for L0 AI
  goals; back-filled `contact_goals` → `goal_links`) are **applied live**. Backend lib in
  `src/lib/goals/`: `links.ts` (link/unlink/setReview + deterministic `refreshIntersection`),
  `load.ts` (loadGoals, loadGoalDetail, entityIdsForGoal, goalsForEntities), `generate.ts` (4 Claude
  flows: goals-from-context, propose links, combined-ask, goal-connection), `facts.ts` (entity facts +
  goal digests), `types.ts`. API: `/api/goals` (GET/POST), `/api/goals/[goalId]` (PATCH incl.
  accept/dismiss, DELETE), `/api/goals/generate`, `/api/goal-links` (POST) + `/[linkId]` (PATCH/DELETE),
  `/api/entities/suggest-goals`, `/api/goal-intersections` (POST/DELETE), `/api/goals/[goalId]/connections`.
  Model: entity_type ∈ {contact, opportunity, item, source} (source = email/meeting/calendar). AI links
  land review (L0); intersections auto-detected in SQL, Claude only writes the combined-ask. **tsc +
  eslint clean.** NEXT: UI — Goals page (list + manual create + generate-from-context), goal detail
  (`/goals/[goalId]`: linked entities, intersections rail, connections), a goal filter/toggle in the
  Topbar wired through `?goal=` to filter People/Opportunities, and an "Add to goal / suggest goals"
  control on PersonCard + OpportunityCard. Then adversarial review + commit. Design spec lives in the
  workflow output (run wuo6a0whl).
- **Migrations applied LIVE + Google connector** — ✅ done. Applied `0001→0005` via the Supabase MCP
  (12 tables, RLS verified, advisors clean). Built the **Google connector** (read-only):
  `0005_connected_accounts` (RLS-scoped token storage; `sources.source_type` extended with
  `sheet`/`drive`); `src/lib/google/{oauth,store,drive,sheets,import-contacts,draft-email}.ts`;
  `/api/connect/google` + `/callback` + `/disconnect` (CSRF state cookie, refresh-on-expiry);
  `/api/google/import-contacts` + `/draft-email`; a **Connections** tab
  (`ConnectionsPanel`) to connect/disconnect + run the two tools. **Two features:** (1) import contacts
  from a Google Sheet → each row lands in Review with the sheet+row as source (reuses `research_runs`);
  (2) draft an email from a Drive template → Claude fills placeholders, draft-only (no send scope yet).
  **Verified:** tsc + eslint clean; live routes gate correctly (connect → /login, APIs → 401). Live
  Drive/Sheets calls await the user connecting Google.
- **Immersive Jarvis home + nav drawer** — ✅ built (local). `/jarvis` is now the command-center home:
  `LiveClock` (ticking, hydration-safe) + the arc-reactor orb + "JARVIS" wordmark + the ask console
  (`JarvisConsole hero`). The persistent sidebar was replaced by a slide-in `NavDrawer` opened from a
  hamburger in the `Topbar` (Esc/overlay/route-change close it). Root `/` and post-login now land on
  `/jarvis` (was `/today`). Deleted orphaned `Sidebar.tsx` + `MobileNav.tsx`. **Verified:** tsc +
  eslint clean; live server `/jarvis` + `/` → 307 `/login` (compile + auth gate OK).
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
**Verify the new write-actions end-to-end with a connected Google account.** The orb's
`create_calendar_event` / `draft_email` / `save_drive_template` are built, build-clean, and
review-hardened, but need a live OAuth check: connect Google (Connections tab) with the
calendar.events + gmail.compose + drive.readonly scopes, then exercise from the orb — "add a dentist
checkup next week" (→ all-day event next week, NOT a timed one), "draft an email to X using my
outreach template but make it more casual" (→ list_templates → adapted draft in Gmail Drafts, never
sent), and "save my <DocName> doc as a template" (→ appears on the Templates page). Confirm a missing
scope surfaces the "Reconnect Google…" message. Also confirm a manually-added contact now shows on the
People page with an "Added by you" badge.

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
