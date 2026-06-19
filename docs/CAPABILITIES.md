# Jarvis — Current Capabilities Roadmap

> A snapshot of what Jarvis **does today**, grounded in the shipped code (not aspirational). For the
> forward-looking plan see [`ROADMAP.md`](./ROADMAP.md); for the data layer see
> [`DATA_MODEL.md`](./DATA_MODEL.md). Last regenerated: 2026-06-19.

## What Jarvis is
A personal command center that reads your email, calendar, and meetings; turns commitments and
opportunities into tracked items **each carrying a source link**; researches people and programs on
the open web; and is driven by a conversational orb (text or voice). Every Jarvis-derived fact lands
in a **review queue** before it counts — the user is always the decision-maker.

## Status legend
- 🟢 **Live** — works with no external connection (Gemini + Supabase only).
- 🔌 **Needs connection** — requires Google OAuth (Gmail / Calendar / Drive / Sheets).
- ⚙️ **Optional** — degrades gracefully if its key is absent (Apollo, ElevenLabs).
- **Autonomy L0** — suggest-only: Jarvis proposes, the user approves. This is the only autonomy
  level shipped (per HARD RULE #5).

---

## 1. Conversational core — the Jarvis orb 🟢
The central agent (Gemini 2.5 Flash, function-calling loop). Answers questions about your own synced
data and the live web, and can take L0 write actions.

- **Surface:** `Jarvis` tab (`/jarvis`), `JarvisConsole` orb. API: `POST /api/ask`.
- **Tools the orb can call:**
  - `web_search` — Tavily-backed; every cited fact traces to a real result URL.
  - `search_my_data` — read-only query over synced Gmail, Calendar, meetings, tasks, contacts, opportunities.
  - `list_dir` / `read_file` — read local files within allowlisted folders (`JARVIS_FILE_ROOTS`; secrets always denied).
  - `create_calendar_event` — creates a real Google event (🔌).
  - `draft_email` — creates a Gmail **draft**, never sends (🔌).
  - `save_drive_template` / `list_templates` — save/list reusable email templates.
- **Returns:** `{ answer, citations[], files[], actions[] }`.
- **Autonomy:** L0 — all writes are drafts/proposals; nothing is sent or auto-committed.

### Voice I/O ⚙️
- **Output:** ElevenLabs TTS (`/api/voice`, Turbo v2.5, capped ~2500 chars). No key → silent, text still works.
- **Input:** browser SpeechRecognition; continuous mode loops speak → answer aloud → re-open mic.

---

## 2. Email & inbox triage 🔌
- **What it does:** pulls recent Gmail, and Gemini triages each message **relative to your goals/profile**
  — keeps genuinely important mail, drops promotions/spam, groups by sender/org, and flags real
  people/opportunities to add as contacts.
- **Drafting:** composes Gmail drafts on request (via the orb or Email agent) — lands in Drafts, never sent.
- **Surface:** `Email` tab. API: `/api/google/sync-email`, `/api/google/draft-email`, `/api/google/gmail/create-draft`.
- **Scopes:** `gmail.readonly` (triage), `gmail.compose` (draft). Deduped by Gmail message ID.
- **Autonomy:** L0 — extracted tasks and auto-added contacts land in `review`.

---

## 3. Calendar & meetings 🔌
- **Calendar ingest:** pulls upcoming events; stores **start and end as separate real timestamps**
  (`occurred_at` / `ends_at`) plus an `is_all_day` flag, so the UI and the orb always state the exact
  end time instead of fabricating one. All-day events are stored at local-noon (skew-proof across
  timezones) and rendered date-only.
- **Event creation:** creates real events from your verbatim phrase ("tomorrow at 3pm"); the time is
  resolved deterministically by chrono-node — **the model never computes the date** (HARD RULE #2).
- **Meetings:** extracts action items from a pasted transcript into sourced tasks.
- **Surface:** `Calendar` + `Meetings` tabs. API: `/api/google/sync-calendar`, `/api/google/calendar/create-event`.
- **Scope:** `calendar.events`.

---

## 4. Daily plan — Today 🟢
- **What it does:** builds a prioritized, time-ordered plan from today's calendar events, open tasks,
  and recent email. Fixed events sort by their real times; flexible items get a part-of-day bucket +
  sequence. The model only sequences and prioritizes — it never emits clock times.
- **Surface:** `Today` tab. API: `POST /api/today/plan`.
- **Autonomy:** view-only (ephemeral, recomputed per load); every block shows a working source chip.

---

## 5. Opportunity discovery 🟢
- **What it does:** searches the open web for **programs, jobs, internships, hackathons, fellowships,
  grants, scholarships, competitions, accelerators**. Returns title, org, how-to-apply, requirements,
  skills, location/remote, comp/prize, and deadlines.
- **Pipeline:** query → run record → Gemini tool-loop (web search) → **citation gate** validates every
  field against real page text → chrono-node resolves `raw_deadline`/`raw_event_dates` → ISO timestamps
  → persisted with full per-field provenance.
- **Surface:** `Opportunities` tab. API: `/api/opportunities`, `/opportunities/manual`, `/opportunities/[runId]`.
- **Autonomy:** L0 — results land in `review`; deduped per (user, query).

---

## 6. People research & contacts
### Research agent 🟢
- **What it does:** finds real, named people for a cohort (alumni, founders, recruiters at a given
  company/role) with background, why-they're-relevant, the ask, and reachable channels — then proposes
  which of your goals each person advances.
- **Pipeline:** same shape as opportunities (run → tool-loop → citation gate → persist with provenance → review).
- **Surface:** `People` / Contacts. API: `/api/research`, `/api/research/[runId]`.

### Contacts & Apollo ⚙️
- **Contacts:** people with role, company, background, channels (email/LinkedIn/phone/X/site), and
  follow-up status (`to_reach_out` / `waiting` / `done`). Sources of important email auto-add as contacts (L0).
- **Apollo.io (optional):** "Find email" enriches a contact's missing work email; "Find people with
  Apollo" discovers new candidates (search → match to reveal email). Gated on `APOLLO_API_KEY`.
- **Export:** push accepted contacts to a Google Sheet (🔌 `spreadsheets`).
- **API:** `/api/contacts`, `/contacts/find-email`, `/contacts/export-sheet`, `/contacts/sync-outreach`, `/apollo/*`.

---

## 7. Goals & linking 🟢
- **What it does:** your personal goals are the anchor for all research, contacts, opportunities, and
  tasks. Generate goals from a freeform brain-dump, or create them manually.
- **Linking:** Jarvis proposes which goals a contact/opportunity advances (with confidence + rationale).
- **Intersections:** find entities that advance **multiple** goals at once (`/api/goal-intersections`).
- **Surface:** `Goals` tab + goal detail. API: `/api/goals`, `/goals/generate`, `/goal-links`, `/goal-intersections`.
- **Autonomy:** mixed — manual goals are accepted; auto-proposed links land in `review`.

---

## 8. Email templates & outreach 🟢
- **Two levels:** **connection types** (generalized, reusable — e.g. "parent's professional contact";
  never stores concrete personal detail) and **email templates** (parameterized bodies with
  `{{placeholders}}`, tagged to a connection type, usage-tracked).
- **Composition:** blends a base template + connection context + recipient → a concrete email in
  memory; only the generalized template is persisted (privacy by design).
- **Sources:** user-authored, Jarvis-composed, or saved from a Google Doc (🔌 `drive.readonly`).
- **Surface:** `Templates` tab. API: `/api/templates`, `/templates/compose`, `/templates/create`, `/connection-types`.

---

## 9. Review queue & L0 autonomy 🟢
- **What it does:** every Jarvis-suggested fact (tasks, contacts, opportunities, goal links) is invisible
  until approved. The `review_feed` view unifies all pending suggestions; the user accepts (→ visible)
  or dismisses (→ stays hidden).
- **Surface:** `Review` tab. This is the enforcement point for HARD RULE #5.

---

## 10. Application & outreach agent 🟢
The "apply for me" layer. Two flows, both **suggest-only — Jarvis never submits a form and never
sends an email** (HARD RULE #5). Powered by **Grok (xAI)** for grounding/composition; Gemini stays on
every existing feature.

### Your documents = the agent's memory 🟢
- **What it does:** upload resumes and grant materials; mark one resume as default. These are the
  corpus the agent fills forms and tailors outreach from.
- **Storage:** files land in a private, owner-scoped Supabase Storage bucket (`documents`, RLS by
  `auth.uid()` folder); metadata + extracted text in the `documents` table.
- **Surface:** `Documents` tab. API: `/api/documents/create`, `/api/documents/[id]`.

### Application agent 🟢
- **What it does:** give it a job/grant link; it reads the form, then fills every field it can
  **ground in your documents** and returns a **field plan** for review. Each filled field carries its
  value source (resume / profile / document / opportunity), the **source quote** it was grounded in,
  and a confidence — ungrounded guesses are demoted to unfilled (`backs()` citation gate, hard rule #3).
- **Form reading:** a dependency-free static HTML parser by default; an env-gated
  (`JARVIS_BROWSER=playwright`) **rendered-DOM** path reads JS-built forms with a real browser —
  resolving each control's visible label, grouping radios, capturing options + a re-locatable selector.
- **Browser autofill (live):** with the Playwright backend on, **"Fill in browser"** opens a real
  browser window, types every grounded value into the actual form, attaches your resume from private
  Storage, and **leaves the window open for you to review and submit**. It re-locates each control
  (selector → name/id → label) and fills by type (text/select/radio/checkbox); each field is
  independent and every skip is reported. **Submit-only-on-click — Jarvis never clicks Submit/Apply**
  (hard rule #5). Verified end-to-end against a live browser (DOM read + every fill primitive).
- **Surface:** `Apply` tab + "Prepare with Jarvis" on Opportunity cards. API: `/api/applications/prepare`,
  `/api/applications/[id]`, `/api/applications/[id]/autofill`. Also **registered in the agent router** —
  `POST /api/agent` with "prepare this application <link>" extracts the URL and dispatches here
  (forward-looking: the orb posts to `/api/ask` today, so the router activates once an action-dispatch
  UI uses it, same as the opportunity/contact agents). The user reviews the field plan and submits on
  the real site themselves.
- **Autonomy:** L0 — run lands `needs_review`; values are filled but never submitted.

### Outreach agent 🟢
- **What it does:** per contact, pick an **audience** (investor / recruiter / professor / peer /
  founder) — which sets the tone and the ask — and a goal; Grok drafts a tailored email grounded in
  what the contact is working on (no invented recipient facts).
- **Surface:** "Outreach" on contact cards. API: `/api/outreach/draft`, `/api/outreach/[id]/gmail`.
  The draft is editable, then **saved to Gmail Drafts** (`gmail.compose`) — never sent.
- **Autonomy:** L0 — drafts only.

---

## 11. Connectors & infrastructure

| Piece | Status | Notes |
|---|---|---|
| **Supabase** (Postgres + Auth + RLS) | 🟢 | System of record. Every table row is owner-scoped via RLS. Private `documents` Storage bucket for resumes/materials. |
| **Gemini** (LLM) | 🟢 | 2.5 Flash. Three primitives: structured JSON, tool-loop, plain text. **Dual auth:** AI Studio API key *or* Vertex AI via ADC (`GOOGLE_CLOUD_PROJECT`) for orgs that forbid keys. Retries on overload. Powers every feature except Application/Outreach. |
| **Grok** (xAI LLM) | 🟢 | OpenAI-compatible. Grounds the Application field-plan + composes Outreach drafts. Same three primitives (`grokStructured`/`grokText`/`grokToolLoop`), `XAI_API_KEY` + `XAI_MODEL`. |
| **Google OAuth** | 🔌 | Narrowest scopes, tokens **server-side only**. Read-only first; write scopes added per feature. Re-consent prompts surface clearly. |
| **Tavily** | 🟢 | The only web-search path — every citation traces to a real result. |
| **Apollo.io** | ⚙️ | Contact email enrichment + people discovery. |
| **ElevenLabs** | ⚙️ | Spoken answers. |

### Cross-cutting guarantees (enforced in code)
- **Provenance everywhere:** Jarvis-derived rows carry `source_id` + `source_quote` + `confidence`
  (DB CHECK enforces it); per-field origins live in `field_sources`. No card renders without a working source chip.
- **No model-computed dates/money/reply-state:** the model returns verbatim strings; code resolves
  dates with chrono-node and verifies facts against the real data.
- **Citation gate:** web claims are validated against actual page text before they're persisted.

---

## Current maturity — what this is *not* yet
These are the honest edges of today's build (and the natural next steps on the forward roadmap):

- **Autonomy is L0 only.** Nothing auto-sends or auto-commits; graduating to L1 (auto for
  high-confidence, rare-false-positive cases) is future work.
- **Meetings are paste-only.** No live capture/transcription yet.
- **Applications fill, they don't submit.** The agent reads forms, grounds a field plan, and — with
  the Playwright backend on — types the grounded values into the live form and attaches the resume,
  leaving the window open for **you** to review and submit. It never clicks Submit/Apply. Static HTML
  forms are read with no dependencies; JS-rendered forms + browser autofill need `JARVIS_BROWSER=playwright`
  and a local browser (`npx playwright install chromium`); on a headless server it degrades to "Open
  application + copy from the plan."
- **Today's plan is ephemeral.** Recomputed each load; not persisted or scheduled.
- **Notion mirror, proactive reminders, wake-word voice, and computer-use** are all unbuilt (see `ROADMAP.md`).
- **Email "did I reply?" tracking** is not yet wired from real thread state.
