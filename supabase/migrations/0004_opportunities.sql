-- 0004_opportunities.sql — Opportunity agent (programs / jobs / hackathons / fellowships …).
-- Mirrors the auto-populate (cohort research) pattern from 0002_people.sql + 0003_research.sql:
--   • opportunity_runs  ↔ research_runs  (one NL search + its lifecycle)
--   • opportunities     ↔ contacts        (a discovered item with provenance + review state)
-- Hard rules enforced here:
--   #2  Dates are NEVER computed by the LLM. The model returns verbatim strings (raw_deadline,
--       raw_event_dates); our code resolves them with chrono-node into deadline_at / starts_at /
--       ends_at. Both are stored: the raw string is the source of truth shown to the user, the
--       resolved timestamp is a convenience for sorting/reminders.
--   #3  Every jarvis-discovered row carries source_id + source_quote + confidence (DB CHECK below).
--   #5  L0 suggest-only: rows land review_status='review' and only surface in People/Opportunities
--       after the user accepts them.

-- An opportunity search = one natural-language request and its lifecycle.
create table if not exists public.opportunity_runs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  query        text not null,
  -- which buckets the user asked for; 'all' = no filter. Generalization seam, like research_runs.target_kind.
  kind_filter  text not null default 'all'
                 check (kind_filter in ('all','programs','jobs','hackathons')),
  status       text not null default 'running' check (status in ('running','done','error')),
  result_count integer not null default 0,
  source_id    uuid references public.sources(id) on delete set null,
  error        text,
  created_at   timestamptz not null default now()
);
create index if not exists opportunity_runs_user_id_idx   on public.opportunity_runs(user_id);
create index if not exists opportunity_runs_source_id_idx on public.opportunity_runs(source_id);
-- At most one in-flight run per (user, query): the DB rejects a concurrent duplicate so the
-- non-atomic check-then-insert in the API can't race two identical runs into existence.
create unique index if not exists opportunity_runs_one_inflight_idx
  on public.opportunity_runs(user_id, query) where status = 'running';

-- A discovered opportunity, with provenance + review state.
create table if not exists public.opportunities (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null references auth.users(id) on delete cascade,
  title              text not null,                 -- the only required content field
  organization       text,                          -- who runs it (company, lab, foundation, DAO…)
  category           text not null default 'other'
                       check (category in
                         ('program','job','internship','hackathon','fellowship',
                          'grant','scholarship','competition','accelerator','other')),
  description        text,
  location           text,                          -- "Remote", "San Francisco, CA", "Hybrid — NYC"
  is_remote          boolean,
  how_to_apply_url   text,                           -- the apply / details link
  requirements       text,                           -- eligibility / who can apply (prose)
  required_skills    text[],                         -- languages / skills, e.g. {Python,React,Solidity}
  comp_or_prize      text,                           -- salary range / stipend / prize pool (verbatim)
  notes              text,                            -- AI caveats (e.g. "apply link unverified")

  -- DATES — hard rule #2. raw_* are the model's verbatim strings; *_at are chrono-resolved by our code.
  raw_deadline       text,                           -- e.g. "Applications due March 15, 2026"
  deadline_at        timestamptz,                    -- chrono-resolved; NULL when unparseable ("rolling")
  raw_event_dates    text,                           -- e.g. "Hackathon runs Feb 7–9, 2026"
  starts_at          timestamptz,                    -- chrono-resolved start
  ends_at            timestamptz,                    -- chrono-resolved end (for ranges)

  -- PROVENANCE — hard rule #3.
  field_sources      jsonb,                          -- per-field: {"how_to_apply_url":{"url":"…","confidence":0.8}}
  source_id          uuid references public.sources(id) on delete set null,
  source_quote       text,                           -- verbatim web snippet asserting this opportunity matches
  confidence         numeric check (confidence is null or (confidence >= 0 and confidence <= 1)),

  -- REVIEW — hard rule #5.
  review_status      text not null default 'review'
                       check (review_status in ('review','accepted','dismissed')),
  created_by         text not null default 'jarvis' check (created_by in ('jarvis','user')),
  opportunity_run_id uuid references public.opportunity_runs(id) on delete set null,
  created_at         timestamptz not null default now()
);
create index if not exists opportunities_user_id_idx        on public.opportunities(user_id);
create index if not exists opportunities_review_status_idx  on public.opportunities(review_status);
create index if not exists opportunities_run_id_idx         on public.opportunities(opportunity_run_id);
create index if not exists opportunities_deadline_at_idx    on public.opportunities(deadline_at);

-- DB mirror of the <Card> guardrail: a jarvis-discovered opportunity MUST carry provenance.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'opportunities_provenance_chk') then
    alter table public.opportunities add constraint opportunities_provenance_chk
      check (created_by <> 'jarvis'
             or (source_id is not null and source_quote is not null and length(btrim(source_quote)) > 0));
  end if;
end $$;

-- ---------------------------------------------------------------------------
-- Row-Level Security: owner-only, one policy per command (mirrors every other table).
-- ---------------------------------------------------------------------------
alter table public.opportunity_runs enable row level security;
alter table public.opportunities    enable row level security;

create policy opportunity_runs_select_own on public.opportunity_runs for select using (auth.uid() = user_id);
create policy opportunity_runs_insert_own on public.opportunity_runs for insert with check (auth.uid() = user_id);
create policy opportunity_runs_update_own on public.opportunity_runs for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy opportunity_runs_delete_own on public.opportunity_runs for delete using (auth.uid() = user_id);

create policy opportunities_select_own on public.opportunities for select using (auth.uid() = user_id);
create policy opportunities_insert_own on public.opportunities for insert with check (auth.uid() = user_id);
create policy opportunities_update_own on public.opportunities for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy opportunities_delete_own on public.opportunities for delete using (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Extend the unified Review queue to include discovered opportunities.
-- security_invoker = true is REQUIRED so each base table's RLS still applies (no cross-user leak).
-- The fixed `research_run_id` column from 0003 becomes a generic `run_id` across all three branches.
-- We DROP + CREATE (not CREATE OR REPLACE) because Postgres forbids renaming a view column in-place,
-- and 0003's view ended in a column named `research_run_id`. Safe: nothing consumes this view yet.
-- ---------------------------------------------------------------------------
drop view if exists public.review_feed;
create view public.review_feed with (security_invoker = true) as
  select 'item'::text        as kind, id, user_id, title     as label, confidence,
         source_id, source_quote, created_at, null::uuid as run_id
    from public.items
   where status = 'review'
  union all
  select 'contact'::text     as kind, id, user_id, full_name as label, confidence,
         source_id, source_quote, created_at, research_run_id as run_id
    from public.contacts
   where review_status = 'review'
  union all
  select 'opportunity'::text as kind, id, user_id, title     as label, confidence,
         source_id, source_quote, created_at, opportunity_run_id as run_id
    from public.opportunities
   where review_status = 'review';
