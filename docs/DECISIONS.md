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
