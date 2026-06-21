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
- ✅ **NEW — Add a contact from a pasted LinkedIn URL (+ removed the manual Calendar-event tool).**
  On the People tab, paste someone's `linkedin.com/in/…` link → `AddFromLinkedIn`
  (`src/components/contacts/AddFromLinkedIn.tsx`) → `POST /api/contacts/import-linkedin` →
  `importContactFromLinkedIn` (`src/lib/contacts/import-linkedin.ts`). Two best-effort enrichment tiers,
  merged: **(A)** read the profile page via the user's own logged-in Chromium (`scrapeLinkedInProfile`,
  new in `src/lib/agents/linkedin/search.ts`) → name, headline, role/company, location, About bio;
  **(B)** Apollo by LinkedIn URL → the work email + a clean title/org. The contact lands **straight in
  People** (`created_by='user'`, `review_status='accepted'` — it's an explicit single-person user action,
  like the manual "Add a contact" form, so NOT Review). Dedups by `/in/<slug>`. **No `sources` row, no
  migration** — provenance lives in `field_sources` (LinkedIn URL primary, `apollo.io` for the email) +
  `source_quote` (headline) so the card's source chip works (rule #4). Degrades: Apollo-only (no
  browser) gets the email; browser-only fills role/company/bio with no email; neither configured returns
  an honest message naming `JARVIS_BROWSER=playwright` / `APOLLO_API_KEY`. **Also removed** the manual
  "add a Google Calendar event" tool from the Connections tab (redundant — the assistant already creates
  events); the `calendar.events` scope stays. **Verify next:** People → paste a LinkedIn URL → Import →
  the new card appears (with email if Apollo is on; needs a one-time LinkedIn login in the opened window
  for page details). Reviewed: 4-dimension adversarial pass, 7 distinct findings fixed + re-verified.
- ✅ **Contacts: discover MANY · import a Sheet · validate + enrich.** Three things the user asked for,
  three states: (1) **Discover many** — `runPeopleSearch` (`src/lib/research/run.ts`) already loops over
  ALL validated candidates; the discovery prompt (`src/lib/research/extract.ts`) is now tuned for
  **recall** ("find as many Brown alumni in X as you can" — exhaustive within what's citable, several
  search angles, `MAX_TURNS` 12). (2) **Import a Sheet** — `importContactsFromSheet`
  (`src/lib/google/import-contacts.ts`) lands each row in Review with the row as provenance. (3) **NEW:
  validate + enrich** — `src/lib/contacts/validate-enrich.ts` + `POST /api/contacts/validate`:
  Tier-1 format-checks the existing email/LinkedIn (no key needed) and, when `APOLLO_API_KEY` is set,
  Tier-2 cross-checks the sheet's email against Apollo (verified/mismatch/unconfirmed/invalid) and fills
  missing email/company/title/LinkedIn. **No migration** — verdicts live in `contacts.field_sources`
  jsonb (`FieldSource` gained an optional `status`); rows stay in Review (L0); RLS-scoped; channel fills
  are dedup-safe in code. UI: auto-runs after a Sheet import; "Validate & enrich" button on each Review
  people-run (`ResearchRunCard`) and on the People toolbar (`ContactsToolbar`); coloured verdict badges
  on `PersonCard`. **Verify next:** Connections → import a Sheets link → watch it import + validate, then
  Review shows badges. Or People → "Validate & enrich". With no `APOLLO_API_KEY` it's format-only (the
  button tooltips + response message say so). **Suggested follow-up migration for Aarav:** a
  UNIQUE(contact_id, kind, value) on `contact_channels` (airtight dup-channel guard), and persisting
  channel `sourceUrl`/`confidence` (today they're lost on reload — pre-existing).
- ✅ **ONE LLM provider now — everything runs on xAI Grok.** `src/lib/llm/grok.ts` is the only real LLM
  client (`grokStructured` / `grokToolLoop` / `grokText`, OpenAI-compatible, `XAI_API_KEY` + optional
  `XAI_MODEL`, default grok-4.3). `src/lib/llm/gemini.ts` is now a thin **adapter**: it keeps the old
  `gemini*` export names + Gemini `contents`/`parts` request shape (so the ~10 call sites are unchanged)
  but translates every call into Grok's `messages` API and delegates. No call hits Google anymore
  (`GEMINI_API_KEY` / Vertex are dead). `@anthropic-ai/sdk` is still installed but imported nowhere.
- ✅ **Email + meetings → items extraction engine is LIVE (the keystone).** Ingested sources become
  sourced, reviewable `items`. `src/lib/google/extract-items.ts` mines any text source (a `SourceKind`
  swaps the prompt noun for email vs. meeting transcript) for tasks/events/follow-ups; provenance is
  enforced in CODE after the model call: keep a candidate only if `backs(corpus, source_quote)` (rule
  #3), resolve its `raw_due` phrase with chrono anchored to the source's `occurred_at` (rule #2), drop
  confidence < 0.35, insert at `status='review'` (rule #5). Gmail ingest reads the FULL body
  (`gmail.ts` `format=full` + MIME-tree parser). The Review queue (`src/lib/items/review.ts` +
  `src/components/items/ReviewItemCard.tsx`) shows each item through `<Card>` with Accept/Dismiss →
  `PATCH /api/items`. A **"Scan past emails"** button (`BackfillButton` → `POST /api/items/backfill` →
  `src/lib/items/backfill.ts`) mines already-synced mail that predates the extractor. Meetings tab has a
  paste→extract box. **Verify next: Sync email, watch items land in Review.**
- ✅ **Task loop + unified action surface.** `/api/tasks` has POST/PATCH (complete · edit · chrono-re-
  resolved due)/DELETE; `src/components/tasks/TaskItem.tsx` gives each item a complete checkbox, inline
  edit, and delete. The Tasks page now shows ALL accepted derived types — `task`, `event`, AND
  `follow_up` — with a type pill (events/follow-ups previously vanished after Review). PATCH/DELETE
  accept all three types.
- ✅ **Multi-agent system**: intent **router** (`POST /api/agent`) → exactly ONE agent. Live set:
  **opportunity · contact · application · email · meeting · assistant** (the `calendar` agent was
  removed — the assistant already reads Calendar and creates real events / drafts mail via its write
  tools, so it was redundant). The **email** agent is now LIVE: it dispatches the backfill engine, so
  "turn my inbox into tasks" actually mines synced mail into Review. Calendar/draft requests route to
  the assistant. **Opportunity** + **People** research agents run two-phase (Tavily search → validated
  structured report); deadlines resolved by `chrono-node`.
- ✅ **Application & Outreach agent — runtime-unblocked (migration 0016 is applied).** (1) **Documents**
  tab/store — resumes & grant materials in a private Supabase Storage bucket = the agent's memory
  (PDF/DOCX text-extracted server-side on upload, `src/lib/documents/extract-text.ts`); (2) **Application
  agent** (`src/lib/agents/application/*`) — reads a form (static parser + a `JARVIS_BROWSER=playwright`
  rendered-DOM path), grounds a reviewable **field plan**, and can **fill the live form in a headed
  browser** (`autofill.ts`) — attaches the resume, leaves the window open, **never submits**; surfaces on
  the `Apply` tab + "Prepare with Jarvis" on Opportunity cards; (3) **Outreach agent**
  (`src/lib/agents/outreach/*`) — per-contact `OutreachButton`, audience-tailored draft into **Gmail
  Drafts**, **never sends**. Provenance enforced in code via the `backs()` gate.
- ✅ **NEW — LinkedIn contact-sourcing (Playwright).** A **"Find LinkedIn contacts"** button on the Apply
  card (`ApplicationRunCard`) and Opportunity card (`OpportunityCard`) → `POST /api/linkedin/contacts` →
  `src/lib/agents/linkedin/{run,search,types}.ts`. It drives the user's OWN logged-in LinkedIn (a
  persistent on-disk Chromium profile kept alive on `globalThis`; `browser.ts` `launchPersistentContext`)
  to a People search scoped to the linked org + a role hint (recruiter for jobs, program officer for
  grants), reads the result cards (anchored on `/in/` links via an IIFE reader like the Apply
  `DOM_READER`), and lands people in **Review** as suggested contacts. **Reuses** the `research_runs →
  sources → contacts → contact_channels → Review → People` pipeline (same as the Sheets importer) — **no
  migration**. Read-only (never logs in / connects / messages); autonomy L0 (`review_status='review'`);
  provenance per rule #3 (each contact gets `source_id` + a non-empty `source_quote` = on-page
  headline+location, falling back to the profile URL, + `confidence`). Once accepted, the existing
  Outreach "draft an email" button works on them for free. First run opens a window to log in once
  (`needsLogin`), then the session persists (`LINKEDIN_USER_DATA_DIR`, default `~/.jarvis-browser/linkedin`).
- ✅ **Playwright is installed, proven, and ENABLED.** playwright 1.61 + chromium-1228 are present;
  `JARVIS_BROWSER=playwright` is now set in `.env.local`, so BOTH the headed Apply autofill
  (`autofill.ts`, types grounded values into the live form, never submits) AND LinkedIn sourcing are
  live. Unset, Apply falls back to the static-HTML reader (copy-from-plan) and LinkedIn sourcing reports
  it's unavailable.
- ✅ **Web search is Tavily** (`src/lib/search/tavily.ts` `webSearch()`), used by the orb assistant and
  both research agents. The citation gate (rule #3) holds against Tavily page text. **No `TAVILY_API_KEY`
  ⇒ the orb SAYS it can't web-search** (it no longer answers from memory silently).
- ✅ **Jarvis has a voice (ElevenLabs).** `src/lib/voice/elevenlabs.ts` + `POST /api/voice`; client
  playback in `JarvisConsole`. Silent until `ELEVENLABS_API_KEY` is set (text still works).
- ✅ **Immersive home + hamburger-only nav.** `/jarvis` is a bare particle sphere (`JarvisSphere`) +
  military clock on pure black; nav lives in the `NavDrawer` hamburger. The `/dev` Component Lab is now
  gated out of production (server-side `notFound()` layout + hidden nav link).
- ✅ Migrations `0001→0015` applied via the Supabase MCP; **`0016` applied via the dashboard SQL editor**
  (absent from `list_migrations` but all objects verified live this session). `npm run build` + `tsc` +
  `eslint` green.

## ⚠ The roadblocks to clear next
**1. Re-run Email sync, then exercise the engine.** Triage + extraction read the full message body
(`format=full`, inside the existing `gmail.readonly` scope — no new consent). Hit Sync on the Email tab
to (re)ingest bodies and trigger extraction; or use **Scan past emails** in Review to mine already-synced
mail. Accept a few items → confirm they land on the Tasks page.

**2. LinkedIn sourcing needs a one-time login.** `JARVIS_BROWSER=playwright` is now set, so the first
"Find LinkedIn contacts" click opens a real Chromium window on LinkedIn's login (the button reports
"log in, then click again"). Sign in once — the session persists in `~/.jarvis-browser/linkedin` — then
click again and people land in Review.

**3. Optional env to light up more.** `JARVIS_BROWSER=playwright` is already set (enables headed Apply
autofill + LinkedIn sourcing). `TAVILY_API_KEY` enables web search. `ELEVENLABS_API_KEY` enables the
voice. Write features (Gmail **drafts** for Outreach, calendar events) need `gmail.compose` /
`calendar.events` consent if not already granted — reconnect Google on the Connections tab.

## How to run
```
npm install          # if node_modules is missing
npm run dev          # http://localhost:3000  (redirects to /login until signed in)
npm run build        # production build / typecheck
```

## Files that matter
- `/CLAUDE.md` — how to work here (auto-read each session). `/docs/PROGRESS.md` — **read first**.
- `/docs/DATA_MODEL.md` — schema + migration order + changelog. `/docs/DECISIONS.md` — why (newest
  entries: single-provider Grok consolidation, phantom-agent fix, source→items engine, web_search honesty).
- **LLM provider:** `src/lib/llm/grok.ts` — the only real client (xAI, OpenAI-compatible, three
  primitives). `src/lib/llm/gemini.ts` — thin adapter that routes the `gemini*` API to Grok (keep the
  name; it's documented in the file header). Every feature calls through one of these.
- **Email/meeting → items engine:** `src/lib/google/extract-items.ts` (the extractor; `SourceKind`),
  `src/lib/google/gmail.ts` (full-body fetch), `src/lib/google/ingest.ts` (wires extraction into sync),
  `src/lib/items/{review,backfill}.ts` + `src/components/items/{ReviewItemCard,BackfillButton}.tsx`,
  `src/app/api/items/{route,backfill/route}.ts`, `src/app/api/meetings/extract/route.ts`. Citation gate:
  `src/lib/agents/citation-gate.ts`.
- **Task loop:** `src/app/api/tasks/route.ts` (POST/PATCH/DELETE, all three action-item types) +
  `src/components/tasks/TaskItem.tsx` + `src/app/(app)/tasks/page.tsx` (the unified surface).
- **Apply autofill:** `src/lib/agents/application/{browser,autofill,scrape}.ts` +
  `src/app/api/applications/[id]/autofill/route.ts`; resume text: `src/lib/documents/extract-text.ts`.
- **Application & Outreach agent:** `src/lib/documents/store.ts`, `src/lib/agents/application/*`
  (`scrape.ts`, `resolve.ts` grounder + `backs()` gate, `run.ts`), `src/lib/agents/outreach/*`. UI:
  `src/app/(app)/{apply,documents}/page.tsx`, `src/components/apply/*`,
  `src/components/outreach/OutreachButton.tsx`. Migration `0016` (applied).
- **Multi-agent:** `src/lib/agents/{types,registry,router,citation-gate}.ts` + `src/app/api/agent/route.ts`.
- **Web search:** `src/lib/search/tavily.ts`. **Voice:** `src/lib/voice/elevenlabs.ts` +
  `src/app/api/voice/route.ts`; client playback in `src/components/JarvisConsole.tsx`.
- **Orb assistant:** `src/lib/assistant/{ask,data-tools,fs-tools,actions}.ts` + `src/app/api/ask/route.ts`.
- **Research agents:** `src/lib/research/*` (people) and `src/lib/agents/opportunity/*` (`deadline.ts` is
  the hard-rule-#2 chrono boundary).
- **Home/nav:** `src/components/{JarvisSphere,JarvisConsole,LiveClock,NavDrawer,Topbar,AppBackground}.tsx`.

## What we need from the user
1. **Connect Google + Sync email** (Connections → Email tab), then **Scan past emails** in Review — to
   exercise the now-live email→items engine and see items appear; accept a few and confirm on Tasks.
2. **Optional env** to light up more: `JARVIS_BROWSER=playwright` (Apply autofill — chromium already
   installed), `TAVILY_API_KEY` (web search), `ELEVENLABS_API_KEY` (voice).
3. Keys already in place (per the user): `XAI_API_KEY` (the single LLM provider), `TAVILY_API_KEY`,
   `ELEVENLABS_API_KEY`, Supabase anon/URL, Google OAuth client. (`GEMINI_*` and `ANTHROPIC_*` are
   retired — safe to delete from `.env.local`.)
4. Later: a Vercel login if/when we deploy; `gmail.send` write scope only when we add send-from-Jarvis.
