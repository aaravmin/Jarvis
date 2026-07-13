# CAPABILITIES — what Jarvis can and cannot do

> Honest, current, and short. Updated 2026-07-13 after the simplification (see DECISIONS.md).
> If a capability isn't listed under CAN, Jarvis does not do it.

## What Jarvis is
A goal-grounded attention engine.
It reads your email, meeting notes, Notion, and calendar; turns commitments into tracked
tasks/follow-ups each carrying a source link; and orders everything by importance against the goals
and sub-goals you enter.
Every Jarvis-derived fact lands in a review queue before it counts - the user is always the
decision-maker.

## CAN

**Ingest (read-only, per-user, RLS-scoped)**
- Sync Gmail: triage the inbox against your profile + goals (titles AND descriptions), keep only
  important mail, store each as a source with the full body and a Gmail permalink.
- Sync Google Calendar: upcoming events with real start/end times and all-day handling; reschedules
  refresh in place.
- Sync Notion (per-user OAuth: each user clicks Connect Notion and picks their own pages; needs
  migrations 0021 + 0023 and a public Notion integration's NOTION_CLIENT_ID/SECRET; NOTION_API_KEY
  works as a single-person self-host fallback): pages edited in the last 14 days, stored with the
  page URL; re-edited pages re-ingest.
- Accept pasted meeting transcripts on the Meetings page.
- Run a first sync automatically when Google is connected; "Sync all" on Today covers all three.

**Derive (suggest-only, everything lands in Review)**
- Extract tasks, events, and follow-ups from any ingested source, each with the exact supporting
  quote, a confidence score, and a chrono-resolved due date (the model never computes dates).
- Propose which goal an item serves; the claim is kept only when the supporting quote verifies
  against the source. The goal chip shows in Review and is accepted together with the item in one
  click.
- Backfill: mine already-synced email/meetings/Notion that predate the extractor.

**Prioritize (pure code, no LLM)**
- Score every accepted item by due-date proximity, goal linkage, type, and confidence into buckets:
  overdue (red) -> today -> soon -> later -> done (green).
- Attach likely meeting topics (open items with overlapping titles) to upcoming calendar events.

**Act (only with your click)**
- Complete / edit / delete tasks (due-date edits re-resolve through chrono; deletes confirm first).
- Accept / dismiss suggestions; manage goals and one level of sub-goals.

### Cross-cutting guarantees (enforced in code)
- **Provenance everywhere:** derived rows carry `source_id` + `source_quote` + `confidence` (DB
  CHECK enforces it). No card renders without a working source chip.
- **No model-computed dates/priority/reply-state:** the model returns verbatim strings; code
  resolves dates with chrono-node and ranks with a pure function.
- **Quote gate:** an extraction or goal-relevance claim survives only if its quote is a real
  substring of the source.

## CANNOT (removed 2026-07-13, or never built)

- No voice (in or out). No conversational assistant / chat box. No orb.
- No sending or drafting email, no creating calendar events, no writing to Notion or Google -
  every connector is read-only.
- No job-application autofill, no browser automation, no credentials vault.
- No people/opportunity research, no LinkedIn scraping, no Apollo enrichment, no web search.
- No automatic recurring sync (connect-time + manual only; a scheduled Edge Function is backlog).
- No reply-state ("did they answer me?") detection yet - the top backlog item; per hard rule #7 it
  will be verified from the actual thread when built, never guessed.
