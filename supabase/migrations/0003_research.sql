-- 0003_research.sql — Auto-Populate (cohort research agent) additions.
-- Layers the provenance + review columns the feature needs on top of the documented Phase-6
-- contacts table, adds the research_runs tracking table, and a unified Review queue view.
-- Hard rules enforced here: every jarvis-discovered person carries source_id + source_quote
-- (DB CHECK), and review_feed runs with the caller's RLS (security_invoker) so it can't leak.

-- A research run = one natural-language cohort request and its lifecycle.
create table if not exists public.research_runs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references auth.users(id) on delete cascade,
  query        text not null,
  target_kind  text not null default 'people' check (target_kind in ('people')),  -- generalization seam
  status       text not null default 'running' check (status in ('running','done','error')),
  result_count integer not null default 0,
  source_id    uuid references public.sources(id) on delete set null,
  error        text,
  created_at   timestamptz not null default now()
);
create index if not exists research_runs_user_id_idx   on public.research_runs(user_id);
create index if not exists research_runs_source_id_idx on public.research_runs(source_id);
-- At most one in-flight run per (user, target, query): the DB rejects a concurrent duplicate so the
-- non-atomic check-then-insert in the API can't race two identical runs into existence.
create unique index if not exists research_runs_one_inflight_idx
  on public.research_runs(user_id, target_kind, query) where status = 'running';

-- Provenance + review columns for discovered people.
alter table public.contacts add column if not exists review_status text not null default 'accepted'
  check (review_status in ('review','accepted','dismissed'));   -- user rows 'accepted'; jarvis rows 'review'
alter table public.contacts add column if not exists source_quote text;   -- verbatim web snippet asserting the COHORT MATCH
alter table public.contacts add column if not exists confidence numeric
  check (confidence is null or (confidence >= 0 and confidence <= 1));
alter table public.contacts add column if not exists research_run_id uuid
  references public.research_runs(id) on delete set null;

create index if not exists contacts_review_status_idx  on public.contacts(review_status);
create index if not exists contacts_research_run_id_idx on public.contacts(research_run_id);

-- DB mirror of the <Card> guardrail: a jarvis-discovered contact MUST carry provenance.
-- (Use a DO block so re-running the migration doesn't error on an existing constraint.)
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'contacts_provenance_chk'
  ) then
    -- Non-empty, not just non-null: matches the <Card> guardrail, which rejects blank quotes.
    alter table public.contacts add constraint contacts_provenance_chk
      check (created_by <> 'jarvis'
             or (source_id is not null and source_quote is not null and length(btrim(source_quote)) > 0));
  end if;
end $$;

-- RLS for the new table.
alter table public.research_runs enable row level security;
create policy research_runs_select_own on public.research_runs for select using (auth.uid() = user_id);
create policy research_runs_insert_own on public.research_runs for insert with check (auth.uid() = user_id);
create policy research_runs_update_own on public.research_runs for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy research_runs_delete_own on public.research_runs for delete using (auth.uid() = user_id);

-- Unified Review queue: extracted items (status='review') + discovered people (review_status='review').
-- security_invoker = true is REQUIRED so the view honors each base table's RLS (without it the view
-- runs as its owner and would leak every user's rows).
create or replace view public.review_feed with (security_invoker = true) as
  select 'item'::text    as kind, id, user_id, title     as label, confidence,
         source_id, source_quote, created_at, null::uuid as research_run_id
    from public.items
   where status = 'review'
  union all
  select 'contact'::text as kind, id, user_id, full_name as label, confidence,
         source_id, source_quote, created_at, research_run_id
    from public.contacts
   where review_status = 'review';
