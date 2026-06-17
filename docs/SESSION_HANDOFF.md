# SESSION_HANDOFF — fresh-start brief

> Regenerated at the end of every session. Written for a new session with **zero memory** of any prior
> chat. Points to files; does not summarize the whole codebase.

## What this project is
**Jarvis** — a personal command center. It reads your email, meetings, and calendar, turns commitments
into tracked tasks/events **with a source link for each**, proactively surfaces follow-ups, and is
controllable by voice. Full product definition: `/docs/PRD.md`. Full roadmap: `/docs/ROADMAP.md`
(canonical copy also at repo root as `jarvis-product-roadmap.md`).

## Hard rules (also in `/CLAUDE.md`)
- Supabase Postgres is the system of record. Notion is only an optional one-way mirror.
- The LLM never computes dates — use a date-parser library.
- Every derived item stores `source_id` + `source_quote` + `confidence`.
- No UI card renders without a working source chip (enforced by `<Card>`).
- Ship autonomy L0 (suggest-only) first; narrowest OAuth scopes; tokens server-side.

## Current state
- ✅ **Phase 0 code-complete**: P0-T1 docs, P0-T2 shell, P0-T5 `<Card>`, **P0-T3 auth**, **P0-T4 +
  Phase-6 + research migrations** (written, not yet applied to a live DB).
- ✅ **Auto-Populate cohort research agent** built end-to-end (cross-cutting feature, user request):
  natural-language cohort → Claude w/ web search → verified people in the Review queue (L0). A design
  workflow shaped it; a 4-dimension adversarial review found 12 defects, **all fixed**.
- Verified: `npx tsc --noEmit` clean; `npm run build` green (14 routes + middleware); runtime auth
  gate works (`/today`→`/login`, unauth API→401 JSON).
- ⛔ **Live** auth + migrations + research are blocked on credentials (see below). The build is not.

## How to run
```
npm install          # if node_modules is missing
npm run dev          # http://localhost:3000  (redirects to /login until Supabase is live)
npm run build        # production build / typecheck
```

## Files that matter
- `/CLAUDE.md` — how to work here (auto-read each session). `/docs/PROGRESS.md` — **read first**.
- `/docs/DATA_MODEL.md` — schema + migration order + changelog. `/docs/DECISIONS.md` — why.
- `supabase/migrations/0001_core.sql · 0002_people.sql · 0003_research.sql` — apply in order.
- `src/lib/supabase/{client,server,middleware}.ts` + `src/middleware.ts` — auth (P0-T3).
- `src/app/login/*`, `src/app/auth/{confirm,signout}/*` — auth screens/routes.
- `src/lib/research/extract.ts` — **the research engine + the citation-allowlist provenance gate**
  (the model's URLs/quotes are validated against real `web_search` citations before persist).
- `src/app/api/research/*` — POST (run) + `[runId]` GET/PATCH (load / accept / dismiss / cancel).
- `src/components/{Card,SourceChip,PersonCard,ResearchRunCard,AskJarvisDialog,FindPeopleBar}.tsx`.
- `src/app/(app)/{people,review,dev}/page.tsx` — where the feature surfaces. ⌘K opens "Ask Jarvis".

## The single next task
**Apply the migrations and verify auth + research live.** Steps once unblocked:
1. Apply `0001 → 0002 → 0003` via the Supabase MCP (`apply_migration`).
2. Verify RLS: sign up two users; a row inserted by A is invisible to B; `review_feed` excludes B.
3. Put `ANTHROPIC_API_KEY` (+ the anon key) in `.env.local`; run one cohort search (⌘K → "Brown
   alumni at a YC biotech startup") and confirm verified people land in Review with working source chips.

## What we need from the user to unblock
1. **Real Supabase personal access token** in the MCP config (`~/.claude.json` → `supabase` server;
   only the token is a placeholder now) **+ a Claude Code window reload** so the MCP connects.
2. **Supabase anon (publishable) key** → `.env.local` `NEXT_PUBLIC_SUPABASE_ANON_KEY` (URL already set).
3. **`ANTHROPIC_API_KEY`** → `.env.local` (server-side; powers the research agent). Optionally set
   `ANTHROPIC_MODEL=claude-opus-4-8` for stronger research (defaults to `claude-sonnet-4-6`).
4. Later: Google Cloud OAuth client (Phase 2 Gmail/Calendar); a Vercel login if/when we deploy.
