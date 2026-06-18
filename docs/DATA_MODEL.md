# DATA_MODEL — the schema (system of record: Supabase Postgres)

> Derived from `/docs/ROADMAP.md` Sections 3.4 and 3.7. **Append every schema change to the changelog
> at the bottom** with date + rationale. Supabase Postgres is the system of record — never store core
> data in Notion.

## Core principle: provenance
Every *derived* object (task, event, follow-up, application-status change) is **never trusted on its
own** — it carries a `source` record. No UI card renders without a working "source" chip.

## Core tables (Section 3.4) — created in P0-T4

```sql
-- the original artifacts we ingested
create table sources (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  source_type text not null,         -- 'email' | 'meeting' | 'calendar' | 'manual'
  external_id text,                  -- gmail message id, transcript id, gcal event id
  permalink text,                    -- deep link back to the original
  title text,                        -- e.g. email subject / meeting name
  occurred_at timestamptz,           -- when the email/meeting happened
  raw_text text,                     -- transcript or email body (for re-extraction)
  created_at timestamptz default now()
);

-- everything Jarvis derives, with a trail home
create table items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  item_type text not null,           -- 'task' | 'event' | 'follow_up' | 'app_status' | 'outreach'
  title text not null,
  due_at timestamptz,                -- resolved, not raw
  status text default 'review',      -- 'review' | 'accepted' | 'done' | 'dismissed'
  confidence numeric,                -- 0..1 from the extractor
  source_id uuid references sources, -- WHERE it came from
  source_quote text,                 -- the EXACT line that justified it
  reasoning text,                    -- one sentence: why Jarvis created this
  created_by text default 'jarvis',  -- 'jarvis' | 'user'
  contact_id uuid references contacts, -- added in Phase 6 (see below); link an item to a person
  created_at timestamptz default now()
);
```

**RLS:** every table is row-level-security scoped to `auth.uid() = user_id` (or via the parent row for
child tables). Rows are only ever visible to their owning user.

**Date rule:** `due_at` is **resolved deterministically** (e.g. `chrono-node`) from the extractor's
`raw_due`/`raw_when` string + the source's `occurred_at` + the user's timezone. The LLM never computes
dates.

## People / outreach tables (Section 3.7) — created in Phase 6

```sql
-- people you track and follow up with
create table contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  full_name text not null,            -- the only required field (or auto-captured from email/meetings)
  company text,
  role_title text,                    -- the job they have (used to tailor outreach)
  background text,                    -- factual bio; AI-enriched from the web
  relevance text,                     -- WHY they matter to you (AI links this to your goals)
  the_ask text,                       -- WHAT you need from them (AI-proposed)
  notes text,                         -- freeform; AI writes caveats here when unsure
  follow_up_status text default 'to_reach_out',  -- 'to_reach_out' | 'waiting' | 'done'
  next_follow_up_at timestamptz,
  field_sources jsonb,                -- per-field provenance: {"email": {"url":"…","confidence":0.6}}
  source_id uuid references sources,  -- set if auto-created from an email/meeting
  created_by text default 'user',     -- 'user' | 'jarvis'
  created_at timestamptz default now()
);

create table contact_channels (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references contacts on delete cascade not null,
  kind text not null,                 -- 'email' | 'linkedin' | 'phone' | 'x' | 'website' | 'other'
  value text not null,
  is_primary boolean default false
);

create table connections (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references contacts on delete cascade not null,
  relationship_note text,             -- "friend of a friend via Sarah", "met at the X conf"
  introduced_by uuid references contacts
);

create table email_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  name text not null,
  subject text,
  body text not null                  -- supports {{first_name}}, {{company}}, {{role}}, {{connection}}
);

create table goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  title text not null,
  description text,
  created_at timestamptz default now()
);

create table contact_goals (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid references contacts on delete cascade not null,
  goal_id uuid references goals on delete cascade not null,
  rationale text,
  confidence numeric
);
```

> Note: `items.contact_id` is shown inline above for completeness, but in migration order it is added
> **after** `contacts` exists (Phase 6). In P0-T4 we create `sources` and `items` *without*
> `contact_id`, then `alter table items add column contact_id uuid references contacts;` in Phase 6.

## Auto-populate (cohort research) additions — migration `0003_research.sql`

The auto-populate feature (a cohort research agent: natural-language request → web-researched people,
each with provenance, landing in Review) adds:

- **`source_type = 'research'`** — a research run is itself a `sources` row (the artifact every
  discovered person points back to). `sources.source_type` now allows `'research'` alongside
  `email|meeting|calendar|manual`.
- **`contacts` provenance + review columns** (added by `0003`, on top of the documented Phase-6
  table): `review_status` (`'review'|'accepted'|'dismissed'`, default `'accepted'`; jarvis-discovered
  rows insert as `'review'`), `source_quote` (verbatim web snippet asserting the cohort match),
  `confidence` (0..1 match confidence), `research_run_id` (FK → `research_runs`).
- **DB-level provenance guard** — `contacts_provenance_chk`: a `created_by='jarvis'` contact MUST have
  `source_id` and `source_quote`. This mirrors the `<Card>` invariant at the database.
- **`research_runs`** — one row per cohort request: `query`, `target_kind` (`'people'` for now — the
  only generalization seam), `status` (`'running'|'done'|'error'`), `result_count`, `source_id`,
  `error`. RLS-scoped to the owner.
- **`review_feed` view** — unifies extracted `items` (`status='review'`) and discovered `contacts`
  (`review_status='review'`) for one Review queue. Created `with (security_invoker = true)` so it
  honors each base table's RLS (without it the view would run as owner and leak rows).

**Per-field provenance:** `contacts.field_sources` (jsonb) stores `{ field: { url, quote, confidence } }`
for each auto-filled claim. Every stored `url` is validated server-side against the run's **real
`web_search` citations** before persist — the model's self-reported URLs/quotes are never trusted.

## Opportunity agent — migration `0004_opportunities.sql`

The Opportunity agent (programs / jobs / hackathons / fellowships → web-researched, each with
provenance, landing in Review) mirrors the people agent's shape:

- **`opportunity_runs`** — one row per NL search: `query`, `kind_filter` (`'all'|'programs'|'jobs'|
  'hackathons'`), `status` (`'running'|'done'|'error'`), `result_count`, `source_id`, `error`. A
  partial unique index (`… where status='running'`) blocks concurrent duplicate runs. RLS owner-scoped.
- **`opportunities`** — a discovered opportunity: `title` (only required content), `organization`,
  `category` (program/job/internship/hackathon/fellowship/grant/scholarship/competition/accelerator/
  other), `description`, `location`, `is_remote`, `how_to_apply_url`, `requirements`, `required_skills`
  (`text[]`), `comp_or_prize`, `notes`. **Dates obey hard rule #2:** `raw_deadline`/`raw_event_dates`
  are the model's VERBATIM strings (the displayed source of truth); `deadline_at`/`starts_at`/`ends_at`
  are **chrono-resolved by our code**, never the model. Provenance: `field_sources`, `source_id`,
  `source_quote`, `confidence`. Review: `review_status` (default `'review'` for jarvis rows),
  `created_by`, `opportunity_run_id`.
- **DB-level provenance guard** — `opportunities_provenance_chk`: a `created_by='jarvis'` row MUST have
  `source_id` + non-empty `source_quote` (mirrors the `<Card>` invariant, same as contacts).
- **`review_feed` view extended** — now unions three branches: `items` (status=review) + `contacts`
  (review_status=review) + `opportunities` (review_status=review). The fixed `research_run_id` column
  became a generic `run_id`. Still `security_invoker=true` so base-table RLS holds.

## Migration order
1. **P0-T4 (`0001_core.sql`):** `sources`, `items` (no `contact_id` yet) + RLS.
2. **Phase 6 (`0002_people.sql`):** `goals`, `contacts`, `contact_channels`, `connections`,
   `email_templates`, `contact_goals`; then `alter table items add column contact_id`.
3. **Auto-populate (`0003_research.sql`):** `research_runs`; `contacts` review/provenance columns +
   `contacts_provenance_chk`; `review_feed` view. (Pulled forward with Phase 6 to support the feature.)
4. **Opportunity agent (`0004_opportunities.sql`):** `opportunity_runs`, `opportunities` (+
   `opportunities_provenance_chk`); `review_feed` view re-created to also union `opportunities`.
5. **Google connector (`0005_connected_accounts.sql`):** `connected_accounts` (RLS-scoped Google token
   storage); `sources.source_type` extended with `sheet` + `drive`.
6. **Goals anchors (`0006_goals_anchors.sql`):** `goal_links` (polymorphic entity↔goal, entity_type ∈
   contact|opportunity|item|source), `goal_connections` (goal↔goal), `goal_intersections` (entity in
   2+ goals + AI combined-ask). RLS owner-only.
7. **Goals provenance (`0007_goals_provenance.sql`):** `goals` gains created_by/review_status/source_*/
   confidence (L0 for AI goals); back-fills `contact_goals` → `goal_links`.
8. **Profile (`0008_profile.sql`):** `profiles` (headline/age/level/looking_for) for relevance.
9. **Email ingest (`0009_email_ingest.sql`):** `sources` gains from_name/from_email/group_label + a
   partial-unique (user, type, external_id) for idempotent re-sync.
10. **Phase 7:** `applications` (Kanban) — schema TBD when we reach P7-T1.

**Applied to the live project on 2026-06-17:** `0001→0009` via the Supabase MCP. RLS verified; advisors
clean. (`0006→0009` add the goals-anchor tables, goals L0/provenance, the profile, and email-ingest
columns on `sources`.)

## Changelog
- _2026-06-17_ — Initial data model documented from roadmap Sections 3.4 & 3.7 (P0-T1). No migrations
  run yet.
- _2026-06-17_ — **Migrations written (`supabase/migrations/0001–0003`).** P0-T4 core (`sources`,
  `items` + RLS); Phase-6 People schema pulled forward; auto-populate additions (`research_runs`,
  `contacts.review_status/source_quote/confidence/research_run_id`, `contacts_provenance_chk`,
  `review_feed` view, `source_type='research'`). RLS on every table; child tables scope via the
  parent contact; `contact_goals` insert verifies both parents. **Not yet applied to a live project**
  (awaiting the real Supabase access token + window reload to run via the Supabase MCP).
- _2026-06-17_ — **Migrations `0001→0005` APPLIED to the live project** (Supabase MCP). Added
  `0005_connected_accounts` (Google OAuth token storage, RLS owner-only) and extended
  `sources.source_type` with `sheet`/`drive` for Drive/Sheets import provenance. Verified RLS on all 12
  tables; both provenance CHECKs present; `review_feed` is `security_invoker`; revoked a stray public
  `EXECUTE` on the pre-existing `rls_auto_enable` event-trigger helper (advisor finding).
- _2026-06-17_ — **Migration `0004_opportunities.sql` written** for the Opportunity agent:
  `opportunity_runs` + `opportunities` (+ `opportunities_provenance_chk`), and `review_feed` re-created
  to union opportunities (the fixed `research_run_id` column generalized to `run_id`). Dates split into
  model-verbatim `raw_*` strings + chrono-resolved `*_at` timestamps (hard rule #2). RLS owner-scoped.
  **Apply order is now `0001→0004`.** Not yet applied to a live project (same token/reload blocker).
