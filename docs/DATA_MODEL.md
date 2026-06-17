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

## Migration order
1. **P0-T4:** `sources`, `items` (no `contact_id` yet) + RLS.
2. **Phase 6:** `goals`, `contacts`, `contact_channels`, `connections`, `email_templates`,
   `contact_goals`; then `alter table items add column contact_id`.
3. **Phase 7:** `applications` (Kanban) — schema TBD when we reach P7-T1.

## Changelog
- _2026-06-17_ — Initial data model documented from roadmap Sections 3.4 & 3.7 (P0-T1). No migrations
  run yet.
