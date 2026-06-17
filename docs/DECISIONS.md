# DECISIONS — append-only log

> One entry per non-obvious decision: date, decision, why. Never edit past entries; append new ones.

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

- **2026-06-17 — Tavily is an OPTIONAL recall seed, never a provenance source.** Why: the user asked to
  "use Tavily where applicable," but the citation gate (hard rule #3) requires real `web_search`
  citations. So when `TAVILY_API_KEY` is set, the Opportunity agent runs a quick Tavily search and
  seeds the result URLs into the agent's prompt as leads — but nothing Tavily returns is ever stored as
  fact; the agent must still cite a real `web_search` result for a claim to survive. With no key,
  `src/lib/search/tavily.ts` is a safe no-op. It also never throws (an outage degrades recall, never
  aborts a run). Webhooks remain deferred to the Gmail/Calendar connectors (they need OAuth first).
