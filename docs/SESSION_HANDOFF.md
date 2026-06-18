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
  contact · email · calendar · meeting · assistant). **Opportunity** + **People** research agents both
  run two-phase (Tavily search → validated structured report); deadlines resolved by `chrono-node`.
- ✅ **Google connector** (read-only OAuth + Gmail/Calendar/Drive/Sheets) is built; activates on the
  Connections tab. Inbox triage (`src/lib/google/ingest.ts`) now runs on Gemini.
- ✅ Migrations `0001→0013` exist; per PROGRESS they're applied to the live project (verify with the
  Supabase MCP `list_migrations` if in doubt). Verified this session: `npm run build` is green and
  `/api/voice` is in the route manifest; `tsc` + `eslint` clean.

## ⚠ The one roadblock to clear next
**Voice needs an ElevenLabs key.** The whole TTS path is built and degrades silently, so nothing is
broken — answers just don't speak. To turn the voice on:
1. Get an API key from elevenlabs.io.
2. Put it in `.env.local` as `ELEVENLABS_API_KEY=…` (a placeholder line is already there). Optionally
   set `ELEVENLABS_VOICE_ID` (defaults to "Rachel") and `ELEVENLABS_MODEL` (defaults `eleven_turbo_v2_5`).
3. Restart `npm run dev`, ask the orb something, and confirm it speaks. The speaker icon in the input
   row mutes/unmutes (preference persists).

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
- **LLM provider:** `src/lib/llm/gemini.ts` — the only place that talks to a model. JSON-Schema →
  Gemini-schema conversion lives here; free-form schemas fall back to prompt-embedded JSON mode.
- **Web search:** `src/lib/search/tavily.ts` (`webSearch` is the agent-facing call).
- **Voice:** `src/lib/voice/elevenlabs.ts` + `src/app/api/voice/route.ts`; client playback in
  `src/components/JarvisConsole.tsx`.
- **Orb assistant:** `src/lib/assistant/{ask,data-tools,fs-tools}.ts` + `src/app/api/ask/route.ts`.
- **Multi-agent:** `src/lib/agents/{types,registry,router,citation-gate}.ts` + `src/app/api/agent/route.ts`.
- **Research agents:** `src/lib/research/*` (people) and `src/lib/agents/opportunity/*` (programs/jobs/
  hackathons; `deadline.ts` is the hard-rule-#2 chrono boundary).
- **Home/nav:** `src/components/{JarvisSphere,JarvisConsole,LiveClock,NavDrawer,Topbar,AppBackground}.tsx`.

## What we need from the user
1. **`ELEVENLABS_API_KEY`** in `.env.local` to enable the voice (see roadblock above). Everything else
   runs without it.
2. Keys already in place: `GEMINI_API_KEY`, `GEMINI_MODEL`, `TAVILY_API_KEY`, Supabase anon/URL, Google
   OAuth client. (`ANTHROPIC_*` are retired — safe to delete from `.env.local`.)
3. Later: a Vercel login if/when we deploy; `gmail.send` write scope only when we add send-from-Jarvis.
