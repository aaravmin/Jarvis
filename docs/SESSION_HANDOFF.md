# SESSION_HANDOFF — fresh-start brief

> Regenerated at the end of every session. Written for a new session with **zero memory** of any prior
> chat. Points to files; does not summarize the whole codebase.

## What this project is
**Jarvis** — a goal-grounded attention engine.
It reads your email, meeting notes, Notion, and calendar; turns commitments into tracked
tasks/follow-ups with a source link for each; and orders everything by importance against the goals
and sub-goals you enter.
One simple white UI: red = overdue/urgent, green = on-track/done.
The point is reducing friction.

`/docs/PRD.md` + `/docs/ROADMAP.md` describe the original larger product; the **2026-07-13
simplification** (five entries in `/docs/DECISIONS.md`) supersedes their scope.

## Hard rules (also in `/CLAUDE.md`)
- Supabase Postgres is the system of record. Notion is READ-ONLY ingestion, never a store.
- The LLM never computes dates (chrono in `src/lib/dates.ts`) and never computes priority
  (`src/lib/priority/score.ts` is pure code).
- Every derived item stores `source_id` + `source_quote` + `confidence`; no card without a source chip.
- L0 suggest-only: derived items and their goal links land in Review; one approval accepts both.
- Read-only narrow OAuth scopes (`gmail.readonly` + `calendar.readonly`); tokens server-side; RLS on.

## Current state (all shipped to main, 2026-07-13)
The app was **simplified extremely heavily** in one session (6 pushed commits, net ~-19k lines):
1. `249e07b` — teardown: removed voice, the orb homepage + conversational assistant, the job applier
   (autofill/documents/credentials vault), LinkedIn + Apollo, people/opportunity research, outreach +
   templates, Tavily, Drive/Sheets extras. DB schema untouched.
2. `5c924a5` — deterministic priority engine (`src/lib/priority/`): due-date proximity + goal-link
   boost -> red/green buckets; extractor proposes per-item goal links, code verifies the quote
   (`backs()`), one approval accepts item + link; the LLM day-planner is gone.
3. `cfc00db` — read-only Notion connector (`src/lib/notion/`, `POST /api/notion/sync`,
   migration 0021): recent pages -> sources -> same extraction engine.
4. `a66a8c5` — UI: Today attention surface (server-rendered buckets, inline complete), goals with
   one-level sub-goals (migration 0022, graceful 42703 degrade), AI generate-goals removed.
5. `3e97b31` — 3-critic panel (friction/design + target-user + compromise broker) produced 10 fixes,
   all applied: goal chips in Review, first sync in the OAuth callback + Sync all on Today, neutral
   ink chrome (red/green are the only status colors), goal filter scoped to /tasks, dead contacts
   writes cut, Notion backfill, persona copy + goal descriptions in triage, dead affordances removed,
   delete confirms, persistent desktop nav rail.

**Verified:** tsc + eslint + `next build` green; dev-server smoke: every page 307 -> /login unauthed,
`/login` 200, APIs 401 with correct verb semantics.

## What we need from the user (roadblocks)
1. **Apply migrations `0021_notion_sources.sql`, `0022_goal_hierarchy.sql`, and
   `0023_notion_provider.sql`** (Supabase dashboard SQL editor, same as 0016). Until then: Notion sync
   returns an actionable error; sub-goals save flat; Connect Notion reports the missing migration
   (graceful degrade, app still runs).
2. **Create a PUBLIC Notion integration** (notion.so/my-integrations -> make public, redirect URI
   `${NEXT_PUBLIC_SITE_URL}/api/connect/notion/callback`) and set `NOTION_CLIENT_ID` +
   `NOTION_CLIENT_SECRET` in `.env.local`. Then EVERY user connects their own Notion from the
   Connections page and picks their pages. (`NOTION_API_KEY` is now only a single-person self-host
   fallback; leave it unset on a multi-user deployment.)
3. **Reconnect Google once** — scopes narrowed to `gmail.readonly` + `calendar.readonly`; the callback
   now runs a first sync automatically.
4. Enter your goals + sub-goals on /goals (the grounding for all prioritization).

## How to run
```
npm install
npm run dev          # http://localhost:3000 (redirects to /login until signed in)
npm run build        # production build / typecheck
```

## Files that matter
- Engine: `src/lib/priority/{types,score,load}.ts` (deterministic scoring + the Today feed),
  `src/lib/google/extract-items.ts` (extraction + quote-gated goal linking),
  `src/lib/dates.ts` (chrono, hard rule #2), `src/lib/agents/citation-gate.ts` (rule #3),
  `src/lib/items/{review,backfill}.ts`, `src/app/api/items/route.ts` (one-approval flow).
- Connectors: `src/lib/google/{oauth,store,gmail,calendar,ingest}.ts`,
  `src/lib/notion/{client,oauth,store,ingest}.ts` (per-user OAuth + env fallback),
  `src/app/api/notion/sync`, `src/app/api/connect/{google,notion}/**`.
- UI: `src/components/today/{TodayView,SyncAllButton}.tsx`, `src/components/items/ReviewItemCard.tsx`,
  `src/components/goals/GoalsManager.tsx` (sub-goals), `src/components/{DesktopRail,Topbar,NavDrawer,
  Card,SourceChip,GoalChip}.tsx`, `src/lib/nav.ts`, `src/app/globals.css` (neutral ink + red/green).
- LLM: `src/lib/llm/grok.ts` behind the `src/lib/llm/gemini.ts` adapter (single provider, xAI).
- Docs: `/docs/PROGRESS.md` (read first), `/docs/DECISIONS.md` (why), `/docs/DATA_MODEL.md`.

## The single next task
Exercise the loop live: connect Google (auto-syncs), set a goal with a sub-goal, confirm extracted
items land in Review **with goal chips**, accept one, and confirm it appears on Today in the right
bucket with a working source chip. Then apply 0021 + 0023, set up the Notion OAuth app, Connect Notion, and sync.

## Deferred backlog (from the critic panel, in priority order)
1. Reply-state verification from Sent mail ("did they reply?" per hard rule #7) -> follow-up items.
2. "Important new first-contact sender" as a lightweight follow_up item in Review.
3. Wire `?goal=` filtering into Today/Review/Email/Calendar/Meetings.
4. Review bulk accept/dismiss.
5. Triage drop-recovery (store kept=false classifications for audit).
6. Group Meetings by recurring series.
7. Reconsider folding Tasks into a Today toggle.
8. Scheduled auto-sync (Supabase Edge Function cron).
