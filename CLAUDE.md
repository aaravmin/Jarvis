# CLAUDE.md — how to work in this repo

This file is read automatically every session. Follow it exactly.

## What this project is
**GOTT (Goal Oriented Task Tracker)** — a goal-grounded attention engine. It reads your email, meeting notes, Notion, and
calendar, turns commitments into tracked tasks/follow-ups **with a source link for each**, and
orders everything by importance against the goals and sub-goals you enter. One simple white UI:
red = overdue/urgent, green = on-track/done. The point is reducing friction. (`/docs/PRD.md` and
`/docs/ROADMAP.md` describe the original, larger product; the 2026-07-13 simplification in
`/docs/DECISIONS.md` supersedes their scope.)

## HARD RULES (never violate these)
1. **Supabase Postgres is the system of record.** Never store core data in Notion. Notion is, at most,
   an optional one-way mirror with a throttled queue (respect ~3 req/s).
2. **The LLM must NEVER compute dates.** The extractor returns `raw_due` / `raw_when` strings + the
   source quote; our code resolves them deterministically with a date-parser library (e.g.
   `chrono-node`) against the source's `occurred_at` and the user's timezone.
3. **Every derived item stores `source_id` + `source_quote` + `confidence`.** No exceptions.
4. **No UI card renders without a working source chip.** Enforced in code by the `<Card>` primitive
   (P0-T5): a card with no `source` prop throws a clear dev error.
5. **Ship autonomy L0 (suggest-only) first.** Derived items land in a Review queue; the user
   approves/rejects. Graduate to auto only when false positives are rare.
6. **Narrowest OAuth scopes; tokens server-side only.** Read-only first; add write scopes only when a
   feature needs them. Never put tokens in the browser. Keep RLS on — rows are user-scoped.
7. **Don't trust the model with dates, money, or "did I reply?" facts.** Resolve dates with a parser;
   verify reply-state from the actual thread.

## Working method (anti-hallucination)
- **The repo is the memory.** If it isn't written down (code, `/docs`, `PROGRESS.md`), it doesn't
  exist. The chat is disposable; the files are the truth.
- **One atomic task per session.** Finish, verify, update docs, commit. One task = one commit = one
  recoverable checkpoint.
- **Start every session** by reading `/CLAUDE.md`, `/docs/SESSION_HANDOFF.md`, `/docs/PROGRESS.md`, and
  confirming state in 3 bullets before writing code.
- **End every session** by updating `/docs/PROGRESS.md`, appending any decision to
  `/docs/DECISIONS.md`, regenerating `/docs/SESSION_HANDOFF.md`, and committing. (Protocol in
  `/docs/ROADMAP.md` Section 4.4.)
- **Task spec template:** `/docs/ROADMAP.md` Section 4.3. Expand each roadmap task into it before
  building.
- **Research-first:** analyze requirements and read existing code before using tools. No speculative
  or sweeping changes. Verify every step against actual data, not assumptions.

## Stack (see `/docs/ROADMAP.md` Section 3.2)
- **Frontend:** Next.js (App Router) + React + Tailwind.
- **System of record:** Supabase (Postgres + Auth + RLS + Realtime + Edge Functions + pgvector).
- **Extraction engine:** Claude API with tool use / structured output → validated JSON.
- **Connectors:** MCP servers (Google Workspace, Notion).
- **Voice (later):** Web Speech API → Whisper/realtime; ElevenLabs/browser TTS; Picovoice wake word.
- **Computer control (last, gated):** Playwright browser automation → optional Tauri/Electron +
  computer-use.

## Repo layout
```
/CLAUDE.md                 # this file
/docs/                     # ROADMAP, PRD, DATA_MODEL, DECISIONS, PROGRESS, SESSION_HANDOFF
/gott-product-roadmap.md   # canonical roadmap (mirrored to /docs/ROADMAP.md)
<Next.js app at repo root> # app/ (or src/app), components/, lib/, etc.
```

## Secrets
- Secrets live in `.env.local` (gitignored), documented (keys only, never values) in `/docs`.
- Never commit credentials. Never echo secret values into chat or logs.

## Definition of done for any task
- Acceptance criteria met and **verified by the stated command/click**.
- Provenance preserved where applicable (`source_id` + `source_quote`).
- `/docs/PROGRESS.md` updated; decisions appended; committed.
