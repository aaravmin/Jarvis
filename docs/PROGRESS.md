# PROGRESS — living project state

> This is the single source of truth for "where are we." Update it at the end of every task.
> Read this file (plus `/CLAUDE.md` and `/docs/SESSION_HANDOFF.md`) at the start of every session.

## Current phase
**The product was simplified extremely heavily (2026-07-13) into a goal-grounded attention engine.**
Jarvis now does one thing: it checks email, meeting notes, Notion, and calendar; derives sourced
tasks/follow-ups with code-resolved due dates; and orders everything by importance against the user's
goals and sub-goals. Voice, the orb assistant, the job applier, and all people/opportunity
research/outreach machinery are REMOVED (code only; the DB schema is untouched). See the five
2026-07-13 entries in `/docs/DECISIONS.md` and the task log below.

## Status summary
Six commits shipped to `main` on 2026-07-13, each tsc + eslint + build green, net ~-19k lines:
teardown (`249e07b`), deterministic priority engine + quote-gated goal linking (`5c924a5`), read-only
Notion connector (`cfc00db`), Today/goals/sub-goals UI (`a66a8c5`), and the 3-critic panel's 10
reconciled fixes (`3e97b31`). Surfaces: Today (the home; red overdue / green done), Review, Goals
(with sub-goals), Tasks, Meetings, Email, Calendar, Connections (Google + Notion), Set up. Every
derived item still carries source_id + source_quote + confidence and lands in Review first (L0).

## Task log (most recent first)
- **SIMPLIFICATION: Jarvis -> a goal-grounded attention engine** — ✅ shipped to `main` (6 commits:
  `249e07b`, `5c924a5`, `cfc00db`, `a66a8c5`, `3e97b31` + docs), each tsc + eslint + build green;
  dev-server smoke: all pages 307 -> /login unauthed, APIs 401 with correct verbs. Driven by the
  user's directive: "simplify extremely heavily... take out all voice functionality, the homepage,
  the job applier... check my email, my meeting notes, my notion, and my calendar... grounded in
  goals and sub goals... bring your attention to things in order of most importance... white with
  simple colors like red and green." Executed as: Fable planned + stitched shared files; 3 parallel
  sonnet teardown agents on disjoint file sets; an opus engine agent + sonnet Notion agent in
  parallel; a sonnet UI agent; then a 3-sonnet critic panel (friction/design, target-user,
  compromise broker) whose 10 reconciled fixes were all applied.
  1. **Teardown** (-19,960 lines): voice (ElevenLabs), orb home + assistant (+/api/ask,/api/agent),
     applier (autofill/documents/vault), LinkedIn + Apollo, research agents, outreach + templates +
     learning, Tavily, Drive/Sheets extras, spreadsheet workspace. OAuth narrowed to gmail.readonly +
     calendar.readonly. Deps pruned (playwright, @anthropic-ai/sdk, exceljs, mammoth, unpdf,
     google-auth-library). chrono resolution relocated to `src/lib/dates.ts`.
  2. **Priority engine** (`src/lib/priority/`): pure-code scoring (due proximity, accepted-goal-link
     boost, follow_up nudge, confidence tiebreak) into buckets (overdue=red ... done=green);
     `loadAttention()` feeds Today server-side; deterministic meeting topics via token overlap; the
     LLM day-planner is deleted. Extractor now proposes per-item `goal_index`/`goal_quote`, kept only
     when `backs(corpus, goal_quote)` verifies; links land review-status and flip WITH the item in
     PATCH /api/items (one-approval flow).
  3. **Notion connector** (read-only, `NOTION_API_KEY`, no new deps): 14-day recent pages -> sources
     (`source_type='notion'`, migration **0021 NOT applied**) -> same extractor; constraint violation
     returns an actionable "apply 0021" message. Backfill also mines notion sources.
  4. **UI**: Today attention surface (inline complete, goal chips, likely meeting topics, Sync all);
     goals with one-level sub-goals (migration **0022 NOT applied**; graceful 42703 degrade); neutral
     ink chrome so red/green are the only status colors; persistent desktop rail; goal filter scoped
     to /tasks; delete confirms; first sync fires in the Google OAuth callback.
  - **Critic backlog (DO-NEXT, deferred deliberately):** reply-state verification from Sent mail
    (rule #7) -> follow-ups; first-contact-sender follow_up items; ?goal= filtering across pages;
    Review bulk accept/dismiss; triage drop-recovery; recurring-meeting grouping; Tasks-into-Today
    toggle; scheduled auto-sync (Edge Function).
- **Google sign-on · grounded, self-learning email composer · copy trims** — ✅ shipped to `main`
  (3 commits), tsc + eslint + build green. Driven by: "add sign on with google", "remove unnecessary
  explanations", "operate using memory it has access to and ground follow-ups in it", "apply to
  jobs/grants and write emails with that in mind plus a template", "for autonomous tasks I should be
  able to edit the output AND IT SHOULD LEARN FROM THE EDITS".
  1. **Sign on with Google.** "Continue with Google" on the login screen (Supabase Google OAuth, PKCE)
     + new `/auth/callback` route that exchanges the code and routes a new user to `/onboard`, a
     returning user to `/today`. (Enable the Google provider in the Supabase dashboard; see
     SESSION_HANDOFF.) Identity sign-on is separate from the Gmail/Calendar data connector.
  2. **Email composer grounded in memory + learns from edits.** `composeConnectionEmail` now feeds the
     model the user's profile digest + a digest of their uploaded materials (resume/bio text) alongside
     the template, told to write in the user's voice from real background. **Learn-from-edits**:
     migration **0018** `style_examples` (per-user, RLS, append-only, **NOT applied**); when the user
     edits a generated draft and saves it, the composer posts the (ai, final) pair to
     `POST /api/learning` (`src/lib/learning/store.ts`); future drafts read recent pairs back
     (`styleExamplesBlock`) so Jarvis matches the user's revealed style. **Now also wired into the Apply
     agent** (kind `application_field`): the grounder injects your recent field edits, and editing a
     grounded value + Save captures the (proposed, your-edit) override. Same store/endpoint. Tasks
     surface not yet wired.
  3. **Trimmed verbose copy** on the login page and Connections (self-evident helper text cut to one
     line, keeping the useful security/nothing-is-sent notes).
  - **Still open from this directive (next pass):** ground the *follow-up* suggestions and the
    Apply/Outreach *autonomous* paths in the broader memory (email/calendar/meeting transcripts), and
    wire the same learn-from-edits capture into the Apply field plan + the Tasks edit surfaces.
- **Productization batch: white/green theme · spreadsheet data pages · em-dash purge · onboarding ·
  encrypted login vault + per-user auto-login** — ✅ shipped to `main` across 7 commits, each tsc +
  eslint + build green. Driven by a multi-part user directive ("make it for anyone", "white and green
  theme", "exportable spreadsheet-like Contacts/Opportunities, inline-editable, grouped", "no
  em-dashes anywhere", "save site logins so Playwright can auto-log-in"). Decisions captured in
  DECISIONS.
  1. **Theme white/green.** `globals.css` tokens flipped to a light, white-and-green palette (green-700
     accent that reads as text on white and takes white button text); orb + ambient recolored green;
     `/jarvis` hero stays dark (orb uses screen blend) but is now deep green. On-accent button text
     `text-[#04181f]` → `text-white` across 32 files; the one `bg-sky-400` removed.
  2. **Spreadsheet Contacts + Opportunities.** New reusable `src/components/data/` (declarative
     `ColumnDef`, a `DataTable` with sticky header / group-by / sort / inline select-then-edit /
     row-select / delete, a `Workspace` shell with Table+Grid toggle, search, CSV export, optimistic
     edits + toast). Default Table view; Grid toggle reuses the existing cards 4-wide. Contacts edits
     route to `/api/contacts` (+ status) ; opportunities to a **new** `PATCH /api/opportunities`
     (partial field edit, deadline chrono-resolved) and `DELETE /api/opportunities`. No migration.
  3. **Em-dash purge.** New `stripDashes()` (`src/lib/text.ts`); the assistant strips dashes from its
     answer (read aloud) + web-search citations, and its prompt forbids them. Swept every em/en dash
     out of source copy + comments (607 replacements, 171 files, newline-safe so no lines merged).
  4. **Onboarding + de-personalize ("anyone can use it").** The app was already multi-tenant
     (per-user RLS, per-user Google tokens / profile / documents). Added a first-run `/onboard`
     checklist (profile → Google → documents, with live done/not-done status); new sign-ups land
     there; a "Set up" nav item. De-personalized placeholders that named a specific school/person.
     `/dev` was already 404-gated in production.
  5. **Encrypted login vault + per-user auto-login.** **Migration 0017** (`site_credentials`,
     per-user, RLS, **NOT applied yet**). AES-256-GCM crypto (`src/lib/crypto/secrets.ts`, key
     `CREDENTIALS_SECRET`); store + `/api/credentials` (save encrypts, list masks, delete); a
     Connections "Saved site logins" UI. The Playwright LinkedIn flow now uses a **per-user** browser
     profile/context (fixes a real cross-user session-leak hazard) and **auto-logs-in** from the vault
     when it hits a login wall, falling back to the manual "finish signing in" path on a 2FA/captcha
     checkpoint. (The LinkedIn login automation itself is unverified headlessly.)
- **Wired the LinkedIn/Apollo contact-scraping into the conversational assistant (the orb)** — ✅
  shipped to `main`, tsc + eslint green, `/api/ask` smoke-tested (401 unauthed; mounts clean),
  3-finding adversarial review (all HIGH, all confirmed, all fixed + re-verified), pushed. The user
  reported the orb said it had "no Playwright or any scraping tools — only web search." **It was telling
  the truth about itself:** the scrape+enrich capability lived only on the People tab
  (`importContactFromLinkedIn`), never in the assistant's tool loop (`ask.ts`). Fix: a new **`add_contact`
  assistant tool**.
  1. **NEW — `src/lib/contacts/add-contact.ts` (`addContact`).** Resolves a person to a saved contact
     three ways: (a) a pasted LinkedIn URL → `importContactFromLinkedIn`; (b) a NAME (+ optional company)
     → `searchLinkedInPeople` in the user's own logged-in browser → `pickBest` match → import; (c) browser
     off / no match → `apolloMatchPerson` by name → import its `linkedinUrl`, or `insertFromApollo` (a
     contact from Apollo data alone). Honest failure when neither backend is configured (names the env
     vars). Every path → `created_by='user'`, `review_status='accepted'` (explicit single-person user
     action, like the People-tab importer — not Review).
  2. **Wired into the brain.** `ask.ts` gains the `add_contact` function schema, adds it to the tool list
     when `ctx.actions` is present, a system-prompt capability + rule, and an `execute()` branch.
     `actions.ts` gains an `addContact` method on `AskActions`/`buildAskActions` that returns an
     `ActionOutcome` with a `kind:'contact'` receipt; `AskActionRef.kind` gains `'contact'`;
     `JarvisConsole` renders the receipt with a `UserPlus` icon linking to the person's LinkedIn.
  - **Review fixes (all verified):** (HIGH) don't overwrite an existing contact's `notes` on the
    already-exists path (`!r.alreadyExisted` guard); (HIGH) the system-prompt no longer tells the model
    it can *unconditionally* look people up — it says don't refuse pre-emptively but RELAY exactly what
    `add_contact` returns (login-needed / needs-a-URL / backend-not-configured), so it can't claim a save
    that didn't happen (rule #7); (HIGH) `insertFromApollo` now always seeds a url-bearing `field_sources`
    entry so the card's source chip links back even for a bare-name Apollo match — **and the same guard
    was added to `importContactFromLinkedIn`** (a sparse profile with no role/company/bio/email + no
    Apollo would otherwise leave `field_sources` empty and the chip link-less). No new findings dismissed.
- **"Add a contact from a LinkedIn URL" + removed the manual Calendar-event tool** — ✅ shipped to
  `main`, tsc + eslint green, route smoke-tested (`POST /api/contacts/import-linkedin` 401 unauthed;
  `/people` + `/connections` 307 auth-redirect), 4-dimension adversarial review (correctness /
  hard-rules / security / ux, per-finding verification) run — **13 raised, 9 confirmed (7 distinct,
  2 dup pairs); all 7 fixed and re-verified**; pushed. The user's directive: "take away the manual
  entry of Google Calendar events … And then make it so that if I put in a contact link, like their
  LinkedIn URL, then Jarvis would … scrape and identify as much information: their email, what they do
  … and then we'll automatically put that in the contact tab."
  1. **NEW — paste a LinkedIn URL → one enriched contact.** `src/lib/contacts/import-linkedin.ts`
     (`importContactFromLinkedIn`) + `POST /api/contacts/import-linkedin` + `AddFromLinkedIn` on the
     People page. Two independent enrichment tiers, merged: **(A)** read the profile page via the
     user's own logged-in Chromium (`scrapeLinkedInProfile`, new in `linkedin/search.ts`) → name,
     headline, role/company, location, About bio; **(B)** Apollo by LinkedIn URL → the work email
     LinkedIn hides + a clean title/org. Either tier alone makes a useful contact; with neither
     configured it says so plainly (names the env vars) instead of saving a bare link. Dedups by the
     `/in/<slug>` identity. Lands `created_by='user'`, `review_status='accepted'` — straight into the
     People tab, exactly like the manual "Add a contact" form (it's an explicit, single-person user
     action, NOT autonomous discovery, so it does **not** go to Review — see DECISIONS).
  2. **Provenance with no `sources` row.** `sources.source_type` has no `'linkedin'` value, and a
     `created_by='user'` contact needs no `source_id` to satisfy `contacts_provenance_chk`. So
     provenance rides in `field_sources` (LinkedIn URL for page-read fields, apollo.io for the email,
     each with a quote + confidence + status) and `source_quote` (the headline) — the card renders a
     working source chip (hard rule #4) and the LinkedIn URL is its primary permalink. **No migration.**
  3. **REMOVED — the manual "add a Google Calendar event" tool** from the Connections tab
     (`CalendarEventTool` deleted; intro/fallback/scope-notice copy updated). The `calendar.events`
     write scope stays (the assistant still creates events autonomously); only the redundant manual
     form is gone.
  - **Review fixes (all verified):** capture the `contact_channels` insert error and surface it
    (contact still renders via `source_quote`, but warn the user their link/email wasn't saved); the
    route's 500-path now returns all 12 `ImportLinkedInResult` fields; `company` field_sources now
    carries a quote (was empty); safe `decodeURIComponent` in `slugOf` + `normalizeLinkedInProfileUrl`
    (a malformed `%` in a pasted URL no longer 500s); skip `router.refresh()` on an already-exists
    import; Connections scope-notice no longer implies a removed manual calendar tool. (Dismissed as
    not-real: SSRF — the `https://www.linkedin.com/in/` prefix is enforced before any navigation; auth
    bypass — TS narrows `user`; IDOR — every query is RLS-scoped to `user_id`; eval injection — the
    page-reader is a hardcoded const string. Accepted by-design: the persistent logged-in Chromium
    holds the user's LinkedIn cookie — that's pre-existing shared infra and persistence is the point.)
- **Contact "Validate & enrich" + people-discovery recall tune** — ✅ shipped to `main`, tsc + eslint
  green, route smoke-tested (validate 401 unauthed; /review + /people compile, 307 auth-redirect), an
  adversarial 4-dimension review run (9 confirmed findings, in-scope ones fixed), pushed. The user's
  directive: "find as many Brown alumni in X as possible … give it a Google Sheet, it auto-populates
  the contacts and tries to fill in the missing pieces and validates if the contact information in the
  spreadsheet is correct. Make sure it has the functionality." Audited first (6-reader mapping
  workflow): **3 of 4 facets already worked** — multi-person discovery (`runPeopleSearch` already loops
  over MANY candidates), Sheet→contacts import (`importContactsFromSheet`), and per-contact email enrich
  (`apolloMatchPerson`). The **one genuinely missing facet was validating the sheet's existing contact
  info + batch-filling the blanks**. Built that, plus a recall tune:
  1. **NEW — Validate & enrich.** `src/lib/contacts/validate-enrich.ts` +
     `POST /api/contacts/validate`. For each target contact (by run, by ids, or review/accepted scope;
     pooled 5-concurrent, cap 25/call, per-row try/catch): **Tier 1** deterministic format-check of the
     existing email + LinkedIn (works with NO API key); **Tier 2** (only when `APOLLO_API_KEY` set)
     `apolloMatchPerson` to cross-check the sheet's email against Apollo's record
     (verified / mismatch / unconfirmed / invalid) and FILL any missing email / company / title /
     LinkedIn. **No migration** — verdicts + filled provenance go in `contacts.field_sources` jsonb
     (added optional `status` to the `FieldSource` type); contacts stay in **Review** (L0, rule #5) so
     the user re-approves; RLS scopes every read/write (rule #6). Channel fills are dedup-safe
     (fresh-check + insert + keep-lowest-id prune) since `contact_channels` has no UNIQUE(contact_id,
     kind, value) — **suggested follow-up migration for Aarav** to make that airtight.
  2. **Wiring.** Auto-runs after a Sheet import (`ConnectionsPanel`, before the Review redirect); a
     "Validate & enrich" button on each Review people-run (`ResearchRunCard`, re-fetches the run after)
     and on the People toolbar (`ContactsToolbar`, `router.refresh`); coloured at-a-glance verdict
     badges on `PersonCard` (Email verified/mismatch/invalid · LinkedIn invalid · Enriched). Button
     tooltips are honest about Apollo being optional (threaded `apolloEnabled` so they don't oversell
     when no key is set).
  3. **Recall tune (F1).** `src/lib/research/extract.ts`: rule 4 flipped from "prefer precision over
     recall" to **"be exhaustive within what you can verify"** (search several angles, report EVERY
     cited match, don't stop at three) while keeping the hard citation bar; phase-2 report prompt told
     not to truncate; `MAX_TURNS` 8→12 for more search rounds.
  - **Known follow-ups surfaced by the review (pre-existing, NOT in this diff):** `contact_channels`
    never persists `sourceUrl`/`confidence` (lost on reload — needs a migration + `run.ts` change);
    non-transactional channel-insert+field_sources-update (Supabase has no client txns; self-heals on
    re-run, same pattern as the existing find-email route).
- **LinkedIn contact-sourcing (Playwright) + Apply/Outreach proven end-to-end** — ✅ shipped to `main`
  (commit `f2068e0`), tsc + eslint green, route smoke-tested (401 unauthed), pushed. The user's
  directive: "Make sure Jarvis can automatically fill out job/grant applications using a link and email
  people (drafts). additionally add a feature where playwright scrubs linkedin for relevant contacts for
  job/grant applications i link it." Three parts:
  1. **Autofill-from-a-link** — re-verified already fully-works (paste URL → scrape form → grounded,
     citation-gated field plan → headed Chromium types values into the live form, NEVER submits). Was
     only gated on `JARVIS_BROWSER`; now enabled in `.env.local` (Playwright 1.61 + chromium-1228
     present). No code change needed — proven, not rebuilt.
  2. **Email-people-as-drafts** — re-verified already fully-works (Outreach agent → Gmail **Drafts**
     endpoint only; no `/send` code path exists). Gated on the `gmail.compose` scope (reconnect Google).
  3. **NEW — LinkedIn sourcing.** A "Find LinkedIn contacts" button on the Apply card and Opportunity
     card drives the user's OWN logged-in LinkedIn (persistent on-disk Chromium profile on `globalThis`)
     to a People search scoped to the linked org + a role hint (recruiter for jobs, program officer for
     grants), reads the result cards (anchored on `/in/` links, IIFE reader like the Apply DOM_READER),
     and lands people in **Review** as suggested contacts. Reuses the `research_runs → sources →
     contacts → Review → People` pipeline (same as Sheets import) — **no migration**. Read-only (never
     logs in / connects / messages); autonomy L0 (`review_status='review'`); provenance per rule #3
     (source_id + non-empty source_quote = on-page headline+location, falling back to the profile URL +
     confidence). Once accepted, the existing Outreach "draft an email" button works for free. New:
     `src/lib/agents/linkedin/{types,search,run}.ts`, `src/app/api/linkedin/contacts/route.ts`,
     `src/components/linkedin/FindLinkedInContactsButton.tsx`; `browser.ts` gains
     `launchPersistentContext`. Off unless `JARVIS_BROWSER=playwright`; first run opens a window to log
     in once, then the session persists (`LINKEDIN_USER_DATA_DIR`, default `~/.jarvis-browser/linkedin`).
- **Single LLM provider (Grok) + lean-up pass** — ✅ shipped to `main`, each commit tsc + eslint +
  build green, pushed. The user's directive: "just grok for everything and try to fix those issues …
  I don't even know if you're using playwright." Five pieces:
  1. **Grok consolidation.** `lib/llm/gemini.ts` rewritten as a thin ADAPTER over `lib/llm/grok.ts`:
     keeps the `gemini*` export names + Gemini `contents`/`parts` shape (so all ~10 call sites are
     unchanged) but routes every call to xAI. FIFO tool-call-id pairing makes a tool-loop transcript
     round-trip for the research/opportunity follow-up pass. Deleted the JSON-Schema→Gemini converter +
     Vertex/ADC. No call hits Google anymore. (commit `f8b546a`)
  2. **Events/follow-ups dead-end.** Accepted `event`/`follow_up` items vanished after Review (/tasks
     only showed `item_type='task'`, /calendar reads only Google sources). Tasks is now the unified
     "things on my plate" surface for all three accepted types with a type pill; task PATCH/DELETE widen
     to the three action types so they can be checked off / edited / deleted. (commit `c5e3cb1`)
  3. **Phantom agents.** `email` agent is now LIVE → dispatches the existing `backfillExtraction` ("turn
     my inbox into tasks" mines synced mail into Review). `calendar` agent deleted (assistant already
     reads Calendar + creates events / drafts mail). `meeting` kept. (commit `7b44986`)
  4. **/dev gate.** Server-side `notFound()` layout + hidden nav link → 404 in production. (commit `a84c04b`)
  5. **Playwright proven.** Smoke test launched headless chromium, read a rendered form's fields, closed
     clean. It IS installed (1.61 + chromium-1228); the only missing piece is `JARVIS_BROWSER=playwright`
     in `.env.local` to enable the headed autofill.
- **The engine bay: real autofill + email/meeting→items extraction + task loop (Phase 1/2 made real)**
  — ✅ all shipped to `main`, each commit tsc + build + lint green, pushed. The user's directive:
  "give Jarvis a job/grant application or a person to contact and it should fill it out … go part by
  part of the roadmap and make sure Jarvis can do it." Six pieces, in order:
  1. **Playwright browser autofill (B5).** `JARVIS_BROWSER=playwright`-gated. `application/browser.ts`
     (dependency-decoupled Chromium loader via `new Function` so the app builds without playwright) +
     `application/autofill.ts` (`autofillApplication`: launches a HEADED browser, locates each grounded
     field by selector→name→id→label, fills text/select/radio/checkbox, attaches the resume file, and
     **leaves the window open for the user to review + submit — never clicks Submit**) + `scrape.ts`
     DOM reader rewrite (a browser-side reader passed as a string to `page.evaluate`, resolving real
     labels/options/selectors) + `POST /api/applications/[id]/autofill` + a "Fill in browser" button on
     `ApplicationRunCard`. Mechanical core smoke-tested against a real browser (8 field types + all fill
     primitives passed). **Runtime-blocked only by migration 0016.**
  2. **Resume text extraction (B4).** `lib/documents/extract-text.ts` (unpdf + mammoth, serverless, no
     native deps) + `/api/documents/create` downloads the uploaded binary and extracts when the client
     sent no text — so a PDF/DOCX resume becomes the corpus the autofill grounds on (was empty before;
     the autofill was filling nothing). Both parse paths verified in this environment.
  3. **Task loop (B3).** Tasks could be created but never completed/edited/deleted (`/api/tasks` had
     only POST). Added PATCH (status done⇄accepted, title/notes edits, chrono-re-resolved due) + DELETE,
     RLS-scoped + pinned to `item_type='task'`; `components/tasks/TaskItem.tsx` gives each row a
     complete checkbox, inline edit, and delete. Live-verifiable (not gated on 0016).
  4. **Email→items extraction engine (B1) — the keystone.** 43 ingested email sources had produced 0
     items because nothing turned sources into items. Now: `gmail.ts` reads the FULL body (`format=full`
     + a MIME-tree parser that prefers text/plain and strips HTML — verified on 4 payload shapes) and
     stores it as `raw_text`; `lib/google/extract-items.ts` runs Gemini per email for candidate
     tasks/events/follow-ups, then enforces the hard rules in CODE: keep a candidate only if
     `backs(corpus, source_quote)` (rule #3), resolve `raw_due` with chrono anchored to the email's
     `occurred_at` (rule #2), drop confidence < 0.35, dedup by (source_id, title), insert at
     `status='review'` (rule #5). Wired into `ingestGmail`; sync reports "N to review".
  5. **Review surface + accept/reject (B2).** `lib/items/review.ts` + `components/items/ReviewItemCard.tsx`
     render each extracted item through the provenance-enforcing `<Card>` (working source chip required,
     rule #4) with Accept/Dismiss → `PATCH /api/items` (accept→accepted, dismiss→dismissed, RLS-scoped,
     only acts on rows still in review). The Review page now merges items with the research-agent runs.
     Accepted tasks flow to the Tasks page.
  6. **Meetings paste→extract (B10) + web_search honesty.** Meetings was a stub that *claimed*
     transcript extraction. Now `/api/meetings/extract` stores a pasted transcript as a `meeting` source
     and runs the same engine (generalized with a `SourceKind` so the prompt says "meeting transcript");
     the Meetings tab has a paste form + a list of transcripts with per-meeting action-item counts.
     Separately, the orb's `web_search` now returns an explicit "not configured" result when
     `TAVILY_API_KEY` is unset (it previously answered from memory silently). `docs/CAPABILITIES.md`
     updated to match reality.
- **Application & Outreach agent (the "apply for me" layer)** — ✅ build green (tsc 0, lint clean),
  shipped to `main` across the session. A new specialized agent powered by **Grok (xAI)** (Gemini stays
  on every existing feature). Three pillars:
  1. **Documents = the agent's memory.** New `Documents` tab + private, owner-scoped Supabase Storage
     bucket (`documents`, RLS by `auth.uid()` folder) + `documents` table (metadata + extracted text,
     default-resume flag). Client upload → `/api/documents/create` → `store.ts` (`loadAgentMaterials`
     returns the default/most-recent resume + other materials).
  2. **Application agent.** `runApplication()` flow: dedup guard → read the form (dependency-free static
     HTML parser today; env-gated `JARVIS_BROWSER=playwright` rendered-DOM path wired for later) → load
     the user's materials → Grok grounds each field → persist a **field plan** for review. Provenance is
     enforced in CODE (`backs()` citation gate): any fill not grounded in the corpus is demoted to
     unfilled/`inferred` (hard rule #3). It **NEVER submits** — lands `needs_review` (hard rule #5).
     Surfaces: `Apply` tab, "Prepare with Jarvis" on Opportunity cards, and the orb router
     ("prepare this application <link>" → application agent, URL extracted from the message).
  3. **Outreach agent.** Per-contact `OutreachButton`: pick an **audience** (investor/recruiter/professor/
     peer/founder — sets tone + ask) + goal → Grok drafts a tailored email grounded in the contact's
     `current_work` (no invented recipient facts) → editable → **saved to Gmail Drafts** (`gmail.compose`),
     never sent. Reuses the existing `getTokenWithScope` + `createDraft` infra.
  Migration **0016** adds it all (documents table + Storage bucket + 4 policies, `contacts.current_work`,
  `application_runs`, `outreach_runs`, owner-only RLS, inflight unique index). **⚠️ 0016 is written but
  NOT yet applied to the live project — Aarav applies migrations.** Until then the Documents/Apply/Outreach
  tables don't exist server-side; the UI builds and routes, but runs will error until 0016 is applied.
- **Calendar end-times + all-day fix · Apollo email connector · README API list** — ✅ build green
  (tsc 0, lint clean), adversarially verified (no real defects), not yet pushed. Three user requests:
  1. **Calendar never fabricates an end time.** `sources.ends_at` (migration 0014) + `sources.is_all_day`
     (migration 0015) make the end a real timestamp and mark date-only events. `formatEventTime()`
     renders the start–end span deterministically (hard rules #2/#7) and the assistant is handed that
     exact string. All-day events store start/end at LOCAL NOON (skew-proof; Google's exclusive end
     converted to the last included day) and render a plain DATE with no clock time. Ingest now REFRESHES
     seen events each sync, so reschedules + legacy rows self-heal. Threaded `is_all_day` through the
     calendar page, the assistant digest/search, and the Today agent.
  2. **Apollo.io connector** (`src/lib/apollo.ts`, gated on `APOLLO_API_KEY`, Tavily-style graceful
     degrade): enrich an existing contact's missing email (MATCH) and discover new people (SEARCH via
     `/mixed_people/api_search` — discovery only, no emails, so import ENRICHES each person by Apollo id
     to reveal the email). Imports are `created_by='user'`, Apollo recorded in `field_sources.email`.
  3. **README "APIs & services" table** lists every external service (Supabase, Gemini, Google
     Workspace, Tavily, ElevenLabs, Apollo.io, Web Speech API) + env vars; `.env.example` gained the
     Google connector vars; fixed Drive/Sheets attribution.
  A 9-finding adversarial workflow flagged the two HIGH correctness bugs (all-day fabrication; Apollo
  search returning no emails) — both fixed here, then re-verified.
- **Jarvis write-actions + manual contacts fix + user templates** — ✅ shipped to `main`, build green.
  Three commits this session:
  1. **Write-actions** (`62e119e`): the orb can now `create_calendar_event`, `draft_email`, and
     `save_drive_template`, wired into `ask()`'s Gemini tool loop via `src/lib/assistant/actions.ts`
     (`buildAskActions`). Calendar times resolve in code with chrono (hard rule #2) — the model passes
     the user's verbatim phrase in `when`. Timed-vs-all-day is decided by clock intent
     (`isCertain('hour') || meridiem !== null`, so "tonight"/"this morning" → timed, "June 20" →
     all-day). All-day range ends get a +1 day (Google's all-day end is exclusive; chrono's is
     inclusive), and the confirmation date is formatted from the resolved YYYY-MM-DD (no UTC
     round-trip → no off-by-one in negative-offset zones). Email is **DRAFT only** (gmail.compose;
     no send path — autonomy L0). Save-template reads a named/linked Doc (drive.readonly) → Supabase.
     Each action returns a receipt (`AskActionRef` w/ `detail`) surfaced under "Done by Jarvis";
     missing scope → "Reconnect Google…". `/api/agent` now propagates citations/files/actions.
  2. **Manual contacts fix** (`71616c6`): `loadAcceptedPeople` was filtering out every contact with
     no `source_quote` — i.e. every manually-added one. Removed the filter; `PersonCard` renders
     manual contacts (no provenance) via a non-`<Card>` tile with an "Added by you" badge, keeping
     the `<Card>` source-chip invariant (rule 4) intact for researched people. (Write path was
     already correct — contact row + email/linkedin channels.)
  3. **User templates** (`8e6286a`): "New template" form on the Templates page (type or upload a
     .txt/.md) → `POST /api/templates/create` → `saveUserTemplate` (source "user", verbatim, no
     scrub). New read-only `list_templates` assistant tool hands Jarvis each saved template's full
     name/subject/body so it can MEANINGFULLY adapt one (fill placeholders, change tone/content)
     and then `draft_email` the edited result — prompt instructs it not to echo verbatim.
  - **tsc + full `npm run build` clean** after each commit. Adversarial review (workflow `wj8vppg39`,
    13 agents, 3 lenses, each finding skeptic-verified) found **6 real defects — all fixed** in
    `f5b6e6f`, then re-verified empirically against the project's chrono:
    1. **HIGH** — bare relative phrases ("next week", "next month", "in 2 weeks") became fabricated
       1-hour timed events (chrono attaches a default meridiem to them; the old `meridiem !== null`
       check misread that). Fixed: a meridiem only implies a time when a day-segment word is present
       (`SEGMENT_WORDS` regex); otherwise the phrase stays all-day.
    2. **MED** — start-timed range w/ a date-only end ("tomorrow 9am to next Friday") collapsed to a
       1-hour event; now spans to the end day at the start's time-of-day.
    3. **MED** — multi-day confirmations showed only the first day; new `describeResolved()` renders
       the full range ("Jun 20 – Jun 22") for all-day and timed spans.
    4. **MED** — `NewTemplateForm.submit()` had no `catch`; offline/non-JSON now surfaces a message.
    5. **LOW** — a space-free doc name matched `extractFileId`'s bare-id regex; `saveTemplate` now
       falls back to a name search when a guessed (non-URL) id fails to read.
    6. **LOW** — file was read before the size cap; added a pre-read size + empty-file guard.
- **Gemini switch + Tavily web search + ElevenLabs voice + bare-orb home** — ✅ shipped (local), build green.
  Four user requests in one push:
  1. **Runtime LLM → Gemini** (commit `cc0b3d5`): all model calls go through `src/lib/llm/gemini.ts`
     (direct REST, no SDK) — `geminiStructured`/`geminiToolLoop`/`geminiText`, default `gemini-2.5-flash`,
     `thinkingBudget:0`, retry-on-overload. Migrated 9 logical sites (goals/router/today-plan/draft-email/
     ingest/compose structured; ask/opportunity/research agentic). Anthropic SDK now unused. Verified live.
  2. **Tavily is now the web search** (same commit): `webSearch()` feeds the agent loops; the citation gate
     is preserved against Tavily page text (quote must be a real substring; URL must be in the allowlist).
  3. **ElevenLabs voice** (commit `9d47bdb`): `src/lib/voice/elevenlabs.ts` + `POST /api/voice` speak each
     answer; `JarvisConsole` plays it with a speaker toggle (localStorage-persisted). Server-only key.
     Degrades silently with no key. **⚠ Needs `ELEVENLABS_API_KEY` to actually speak — see SESSION_HANDOFF.**
  4. **Bare-orb home + hamburger-only nav** (commits `365d56b`/`ddcf133`/`5ce870e`): home is just the
     particle sphere + military clock on pure black; nav is a slide-in drawer behind a hamburger; the
     "Ask about your email" explainer and the duplicate top-right "Ask Jarvis" are gone on the home.
- **Daily Plan (Today) + Jarvis Q&A over connected data** — ✅ shipped (local). Two features:
  1. **Daily Plan** (`/today`): `src/lib/agents/today/plan.ts` loads today's calendar events + open/overdue/
     undated tasks + recent emails, then a forced Claude `build_day_plan` tool returns **only**
     order/part-of-day/priority/action/why — **never a clock time** (hard rule #2). Code attaches the real
     calendar times (`sources.occurred_at` → `formatWhen`) and computes a deterministic sortKey (fixed
     events at their epoch; flexible items at startOfDay + bucketHour[morning9/afternoon13/evening18/
     anytime12] + order). Ephemeral — nothing persisted (L0). Every block carries a non-empty `CardSource`
     so `<Card>` renders. `GET /api/today/plan` + `DayPlanView` client component.
  2. **Q&A over connected data**: `src/lib/assistant/data-tools.ts` gives the assistant read-only,
     RLS-scoped access to Gmail/Calendar/meetings/tasks/contacts/opportunities via a prompt **digest**
     (`buildDataDigest`) + a `search_my_data` tool (`searchMyData`). Threaded through `ask(message, ctx)`
     and both `/api/ask` + `/api/agent`. Dates only formatted, never computed. Router/registry guidance +
     JarvisConsole examples updated to advertise data Q&A.
  - Adversarial review (workflow w77ny0yiv, 9 agents): 4 confirmed findings. **Fixed:** voice-input
    duplication (cumulative `e.results` re-appended → rebuild each event); `searchMyData` silently dropped
    null-date tasks/opps under a time window (now `nullableWindowOr` keeps undated/rolling in today/upcoming).
    **Deferred/acknowledged:** `/api/agent` router is not reached by any UI (orb posts to `/api/ask`
    directly) — to be wired when the action-agents arc lands; model prose could restate a real event time
    (low, compliant — the structured timeLabel path is code-derived). **tsc + eslint clean.**
- **Goals anchors UI + manual entry + Gmail/Calendar ingestion + drafting + orb/nav polish** — ✅ shipped
  (migrations `0006→0009` live). Highlights: Goals page/detail + global goal filter (`?goal=`) + per-tab
  filtering + add-to-goal on cards + AI goals-from-context + intersections (combined-ask) + goal
  connections. Manual entry for contacts/opportunities/tasks + a user `profiles` row (age/level/looking-for)
  that makes opportunity auto-population goal+profile-aware. **Gmail ingestion** (`lib/google/ingest.ts`):
  Claude triages inbox relative to goals/profile, keeps only important mail, groups by sender/org, adds
  important senders/opportunity threads to Contacts (L0); **Calendar** kept as-is; both stored as `sources`
  (deduped by external_id). Email drafting to a contact → "Open in Gmail" compose (no send scope). Orb
  rebuilt as a layered morphing blob (moves more when talking); persistent left sidebar nav; all page
  explainer text stripped; logo → home. tsc + eslint clean; routes gate. Adversarial review run wwaqknovi.
- **Goals as ANCHORS (backend+API)** — Migrations `0006_goals_anchors`
  (polymorphic `goal_links` entity↔goal + `goal_connections` + `goal_intersections`) and
  `0007_goals_provenance` (goals get `created_by`/`review_status`/`source_*`/`confidence` for L0 AI
  goals; back-filled `contact_goals` → `goal_links`) are **applied live**. Backend lib in
  `src/lib/goals/`: `links.ts` (link/unlink/setReview + deterministic `refreshIntersection`),
  `load.ts` (loadGoals, loadGoalDetail, entityIdsForGoal, goalsForEntities), `generate.ts` (4 Claude
  flows: goals-from-context, propose links, combined-ask, goal-connection), `facts.ts` (entity facts +
  goal digests), `types.ts`. API: `/api/goals` (GET/POST), `/api/goals/[goalId]` (PATCH incl.
  accept/dismiss, DELETE), `/api/goals/generate`, `/api/goal-links` (POST) + `/[linkId]` (PATCH/DELETE),
  `/api/entities/suggest-goals`, `/api/goal-intersections` (POST/DELETE), `/api/goals/[goalId]/connections`.
  Model: entity_type ∈ {contact, opportunity, item, source} (source = email/meeting/calendar). AI links
  land review (L0); intersections auto-detected in SQL, Claude only writes the combined-ask. **tsc +
  eslint clean.** NEXT: UI — Goals page (list + manual create + generate-from-context), goal detail
  (`/goals/[goalId]`: linked entities, intersections rail, connections), a goal filter/toggle in the
  Topbar wired through `?goal=` to filter People/Opportunities, and an "Add to goal / suggest goals"
  control on PersonCard + OpportunityCard. Then adversarial review + commit. Design spec lives in the
  workflow output (run wuo6a0whl).
- **Migrations applied LIVE + Google connector** — ✅ done. Applied `0001→0005` via the Supabase MCP
  (12 tables, RLS verified, advisors clean). Built the **Google connector** (read-only):
  `0005_connected_accounts` (RLS-scoped token storage; `sources.source_type` extended with
  `sheet`/`drive`); `src/lib/google/{oauth,store,drive,sheets,import-contacts,draft-email}.ts`;
  `/api/connect/google` + `/callback` + `/disconnect` (CSRF state cookie, refresh-on-expiry);
  `/api/google/import-contacts` + `/draft-email`; a **Connections** tab
  (`ConnectionsPanel`) to connect/disconnect + run the two tools. **Two features:** (1) import contacts
  from a Google Sheet → each row lands in Review with the sheet+row as source (reuses `research_runs`);
  (2) draft an email from a Drive template → Claude fills placeholders, draft-only (no send scope yet).
  **Verified:** tsc + eslint clean; live routes gate correctly (connect → /login, APIs → 401). Live
  Drive/Sheets calls await the user connecting Google.
- **Immersive Jarvis home + nav drawer** — ✅ built (local). `/jarvis` is now the command-center home:
  `LiveClock` (ticking, hydration-safe) + the arc-reactor orb + "JARVIS" wordmark + the ask console
  (`JarvisConsole hero`). The persistent sidebar was replaced by a slide-in `NavDrawer` opened from a
  hamburger in the `Topbar` (Esc/overlay/route-change close it). Root `/` and post-login now land on
  `/jarvis` (was `/today`). Deleted orphaned `Sidebar.tsx` + `MobileNav.tsx`. **Verified:** tsc +
  eslint clean; live server `/jarvis` + `/` → 307 `/login` (compile + auth gate OK).
- **Multi-agent system + Opportunity agent** — ✅ built (local; gated on migrations to *run*). Two
  parts:
  1. **Intent router** — `POST /api/agent` classifies one request (Haiku, `JARVIS_ROUTER_MODEL`) and
     dispatches to exactly ONE agent: opportunity · contact · email · calendar · meeting · assistant.
     Live agents run (opportunity/contact research, assistant ask); email/calendar return a
     needs-connection hint; meeting asks for a pasted transcript. Failsafe → assistant on any error.
     Files: `src/lib/agents/{types,registry,router,citation-gate}.ts`, `src/app/api/agent/route.ts`.
  2. **Opportunity agent** — mirrors the people agent end-to-end for programs/jobs/hackathons/
     fellowships. Two-phase Claude (web search → forced `report_opportunities`) + the shared citation
     gate; **deadlines obey hard rule #2** (model returns verbatim strings; `chrono-node` resolves them
     in `deadline.ts`). Each result carries deadline, how-to-apply, requirements, location, dates, and
     required skills — every field sourced. Lands in Review (L0). Files: `src/lib/agents/opportunity/*`
     (types/deadline/extract/map/load/run/useOpportunityRun), `src/app/api/opportunities/*`,
     `src/components/{OpportunityCard,OpportunityRunCard,FindOpportunitiesBar}.tsx`, migration
     `0004_opportunities.sql`, wired into `/opportunities` + `/review`.
  - **Tavily** (`src/lib/search/tavily.ts`) wired as an OPTIONAL recall seed (gated on `TAVILY_API_KEY`,
    safe no-op without it; never a provenance source). **Refactor:** extracted `runPeopleSearch` so
    `/api/research` and the router share one path (behavior identical). **Nav** renamed to mirror agents
    (Email/Calendar/Meetings/Contacts/Opportunities). **Verified:** `tsc` + `eslint` clean; live dev
    server compiles all new routes (agent/opportunities → 401 JSON unauthed; pages → 307 `/login`).
- **Auto-Populate (cohort research agent)** — ✅ built + reviewed + fixed (local). Natural-language
  cohort → Claude w/ web search → verified people land in Review (L0). Engine validates every
  quote/URL against **real `web_search` citations** before persist (the model is untrusted). Files:
  `src/lib/research/*` (extract/map/load/types/targets/useResearchRun), `src/app/api/research/*`,
  `src/components/{PersonCard,ResearchRunCard,AskJarvisDialog,FindPeopleBar}.tsx`, wired into
  `/people`, `/review`, the Topbar ⌘K, and `/dev`. Adversarial review (12 findings) all fixed:
  open-redirect, contact_goals/connections dual-parent RLS, citation-backing direction, dedup race,
  phase-2 stop_reason guard, signout CSRF, etc. **Verified:** `tsc` clean, `npm run build` green.
- **P0-T3 — Supabase Auth** — ✅ code-complete (live apply pending token). `@supabase/ssr` browser +
  server clients, `src/middleware.ts` session refresh + route gate, server-side re-check in the
  `(app)` layout, email/password login/signup + email-confirm + signout, sidebar user/sign-out.
  **Verified at runtime:** `/today` → 307 `/login?redirectTo=…`; `/login` 200; unauth `POST
  /api/research` → 401 JSON. (Real sign-in needs live Supabase creds.)
- **P0-T4 + Phase-6 + research schema** — ✅ migration files written (live apply pending token).
  `supabase/migrations/0001_core.sql` (sources+items+RLS), `0002_people.sql` (full People schema +
  child-table RLS, `items.contact_id`), `0003_research.sql` (research_runs, contacts provenance/
  review columns, `contacts_provenance_chk`, partial unique index, `review_feed` view). RLS on every
  table; child tables scope via parent; `contact_goals`/`connections` verify both parents.
- **P0-T5 / P0-T2 / P0-T1** — ✅ done in prior sessions (see git log).

## Verified working
- `npx tsc --noEmit` clean; `npx eslint src` clean; `npm run build` green (2026-07-13, post-critique).
- Dev-server smoke: /, /today, /review, /goals, /tasks, /meetings, /email, /calendar, /connections,
  /onboard all 307 -> /login unauthed; /login 200; GET /api/today/plan, PATCH /api/items,
  POST /api/{notion/sync,tasks,goals} all 401 unauthed (correct verb semantics).

## The single next task
Exercise the simplified loop live end-to-end: connect Google (the callback now auto-syncs), set a
goal + sub-goal on /goals, confirm extracted items land in Review **with goal chips**, accept one
(item + goal link flip together), and confirm it appears on Today in the right bucket with a working
source chip. Then apply migration 0021 + set `NOTION_API_KEY`, hit Sync all on Today, and confirm a
Notion meeting-notes page produces reviewable items. Apply 0022 and confirm sub-goals nest.

## Known roadblocks / waiting on the user
- **Migrations `0021_notion_sources.sql` + `0022_goal_hierarchy.sql` + `0023_notion_provider.sql`
  are written, NOT applied.** Apply all three in the Supabase dashboard SQL editor (like 0016). Until
  then: Notion sync returns an actionable error; sub-goals save flat; Connect Notion reports the
  missing migration (the app degrades gracefully, nothing crashes).
- **Notion is per-user OAuth now.** Set `NOTION_CLIENT_ID` + `NOTION_CLIENT_SECRET` (a public Notion
  integration whose redirect URI is `${NEXT_PUBLIC_SITE_URL}/api/connect/notion/callback`); each user
  clicks Connect Notion and picks their own pages. `NOTION_API_KEY` is only a single-person self-host
  fallback; leave it unset on a multi-user deployment.
- **Reconnect Google once** — scopes were narrowed to `gmail.readonly` + `calendar.readonly`;
  existing broader grants keep working, but a fresh consent matches the new minimal ask and the
  callback now runs a first sync automatically.
- **LLM key:** one provider — xAI Grok (`XAI_API_KEY`, default model grok-4.3). `lib/llm/gemini.ts`
  is a thin adapter over `grok.ts` (kept to avoid churn at 4 call sites; collapsing it is optional
  cleanup). ELEVENLABS_*/TAVILY_*/APOLLO_*/JARVIS_BROWSER/CREDENTIALS_SECRET are all dead — safe to
  delete from `.env.local`.

## Stack as built
Next.js 15.5.19 · React 19.1 · Tailwind v4 · TypeScript · lucide-react · Turbopack ·
`@supabase/ssr` + `@supabase/supabase-js` · **xAI Grok** (single LLM provider, `lib/llm/grok.ts` +
the `gemini.ts` adapter) · `chrono-node` (`src/lib/dates.ts`, the rule-#2 boundary) · Notion REST
(fetch-based, no SDK). App at repo root; docs in `/docs`; SQL in `/supabase/migrations` (0021 + 0022
pending apply).

## Notes
- The model's self-reported URLs/quotes are **never trusted** — see `src/lib/research/extract.ts`
  (`backs()` + the citation allowlist). This is hard rule #3 made verifiable.
- L0 is enforced beyond the status column: every live contact read filters `review_status='accepted'`.
- Architecture decisions live in `/docs/DECISIONS.md`; schema + changelog in `/docs/DATA_MODEL.md`.
