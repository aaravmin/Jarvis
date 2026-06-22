# DECISIONS — append-only log

> One entry per non-obvious decision: date, decision, why. Never edit past entries; append new ones.

- **2026-06-22 — Login passwords are stored AES-256-GCM encrypted (key `CREDENTIALS_SECRET`), never
  plaintext, and never returned to the client.** Why: the user wants saved site logins so Playwright can
  auto-sign-in, which means storing real third-party passwords. We encrypt in the app before insert
  (`src/lib/crypto/secrets.ts`), store only ciphertext (migration 0017 `site_credentials`, per-user RLS),
  decrypt only server-side at scrape time (`getCredentialForSite`), and the list endpoint returns the
  username + a "saved" flag only. With no `CREDENTIALS_SECRET` the vault is off and the UI says so. This
  keeps hard rule #6 (secrets server-side only) while enabling the feature.
- **2026-06-22 — The LinkedIn browser profile + context are keyed PER USER (`profileDir/<userId>`, a Map
  of contexts on globalThis).** Why: the old single globalThis context + one shared profile dir would, on
  a multi-user deployment, let one user see another's LinkedIn session (a real isolation hazard flagged in
  the multi-tenancy audit). Per-user keying fixes it. Auto-login is non-regressive: it only fires when a
  saved login exists and the page is on a wall; on a 2FA/captcha checkpoint it falls back to the existing
  manual "finish signing in" message. The LinkedIn login automation could not be verified headlessly.
- **2026-06-22 — Data pages are a TABLE by default with a Grid (4-wide) toggle, not one card per row.**
  Why: the user wants a Google-Sheets feel (dense, many records, every field labeled, inline edit,
  grouping). A research pass (Airtable/Notion/Sheets/Linear/Todoist) confirmed a table is the right
  primary view; the Grid reuses the existing PersonCard/OpportunityCard (so provenance + the source-chip
  invariant stay intact) for visual browsing. Inline edit is save-on-blur + optimistic with revert+toast;
  select pills edit in one click, text/date/link via double-click or Enter. Advanced spreadsheet features
  (keyboard grid nav, drag-reorder, fill handle, command palette, undo stack) were deferred.
- **2026-06-22 — Em-dashes are stripped from generated output AND swept from all source copy.** Why: the
  user asked for none anywhere, especially in web-search answers. `stripDashes()` cleans the assistant's
  answer (also what is read aloud) and web-search citations at runtime, the prompt forbids them, and a
  one-time newline-safe sweep removed them from existing copy/comments. The stripper util itself keeps
  the dash characters (its regex matches on them), so it is excluded from the sweep.
- **2026-06-22 — Jarvis is productized via a first-run /onboard checklist, not by changing the data
  model.** Why: the audit showed the app is already multi-tenant (per-user RLS everywhere, per-user Google
  tokens / profile / documents), so "anyone can use it" needed onboarding + de-personalization, not a
  re-architecture. New sign-ups land on /onboard (profile → Google → documents) instead of an empty
  dashboard; placeholders that named a specific school/person were genericized.
- **2026-06-20 — The conversational assistant gets a single `add_contact` tool that REUSES the People-tab
  importer, not a parallel implementation.** Why: the orb (`ask.ts`) and the People tab were separate code
  paths, so the orb genuinely couldn't make a contact card (it had no scrape/contact tool). Rather than
  duplicate the scrape+enrich logic, `add-contact.ts` resolves a person to a LinkedIn URL (pasted URL →
  browser People-search by name → Apollo match) and then delegates to the SAME
  `importContactFromLinkedIn`, so provenance/dedup/source-chip behavior is identical everywhere. The only
  bespoke path is `insertFromApollo` (Apollo matched a name but returned no LinkedIn URL) — a rare case
  the importer can't serve because it requires a `/in/` URL. The assistant action stays thin (delegates),
  matching how `createCalendarEvent`/`draftEmail` delegate to the google libs.
- **2026-06-20 — The assistant's contact tool is gated behind `ctx.actions` and lands `accepted`, and the
  system prompt is honest about when it can't.** Why: `add_contact` is a WRITE tool, so it's only offered
  when an actions context is present (same gating as create-event / draft-email). It's an explicit
  single-person user request → `created_by='user'`/`accepted` (rule #5, like the manual form). The prompt
  tells the model NOT to refuse pre-emptively (the original bug was the orb disclaiming it had no
  scraping) but to RELAY exactly what the tool returns — login-needed, needs-a-URL, or backend-not-
  configured — so it never claims a save that didn't happen (rule #7). A url-bearing `field_sources` entry
  is always seeded (in both `insertFromApollo` and `importContactFromLinkedIn`) so the card's source chip
  links back even when the only datum is a bare name (rule #4 — the chip renders from `source_quote`, but
  a missing permalink would break the click-back-to-source provenance).
- **2026-06-20 — Paste-a-LinkedIn-URL import lands the contact `accepted` (NOT Review), with NO
  `sources` row.** Why: hard rule #5 sends *autonomous discovery* to Review, but this is an explicit,
  single-person user action (the user chose THIS person and pasted THEIR link) — identical in kind to
  the manual "Add a contact" form and the Apollo "Find email" flow, both of which create `accepted`
  contacts. So `importContactFromLinkedIn` writes `created_by='user'`, `review_status='accepted'`. No
  `sources` row is created because `sources.source_type` has no `'linkedin'` value (inserting one would
  violate the CHECK), and a `created_by='user'` contact needs no `source_id` to satisfy
  `contacts_provenance_chk`. Provenance (rule #3) therefore rides entirely in `field_sources` (the
  LinkedIn URL for page-read fields, `apollo.io` for the Apollo email, each with a quote + confidence +
  status) plus `source_quote` (the headline) — enough for the card's source chip (rule #4), with the
  LinkedIn URL ordered first so `rowsToPerson` picks it as the primary permalink. No migration.
- **2026-06-20 — Enrichment is two independent best-effort tiers (page read + Apollo), merged,
  attributed per field.** Why: LinkedIn hides emails (so Apollo is the only reliable email source) but
  Apollo's title/org can be stale or a guess (so the visible profile page is preferred for role/company
  VALUE, which also keeps the LinkedIn URL as the card's primary source). Each tier degrades alone:
  Apollo-only needs no browser; browser-only fills role/company/bio with no email; neither configured
  returns an honest message naming `JARVIS_BROWSER=playwright` / `APOLLO_API_KEY` instead of saving a
  bare link. `scrapeLinkedInProfile` reuses the ONE persistent, user-logged-in Chromium context (shared
  with people-search) — accepted that it holds the user's LinkedIn cookie in a local on-disk profile;
  persistence is the point (the login survives), tokens never touch the browser/client (rule #6).
- **2026-06-20 — Removed the manual "add a Google Calendar event" tool from Connections; kept the
  `calendar.events` scope.** Why: the user called the manual form redundant ("That's in the connections
  tab"), and the assistant already creates calendar events autonomously — so the scope is still needed
  and stays in `WRITE_SCOPES` (the reconnect nudge still fires). Only the duplicate manual UI + its
  now-misleading copy were removed.
- **2026-06-20 — Contact validation verdicts live in `contacts.field_sources` (jsonb), not new
  columns; `contact_channels` has no `verified` column.** Why: rule #3 already makes `field_sources` the
  per-field provenance store, and adding a verdict needs no migration (I never apply migrations to the
  live DB). The `FieldSource` type gained an optional `status` ("verified" | "mismatch" | "unconfirmed"
  | "invalid" | "enriched"); `PersonCard` reads it to render coloured badges. Validation-of-an-existing
  email deliberately writes NO `url` on its verdict (the email VALUE came from the sheet, the contact's
  primary source — Apollo only vouches for it; a url would make `rowsToPerson` mis-pick Apollo as the
  card's primary permalink). Filled-from-Apollo fields DO carry `url: apollo.io` (Apollo is genuinely
  that field's source).
- **2026-06-20 — Validate/enrich is a SECOND pass over already-imported rows, not folded into import.**
  Why: keep Sheet import fast + deterministic (no LLM, no network beyond Sheets) and let validation
  re-run on demand (a button) or after a re-import. It auto-runs once right after import for the
  expected flow, but is idempotent and safe to repeat. Contacts stay in Review (L0) the whole time, so
  every filled/flagged field is re-approved by the user — Apollo data is never silently promoted to a
  trusted fact (rule #5). Channel fills are dedup-safe in code (fresh-check + insert + keep-lowest-id
  prune) because `contact_channels` lacks a UNIQUE(contact_id, kind, value) constraint; the airtight fix
  is that constraint, left as a suggested migration for Aarav.
- **2026-06-20 — People-discovery prompt flipped from "prefer precision over recall" to "exhaustive
  within what you can verify."** Why: the user explicitly wants "as MANY Brown alumni in X as possible."
  The citation/verification bar is unchanged (every person still needs a verbatim-substring quote from a
  retrieved result, or they're dropped) — only the breadth target changed: search several angles, report
  every backed match, `MAX_TURNS` 8→12. Precision is still enforced by `backs()` server-side; recall is
  now encouraged in the prompt rather than suppressed.

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

- **2026-06-19 — Playwright browser autofill is real, but submit-only-on-click, gated, and
  dependency-decoupled.** Why: the user asked Jarvis to actually *fill out* a job/grant form, not just
  produce a plan. `autofill.ts` drives a HEADED real browser to type the grounded `field_plan` into the
  live form, attaches the resume from private Storage to the first file input, then **leaves the window
  open for the user to review and submit** — it never clicks Submit/Apply (hard rule #5). Field identity
  (`name`/`field_type`/`selector`/`options`) rides scrape→resolve→autofill inside the `field_plan` jsonb
  (no migration); `browserScrape` now reads the *rendered* DOM via `page.evaluate` (visible labels,
  grouped radios, options, re-locatable selectors) instead of re-parsing static HTML. The `playwright`
  dep is loaded via `new Function("m","return import(m)")` (in `browser.ts`) so the bundler never
  resolves it — the app builds/runs without it and the static parser stays the default. Each control is
  re-located selector→name/id→label and filled by type; every field is independent and each skip is
  reported. Open windows are tracked on `globalThis` so a re-fill replaces the prior one. All gated on
  `JARVIS_BROWSER=playwright`; off or headless it degrades to "Open application + copy from the plan."
  The mechanical core (DOM read + text/select/radio/checkbox fill + file attach) is verified end-to-end
  against a live chromium. Surface: `POST /api/applications/[id]/autofill` + "Fill in browser" on the
  run card. (Browser autofill needs migration 0016 live for runs to exist, same gate as the rest.)

- **2026-06-19 — Source→items extraction is one engine; provenance is enforced in code, not trusted.**
  Why: the inbox/calendar/meetings all ingested `sources` but nothing turned them into `items`, so the
  whole product wedge (Review → Tasks → follow-ups) had an empty engine bay (`items`=0 despite 43
  sources). Decision: a single extractor (`lib/google/extract-items.ts`) mines any text source for
  candidate tasks/events/follow-ups, parameterized by a `SourceKind` ("email" | "meeting") that only
  swaps the prompt noun — the inbox and the Meetings paste-box share one code path. The model is
  UNTRUSTED at three points, each enforced in our code after the call: (1) **hard rule #3** — a
  candidate's `source_quote` is kept only if `backs(corpus, quote)` proves it's actually in the source;
  paraphrases/hallucinations are dropped, so every surviving item has a real, clickable source line.
  (2) **hard rule #2** — the model returns a verbatim `raw_due` *phrase* and never a date; chrono
  resolves it anchored to the source's `occurred_at` (the email's arrival / the meeting time), NOT
  today — so "by Friday" in a week-old email resolves to the correct Friday. (3) **hard rule #5** —
  everything lands at `status='review'` (L0 suggest-only) with confidence < 0.35 filtered and
  (source_id, title) de-duped; the user accepts/dismisses via `PATCH /api/items`. To feed the engine,
  Gmail ingest now pulls the FULL body (`format=full` + a MIME-tree parser, text/plain preferred,
  HTML stripped) instead of the ~160-char snippet — still read-only, no new scope. Surfaces:
  `lib/items/review.ts` + `ReviewItemCard` (rendered through the provenance-enforcing `<Card>`, so a
  quote-less item literally cannot display — rule #4), merged into the existing Review queue.

- **2026-06-19 — The orb admits when it can't web-search instead of answering from memory.** Why:
  `web_search` silently returned `[]` with no `TAVILY_API_KEY`, so the model would answer current-events
  questions from training data while looking like it had searched — a trust violation (a quiet, plausible
  wrong answer is worse than "I can't"). `ask.ts` now returns an explicit "web search is not configured"
  tool result when `tavilyEnabled()` is false, instructing the model to tell the user rather than guess.
  Same spirit as the dates/reply-state rules: never present an ungrounded claim as a grounded one.

- **2026-06-19 — One LLM provider: everything runs on xAI Grok.** Why: we were running two providers
  (Gemini Flash for ~10 call sites, Grok only for Application/Outreach), which doubled the keys, the
  failure modes, and the prompt/schema quirks to reason about. The user chose Grok as the single
  standard. Decision: `lib/llm/gemini.ts` is now a thin ADAPTER over `lib/llm/grok.ts` — it keeps the
  historical `gemini*` export names and the Gemini `contents`/`parts` request shape (so the ~10 call
  sites are UNCHANGED) but translates every call into xAI's OpenAI-style `messages` API and delegates to
  the three Grok primitives. No call hits Google anymore (GEMINI_API_KEY / Vertex are dead). The one bit
  of real logic is the contents⇄messages translation, with FIFO tool-call-id pairing so a tool-loop
  transcript survives the round-trip the research/opportunity engines need for their follow-up structured
  pass. Trade-off accepted: the file is still named `gemini.ts` (cosmetic debt) to avoid churning 10
  imports; its header documents that it's the unified Grok client. Grok takes JSON Schema natively, so
  the old JSON-Schema→Gemini-schema converter and the Vertex/ADC auth path were deleted. Verified: tsc +
  eslint + `next build` all green.

- **2026-06-19 — Phantom router agents fixed: email made real, calendar removed.** Why: the `email` and
  `calendar` agents were registered + classified but had no real dispatch — they returned a stale "needs
  Google connection" message for capabilities that already work. Decision: (1) the `email` agent is now
  LIVE and dispatches to the existing `backfillExtraction` engine, so "turn my inbox into tasks" actually
  mines synced mail into the Review queue and reports counts; (2) the `calendar` agent is deleted —
  the assistant already reads Calendar (`search_my_data`) and creates real events / drafts mail via its
  write tools (`create_calendar_event` / `draft_email`), so a separate agent was pure redundancy;
  calendar/draft requests now route to the assistant; (3) the `meeting` agent stays (its paste-a-
  transcript guidance is accurate). Also: accepted `event`/`follow_up` items now appear on the Tasks
  surface with a type pill (they previously vanished after the Review queue — /tasks only showed
  `item_type='task'`), and the `/dev` Component Lab is gated behind `NODE_ENV` (server-side `notFound()`
  + hidden nav link) so it can't be reached in production.

- **2026-06-19 — LinkedIn contact-sourcing reuses the existing research→contacts→Review pipeline and
  drives the user's OWN logged-in session (no new surface, no migration, no scraping bot).** Why: the
  user asked Jarvis to "scrub LinkedIn for relevant contacts for a job/grant I link." LinkedIn has no
  usable people API and aggressively blocks headless mass-scraping, so the only honest, durable path is
  to act as the user browsing their own account: one visible window, one page, rate-limited. We persist
  that session in an on-disk Chromium profile (`launchPersistentContext`, `LINKEDIN_USER_DATA_DIR`) kept
  alive on `globalThis` (survives dev HMR; we never open a second context against the same locked profile
  dir), so the login sticks across runs — the user signs in once. Discovered people flow through the
  SAME `research_runs → sources → contacts → contact_channels → Review → People` path as the Sheets
  importer, so there is **zero new data model** (no migration — respects "Aarav applies infra") and an
  accepted person inherits the existing Outreach "draft an email" button for free. Boundaries are
  deliberate: read-only (never logs in for the user, never connects, never messages); autonomy L0
  (`review_status='review'` — nothing reaches People until accepted, rule #5); provenance per rule #3
  (each contact stores `source_id` + a non-empty `source_quote` = the on-page headline+location, falling
  back to the profile URL, + `confidence`); and if the `sources` row can't be written we save nothing and
  say so rather than emit provenance-less contacts. The results reader is an IIFE **string** passed to
  `page.evaluate` (so TS never types the page-context DOM, matching the proven Apply `DOM_READER`),
  anchored on `/in/<slug>` profile links rather than LinkedIn's churning CSS class names. The whole
  feature is dark unless `JARVIS_BROWSER=playwright` — same gate as Apply autofill — so default installs
  carry no browser-automation surface.
