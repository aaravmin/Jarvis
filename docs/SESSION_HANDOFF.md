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
- The LLM never computes dates — use a date-parser library (chrono).
- Every derived item stores `source_id` + `source_quote` + `confidence`.
- No UI card renders without a working source chip (enforced by `<Card>`).
- Ship autonomy L0 (suggest-only) first; narrowest OAuth scopes; tokens server-side.

## Current state
- ✅ **Email + meetings → items extraction engine is LIVE (the keystone, no migration gate).** Ingested
  sources now become sourced, reviewable `items`. `src/lib/google/extract-items.ts` mines any text
  source (a `SourceKind` swaps the prompt noun for email vs. meeting transcript) for tasks/events/
  follow-ups; provenance is enforced in CODE after the model call: keep a candidate only if
  `backs(corpus, source_quote)` (rule #3), resolve its `raw_due` phrase with chrono anchored to the
  source's `occurred_at` (rule #2), drop confidence < 0.35, insert at `status='review'` (rule #5).
  Gmail ingest now reads the FULL body (`gmail.ts` `format=full` + MIME-tree parser) to feed it. The
  Review queue (`src/lib/items/review.ts` + `src/components/items/ReviewItemCard.tsx`) shows each item
  through `<Card>` with Accept/Dismiss → `PATCH /api/items`. Meetings tab has a paste→extract box
  (`/api/meetings/extract`). **Verify next: connect Google, Sync email, watch items land in Review.**
- ✅ **Task loop works.** `/api/tasks` now has PATCH (complete / edit / chrono-re-resolved due) + DELETE;
  `src/components/tasks/TaskItem.tsx` gives each task a complete checkbox, inline edit, and delete.
  Accepting a task in Review surfaces it here.
- ✅ **Apply autofill is real (gated).** `src/lib/agents/application/autofill.ts` drives a HEADED browser
  to type the grounded field plan into the live form + attach the resume, leaving the window open to
  submit (never auto-submits). Resume PDFs/DOCX are now text-extracted server-side
  (`src/lib/documents/extract-text.ts`, unpdf + mammoth) so the agent has a corpus. Needs
  `JARVIS_BROWSER=playwright` + a local chromium, AND migration 0016 for runs to exist.
- ✅ **Runtime LLM is Gemini, not Claude.** Every model call goes through `src/lib/llm/gemini.ts`
  (direct REST, no SDK): `geminiStructured` / `geminiToolLoop` / `geminiText`. Default
  `gemini-2.5-flash`; set via `GEMINI_MODEL`. Needs `GEMINI_API_KEY` (already in `.env.local`).
  Reason for the switch: the Anthropic key kept running out of quota. The `@anthropic-ai/sdk` package
  is still installed but **no longer imported anywhere**.
- ✅ **Web search is Tavily** (`src/lib/search/tavily.ts` `webSearch()`), used by the orb assistant and
  both research agents. The citation gate (hard rule #3) is preserved against Tavily page text: a
  reported quote survives only if it's a real substring of a retrieved page, and a URL only if it's in
  the per-run allowlist. Needs `TAVILY_API_KEY`. **No key ⇒ the orb now SAYS it can't web-search**
  (it used to answer from memory silently); set the key to enable it.
- ✅ **Jarvis has a voice (ElevenLabs).** `src/lib/voice/elevenlabs.ts` + `POST /api/voice` synthesize
  each answer server-side; `JarvisConsole` plays it and shows a speaker toggle. **See the roadblock
  below — it stays silent until `ELEVENLABS_API_KEY` is set.** Browser speech-to-text (input) already
  worked; this closes the loop on output.
- ✅ **Immersive home + hamburger-only nav.** `/jarvis` is a bare particle sphere (`JarvisSphere`) +
  military clock on pure black — no explainer, no nav until you open the hamburger drawer (`NavDrawer`).
  The duplicate top-right "Ask Jarvis" is hidden on the home only (`Topbar` checks the route).
- ✅ **Multi-agent system**: intent **router** (`POST /api/agent`) → exactly ONE agent (opportunity ·
  contact · application · email · calendar · meeting · assistant). **Opportunity** + **People** research
  agents both run two-phase (Tavily search → validated structured report); deadlines resolved by `chrono-node`.
- ✅ **Application & Outreach agent (NEW, runs on Grok/xAI — not Gemini).** `src/lib/llm/grok.ts`
  mirrors `gemini.ts` (`grokStructured`/`grokText`/`grokToolLoop`, `XAI_API_KEY` + `XAI_MODEL`). Three
  parts: (1) **Documents** tab/store — resumes & grant materials in a private Supabase Storage bucket =
  the agent's memory (PDF/DOCX now text-extracted server-side on upload); (2) **Application agent**
  (`src/lib/agents/application/*`) — reads a form (static parser + a `JARVIS_BROWSER=playwright`
  rendered-DOM path), grounds a reviewable **field plan**, and can now **fill the live form in a headed
  browser** (`autofill.ts`) — attaches the resume, leaves the window open, **never submits**; surfaces
  on the `Apply` tab + "Prepare with Jarvis" on Opportunity cards; (3) **Outreach agent**
  (`src/lib/agents/outreach/*`) — per-contact `OutreachButton`,
  audience-tailored draft into **Gmail Drafts**, **never sends**. Provenance enforced in code via the
  `backs()` citation gate. **⚠ Migration 0016 (its tables + Storage bucket) is NOT applied yet — see roadblock.**
- ✅ **Google connector** (read-only OAuth + Gmail/Calendar/Drive/Sheets) is built; activates on the
  Connections tab. Inbox triage (`src/lib/google/ingest.ts`) now runs on Gemini.
- ✅ Migrations `0001→0015` exist and are applied to the live project (per PROGRESS; verify with the
  Supabase MCP `list_migrations` if in doubt). **`0016_application_outreach.sql` is written but NOT
  applied** — see roadblock. Verified this session: `npm run build` green, `tsc` + `eslint` clean.

## ⚠ The roadblocks to clear next
**1. Apply migration 0016 — the ONE thing blocking the Apply/Outreach/Documents arc.**
`supabase/migrations/0016_application_outreach.sql` creates the `documents` table + private `documents`
Storage bucket (+4 RLS policies), `contacts.current_work`, `application_runs`, and `outreach_runs`. The
Documents/Apply/Outreach UI builds and routes, but every server write errors until 0016 is applied.
**Aarav applies migrations** (don't auto-apply): run it via the Supabase MCP `apply_migration` or the
dashboard SQL editor, then re-run the security advisor. **Everything else built this session (email→items,
meetings, task loop, Review) is already live — no migration needed.**

**2. Re-run Email sync after the gmail-body change.** Triage + extraction now read the full message body
(`format=full`) — still inside the existing `gmail.readonly` scope (no new consent), but the user should
hit Sync on the Email tab to (re)ingest bodies and trigger extraction into the Review queue.

**3. Optional keys.** `XAI_API_KEY` (+ optional `XAI_MODEL`) powers Application/Outreach (Grok) — **set
per the user**. `TAVILY_API_KEY` enables web search (no key ⇒ the orb says it can't search). `ELEVENLABS_API_KEY`
enables the voice (no key ⇒ silent, text still works). `JARVIS_BROWSER=playwright` + `npx playwright
install chromium` enables Apply autofill (off ⇒ "open the application + copy from the plan").

## How to run
```
npm install          # if node_modules is missing
npm run dev          # http://localhost:3000  (redirects to /login until signed in)
npm run build        # production build / typecheck
```

## Files that matter
- `/CLAUDE.md` — how to work here (auto-read each session). `/docs/PROGRESS.md` — **read first**.
- `/docs/DATA_MODEL.md` — schema + migration order + changelog. `/docs/DECISIONS.md` — why (newest
  entries: the source→items extraction engine, web_search honesty, and Playwright autofill).
- **Email/meeting → items engine:** `src/lib/google/extract-items.ts` (the extractor; `SourceKind`),
  `src/lib/google/gmail.ts` (full-body fetch), `src/lib/google/ingest.ts` (wires extraction into sync),
  `src/lib/items/review.ts` + `src/components/items/ReviewItemCard.tsx` (Review surface),
  `src/app/api/items/route.ts` (accept/dismiss), `src/app/api/meetings/extract/route.ts` +
  `src/components/meetings/PasteMeetingForm.tsx` (meetings). Citation gate: `src/lib/agents/citation-gate.ts`.
- **Task loop:** `src/app/api/tasks/route.ts` (POST/PATCH/DELETE) + `src/components/tasks/TaskItem.tsx`.
- **Apply autofill:** `src/lib/agents/application/{browser,autofill,scrape}.ts` +
  `src/app/api/applications/[id]/autofill/route.ts`; resume text: `src/lib/documents/extract-text.ts`.
- **LLM providers:** `src/lib/llm/gemini.ts` — talks to Gemini for every existing feature (JSON-Schema →
  Gemini-schema conversion lives here). `src/lib/llm/grok.ts` — Grok/xAI, used ONLY by the
  Application/Outreach agents (same three primitives, OpenAI-compatible).
- **Application & Outreach agent:** `src/lib/documents/store.ts` (the agent's memory),
  `src/lib/agents/application/*` (`scrape.ts` form-reader, `resolve.ts` Grok grounder + `backs()` gate,
  `run.ts` orchestration), `src/lib/agents/outreach/*` (`compose.ts`, `run.ts`). UI: `src/app/(app)/{apply,documents}/page.tsx`,
  `src/components/apply/*`, `src/components/outreach/OutreachButton.tsx`. Migration `0016`.
- **Web search:** `src/lib/search/tavily.ts` (`webSearch` is the agent-facing call).
- **Voice:** `src/lib/voice/elevenlabs.ts` + `src/app/api/voice/route.ts`; client playback in
  `src/components/JarvisConsole.tsx`.
- **Orb assistant:** `src/lib/assistant/{ask,data-tools,fs-tools}.ts` + `src/app/api/ask/route.ts`.
- **Multi-agent:** `src/lib/agents/{types,registry,router,citation-gate}.ts` + `src/app/api/agent/route.ts`.
- **Research agents:** `src/lib/research/*` (people) and `src/lib/agents/opportunity/*` (programs/jobs/
  hackathons; `deadline.ts` is the hard-rule-#2 chrono boundary).
- **Home/nav:** `src/components/{JarvisSphere,JarvisConsole,LiveClock,NavDrawer,Topbar,AppBackground}.tsx`.

## What we need from the user
1. **Apply migration `0016`** (Supabase MCP `apply_migration` or dashboard) — the only thing blocking
   Documents/Apply/Outreach. Everything else built this session is already live.
2. **Connect Google + Sync email** (Connections → Email tab) — to exercise the now-live email→items
   engine end-to-end and see items appear in the Review queue.
3. **Optional keys** to light up more: `TAVILY_API_KEY` (web search), `ELEVENLABS_API_KEY` (voice),
   `JARVIS_BROWSER=playwright` + `npx playwright install chromium` (Apply autofill).
4. Keys already in place (per the user): `GEMINI_API_KEY`/`GEMINI_MODEL`, `XAI_API_KEY`/`XAI_MODEL`,
   Supabase anon/URL, Google OAuth client. (`ANTHROPIC_*` are retired — safe to delete from `.env.local`.)
5. Later: a Vercel login if/when we deploy; `gmail.send` write scope only when we add send-from-Jarvis.
