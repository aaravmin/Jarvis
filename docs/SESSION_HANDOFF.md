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
- ✅ **Runtime LLM is Gemini, not Claude.** Every model call goes through `src/lib/llm/gemini.ts`
  (direct REST, no SDK): `geminiStructured` / `geminiToolLoop` / `geminiText`. Default
  `gemini-2.5-flash`; set via `GEMINI_MODEL`. Needs `GEMINI_API_KEY` (already in `.env.local`).
  Reason for the switch: the Anthropic key kept running out of quota. The `@anthropic-ai/sdk` package
  is still installed but **no longer imported anywhere**.
- ✅ **Web search is Tavily** (`src/lib/search/tavily.ts` `webSearch()`), used by the orb assistant and
  both research agents. The citation gate (hard rule #3) is preserved against Tavily page text: a
  reported quote survives only if it's a real substring of a retrieved page, and a URL only if it's in
  the per-run allowlist. Needs `TAVILY_API_KEY` (already set). No key ⇒ web search is a safe no-op.
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
  the agent's memory; (2) **Application agent** (`src/lib/agents/application/*`) — reads a form
  (static parser now; env-gated `JARVIS_BROWSER=playwright` path wired for later), grounds a reviewable
  **field plan** from your docs, **never submits**; surfaces on the `Apply` tab + "Prepare with Jarvis"
  on Opportunity cards; (3) **Outreach agent** (`src/lib/agents/outreach/*`) — per-contact `OutreachButton`,
  audience-tailored draft into **Gmail Drafts**, **never sends**. Provenance enforced in code via the
  `backs()` citation gate. **⚠ Migration 0016 (its tables + Storage bucket) is NOT applied yet — see roadblock.**
- ✅ **Google connector** (read-only OAuth + Gmail/Calendar/Drive/Sheets) is built; activates on the
  Connections tab. Inbox triage (`src/lib/google/ingest.ts`) now runs on Gemini.
- ✅ Migrations `0001→0015` exist and are applied to the live project (per PROGRESS; verify with the
  Supabase MCP `list_migrations` if in doubt). **`0016_application_outreach.sql` is written but NOT
  applied** — see roadblock. Verified this session: `npm run build` green, `tsc` + `eslint` clean.

## ⚠ The roadblocks to clear next
**1. Apply migration 0016 (blocks the new agent).** `supabase/migrations/0016_application_outreach.sql`
creates the `documents` table + private `documents` Storage bucket (+4 RLS policies), `contacts.current_work`,
`application_runs`, and `outreach_runs`. The Documents/Apply/Outreach UI builds and routes, but every
server write errors until 0016 is applied. **Aarav applies migrations** (don't auto-apply): run it via
the Supabase MCP `apply_migration` or the dashboard SQL editor, then re-run the security advisor.

**2. Set `XAI_API_KEY` (powers the new agent's brain).** The Application/Outreach agents call Grok
(xAI). Put `XAI_API_KEY=…` in `.env.local` (optionally `XAI_MODEL`, defaults to the configured Grok
model). Without it, those two agents error; everything else (Gemini-powered) is unaffected.

**3. (Pre-existing) Voice needs an ElevenLabs key.** The TTS path degrades silently — answers just
don't speak. Set `ELEVENLABS_API_KEY` in `.env.local` (optional `ELEVENLABS_VOICE_ID` / `ELEVENLABS_MODEL`),
restart, and the orb speaks. The speaker icon mutes/unmutes.

## How to run
```
npm install          # if node_modules is missing
npm run dev          # http://localhost:3000  (redirects to /login until signed in)
npm run build        # production build / typecheck
```

## Files that matter
- `/CLAUDE.md` — how to work here (auto-read each session). `/docs/PROGRESS.md` — **read first**.
- `/docs/DATA_MODEL.md` — schema + migration order + changelog. `/docs/DECISIONS.md` — why (the three
  newest entries cover the Gemini switch, Tavily-as-search, and ElevenLabs voice).
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
1. **Apply migration `0016`** (Supabase MCP `apply_migration` or dashboard) — unblocks Documents/Apply/Outreach.
2. **`XAI_API_KEY`** in `.env.local` — powers the Application/Outreach agents (Grok). Optional `XAI_MODEL`.
3. **`ELEVENLABS_API_KEY`** in `.env.local` to enable the voice (pre-existing roadblock). Everything else
   runs without it.
4. Keys already in place: `GEMINI_API_KEY`, `GEMINI_MODEL`, `TAVILY_API_KEY`, Supabase anon/URL, Google
   OAuth client. (`ANTHROPIC_*` are retired — safe to delete from `.env.local`.)
5. Later: a Vercel login if/when we deploy; `gmail.send` write scope only when we add send-from-Jarvis.
