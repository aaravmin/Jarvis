<h1 align="center">Otto</h1>

<p align="center">
  <strong>A goal-grounded attention engine.</strong><br />
  Otto reads your email, meeting notes, Notion, and calendar, turns commitments into tracked
  tasks and follow-ups with a source link for every single one, and orders everything by what
  matters most to your goals.
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Status-In_Development-334155?style=for-the-badge" alt="Status: In Development" />
  <img src="https://img.shields.io/badge/Autonomy-L0_·_Suggest--only-16a34a?style=for-the-badge" alt="Autonomy: L0 suggest-only" />
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-15-000000?logo=nextdotjs&logoColor=white" alt="Next.js 15" />
  <img src="https://img.shields.io/badge/React-19-38bdf8?logo=react&logoColor=black" alt="React 19" />
  <img src="https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white" alt="TypeScript 5" />
  <img src="https://img.shields.io/badge/Tailwind_CSS-4-38BDF8?logo=tailwindcss&logoColor=white" alt="Tailwind CSS 4" />
  <img src="https://img.shields.io/badge/Supabase-Postgres_+_RLS-3FCF8E?logo=supabase&logoColor=white" alt="Supabase" />
  <img src="https://img.shields.io/badge/xAI_Grok-LLM-000000" alt="xAI Grok" />
  <img src="https://img.shields.io/badge/chrono--node-Deterministic_dates-0ea5e9" alt="chrono-node" />
</p>

---

Most "AI assistants" hand you a chat box. Otto is built on the opposite bet: the assistant's job
is to **reduce friction**, not to converse. It checks the four places your commitments live (email,
meeting notes, Notion, calendar), derives what needs doing, and puts it on one white page in order
of importance — red for overdue, green for done. Every item carries a link back to the exact line
that justified it, and nothing becomes real until you approve it.

## What it does

- **Captures commitments.** "Get this in by July 29th" in an email or a Notion meeting note becomes
  a task with a real due date and a link straight to that line.
- **Grounds importance in your goals.** You enter goals and sub-goals (e.g. *grow a respected
  AI + social-impact consortium* → *expand criminal-justice member attendance*). Correspondence and
  action items that advance one get flagged with a goal chip and boosted up the feed. The relevance
  claim is only kept if the exact supporting quote verifies against the source.
- **Orders everything deterministically.** Priority is pure code: overdue first, then due today,
  due soon, goal-relevant, the rest. No model computes a date or a rank.
- **Surfaces meeting topics.** Upcoming calendar events carry the open items likely to come up.
- **Shows its receipts.** One `<Card>` primitive refuses to render anything without a working
  source chip.

## The daily loop

Open **Today** → see what matters, in order → check things off → approve new suggestions in
**Review** (an item and its goal tag are accepted in one click). **Sync all** brings email,
calendar, and Notion current from one button; connecting Google runs a first sync automatically.

## How it works

| Step | What happens | Built with |
|------|--------------|------------|
| **1 · Ingest** | Gmail, Calendar, and recently edited Notion pages are stored as `sources` — raw text, when it occurred, a permalink home. | Google OAuth (read-only) · Notion OAuth, per-user (read-only) |
| **2 · Extract** | Otto reads a source and proposes items (tasks, events, follow-ups) plus optional goal relevance, as structured JSON — never free text. | xAI Grok · structured output |
| **3 · Verify** | Every item's `source_quote` and every goal link's `goal_quote` must be a real substring of the source, or it's dropped. | citation gate, in code |
| **4 · Resolve dates** | The model returns raw phrases ("next Friday"); code resolves real timestamps against the source's date. **The LLM never computes a date.** | chrono-node (`src/lib/dates.ts`) |
| **5 · Review (L0)** | Suggestions land in Review with their goal chips. One approval accepts the item and its goal tag together. | `PATCH /api/items` |
| **6 · Prioritize** | A pure function scores every accepted item (due proximity, goal links, type, confidence) into buckets: overdue (red) - today - soon - later - done (green). | `src/lib/priority/score.ts` (no LLM) |

## APIs & services

| Service | What it does here | Env var(s) | Required? |
|---------|-------------------|-----------|-----------|
| **Supabase** | Postgres + Auth + RLS — the system of record | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **Yes** |
| **xAI Grok** | All LLM calls: inbox triage, item extraction, goal-relevance proposals | `XAI_API_KEY` (+ `XAI_MODEL`) | **Yes** |
| **Google Workspace** | Read-only Gmail + Calendar connector | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` (+ optional `GOOGLE_OAUTH_REDIRECT`) | For email/calendar |
| **Notion** | Read-only meeting notes / pages connector — each user connects their own via OAuth and picks the pages Otto may read | `NOTION_CLIENT_ID`, `NOTION_CLIENT_SECRET` (+ optional `NOTION_OAUTH_REDIRECT`; `NOTION_API_KEY` only as a single-person self-host fallback) | Optional |

Each optional service is gated on its key — unset it and the feature says so plainly; the rest of
the app keeps working.

## The hard rules

Enforced, not aspirational ([`CLAUDE.md`](CLAUDE.md)):

- **Supabase Postgres is the system of record.** Notion is read-only ingestion, never a store.
- **The LLM never computes dates, priority, or reply-state.** chrono-node resolves dates; a pure
  function ranks; facts are verified against sources.
- **Every derived item stores `source_id` + `source_quote` + `confidence`.** Guarded at the database.
- **No card renders without a working source chip.** Enforced by the `<Card>` primitive.
- **Suggest-only (Autonomy L0).** Everything waits in Review; you approve before anything is real.
- **Narrowest OAuth scopes (`gmail.readonly`, `calendar.readonly`); tokens server-side only; RLS on.**

## Running it locally

```bash
git clone https://github.com/aaravmin/Otto.git
cd Otto
npm install

cp .env.example .env.local      # fill in the keys (see the table above)
npm run dev                     # http://localhost:3000
```

Apply the schema by running the files in [`supabase/migrations/`](supabase/migrations/)
(`0001` → latest, including `0021_notion_sources.sql`, `0022_goal_hierarchy.sql`, and
`0023_notion_provider.sql`) in the Supabase SQL editor. Then sign in, set your goals, and connect
Google and Notion from the **Connections** tab — each user grants their own accounts, and the first
sync runs automatically.

## Project structure

```
src/app/
  page.tsx                # → redirects to /today
  (app)/                  # signed-in surfaces (server-side auth gate)
    today/  review/  goals/  tasks/  meetings/  email/  calendar/  connections/  onboard/
  api/                    # items, tasks, goals, notion/sync, google/*, connect/google/*
src/components/           # TodayView, ReviewItemCard, GoalsManager, Card (the source-chip gate),
                          #   SourceChip, GoalChip, DesktopRail, NavDrawer …
src/lib/
  priority/               # deterministic scoring + the Today feed (no LLM)
  google/                 # OAuth, Gmail, Calendar, ingest, extraction engine
  notion/                 # read-only Notion client + ingest
  goals/                  # goals, sub-goals, goal links
  items/                  # review queue + backfill
  llm/                    # Grok client (+ the gemini.ts adapter it powers)
  dates.ts                # chrono-node — the hard-rule-#2 boundary
docs/                     # PRD, ROADMAP, DATA_MODEL, DECISIONS, PROGRESS, SESSION_HANDOFF
supabase/migrations/      # 0001 → latest — run in the Supabase SQL editor
```

<p align="center">
  <sub>Built by Aarav Minocha · provenance-first, suggest-only by default · goal-grounded ·
  see <a href="docs/PROGRESS.md">docs/PROGRESS.md</a></sub>
</p>
