# PROGRESS — living project state

> This is the single source of truth for "where are we." Update it at the end of every task.
> Read this file (plus `/CLAUDE.md` and `/docs/SESSION_HANDOFF.md`) at the start of every session.

## Current phase
**Phase 1 (task loop) and Phase 2 (source→items extraction) are now functional**, on top of a
code-complete Phase 0 and the research/agent stack. The keystone — turning ingested email/meeting
sources into sourced, reviewable items — is built and live (no migration gate). **Migration 0016 is
now applied** (via the dashboard SQL editor — so it does NOT appear in `list_migrations`, but all its
objects are verified live), which runtime-unblocks the **Apply/Outreach/Documents** arc. **Apply
autofill and Outreach drafts are proven end-to-end, and a new Playwright LinkedIn contact-sourcing
feature** lands relevant people from a linked job/grant into Review (no migration — reuses the
research→contacts pipeline). The browser backend is now enabled locally (`JARVIS_BROWSER=playwright`).

## Status summary
Phase 0 is code-complete: app shell, provenance `<Card>`, **auth (P0-T3)**, and the **core +
People + research schema migrations (P0-T4 and forward)** are all written and compile/build clean.
On top of that, the **Auto-Populate cohort research agent** is built end-to-end (the "find me Brown
alumni at a YC biotech startup" feature). A design workflow shaped it and a 4-dimension adversarial
review found **12 real defects — all fixed and re-verified**.

On top of that, a **multi-agent system** is now built: an intent **router** (`POST /api/agent`) sends
each request to exactly one agent, and a full **Opportunity agent** (programs/jobs/hackathons) mirrors
the people agent with chrono-resolved deadlines. Tabs were renamed to mirror the agents.

Most recently, an **Application & Outreach agent** (the "apply for me" layer, powered by **Grok**) is
built end-to-end: a `Documents` store (the agent's memory), an Application agent that reads a form and
grounds a reviewable field plan from your documents (never submits), and an Outreach agent that drafts
audience-tailored emails into Gmail Drafts (never sends). Its migration (**0016**) is written but **not
yet applied to the live project** — see the task log.

**Migrations `0001→0015` are APPLIED to the live project** (via the Supabase MCP); **`0016` is also
applied** (run through the dashboard SQL editor, so absent from `list_migrations`, but its tables,
bucket, column, and RLS policies are verified present). RLS is on for every table,
both provenance CHECKs exist, `review_feed` is `security_invoker`, and the security advisor is clean.
People / Opportunities / Review / Auto-Populate / Goals / Calendar / Email triage **and now the
email+meeting→items extraction engine and the task loop** are live. The **Google connector** activates
once the user connects Google on the Connections tab.

## Task log (most recent first)
- **LinkedIn contact-sourcing (Playwright) + Apply/Outreach proven end-to-end** — ✅ shipped to `main`
  (commit `f2068e0`), tsc + eslint green, route smoke-tested (401 unauthed), pushed. The user's
  directive: "Make sure Jarvis can automatically fill out job/grant applications using a link and email
  people (drafts). additionally add a feature where playwright scrubs linkedin for relevant contacts for
  job/grant applications i link it." Three parts:
  1. **Autofill-from-a-link** — re-verified already fully-works (paste URL → scrape form → grounded,
     citation-gated field plan → headed Chromium types values into the live form, NEVER submits). Was
     only gated on `JARVIS_BROWSER`; now enabled in `.env.local` (Playwright 1.61 + chromium-1228
     present). No code change needed — proven, not rebuilt.
  2. **Email-people-as-drafts** — re-verified already fully-works (Outreach agent → Gmail **Drafts**
     endpoint only; no `/send` code path exists). Gated on the `gmail.compose` scope (reconnect Google).
  3. **NEW — LinkedIn sourcing.** A "Find LinkedIn contacts" button on the Apply card and Opportunity
     card drives the user's OWN logged-in LinkedIn (persistent on-disk Chromium profile on `globalThis`)
     to a People search scoped to the linked org + a role hint (recruiter for jobs, program officer for
     grants), reads the result cards (anchored on `/in/` links, IIFE reader like the Apply DOM_READER),
     and lands people in **Review** as suggested contacts. Reuses the `research_runs → sources →
     contacts → Review → People` pipeline (same as Sheets import) — **no migration**. Read-only (never
     logs in / connects / messages); autonomy L0 (`review_status='review'`); provenance per rule #3
     (source_id + non-empty source_quote = on-page headline+location, falling back to the profile URL +
     confidence). Once accepted, the existing Outreach "draft an email" button works for free. New:
     `src/lib/agents/linkedin/{types,search,run}.ts`, `src/app/api/linkedin/contacts/route.ts`,
     `src/components/linkedin/FindLinkedInContactsButton.tsx`; `browser.ts` gains
     `launchPersistentContext`. Off unless `JARVIS_BROWSER=playwright`; first run opens a window to log
     in once, then the session persists (`LINKEDIN_USER_DATA_DIR`, default `~/.jarvis-browser/linkedin`).
- **Single LLM provider (Grok) + lean-up pass** — ✅ shipped to `main`, each commit tsc + eslint +
  build green, pushed. The user's directive: "just grok for everything and try to fix those issues …
  I don't even know if you're using playwright." Five pieces:
  1. **Grok consolidation.** `lib/llm/gemini.ts` rewritten as a thin ADAPTER over `lib/llm/grok.ts`:
     keeps the `gemini*` export names + Gemini `contents`/`parts` shape (so all ~10 call sites are
     unchanged) but routes every call to xAI. FIFO tool-call-id pairing makes a tool-loop transcript
     round-trip for the research/opportunity follow-up pass. Deleted the JSON-Schema→Gemini converter +
     Vertex/ADC. No call hits Google anymore. (commit `f8b546a`)
  2. **Events/follow-ups dead-end.** Accepted `event`/`follow_up` items vanished after Review (/tasks
     only showed `item_type='task'`, /calendar reads only Google sources). Tasks is now the unified
     "things on my plate" surface for all three accepted types with a type pill; task PATCH/DELETE widen
     to the three action types so they can be checked off / edited / deleted. (commit `c5e3cb1`)
  3. **Phantom agents.** `email` agent is now LIVE → dispatches the existing `backfillExtraction` ("turn
     my inbox into tasks" mines synced mail into Review). `calendar` agent deleted (assistant already
     reads Calendar + creates events / drafts mail). `meeting` kept. (commit `7b44986`)
  4. **/dev gate.** Server-side `notFound()` layout + hidden nav link → 404 in production. (commit `a84c04b`)
  5. **Playwright proven.** Smoke test launched headless chromium, read a rendered form's fields, closed
     clean. It IS installed (1.61 + chromium-1228); the only missing piece is `JARVIS_BROWSER=playwright`
     in `.env.local` to enable the headed autofill.
- **The engine bay: real autofill + email/meeting→items extraction + task loop (Phase 1/2 made real)**
  — ✅ all shipped to `main`, each commit tsc + build + lint green, pushed. The user's directive:
  "give Jarvis a job/grant application or a person to contact and it should fill it out … go part by
  part of the roadmap and make sure Jarvis can do it." Six pieces, in order:
  1. **Playwright browser autofill (B5).** `JARVIS_BROWSER=playwright`-gated. `application/browser.ts`
     (dependency-decoupled Chromium loader via `new Function` so the app builds without playwright) +
     `application/autofill.ts` (`autofillApplication`: launches a HEADED browser, locates each grounded
     field by selector→name→id→label, fills text/select/radio/checkbox, attaches the resume file, and
     **leaves the window open for the user to review + submit — never clicks Submit**) + `scrape.ts`
     DOM reader rewrite (a browser-side reader passed as a string to `page.evaluate`, resolving real
     labels/options/selectors) + `POST /api/applications/[id]/autofill` + a "Fill in browser" button on
     `ApplicationRunCard`. Mechanical core smoke-tested against a real browser (8 field types + all fill
     primitives passed). **Runtime-blocked only by migration 0016.**
  2. **Resume text extraction (B4).** `lib/documents/extract-text.ts` (unpdf + mammoth, serverless, no
     native deps) + `/api/documents/create` downloads the uploaded binary and extracts when the client
     sent no text — so a PDF/DOCX resume becomes the corpus the autofill grounds on (was empty before;
     the autofill was filling nothing). Both parse paths verified in this environment.
  3. **Task loop (B3).** Tasks could be created but never completed/edited/deleted (`/api/tasks` had
     only POST). Added PATCH (status done⇄accepted, title/notes edits, chrono-re-resolved due) + DELETE,
     RLS-scoped + pinned to `item_type='task'`; `components/tasks/TaskItem.tsx` gives each row a
     complete checkbox, inline edit, and delete. Live-verifiable (not gated on 0016).
  4. **Email→items extraction engine (B1) — the keystone.** 43 ingested email sources had produced 0
     items because nothing turned sources into items. Now: `gmail.ts` reads the FULL body (`format=full`
     + a MIME-tree parser that prefers text/plain and strips HTML — verified on 4 payload shapes) and
     stores it as `raw_text`; `lib/google/extract-items.ts` runs Gemini per email for candidate
     tasks/events/follow-ups, then enforces the hard rules in CODE: keep a candidate only if
     `backs(corpus, source_quote)` (rule #3), resolve `raw_due` with chrono anchored to the email's
     `occurred_at` (rule #2), drop confidence < 0.35, dedup by (source_id, title), insert at
     `status='review'` (rule #5). Wired into `ingestGmail`; sync reports "N to review".
  5. **Review surface + accept/reject (B2).** `lib/items/review.ts` + `components/items/ReviewItemCard.tsx`
     render each extracted item through the provenance-enforcing `<Card>` (working source chip required,
     rule #4) with Accept/Dismiss → `PATCH /api/items` (accept→accepted, dismiss→dismissed, RLS-scoped,
     only acts on rows still in review). The Review page now merges items with the research-agent runs.
     Accepted tasks flow to the Tasks page.
  6. **Meetings paste→extract (B10) + web_search honesty.** Meetings was a stub that *claimed*
     transcript extraction. Now `/api/meetings/extract` stores a pasted transcript as a `meeting` source
     and runs the same engine (generalized with a `SourceKind` so the prompt says "meeting transcript");
     the Meetings tab has a paste form + a list of transcripts with per-meeting action-item counts.
     Separately, the orb's `web_search` now returns an explicit "not configured" result when
     `TAVILY_API_KEY` is unset (it previously answered from memory silently). `docs/CAPABILITIES.md`
     updated to match reality.
- **Application & Outreach agent (the "apply for me" layer)** — ✅ build green (tsc 0, lint clean),
  shipped to `main` across the session. A new specialized agent powered by **Grok (xAI)** (Gemini stays
  on every existing feature). Three pillars:
  1. **Documents = the agent's memory.** New `Documents` tab + private, owner-scoped Supabase Storage
     bucket (`documents`, RLS by `auth.uid()` folder) + `documents` table (metadata + extracted text,
     default-resume flag). Client upload → `/api/documents/create` → `store.ts` (`loadAgentMaterials`
     returns the default/most-recent resume + other materials).
  2. **Application agent.** `runApplication()` flow: dedup guard → read the form (dependency-free static
     HTML parser today; env-gated `JARVIS_BROWSER=playwright` rendered-DOM path wired for later) → load
     the user's materials → Grok grounds each field → persist a **field plan** for review. Provenance is
     enforced in CODE (`backs()` citation gate): any fill not grounded in the corpus is demoted to
     unfilled/`inferred` (hard rule #3). It **NEVER submits** — lands `needs_review` (hard rule #5).
     Surfaces: `Apply` tab, "Prepare with Jarvis" on Opportunity cards, and the orb router
     ("prepare this application <link>" → application agent, URL extracted from the message).
  3. **Outreach agent.** Per-contact `OutreachButton`: pick an **audience** (investor/recruiter/professor/
     peer/founder — sets tone + ask) + goal → Grok drafts a tailored email grounded in the contact's
     `current_work` (no invented recipient facts) → editable → **saved to Gmail Drafts** (`gmail.compose`),
     never sent. Reuses the existing `getTokenWithScope` + `createDraft` infra.
  Migration **0016** adds it all (documents table + Storage bucket + 4 policies, `contacts.current_work`,
  `application_runs`, `outreach_runs`, owner-only RLS, inflight unique index). **⚠️ 0016 is written but
  NOT yet applied to the live project — Aarav applies migrations.** Until then the Documents/Apply/Outreach
  tables don't exist server-side; the UI builds and routes, but runs will error until 0016 is applied.
- **Calendar end-times + all-day fix · Apollo email connector · README API list** — ✅ build green
  (tsc 0, lint clean), adversarially verified (no real defects), not yet pushed. Three user requests:
  1. **Calendar never fabricates an end time.** `sources.ends_at` (migration 0014) + `sources.is_all_day`
     (migration 0015) make the end a real timestamp and mark date-only events. `formatEventTime()`
     renders the start–end span deterministically (hard rules #2/#7) and the assistant is handed that
     exact string. All-day events store start/end at LOCAL NOON (skew-proof; Google's exclusive end
     converted to the last included day) and render a plain DATE with no clock time. Ingest now REFRESHES
     seen events each sync, so reschedules + legacy rows self-heal. Threaded `is_all_day` through the
     calendar page, the assistant digest/search, and the Today agent.
  2. **Apollo.io connector** (`src/lib/apollo.ts`, gated on `APOLLO_API_KEY`, Tavily-style graceful
     degrade): enrich an existing contact's missing email (MATCH) and discover new people (SEARCH via
     `/mixed_people/api_search` — discovery only, no emails, so import ENRICHES each person by Apollo id
     to reveal the email). Imports are `created_by='user'`, Apollo recorded in `field_sources.email`.
  3. **README "APIs & services" table** lists every external service (Supabase, Gemini, Google
     Workspace, Tavily, ElevenLabs, Apollo.io, Web Speech API) + env vars; `.env.example` gained the
     Google connector vars; fixed Drive/Sheets attribution.
  A 9-finding adversarial workflow flagged the two HIGH correctness bugs (all-day fabrication; Apollo
  search returning no emails) — both fixed here, then re-verified.
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
**Verify the email→items engine end-to-end against live Gmail.** It's now runtime-functional (no
migration gate — the `items`/`sources` tables are live). Connect Google on the Connections tab, hit
**Sync** on the Email tab, and confirm: the sync summary reports "N to review"; the `Review` tab shows
the extracted tasks/events/follow-ups each with a working source chip (click it → the exact email line
+ Gmail link); Accept moves a task to the `Tasks` page, Dismiss clears it. Then paste a transcript on
the `Meetings` tab and confirm its action items land in Review the same way. Watch for date correctness
(a "by Friday" in an email from last week must resolve to the right Friday — chrono is anchored to the
email's `occurred_at`, not today).

Then, once **migration 0016 is applied** (see roadblocks), verify the Apply autofill: set
`JARVIS_BROWSER=playwright` + `npx playwright install chromium`, upload a PDF resume (confirm it
extracts text), "Prepare with Jarvis" on an opportunity, then "Fill in browser" — a headed window
should open with the grounded fields typed in and the resume attached, left open for you to submit.

## Known roadblocks / waiting on the user
- **Migration `0016` is APPLIED — no longer a roadblock.** Aarav ran it through the dashboard SQL
  editor, so it does NOT appear in `list_migrations`, but all of its objects are verified live (the
  `documents` table + private Storage bucket, `application_runs`, `outreach_runs`, `contacts.current_work`,
  and 8 RLS policies). The Apply/Outreach/Documents arc is now runtime-unblocked. (If you ever re-point
  at a fresh project, re-run `supabase/migrations/0016_application_outreach.sql`.)
- **Reconnect Google after the gmail body change.** Triage + extraction now read the full message body
  (`format=full`) — still within the existing `gmail.readonly` scope, so no NEW consent is needed, but
  the user should re-run Email sync to (re)ingest bodies and trigger extraction. Write features
  (calendar events, Gmail drafts) still need `calendar.events` + `gmail.compose` consent if not already
  granted.
- **`TAVILY_API_KEY` (optional but recommended).** Unset = the orb now says it can't web-search (no
  more silent from-memory answers), and the research/opportunity agents get no recall seed. Set it to
  enable web search end-to-end. Never affects provenance.
- **`ELEVENLABS_API_KEY` (optional).** Unset = the orb stays silent (text still works). Set it to speak.
- **`JARVIS_BROWSER=playwright` (for Apply autofill).** Playwright 1.61 + chromium-1228 are already
  installed and smoke-tested (a headed browser reads + fills forms end-to-end). The ONE missing piece is
  this env var — until it's set, Apply uses the static-HTML form reader and degrades autofill to "open
  the application + copy from the plan". Set `JARVIS_BROWSER=playwright` in `.env.local` to turn on the
  browser.
- **LLM key:** **one provider now — xAI Grok** powers EVERY model call (`XAI_API_KEY`, optional
  `XAI_MODEL`, default grok-4.3). `lib/llm/gemini.ts` is a thin adapter that routes to `grok.ts`;
  GEMINI_API_KEY / Vertex are no longer used. Set per the user.

## Stack as built
Next.js 15.5.19 · React 19.1 · Tailwind v4 · TypeScript · lucide-react · Turbopack ·
`@supabase/ssr` + `@supabase/supabase-js` · **xAI Grok** (single LLM provider, `lib/llm/grok.ts` +
the `gemini.ts` adapter) · Tavily (`lib/search/tavily.ts`, web search) · Playwright (Apply autofill) ·
`chrono-node` (date resolver). App at repo root; docs in `/docs`; SQL in `/supabase/migrations`.
(`@anthropic-ai/sdk` is still an installed dependency but no longer imported anywhere — retired.)

## Notes
- The model's self-reported URLs/quotes are **never trusted** — see `src/lib/research/extract.ts`
  (`backs()` + the citation allowlist). This is hard rule #3 made verifiable.
- L0 is enforced beyond the status column: every live contact read filters `review_status='accepted'`.
- Architecture decisions live in `/docs/DECISIONS.md`; schema + changelog in `/docs/DATA_MODEL.md`.
