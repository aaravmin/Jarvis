# DECISIONS — append-only log

> One entry per non-obvious decision: date, decision, why. Never edit past entries; append new ones.

- **2026-06-17 — Daily Plan is ephemeral and the model only SEQUENCES; it never emits a time.** Why:
  hard rule #2. `build_day_plan` (`src/lib/agents/today/plan.ts`) returns order/part_of_day/priority/
  action/why only — no date/time field. Real times come from `sources.occurred_at` (formatted by code);
  flexible items get a deterministic sortKey (startOfDay + bucketHour + order). The plan persists nothing
  (L0/suggest-only) — it's a view recomputed on each `GET /api/today/plan`. Every block carries a
  `CardSource` so `<Card>`'s provenance invariant holds. (Residual: the model's free-text action/why can
  *restate* a real event time — accepted, since repeating given data ≠ computing a date; a regex strip
  would wrongly mangle accurate references.)

- **2026-06-17 — The assistant reads the user's own data via a server-only, RLS-scoped bridge
  (`src/lib/assistant/data-tools.ts`): a prompt digest + a `search_my_data` tool.** Why: the user wants
  to ASK about their email/calendar/meetings/tasks, not just see them. The digest gives breadth for
  instant answers; the tool drills down. The user-scoped Supabase client (RLS → auth.uid()) guarantees
  rows never cross tenants; no service-role client is used. Dates are only formatted, never computed.
  Nullable date columns (tasks.due_at, opps.deadline_at) use `nullableWindowOr` so undated/rolling-open
  items survive a today/upcoming filter (a bare gte/lte drops SQL NULLs).

- **2026-06-17 — The orb (JarvisConsole) posts to `/api/ask`, NOT the `/api/agent` router.** Why: the
  ask path always answers (web + files + the user's data) and never needs the router's one-agent
  dispatch. Consequence: `/api/agent` + router + registry are currently unreached by the UI; the
  registry/router routing-guidance is forward-looking, taking effect only once an action-dispatch UI
  posts to `/api/agent`. Revisit when the write/action agents (Gmail draft, calendar create) land.

- **2026-06-17 — Supabase (Postgres) is the system of record; Notion is only an optional one-way
  mirror.** Why: Notion's API (~3 req/s, ~1000-block page ceiling, slow block writes) is unfit for
  all-day programmatic ingestion. Postgres/Supabase gives ~167× throughput plus auth, RLS, realtime,
  edge functions, and pgvector in one service. Core logic must never depend on the Notion API.

- **2026-06-17 — The LLM must NEVER compute dates.** Why: LLMs silently get "next Sunday" /
  "next Thursday" wrong. The extractor returns `raw_due`/`raw_when` strings + the source quote; our
  code resolves them deterministically with a real date parser (e.g. `chrono-node`) against the
  source's `occurred_at` and the user's timezone. This is the line between a toy and something
  trustworthy.

- **2026-06-17 — Provenance is non-negotiable.** Why: it is both the trust mechanism and the headline
  feature. Every derived item stores `source_id` + `source_quote` + `confidence`. No UI card renders
  without a working source chip. This rule is enforced in code (the `<Card>` primitive, P0-T5).

- **2026-06-17 — Ship autonomy L0 (suggest-only) first.** Why: autonomy before trust is the fastest
  way to abandon the project. Everything lands in a Review queue; the user approves/rejects. Graduate
  to L1/L2 only when the false-positive rate is low for this user.

- **2026-06-17 — Start ingestion with scheduled polling, not push.** Why: polling (Gmail History API
  `historyId`, Calendar sync tokens) is simple and robust; push (Pub/Sub webhooks, watch channels)
  adds infra we don't need on day one. Upgrade later.

- **2026-06-17 — Narrowest OAuth scopes, server-side tokens.** Why: we're connecting a real inbox and
  calendar. Read-only first; add write scopes only when a feature needs them. Tokens live server-side,
  never in the browser. RLS keeps every row user-scoped.

- **2026-06-17 — Connect Supabase via the official Supabase MCP server (not the CLI/manual SQL).**
  Why: it matches the roadmap's "MCP connector" design and gives the tightest build loop — Claude can
  create tables, apply migrations, and read project URL/anon key directly. The MCP server is scoped to
  a single project ref and authed with a revocable personal access token. Migrations are still written
  as SQL files in `supabase/migrations/` for a versioned record; the MCP `apply_migration` tool runs
  them. (Decision: P0-T3/T4 setup.)

- **2026-06-17 — Stay local-only for now; defer Vercel deploy.** Why: local dev works; a live URL is
  only meaningful once there's auth + real data. Revisit deploy after Phase 1/2.

- **2026-06-17 — Concrete Phase 0 stack: Next.js 15.5 (App Router + Turbopack), React 19, Tailwind
  v4, lucide-react; app at repo root.** Why: `create-next-app@15` gives a stable, current baseline on
  Node 24. Tailwind v4 uses the `@tailwindcss/postcss` pipeline (theme tokens in `globals.css` via
  `@theme inline`, no `tailwind.config.js`). The app lives at the repo root (not a `/web` subdir) so
  there's one `package.json`; docs stay in `/docs`. `turbopack.root` is pinned in `next.config.ts`
  because a stray `~/package-lock.json` otherwise makes Turbopack infer the wrong workspace root.

- **2026-06-17 — The `<Card>` guardrail throws in dev, renders null in prod.** Why: the rule "no card
  without a source" must be enforced in code. A hard throw in development surfaces violations loudly
  during the build/dev loop; in production we log and render nothing rather than crash a page. A card
  is invalid if `source` is missing or `source.quote` is empty.

- **2026-06-17 — Work task-by-task; the repo is the memory.** Why: long chat contexts cause drift and
  "it forgot what we decided." State lives in files (`/CLAUDE.md`, `/docs/*`), one atomic task per
  unit of work, commit at the end as a recoverable checkpoint. See `/docs/ROADMAP.md` Section 4.

- **2026-06-17 — Auth: email/password via `@supabase/ssr`, tokens in httpOnly cookies, gated in
  middleware + the `(app)` layout.** Why: matches the roadmap's narrowest-scope/server-side-token
  rule. The browser client uses only the public anon key (RLS-protected); the session rides in
  httpOnly cookies refreshed by `src/middleware.ts`. The dashboard layout re-checks `getUser()`
  server-side as defense-in-depth. (P0-T3.)

- **2026-06-17 — Added a cross-cutting "Auto-Populate" cohort research agent (beyond the roadmap, by
  user request).** Natural-language request ("Brown alumni at a YC biotech startup") → Claude with
  web search finds real people → each lands in Review as a suggested contact with provenance. It is a
  generalization of P6-T8/T9 applied at the cohort level. The Phase-6 People schema was pulled forward
  to support it.

- **2026-06-17 — The model's reported URLs/quotes are UNTRUSTED; provenance is validated against the
  real `web_search` citations before persist.** Why: hard rule #3. The engine harvests the
  server-side `web_search` citation objects (url + cited_text) separately from the model's tool args,
  builds a per-run allowlist, and DROPS any candidate whose `source_quote` isn't backed by a real
  citation and nulls any field source URL not in the allowlist. This makes provenance verifiable, not
  cosmetic. (`src/lib/research/extract.ts`.)

- **2026-06-17 — `review_status` lives on `contacts` (not as an `items` row); the unified Review queue
  is a `security_invoker` SQL view.** Why: a discovered person is a rich `contacts` row with child
  rows — forcing it through `items` orphans them. `review_feed` unions review-status items + contacts
  for one queue; `security_invoker=true` keeps base-table RLS in force. L0 is enforced everywhere by
  filtering `review_status='accepted'` on live reads — nothing auto-applies.

- **2026-06-17 — Structured output via forced `tool_choice` on a `report_candidates` tool, in a
  two-phase call (search → then report).** Why: `output_config.format` JSON mode is incompatible with
  citations, and forcing the report tool up front would stop the model from searching first. Phase 1
  runs `web_search` (tool_choice auto) and yields citations; phase 2 forces `report_candidates` to
  structure the findings. Web search tool: `web_search_20250305` (stable; no code-exec dependency).

- **2026-06-17 — The research run is server-only and synchronous in v1 (POST awaits completion).** Why:
  tokens must never reach the browser, and a synchronous request is the simplest robust path in local
  dev. The `research_runs.status` column + `GET /api/research/[runId]` polling endpoint are in place so
  this can move to a background worker later without changing the client contract.

- **2026-06-17 — Multi-agent system with an intent ROUTER that picks exactly one agent (by user
  request).** Why: the user asked to "route to a specific agent depending on the task, so you don't run
  all of them in conjunction." A small/fast Claude model (Haiku, `JARVIS_ROUTER_MODEL`) classifies a
  free-text request into ONE of: opportunity · contact · email · calendar · meeting · assistant, then
  `POST /api/agent` dispatches only that agent. Routing is failsafe — any error falls back to the
  `assistant` (the always-available catch-all). Registry of agents + capabilities + run-status:
  `src/lib/agents/registry.ts`; router: `src/lib/agents/router.ts`. Tab names were renamed to mirror
  the agents (Email, Calendar, Meetings, Contacts, Opportunities).

- **2026-06-17 — The Opportunity agent mirrors the people research pattern exactly (programs / jobs /
  hackathons / fellowships …).** Why: the people agent's two-phase (search → forced structured report)
  + citation-allowlist provenance gate is proven; reusing it keeps one mental model and one Review
  queue. New: `opportunity_runs` + `opportunities` tables (migration `0004`), the shared citation gate
  extracted to `src/lib/agents/citation-gate.ts`, and `runOpportunitySearch`/`runPeopleSearch` lib
  functions so BOTH the page bars and the router share one run-and-persist path.

- **2026-06-17 — Opportunity DEADLINES obey hard rule #2: the model returns only verbatim date STRINGS;
  our code resolves them with chrono-node.** Why: the same anti-hallucination rule that bans LLM date
  math. `opportunities` stores `raw_deadline`/`raw_event_dates` (verbatim, the displayed source of
  truth) AND `deadline_at`/`starts_at`/`ends_at` (chrono-resolved, for sorting/reminders). The resolver
  (`src/lib/agents/opportunity/deadline.ts`) resolves ambiguous dates FORWARD against one captured
  reference instant; unparseable phrases ("rolling") leave the resolved column null and the UI shows the
  raw string. Timezone caveat: when the source names a zone chrono honors it, else server-local — only
  affects sort/reminder, never the displayed deadline.

- **2026-06-17 — Google connector: read-only OAuth, tokens in an RLS-scoped `connected_accounts`
  table, Drive/Sheets features reuse the existing Review/provenance model.** Why: hard rule #6
  (narrowest scopes, server-side tokens). Scopes are `*.readonly` (gmail/calendar/drive/spreadsheets)
  + identity; write scopes (`gmail.send`) are deferred until the user approves sending. Tokens live in
  `connected_accounts` (RLS owner-only, refreshed on expiry in `store.ts`), never in the browser. The
  two requested features map onto existing agents, not new tables: **contacts-from-sheet** reuses
  `research_runs` + `contacts` (each row → a Review contact sourced to the sheet+row), and
  **draft-from-template** is draft-only (Claude fills a Drive doc's placeholders; no send without the
  write scope). `sources.source_type` gained `sheet`/`drive` so imports carry honest provenance.

- **2026-06-17 — Immersive Jarvis home + hamburger nav-drawer replaces the persistent sidebar (by
  user request).** Why: the user wants the home to read like a command center — a live clock, the
  arc-reactor orb, the JARVIS wordmark, and the ask console. The always-on sidebar fought that, so nav
  moved into a slide-in `<NavDrawer>` opened from a hamburger in the `Topbar` (works at every screen
  size; closes on Esc/overlay/route-change). `/jarvis` is the immersive home; root (`/`) and post-login
  now land there (was `/today`). Sidebar.tsx + MobileNav.tsx deleted (orphaned). `JarvisConsole` gained
  a `hero` prop that adds the clock + wordmark. `LiveClock` is hydration-safe (placeholder until mount).

- **2026-06-17 — Tavily is an OPTIONAL recall seed, never a provenance source.** Why: the user asked to
  "use Tavily where applicable," but the citation gate (hard rule #3) requires real `web_search`
  citations. So when `TAVILY_API_KEY` is set, the Opportunity agent runs a quick Tavily search and
  seeds the result URLs into the agent's prompt as leads — but nothing Tavily returns is ever stored as
  fact; the agent must still cite a real `web_search` result for a claim to survive. With no key,
  `src/lib/search/tavily.ts` is a safe no-op. It also never throws (an outage degrades recall, never
  aborts a run). Webhooks remain deferred to the Gmail/Calendar connectors (they need OAuth first).

- **2026-06-18 — Runtime LLM switched from Claude (Anthropic) to Gemini Flash.** Why: the Anthropic
  key kept hitting quota mid-task, which the working method (one atomic task per session) can't absorb.
  All model calls now go through a small direct-REST provider (`src/lib/llm/gemini.ts`, no SDK) exposing
  three primitives: `geminiStructured<T>()` (forced JSON against a schema — the drop-in for the old
  forced-tool pattern), `geminiToolLoop()` (function-calling agent loop), `geminiText()`. Default model
  `gemini-2.5-flash` (GA, reliable under load); `gemini-3.5-flash` exists but is frequently overloaded,
  so it's opt-in via `GEMINI_MODEL`. `thinkingConfig.thinkingBudget:0` on extraction calls (these are
  thinking models that otherwise burn the token budget before emitting JSON). The provider retries
  transient overload/rate-limit (429/503/"high demand") — exactly the failure the switch was meant to
  dodge. Untrusted-output discipline is unchanged: every call site validates/clamps, and dates are still
  resolved by chrono, never the model. Migrated sites: goals/generate, agents/router, agents/today/plan,
  google/draft-email, google/ingest, templates/compose (structured); assistant/ask, agents/opportunity/
  extract, research/extract (agentic). `@anthropic-ai/sdk` is now unused (left installed; harmless).

- **2026-06-18 — Tavily is now the PRIMARY web search, and it preserves the citation gate.** Why: this
  SUPERSEDES the 2026-06-17 "Tavily is an optional recall seed" decision. Claude's native `web_search`
  (which produced the citation objects hard rule #3 relied on) went away with the Gemini switch, so
  Tavily (`src/lib/search/tavily.ts` `webSearch()`) is the only web search now. Provenance is preserved
  by construction: the agent loops feed the model ONLY what Tavily returns, and we keep each result's
  real page text as the citation corpus + a per-run URL allowlist. A reported `source_quote` survives
  only if it's a genuine substring of a retrieved page (`backs()`), and a source URL only if it's in the
  allowlist — the same gate, now anchored to Tavily pages instead of Anthropic citation objects. With no
  `TAVILY_API_KEY`, web search is a safe no-op (the agents simply find nothing to cite).

- **2026-06-18 — ElevenLabs gives Jarvis a spoken voice; it's a progressive enhancement.** Why: the
  user asked for ElevenLabs voice. TTS of each answer runs server-side (`src/lib/voice/elevenlabs.ts`
  + `POST /api/voice`); the key lives only on the server (hard rule #6). The client plays the audio for
  each new answer and offers a speaker toggle (preference persisted to localStorage). Everything degrades
  silently: no `ELEVENLABS_API_KEY` → the route 503s and the UI just shows the text answer, so voice is
  never a hard dependency. Default voice "Rachel" (premade, on every account) + `eleven_turbo_v2_5`
  (low latency), both overridable via env. This completes the voice loop — we already had browser
  speech-to-text for input.

- **2026-06-18 — Calendar events carry an exact, structured END time (and an all-day flag) so the
  assistant never fabricates one.** Why: the user reported Jarvis inventing end times ("8 PM to 1 AM"
  for an event that only had a start). Root cause: the end was buried in `raw_text` as a raw UTC ISO
  and the start was local, so the model read the UTC hour as a local end. Fix (hard rules #2/#7): a
  `sources.ends_at timestamptz` column (migration 0014) + `formatEventTime()` renders the resolved
  start–end span deterministically and the assistant is handed that exact string, never raw ISO.
  Separately, all-day events were collapsed through `new Date().toISOString()` to UTC midnight, which a
  negative-offset zone renders as the PREVIOUS day at a fabricated clock time. Fix: a
  `sources.is_all_day` flag (migration 0015) + all-day starts/ends stored anchored at LOCAL NOON
  (skew-proof, DST-safe), with Google's EXCLUSIVE all-day end converted back to the last included day;
  `formatEventTime(…, allDay=true)` then renders a plain DATE with no time. Calendar ingest now also
  REFRESHES already-seen events on each sync (not just inserts new ones), so reschedules and legacy
  rows self-heal. Every calendar consumer (calendar page, assistant digest + search, the Today agent)
  passes `is_all_day` through; the digest/search prompts tell the model all-day events have no clock
  time.

- **2026-06-18 — Apollo.io is an optional, gated connector for finding contact emails + discovering
  people.** Why: the user asked to use Apollo to find email contacts (both: enrich existing contacts'
  missing emails AND search for new people). Mirrors the Tavily pattern: `src/lib/apollo.ts` is gated
  on `APOLLO_API_KEY`, server-only, degrades silently (no key → the buttons don't appear). Two
  capabilities: MATCH (`/people/match`) reveals one person's work email; SEARCH
  (`/mixed_people/api_search` — the API endpoint; the plain `/mixed_people/search` 403s on lower plans)
  is discovery only and per Apollo's docs returns NO emails. So the search→import flow ENRICHES each
  selected person via MATCH (by Apollo person id) at import time to reveal the email — search alone
  would yield names with no contact info. Imports are `created_by='user'` + `review_status='accepted'`
  (honestly avoids the jarvis-provenance CHECK while still recording Apollo in `field_sources.email`
  with `url='https://apollo.io'` + email_status-derived confidence, per hard rule #3). The email
  channel write is insert-first-then-prune so a failed write never leaves a contact with no email.

- **2026-06-18 — README documents every external API/service.** Why: the user noted ElevenLabs and
  Apollo.io were missing from the README. Added an "APIs & services" table (Supabase, Gemini, Google
  Workspace, Tavily, ElevenLabs, Apollo.io, Web Speech API) with each service's purpose, env var(s),
  and required/optional status, plus `NEXT_PUBLIC_SITE_URL` and the optional `GOOGLE_OAUTH_REDIRECT` in
  the env block and `.env.example` (which was also missing the Google connector vars entirely). Fixed
  the Drive/Sheets attribution: Drive = draft-from-template, Sheets = contact import/export.

- **2026-06-19 — The Application & Outreach agent runs on Grok (xAI), not Gemini.** Why: the user's
  roadmap specified Grok as the "brain" for this module. Added `src/lib/llm/grok.ts` (OpenAI-compatible,
  `grokStructured`/`grokText`/`grokToolLoop`, `XAI_API_KEY` + `XAI_MODEL`) mirroring `gemini.ts`. Gemini
  is untouched on every existing feature — this is additive, not a swap. Consequence: two LLM providers
  now coexist; pick per feature (existing → Gemini, application/outreach → Grok).

- **2026-06-19 — The Application agent FILLS a reviewable field plan but NEVER submits; form-reading is
  a static parser today with an env-gated Playwright path for later.** Why: hard rule #5 (ship L0
  suggest-only) + "don't reduce functionality / no auto-pilot." `runApplication` reads the form
  (dependency-free static HTML parser via `scrape.ts`; a `JARVIS_BROWSER=playwright` rendered-DOM path
  is wired behind a `new Function("m","return import(m)")` dynamic import so the uninstalled `playwright`
  package never breaks the bundle — verified by `npm run build`), grounds each field with Grok, and
  persists a `field_plan` at status `needs_review`. Provenance is enforced in CODE, not trusted from the
  model: `backs(corpus, quote)` (the citation gate) demotes any ungrounded fill to unfilled/`inferred`
  with capped confidence (hard rule #3). The user submits on the real site.

- **2026-06-19 — Outreach is UI-only (contact-targeted); only the Application agent joined the router.**
  Why: an application needs just a URL, which the router can extract from free text and dispatch
  (`/api/agent` → `runApplication`, redirect `/apply`). Outreach needs a specific contact + audience +
  tone that natural language can't reliably resolve, and it has no review-queue home — its natural
  entry point is the per-contact `OutreachButton`. Shipping a half-working NL outreach path would be
  worse than none, so outreach stays on the Contacts UI. Drafts save to Gmail Drafts (`gmail.compose`),
  never send (L0). (The router dispatch remains forward-looking until a UI posts to `/api/agent`; the
  orb still uses `/api/ask` — see the 2026-06-17 router decision.)

- **2026-06-19 — Documents (resumes/grant materials) live in a private Supabase Storage bucket, RLS by
  user-id folder; the `documents` row holds extracted text.** Why: the agent needs a corpus to ground
  fills/drafts in (hard rule #3), and files must stay owner-scoped (hard rule #6). Bucket `documents` is
  private with policies gating `(storage.foldername(name))[1] = auth.uid()::text`; uploads go to
  `${user.id}/<uuid>.<ext>` from the browser, then `/api/documents/create` records metadata + the
  extracted text used for grounding. One default resume per user (`createDocument` clears the prior
  default of the same type). **Migration 0016 carries all of this and is NOT yet applied to the live DB
  — Aarav applies migrations** (the UI/routes build, but server writes error until 0016 lands).
