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
- One atomic task per session; commit at the end.

## Current state (Phase 0)
- ✅ **P0-T1** docs scaffold, ✅ **P0-T2** app shell (local), ✅ **P0-T5** provenance `<Card>`.
- ⏳ **P0-T2 Vercel deploy** — pending the user.
- ⛔ **P0-T3 (Supabase Auth)** and **P0-T4 (schema)** — blocked until the user provides Supabase
  credentials.
- App runs: `npm run dev` → http://localhost:3000 (opens on `/today`). `npm run build` passes.

## How to run
```
npm install      # if node_modules is missing
npm run dev      # http://localhost:3000
npm run build    # production build / typecheck
```

## Files that matter
- `/CLAUDE.md` — how to work here (read automatically each session).
- `/docs/PROGRESS.md` — living state; **read this first**.
- `/docs/ROADMAP.md` — the phased task list + working method (Section 4) + task template (4.3).
- `/docs/DATA_MODEL.md` — the schema and migration order (P0-T4 next).
- `src/components/Card.tsx` + `src/components/SourceChip.tsx` — the provenance primitive (reuse
  everywhere a derived item is shown).
- `src/lib/nav.ts` — single source of truth for the dashboard nav.
- `src/app/(app)/` — the dashboard layout + section pages. `/dev` is the component lab.

## The single next task
**P0-T3 — Supabase project + Auth** (needs the user). Then **P0-T4 — create `sources` + `items`
with RLS** per `/docs/DATA_MODEL.md`.

## What we need from the user to unblock
1. A Supabase project: Project URL, anon (publishable) key, and the DB connection string (or
   service-role key) for running migrations. (P0-T3/T4)
2. A Vercel account/login if we want to deploy now (P0-T2 deploy). Optional; local works.
3. Later: an Anthropic API key (Phase 2 extraction) and a Google Cloud OAuth client (Phase 2 Gmail).
