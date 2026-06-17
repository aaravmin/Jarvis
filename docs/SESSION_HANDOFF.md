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
- ✅ **Phase 0 code-complete**: P0-T1 docs, P0-T2 shell, P0-T5 `<Card>`, **P0-T3 auth**, migrations
  `0001→0004` (written, not yet applied to a live DB).
- ✅ **Auto-Populate cohort research agent** (people) built end-to-end: NL cohort → Claude w/ web
  search → verified people in Review (L0). Citation-allowlist provenance gate; 12-defect review fixed.
- ✅ **Multi-agent system** (user request): an intent **router** (`POST /api/agent`, Haiku) sends each
  request to exactly ONE agent — opportunity · contact · email · calendar · meeting · assistant — never
  all at once. Live agents run; not-yet-connected ones return a clear hint. Failsafe → assistant.
- ✅ **Opportunity agent**: programs/jobs/hackathons/fellowships, mirroring the people agent. Two-phase
  Claude + shared citation gate; **deadlines resolved by `chrono-node`** (model returns verbatim
  strings only). Each result carries deadline, how-to-apply, requirements, location, dates, skills —
  all sourced. Lands in Review. Optional **Tavily** recall seed (gated on key, never a provenance src).
- Verified: `tsc` + `eslint` clean; live dev server compiles all new routes (agent/opportunities → 401
  JSON unauthed; `/opportunities` + `/review` → 307 `/login`).
- ⛔ **Live** DB-backed features (auth sign-in, People, Opportunities, Review) are blocked on applying
  migrations (see below). The build/code is not.

## How to run
```
npm install          # if node_modules is missing
npm run dev          # http://localhost:3000  (redirects to /login until Supabase is live)
npm run build        # production build / typecheck
```

## Files that matter
- `/CLAUDE.md` — how to work here (auto-read each session). `/docs/PROGRESS.md` — **read first**.
- `/docs/DATA_MODEL.md` — schema + migration order + changelog. `/docs/DECISIONS.md` — why.
- `supabase/migrations/0001_core · 0002_people · 0003_research · 0004_opportunities .sql` — apply in order.
- `src/lib/supabase/{client,server,middleware}.ts` + `src/middleware.ts` — auth (P0-T3).
- **Multi-agent:** `src/lib/agents/{types,registry,router,citation-gate}.ts` + `src/app/api/agent/route.ts`
  — the router (classify → one agent → dispatch). Registry = source of truth for agents + run-status.
- **People agent:** `src/lib/research/{extract,run,map,load}.ts` + `src/app/api/research/*` — the
  engine + the citation-allowlist provenance gate (model URLs/quotes validated vs real citations).
- **Opportunity agent:** `src/lib/agents/opportunity/{extract,deadline,run,map,load,types}.ts` +
  `src/app/api/opportunities/*`. `deadline.ts` is the **hard-rule-#2 boundary** (chrono resolves the
  model's verbatim date strings). `src/lib/search/tavily.ts` = optional recall seed (gated on key).
- `src/components/{Card,SourceChip,PersonCard,ResearchRunCard,FindPeopleBar,OpportunityCard,`
  `OpportunityRunCard,FindOpportunitiesBar,AskJarvisDialog}.tsx`.
- `src/app/(app)/{opportunities,people,review,dev}/page.tsx` — where features surface. ⌘K = "Ask Jarvis".

## The single next task
**Apply the migrations and verify auth + research + opportunities live.** Steps once unblocked:
1. Apply `0001 → 0002 → 0003 → 0004` via the Supabase MCP (`apply_migration`).
2. Verify RLS: sign up two users; a row inserted by A is invisible to B; `review_feed` excludes B.
3. Run one cohort search (⌘K → "Brown alumni at a YC biotech startup") AND one opportunity search
   (Opportunities tab → "biotech hackathons with upcoming deadlines"); confirm both land in Review with
   working source chips, and opportunities show chrono-resolved deadlines.

## What we need from the user to unblock
1. **Real Supabase personal access token** in the **MCP config** (`~/.claude.json` → `supabase` server;
   only the token is a placeholder now) **+ a Claude Code window reload** so the MCP connects. NOTE: the
   `sbp_…` access token goes in the MCP config, NOT `.env.local`.
2. ✅ Anon key + `ANTHROPIC_API_KEY` are in `.env.local`. Optional: `ANTHROPIC_MODEL=claude-opus-4-8`
   (stronger research), `JARVIS_ROUTER_MODEL` (router), `TAVILY_API_KEY` (recall boost).
3. Later: Google Cloud OAuth client (Phase 2 Gmail/Calendar — activates the Email + Calendar agents);
   a Vercel login if/when we deploy.
